/**
 * @fileoverview Deno KV session driver.
 *
 * @module @lockness/session/drivers/deno-kv
 */

import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'
import type { SessionData, SessionDriver } from '../types.ts'

/**
 * Deno KV session driver.
 *
 * Persistent session storage using Deno's built-in KV store.
 * Supports automatic expiration via KV's `expireIn` option.
 *
 * @example
 * ```typescript
 * // Use default KV store
 * const driver = new DenoKvSessionDriver()
 *
 * // Or specify a custom path
 * const driver = new DenoKvSessionDriver('./sessions.db')
 * ```
 */
export class DenoKvSessionDriver implements SessionDriver {
    private kv: Deno.Kv | null = null
    /**
     * The in-flight `Deno.openKv` promise, cached so a concurrent cold-start
     * burst on a shared (memoized) instance opens **one** handle. Memoizing the
     * instance alone does not prevent the race: `getKv` is a check-then-act
     * across an `await`, so two concurrent first-calls would each open a handle
     * and orphan one. Caching the promise single-flights the acquisition.
     */
    private kvPromise: Promise<Deno.Kv> | null = null
    private readonly kvPath?: string
    #handle: DisposableHandle | undefined

    constructor(kvPath?: string) {
        this.kvPath = kvPath
    }

    private getKv(): Promise<Deno.Kv> {
        if (this.kv) return Promise.resolve(this.kv)
        if (!this.kvPromise) {
            const p = Deno.openKv(this.kvPath).then((kv) => {
                this.kv = kv
                // Announced only once a handle exists, so shutdown releases it.
                // Registering in the constructor would enrol a driver owning
                // nothing.
                this.#handle ??= registerDisposable({
                    name: 'session:deno-kv',
                    dispose: () => this.close(),
                    priority: 60,
                })
                return kv
            })
            // Self-heal on a transient open failure: drop the cached promise so
            // the next call retries. Without this, one rejected `Deno.openKv`
            // (disk full, a remote-KV blip) would be cached forever and — since
            // the driver is memoized per process — brick every later session
            // read until restart. The `=== p` guard keeps the single-flight:
            // concurrent callers still await one open.
            p.catch(() => {
                if (this.kvPromise === p) this.kvPromise = null
            })
            this.kvPromise = p
        }
        return this.kvPromise
    }

    async read(sessionId: string): Promise<SessionData | null> {
        const kv = await this.getKv()
        const result = await kv.get<SessionData>(['sessions', sessionId])
        return result.value
    }

    async write(
        sessionId: string,
        data: SessionData,
        lifetime: number,
    ): Promise<void> {
        const kv = await this.getKv()
        await kv.set(['sessions', sessionId], data, {
            expireIn: lifetime * 1000, // Convert to milliseconds
        })
    }

    async destroy(sessionId: string): Promise<void> {
        const kv = await this.getKv()
        await kv.delete(['sessions', sessionId])
    }

    async regenerate(oldId: string, newId: string): Promise<void> {
        const kv = await this.getKv()
        const result = await kv.get<SessionData>(['sessions', oldId])
        if (result.value) {
            await kv.set(['sessions', newId], result.value)
            await kv.delete(['sessions', oldId])
        }
    }

    close(): Promise<void> {
        if (this.#handle) {
            deregisterDisposable(this.#handle)
            this.#handle = undefined
        }
        if (this.kv) {
            this.kv.close()
            this.kv = null
        }
        // Drop the cached promise so a later use reopens rather than handing
        // back a closed handle. Idempotent: a second close is a no-op.
        this.kvPromise = null
        return Promise.resolve()
    }
}
