/**
 * @fileoverview Server-side revocation set for the cookie session driver.
 *
 * The cookie driver is otherwise stateless — the cookie *is* the session. To
 * make logout revoke a captured copy, this adds the minimum server-side state: a
 * set of revoked session nonces (`jti`), keyed `['session-revoked', jti]` in
 * Deno KV, each entry expiring exactly when the session's absolute cap fires so
 * the set self-prunes (#143).
 *
 * **Fail-closed.** A KV read that throws must make the caller REFUSE the cookie,
 * never treat it as not-revoked — a KV blip must not become an authentication
 * bypass. This module therefore lets errors propagate; the driver's `read()`
 * turns a thrown `isRevoked` into a refusal. Reads use Deno KV's default
 * **strong** consistency; an `eventual` read would be a replica-lag logout-bypass
 * window and is deliberately not offered.
 *
 * @module @lockness/session/drivers/revocation_store
 */

import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'

/**
 * A set of revoked session nonces, with a bounded retention per entry.
 *
 * The port the cookie driver depends on; the Deno-KV-backed
 * {@link KvRevocationStore} is the adapter. A test double implements the same
 * two methods.
 */
export interface RevocationStore {
    /**
     * Whether a session nonce has been revoked.
     *
     * @param jti - The session nonce sealed in the cookie.
     * @returns `true` if the nonce is in the revocation set.
     * @throws If the backing store cannot be read — the caller MUST fail closed
     *   (refuse the cookie), never treat a read error as "not revoked".
     */
    isRevoked(jti: string): Promise<boolean>
    /**
     * Revoke a session nonce until `ttlSeconds` from now.
     *
     * @param jti - The session nonce to revoke.
     * @param ttlSeconds - Seconds the entry must survive — the session's
     *   remaining absolute life, so the entry outlives every use of the cookie.
     * @throws If the write fails — the caller MUST propagate (a logout that
     *   silently fails to revoke is worse than one that errors).
     */
    revoke(jti: string, ttlSeconds: number): Promise<void>
    /**
     * Release the backing handle. Idempotent.
     */
    close(): Promise<void>
}

/** The KV key prefix for a revoked nonce. */
const KEY_PREFIX = 'session-revoked'

/**
 * A Deno-KV-backed {@link RevocationStore}.
 *
 * The handle is opened once and single-flighted against a concurrent cold-start
 * burst (the `Deno.openKv` race the `deno-kv` driver also guards), and released
 * through the `@lockness/contract` disposables drain. One instance is memoized
 * per process by the driver registry and injected by reference into each
 * per-request cookie driver, so a request never opens its own handle.
 *
 * @example
 * ```typescript
 * const store = new KvRevocationStore('./sessions.db')
 * if (await store.isRevoked(jti)) return null // refuse
 * await store.revoke(jti, remainingSeconds)
 * ```
 */
export class KvRevocationStore implements RevocationStore {
    private kv: Deno.Kv | null = null
    private kvPromise: Promise<Deno.Kv> | null = null
    #handle: DisposableHandle | undefined
    private readonly kvPath?: string

    /**
     * @param kvPath - Optional Deno KV path; the default store when omitted.
     */
    constructor(kvPath?: string) {
        this.kvPath = kvPath
    }

    private getKv(): Promise<Deno.Kv> {
        if (this.kv) return Promise.resolve(this.kv)
        if (!this.kvPromise) {
            const p = Deno.openKv(this.kvPath).then((kv) => {
                this.kv = kv
                this.#handle ??= registerDisposable({
                    name: 'session:revocation-store',
                    dispose: () => this.close(),
                    priority: 60,
                })
                return kv
            })
            // Self-heal a transient open failure: drop the cached promise so the
            // next call retries rather than caching a rejection forever.
            p.catch(() => {
                if (this.kvPromise === p) this.kvPromise = null
            })
            this.kvPromise = p
        }
        return this.kvPromise
    }

    /**
     * Whether a session nonce is in the revocation set.
     *
     * @param jti - The session nonce.
     * @returns `true` if revoked.
     * @throws If the KV read fails — propagated so the caller fails closed.
     */
    async isRevoked(jti: string): Promise<boolean> {
        const kv = await this.getKv()
        // Default (strong) consistency — an eventual read is a replica-lag
        // logout-bypass window. A thrown error propagates: the driver fails
        // closed on it.
        const entry = await kv.get<true>([KEY_PREFIX, jti])
        return entry.value !== null
    }

    /**
     * Revoke a session nonce for `ttlSeconds` (floored at one second).
     *
     * @param jti - The session nonce to revoke.
     * @param ttlSeconds - Seconds the entry must survive (the cap window).
     * @throws If the KV write fails — propagated, never swallowed.
     */
    async revoke(jti: string, ttlSeconds: number): Promise<void> {
        const kv = await this.getKv()
        // `expireIn` is milliseconds; a non-positive TTL would be rejected, so
        // floor at one second — a just-expired session still gets a live entry
        // for the moment it takes the cookie to be refused.
        const expireIn = Math.max(1, Math.floor(ttlSeconds)) * 1000
        await kv.set([KEY_PREFIX, jti], true, { expireIn })
    }

    /**
     * Close the KV handle and deregister the disposable. Idempotent.
     */
    close(): Promise<void> {
        if (this.#handle) {
            deregisterDisposable(this.#handle)
            this.#handle = undefined
        }
        if (this.kv) {
            this.kv.close()
            this.kv = null
        }
        this.kvPromise = null
        return Promise.resolve()
    }
}
