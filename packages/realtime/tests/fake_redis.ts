/**
 * @fileoverview An in-memory fake Redis for the realtime driver unit tests.
 *
 * It models exactly the command surface the {@link RedisBroadcastDriver} uses —
 * `PUBLISH`, the roster hash (`HSET`/`HDEL`/`HGETALL`), the owned/instances sets
 * (`SADD`/`SREM`/`SMEMBERS`/`DEL`) and the liveness string (`SET … EX`/`EXISTS`)
 * — returning `RespReply`-shaped values so the driver's real reply-narrowing
 * runs unchanged. String TTL is evaluated against `Date.now()`, so a `FakeTime`
 * test drives key expiry deterministically. Pub/sub fan-out is synchronous, like
 * the existing `driver_redis.test.ts` fake bus.
 *
 * A test helper — never imported by production code.
 *
 * @module @lockness/realtime/tests/fake_redis
 */

import { evalLua } from '../../redis/tests/lua_eval.ts'

/** A push-message handler for a subscribed pattern. */
type Handler = (topic: string, payload: string) => void

/** A `RespReply`-shaped value (the subset the driver narrows). */
type Reply =
    | { type: 'simple'; value: string }
    | { type: 'integer'; value: number }
    | { type: 'bulk'; value: string }
    | { type: 'array'; value: Reply[] }
    | { type: 'nil' }

