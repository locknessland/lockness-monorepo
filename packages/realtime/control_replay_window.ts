/**
 * @fileoverview The control-plane replay window (#272) — the single home for
 * whether a control frame is fresh, whether it has already been seen, and what
 * makes two frames "the same frame".
 *
 * Extracted from `drivers/redis.ts` deliberately. The MAC is a pure function of
 * the wire and the secret; this is **mutable, time-dependent, per-instance
 * state with its own lifecycle** — a second reason to change inside a file
 * already owning pub/sub, the roster, the heartbeat, the ghost sweep and the
 * revocation index. A concrete class and **not** an interface: one
 * implementation exists and the second is hypothetical, so a port here would be
 * speculative generality.
 *
 * **It names no drop.** Every "this frame was refused, and here is why" message
 * belongs to the verifier's guard chain, so that vocabulary has one home rather
 * than two. The single WARN this class does raise is a capacity notice — the
 * store hit its cap — which is an operational fact about the store itself and
 * not a verdict about any frame. Nothing else can report it, because nothing
 * else can see it.
 *
 * **What this does and does not guarantee.** The store is per-process, so the
 * honest statement is *a frame is obeyed at most once per receiving process,
 * per window* — not "once per instance", which a restart falsifies. The
 * freshness window is what protects an instance holding no nonce for a frame:
 * one that restarted, or one that started after the frame was issued. The nonce
 * store only tightens that for instances which were up for the original.
 *
 * @module @lockness/realtime/control_replay_window
 */

/** The verdict for one admitted frame. */
export type AdmitVerdict = 'ok' | 'stale' | 'duplicate'

/** How a {@link ControlReplayWindow} is built. */
export interface ControlReplayWindowOptions {
    /**
     * How long after issue a frame may still be obeyed, in milliseconds. Also
     * how long a nonce is remembered — the two are the same number by
     * construction, never configured separately.
     */
    windowMs: number
    /**
     * The clock, in epoch milliseconds. **Required, not optional.** An optional
     * clock defaulting to `Date.now` gives production and tests two different
     * paths through the one seam this class exists to collapse; the driver
     * supplies the default exactly once.
     */
    now: () => number
    /**
     * The most nonces to remember at once. Reached only under a frame rate that
     * outruns the window; past it the OLDEST entry is evicted.
     * @default 10000
     */
    maxEntries?: number
}

const DEFAULT_MAX_ENTRIES = 10_000

/**
 * Remembers recently-seen control frames so a replayed one can be refused.
 *
 * @example
 * ```typescript
 * const seen = new ControlReplayWindow({ windowMs: 30_000, now: () => Date.now() })
 * seen.admit('instance-a', 'f3a9', Date.now()) // 'ok'
 * seen.admit('instance-a', 'f3a9', Date.now()) // 'duplicate'
 * ```
 */
export class ControlReplayWindow {
    readonly #windowMs: number
    readonly #now: () => number
    readonly #maxEntries: number
    /**
     * Insertion-ordered `key -> issuedAt`. A `Map` preserves insertion order,
     * so the oldest entry is always the first — which is what makes both
     * pruning and cap eviction a walk from the front rather than a sort.
     */
    readonly #seen = new Map<string, number>()
    #warnedAtCap = false

    /**
     * @param options - The window, the clock, and the entry cap.
     */
    constructor(options: ControlReplayWindowOptions) {
        this.#windowMs = options.windowMs
        this.#now = options.now
        this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    }

    /**
     * Decide whether a control frame may be obeyed, and remember it if so.
     *
     * Called **only after** the frame's MAC has verified. Admitting an
     * unauthenticated frame would let anyone with bus PUBLISH write into this
     * store, trading one weakness for a worse one.
     *
     * The key is the **`(origin, nonce)` pair**, never the nonce alone. Two
     * instances are independent sources: keyed on the nonce by itself, one
     * sender's legitimate frame is dropped as another's duplicate — and since
     * publishing is fire-and-forget with no retry, that loss is silent and
     * permanent. Failing closed on the control plane is worse than the replay
     * this class prevents.
     *
     * @param origin - The publishing instance's id, from the MAC'd payload.
     * @param nonce - The frame's nonce, from the MAC'd payload.
     * @param issuedAt - The frame's timestamp, in epoch milliseconds.
     * @returns `'ok'` to obey, `'stale'` if outside the window, `'duplicate'`
     *   if already seen.
     */
    admit(origin: string, nonce: string, issuedAt: number): AdmitVerdict {
        const now = this.#now()
        this.#prune(now)

        // Both directions. A one-sided check would let anyone who can push a
        // clock forward extend their own replay window indefinitely.
        if (Math.abs(now - issuedAt) > this.#windowMs) return 'stale'

        const key = `${origin} ${nonce}`
        if (this.#seen.has(key)) return 'duplicate'

        this.#evictIfAtCap()
        this.#seen.set(key, issuedAt)
        return 'ok'
    }

    /** How many nonces are currently remembered — for tests and diagnostics. */
    get size(): number {
        return this.#seen.size
    }

    /**
     * Drop every entry older than the window.
     *
     * Called at the head of {@link admit}, never on a timer: a timer is one
     * more thing that can be stopped, and the driver already reasons about
     * three. The property this delivers is that **no entry older than the
     * window is ever consulted** — not that none ever exists, which would be
     * false for an instance that is ingesting nothing.
     */
    #prune(now: number): void {
        for (const [key, issuedAt] of this.#seen) {
            // The `break` is a BOUND on work, not a claim that everything after
            // this point is fresh. Entries are arrival-ordered but carry the
            // FRAME's timestamp, and the freshness gate admits any `ts` within
            // `±windowMs`, so two entries up to two windows apart in issue time
            // can arrive in either order. An older one can therefore sit behind
            // a younger one and survive this walk.
            //
            // That is retention, never a wrong verdict. A surviving entry can
            // only be matched by an identical `(origin, nonce)`, and both are
            // inside the MAC along with `ts` — so the only frame that can reach
            // it is a verbatim replay carrying that same old `ts`, which the
            // freshness gate above returns 'stale' for before the duplicate
            // lookup ever runs. Residue is bounded at roughly two windows, and
            // absolutely by the entry cap.
            if (now - issuedAt <= this.#windowMs) break
            this.#seen.delete(key)
        }
    }

    /**
     * Make room at the cap by dropping the OLDEST entry.
     *
     * Drop-oldest fails open for exactly one forgotten in-window nonce.
     * Refusing new entries instead would fail closed — the control plane stops
     * accepting frames — which is the outcome this feature's own risk table
     * rates as worse than the replay it prevents.
     */
    #evictIfAtCap(): void {
        if (this.#seen.size < this.#maxEntries) return
        if (!this.#warnedAtCap) {
            this.#warnedAtCap = true
            console.warn(
                `realtime: the control replay window hit its ${this.#maxEntries}-entry ` +
                    'cap and is now evicting the oldest nonce per admission. A ' +
                    'frame older than the evicted entry but still inside the ' +
                    'window could be replayed once. Lower the window or raise ' +
                    'the cap.',
            )
        }
        const oldest = this.#seen.keys().next()
        if (!oldest.done) this.#seen.delete(oldest.value)
    }
}
