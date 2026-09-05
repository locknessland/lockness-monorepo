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
    readonly #strings = new Map<string, { value: string; expireAt?: number }>()
    readonly #subs: Array<{ re: RegExp; handler: Handler }> = []

    /** The command client each driver publishes and stores state through. */
    readonly command = (...args: string[]): Promise<unknown> =>
        Promise.resolve(this.#exec(args))

    /** A fresh subscriber whose `psubscribe` registrations share this instance. */
    subscriberFor(): {
        psubscribe(pattern: string, handler: Handler): void
    } {
        return {
            psubscribe: (pattern, handler) =>
                void this.#subs.push({ re: globToRegExp(pattern), handler }),
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

    #exec(args: string[]): Reply {
        const [cmd, ...rest] = args
        switch (cmd.toUpperCase()) {
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
                return { type: 'nil' }
        }
    }
}
