/**
 * @fileoverview The per-channel authoritative-roster read barrier (#333) — the
 * single home for **when the driver is asked**, as opposed to what it answers.
 *
 * Every presence `subscribe` frame, re-joins included, ended in one
 * authoritative roster read whose reply is the whole room, cluster-wide, with
 * every member's `info`. #327 removed the frame's *write* cost and #329 decided
 * the framework ships no verb meter — but an application-side frame meter
 * bounds the frame **rate** and provably not the per-frame **byte** cost, since
 * a room can grow without the rate changing at all. That residue is this file.
 *
 * **Extracted rather than inlined**, and the partition is by responsibility.
 * `ChannelManager`'s one reason to change is the *membership* invariant;
 * "how often do we ask the driver" is a cost rule with its own lifecycle and
 * its own state. `ControlReplayWindow` is the precedent in this package: a
 * concrete class, not a port, because one implementation exists and a second is
 * hypothetical.
 *
 * ## The rule, and why it is the TRAILING edge
 *
 * At most one read per channel is in flight. A caller arriving while one is in
 * flight is answered by **the next read, issued the instant the current one
 * settles** — never by the one already running. That is a read barrier, not the
 * leading-edge single-flight the issue proposed, and the difference is
 * correctness rather than tuning.
 *
 * The invariant it preserves:
 *
 * > **Ask-time freshness.** The snapshot a caller receives was read from the
 * > driver at an instant no earlier than the moment that caller asked for it.
 *
 * That is exactly the property every caller had when each issued its own read,
 * which is what makes this unobservable through the public contract — no
 * option, no error type, no protocol change, and nothing exported from
 * `mod.ts`.
 *
 * **A leading-edge single-flight breaks it, visibly.** A first join commits its
 * roster write before reading, and the Redis client chains commands onto its
 * tail synchronously at call time (ADR 003 §2), so the write is enqueued ahead
 * of the read and a joiner always sees **itself** in its own `here`. Share a
 * read that was issued before a joiner's own write committed, and that joiner
 * subscribes to a room and is handed a roster it is not in. Clients render
 * `here` directly. The barrier buys that property back for one extra read per
 * burst — two rather than one for K concurrent callers — and that price is
 * correct.
 *
 * ## What it does not do
 *
 * It bounds reads per unit time. It never bounds the bytes of any single read:
 * a lone subscriber in a room of ten thousand still pulls ten thousand members.
 * That is a separate defect with a separate option space, tracked as #339.
 *
 * It refuses nothing, meters nothing, and remembers no desired state — an
 * in-flight promise is not a state to reconcile, which is why ADR 003 §6's ban
 * on coalescing roster **writes** does not reach a read.
 *
 * @module @lockness/realtime/roster_read_barrier
 */

import type { PresenceMember } from './channel.ts'

/** The function a barrier calls when it decides a fresh read is owed. */
export type RosterRead = (
    channel: string,
) => PresenceMember[] | Promise<PresenceMember[]>

/** One channel's two slots. `next` exists only while `running` is in flight. */
interface Slot {
    running: Promise<PresenceMember[]>
    next?: Promise<PresenceMember[]>
}

/**
 * Collapses concurrent authoritative roster reads of one channel onto the
 * trailing edge.
 *
 * @example
 * ```ts
 * const barrier = new RosterReadBarrier((channel) =>
 *     roster.listMembers(channel)
 * )
 * // Eight concurrent subscribes to one channel cost two reads, not eight.
 * const rosters = await Promise.all(
 *     Array.from({ length: 8 }, () => barrier.snapshot('presence-room')),
 * )
 * ```
 */
export class RosterReadBarrier {
    readonly #read: RosterRead
    /**
     * Keyed by channel, and **bounded by reads in flight, not by names ever
     * seen**. Every entry is deleted the moment its last read settles with
     * nothing queued behind it, so a client churning distinct presence names
     * cannot grow this map — which would make the remedy for #333 a second
     * instance of #334 in a different map.
     */
    readonly #slots = new Map<string, Slot>()

    /**
     * @param read - Issues one authoritative read. Takes a FUNCTION rather than
     *   the driver: the unit is then testable alone and cannot drift with
     *   `BroadcastDriver`'s eleven optional members, three of which are
     *   feature-detected by `typeof`.
     */
    constructor(read: RosterRead) {
        this.#read = read
    }

    /**
     * How many channels currently have a read in flight.
     *
     * A test seam, on `ControlReplayWindow.size`'s precedent — and the one
     * assertion that distinguishes "shares reads" from "retains state". It
     * returns to zero once every burst settles.
     *
     * @returns The number of channels holding a slot.
     */
    get size(): number {
        return this.#slots.size
    }

    /**
     * The authoritative roster for `channel`, sharing an in-flight read where
     * sharing cannot cost freshness.
     *
     * **The returned array is shared by every caller of one read**, and so are
     * the `PresenceMember` objects in it. Callers that hand the list onward
     * must copy it; `ChannelManager.rosterSnapshot` spreads it for exactly that
     * reason, and that spread stopped being defensive the day this class
     * arrived. The members themselves are deliberately **not** cloned: a
     * per-caller deep copy restores the per-caller `O(room)` cost this class
     * exists to remove, in CPU instead of bytes. `PresenceMember` is a value
     * object and the framework never mutates one.
     *
     * @param channel - The presence channel to read the roster of.
     * @returns The members the driver reported.
     * @throws Whatever the read threw — propagated to **every** caller sharing
     *   it, never swallowed. The manager's own `#closingRead` stays the single
     *   decider of the local fallback.
     */
    snapshot(channel: string): Promise<PresenceMember[]> {
        const slot = this.#slots.get(channel)
        if (!slot) {
            const running = this.#issue(channel)
            this.#slots.set(channel, { running })
            this.#watch(channel, running)
            return running
        }
        // Everyone who arrives during one read shares ONE next read, not one
        // each — otherwise K callers queue K reads and the bound is a delay
        // rather than a bound.
        if (slot.next) return slot.next
        // THE TRAILING EDGE. A fresh read, issued when the current one settles
        // — and `#issue` on BOTH branches, because a continuation that only
        // runs on fulfilment strands every queued caller forever the first time
        // the driver rejects. That is the trap in this shape.
        const next = slot.running.then(
            () => this.#issue(channel),
            () => this.#issue(channel),
        )
        slot.next = next
        return next
    }

    /** Run the read, normalising a synchronous driver to a promise. */
    #issue(channel: string): Promise<PresenceMember[]> {
        try {
            return Promise.resolve(this.#read(channel))
        } catch (error) {
            // A driver that throws synchronously must reject like one that
            // rejects, or the slot below is never installed and the map leaks.
            return Promise.reject(error)
        }
    }

    /**
     * Promote `next` when `promise` settles, or give the channel's entry back.
     *
     * Registered BEFORE any `next` can be, so it runs first on settlement and
     * sees the queued read rather than deleting the slot out from under it.
     */
    #watch(channel: string, promise: Promise<PresenceMember[]>): void {
        const settled = () => {
            const slot = this.#slots.get(channel)
            // A slot replaced by a later burst is not ours to retire.
            if (!slot || slot.running !== promise) return
            if (!slot.next) {
                this.#slots.delete(channel)
                return
            }
            const promoted = slot.next
            slot.running = promoted
            slot.next = undefined
            this.#watch(channel, promoted)
        }
        // Both arms: a rejected read must still release the channel, or one
        // driver fault makes that room unreadable for the life of the process.
        promise.then(settled, settled)
    }
}