/** Convert a Redis glob (`*`, `?`) to an anchored RegExp, escaping the rest. */
function globToRegExp(glob: string): RegExp {
    let out = '^'
    for (const ch of glob) {
        if (ch === '*') out += '.*'
        else if (ch === '?') out += '.'
        else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
    return new RegExp(out + '$')
}

/**
 * An in-memory Redis double: shared by several driver instances in one test so
 * their rosters and control bus are genuinely cross-instance.
 */
export class FakeRedis {
    readonly #hashes = new Map<string, Map<string, string>>()
    readonly #sets = new Map<string, Set<string>>()
    /** Sorted sets: key → (member → score). Backs the revocation index (#276). */
    readonly #zsets = new Map<string, Map<string, number>>()
    /**
     * Key-level expiry in epoch seconds, as `EXPIRE` sets it.
     *
     * Modelled rather than stubbed: a no-op `EXPIRE` arm would hide a script
     * that shortens a whole key's lifetime under live members — which is
     * precisely the defect this had to catch (#276 review HIGH-1).
     */
    readonly #keyExpiry = new Map<string, number>()
    /**
     * Every command this double executes, script-internal ones included.
     *
     * A test that wraps the `command` function sees only what the driver issues
     * directly — the commands a script runs reach `#exec` through the evaluator
     * and bypass that wrapper entirely, which made one assertion structurally
     * unable to fail (#276 review cycle 2).
     */
    readonly #commandLog: string[][] = []
    /**
     * The seconds this instance's `TIME` reports.
     *
     * Settable, and that is the point: the real defect #276 removes is a
     * liveness decision made on an INSTANCE's clock, so a test has to be able to
     * give two drivers different clocks and show the outcome does not move. The
     * fake's shared `Date.now()` could never express that.
     */
    #timeSeconds: number | undefined
    readonly #strings = new Map<string, { value: string; expireAt?: number }>()
    readonly #subs: Array<{ re: RegExp; handler: Handler }> = []

    /** The command client each driver publishes and stores state through. */
    readonly command = (...args: string[]): Promise<unknown> =>
        Promise.resolve(this.#exec(args))

    /**
     * A fresh subscriber whose `psubscribe` registrations share this instance.
     *
     * It also implements the optional reconnect seam (#271), so a test can
     * simulate a subscribe-socket reconnect with `fireReconnect()` — the real
     * `RedisSubscribeConnection` fires it after a fault-triggered re-`PSUBSCRIBE`.
     * `driver_redis.test.ts` keeps its own fake WITHOUT the seam on purpose: it
     * is the standing proof that an unaware subscriber still works (FR-004).
     */
    subscriberFor(): {
        psubscribe(pattern: string, handler: Handler): void
        onReconnect(handler: () => void | Promise<void>): void
        /** Test-only: simulate a reconnect, awaiting the handler's round-trip. */
        fireReconnect(): Promise<void>
    } {
        let onReconnect: (() => void | Promise<void>) | undefined
        return {
            psubscribe: (pattern, handler) =>
                void this.#subs.push({ re: globToRegExp(pattern), handler }),
            onReconnect: (handler) => void (onReconnect = handler),
            fireReconnect: async () => {
                await onReconnect?.()
            },
        }
    }

    /** Whether a string key is present and unexpired (lazy-expiring on read). */
    #alive(key: string): boolean {
        const s = this.#strings.get(key)
        if (!s) return false
        if (s.expireAt !== undefined && Date.now() >= s.expireAt) {
            this.#strings.delete(key)
            return false
        }
        return true
    }

    /**
     * Override what `TIME` reports for this double, in whole seconds.
     *
     * @param seconds - The epoch seconds to report, or `undefined` to track the
     *   real clock again.
     * @example
     * ```typescript
     * redis.setTime(1_800_000_000)
     * ```
     */
    setTime(seconds: number | undefined): void {
        this.#timeSeconds = seconds
    }

    /**
     * How many members a sorted set holds, expired ones included.
     *
     * Test-only, and load-bearing: a reap that does nothing is invisible to any
     * assertion that reads `listRevoked()`'s return value, because the caller
     * filters by score anyway. Only stored cardinality can see it (#276).
     *
     * @param key - The sorted-set key.
     * @returns The number of stored members.
     * @example
     * ```typescript
     * assertEquals(redis.zcard('app:rt:revocations'), 0)
     * ```
     */
    /**
     * Every command executed, in order — including those issued from inside a
     * script. Test-only.
     *
     * @returns A copy of the command log.
     * @example
     * ```typescript
     * assert(!redis.commandLog().some(([c, k]) => c === 'SADD' && k === legacy))
     * ```
     */
    commandLog(): string[][] {
        return this.#commandLog.map((c) => [...c])
    }

    /**
     * The key-level expiry recorded for `key`, in epoch seconds, or `undefined`
     * when it has none. Test-only.
     *
     * @param key - The key to inspect.
     * @returns The expiry, or `undefined` for a persistent key.
     */
    expiryOf(key: string): number | undefined {
        return this.#keyExpiry.get(key)
    }

    zcard(key: string): number {
        return this.#liveZset(key)?.size ?? 0
    }

    /** The epoch seconds `TIME` reports — overridden by {@link setTime}. */
    #now(): number {
        return this.#timeSeconds ?? Math.floor(Date.now() / 1000)
    }

    /**
     * The sorted set at `key`, or `undefined` — dropping it first if its
     * key-level TTL has passed, as Redis would.
     */
    #liveZset(key: string): Map<string, number> | undefined {
        const expiry = this.#keyExpiry.get(key)
        if (expiry !== undefined && this.#now() >= expiry) {
            this.#zsets.delete(key)
            this.#keyExpiry.delete(key)
        }
        return this.#zsets.get(key)
    }

    /** Parse a `ZRANGEBYSCORE` bound, honouring `-inf` / `+inf` and `(` exclusivity. */
    #bound(raw: string): { value: number; exclusive: boolean } {
        const exclusive = raw.startsWith('(')
        const body = exclusive ? raw.slice(1) : raw
        if (body === '-inf') return { value: -Infinity, exclusive }
        if (body === '+inf') return { value: Infinity, exclusive }
        return { value: Number(body), exclusive }
    }

    #exec(args: string[]): Reply {
        this.#commandLog.push([...args])
        const [cmd, ...rest] = args
        switch (cmd.toUpperCase()) {
            case 'TIME':
                return {
                    type: 'array',
                    value: [
                        { type: 'bulk', value: String(this.#now()) },
                        { type: 'bulk', value: '0' },
                    ],
                }
            case 'ZADD': {
                // ZADD key [GT] score member — GT is MODELLED, not ignored: an
                // ignored option token is exactly the silent-no-op class FR-008
                // exists to stop, and #276 depends on GT to guarantee a
                // re-eviction can only extend a live revocation.
                const [key, ...tail] = rest
                const gt = tail[0]?.toUpperCase() === 'GT'
                const flags = tail.filter((t) =>
                    ['GT', 'LT', 'NX', 'XX', 'CH'].includes(t.toUpperCase())
                )
                const unsupported = flags.filter((f) =>
                    f.toUpperCase() !== 'GT'
                )
                if (unsupported.length > 0) {
                    throw new Error(
                        `FakeRedis: unmodelled ZADD option(s) ${
                            unsupported.join(', ')
                        }`,
                    )
                }
                const [rawScore, member] = gt ? tail.slice(1) : tail
                const zset = this.#liveZset(key) ??
                    new Map<string, number>()
                this.#zsets.set(key, zset)
                const score = Number(rawScore)
                const existing = zset.get(member)
                const added = existing === undefined
                if (added || !gt || score > existing) zset.set(member, score)
                return { type: 'integer', value: added ? 1 : 0 }
            }
            case 'ZREMRANGEBYSCORE': {
                const [key, rawMin, rawMax] = rest
                const min = this.#bound(rawMin)
                const max = this.#bound(rawMax)
                const zset = this.#liveZset(key)
                if (!zset) return { type: 'integer', value: 0 }
                let removed = 0
                for (const [member, score] of [...zset]) {
                    const aboveMin = min.exclusive
                        ? score > min.value
                        : score >= min.value
                    const belowMax = max.exclusive
                        ? score < max.value
                        : score <= max.value
                    if (aboveMin && belowMax) {
                        zset.delete(member)
                        removed++
                    }
                }
                return { type: 'integer', value: removed }
            }
            case 'ZRANGEBYSCORE': {
                const [key, rawMin, rawMax] = rest
                const min = this.#bound(rawMin)
                const max = this.#bound(rawMax)
                const zset = this.#liveZset(key)
                if (!zset) return { type: 'array', value: [] }
                const members = [...zset]
                    .filter(([, score]) => {
                        const aboveMin = min.exclusive
                            ? score > min.value
                            : score >= min.value
                        const belowMax = max.exclusive
                            ? score < max.value
                            : score <= max.value
                        return aboveMin && belowMax
                    })
                    .sort((a, b) => a[1] - b[1])
                    .map(([member]): Reply => ({ type: 'bulk', value: member }))
                return { type: 'array', value: members }
            }
            case 'EXPIRE': {
                // EXPIRE key seconds [GT] — GT is MODELLED: it is what stops a
                // shorter-TTL instance pulling in the whole key's lifetime and
                // taking live members down with it.
                const [key, rawSeconds, ...flags] = rest
                const known = ['NX', 'GT']
                const unsupported = flags.filter((f) =>
                    !known.includes(f.toUpperCase())
                )
                if (unsupported.length > 0) {
                    throw new Error(
                        `FakeRedis: unmodelled EXPIRE option(s) ${
                            unsupported.join(', ')
                        }`,
                    )
                }
                const nx = flags.some((f) => f.toUpperCase() === 'NX')
                const gt = flags.some((f) => f.toUpperCase() === 'GT')
                const at = this.#now() + Number(rawSeconds)
                const current = this.#keyExpiry.get(key)
                // NX: only when the key currently has NO expiry.
                if (nx && current !== undefined) {
                    return { type: 'integer', value: 0 }
                }
                // GT: only when the new expiry is greater than the current one.
                // A key with no TTL counts as an INFINITE one, so GT refuses it —
                // modelling this the other way round is what let an inert
                // `EXPIRE … GT` look like a working guard (#276 review cycle 2).
                if (gt && (current === undefined || at <= current)) {
                    return { type: 'integer', value: 0 }
                }
                this.#keyExpiry.set(key, at)
                return { type: 'integer', value: 1 }
            }
            case 'EVAL': {
                // EVAL script numkeys k1..kN a1..aM — split by the DECLARED
                // numkeys, then evaluate the script itself. Never dispatch on
                // script text.
                const [script, rawNumKeys, ...operands] = rest
                const numKeys = Number(rawNumKeys)
                const keys = operands.slice(0, numKeys)
                const argv = operands.slice(numKeys)
                const result = evalLua(script, keys, argv, (command, cargs) => {
                    const reply = this.#exec([command, ...cargs])
                    if (reply.type === 'array') {
                        return reply.value.map((r) =>
                            r.type === 'bulk' ? r.value : ''
                        )
                    }
                    if (reply.type === 'nil') return undefined
                    return String(reply.value)
                })
                if (result === undefined) return { type: 'nil' }
                if (Array.isArray(result)) {
                    return {
                        type: 'array',
                        value: result.map((v): Reply => ({
                            type: 'bulk',
                            value: v,
                        })),
                    }
                }
                return { type: 'bulk', value: result as string }
            }
            case 'PUBLISH': {
                const [topic, payload] = rest
                let n = 0
                for (const s of this.#subs) {
                    if (s.re.test(topic)) {
                        s.handler(topic, payload)
                        n++
                    }
                }
                return { type: 'integer', value: n }
            }
            case 'HSET': {
                const [key, field, value] = rest
                let h = this.#hashes.get(key)
                if (!h) this.#hashes.set(key, h = new Map())
                const isNew = h.has(field) ? 0 : 1
                h.set(field, value)
                return { type: 'integer', value: isNew }
            }
            case 'HDEL': {
                const [key, field] = rest
                const removed = this.#hashes.get(key)?.delete(field) ? 1 : 0
                return { type: 'integer', value: removed }
            }
            case 'HGETALL': {
                const h = this.#hashes.get(rest[0])
                const flat: Reply[] = []
                for (const [field, value] of h ?? []) {
                    flat.push({ type: 'bulk', value: field })
                    flat.push({ type: 'bulk', value })
                }
                return { type: 'array', value: flat }
            }
            case 'SADD': {
                const [key, ...members] = rest
                let set = this.#sets.get(key)
                if (!set) this.#sets.set(key, set = new Set())
                let added = 0
                for (const m of members) {
                    if (!set.has(m)) added++
                    set.add(m)
                }
                return { type: 'integer', value: added }
            }
            case 'SREM': {
                const [key, ...members] = rest
                const set = this.#sets.get(key)
                let removed = 0
                for (const m of members) if (set?.delete(m)) removed++
                return { type: 'integer', value: removed }
            }
            case 'SMEMBERS': {
                const set = this.#sets.get(rest[0])
                return {
                    type: 'array',
                    value: [...(set ?? [])].map((m) => ({
                        type: 'bulk' as const,
                        value: m,
                    })),
                }
            }
            case 'DEL': {
                const key = rest[0]
                const existed = this.#hashes.delete(key) ||
                    this.#sets.delete(key) || this.#strings.delete(key)
                return { type: 'integer', value: existed ? 1 : 0 }
            }
            case 'SET': {
                const [key, value, ...opts] = rest
                let expireAt: number | undefined
                const ex = opts.indexOf('EX')
                if (ex >= 0) {
                    expireAt = Date.now() + Number(opts[ex + 1]) * 1000
                }
                this.#strings.set(key, { value, expireAt })
                return { type: 'simple', value: 'OK' }
            }
            case 'EXISTS':
                return { type: 'integer', value: this.#alive(rest[0]) ? 1 : 0 }
            default:
                // A `nil` here would be indistinguishable from a legitimate miss,
                // so an unmodelled command would make the driver a silent no-op
                // and every test green. Fail loudly instead (#276 FR-008).
                throw new Error(
                    `FakeRedis: unmodelled command '${cmd}' — model it in ` +
                        `#exec rather than letting it silently no-op`,
                )
        }
    }
}
