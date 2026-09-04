/**
 * @fileoverview An in-process {@link SchedulerLock} (#219).
 *
 * The dependency-free lock: correct for a single replica, and the test vehicle
 * for the distributed adapters (Redis / Deno-KV) that live at the composition
 * root. It implements the same owner-token discipline they must — a claim
 * stores a unique token, and `release` deletes the key only when the stored
 * token is still this holder's, so a claim that expired and was re-acquired by
 * another holder is never deleted out from under them.
 *
 * The "backing store" is a `Map`. Passing a **shared** store to two instances
 * models two replicas talking to one Redis: each keeps its own token set, both
 * read and write the one store.
 *
 * @module @lockness/scheduler/memory_lock
 * @since 0.2.1
 */

import type { SchedulerLock } from './types.ts'

/** One entry in the shared store: who holds the claim, and until when. */
interface Claim {
    readonly token: string
    readonly expiresAt: number
}

/** Options for {@link MemorySchedulerLock}. */
export interface MemorySchedulerLockOptions {
    /**
     * How long a claim is held before it expires, in milliseconds. Must exceed
     * a guarded task's worst-case runtime (at-most-once-within-TTL). Default 5m.
     */
    readonly ttlMs?: number
    /**
     * The backing store. Share one `Map` between instances to model several
     * replicas on one store; omit for a private, single-replica store.
     */
    readonly store?: Map<string, Claim>
}

/**
 * An in-process, owner-token {@link SchedulerLock}.
 *
 * @example
 * ```ts
 * const lock = new MemorySchedulerLock({ ttlMs: 60_000 })
 * scheduler().setLock(lock)
 * ```
 */
export class MemorySchedulerLock implements SchedulerLock {
    readonly #ttlMs: number
    /** The shared store — the "Redis". Keyed by task+occurrence. */
    readonly #store: Map<string, Claim>
    /** This holder's own tokens, so `release` can prove ownership. */
    readonly #owned = new Map<string, string>()

    constructor(options: MemorySchedulerLockOptions = {}) {
        this.#ttlMs = options.ttlMs ?? 300_000
        this.#store = options.store ?? new Map<string, Claim>()
    }

    /** Key an occurrence deterministically so every replica agrees. */
    static key(task: string, occurrence: Date): string {
        return `${task}:${occurrence.toISOString()}`
    }

    acquire(task: string, occurrence: Date): Promise<boolean> {
        const key = MemorySchedulerLock.key(task, occurrence)
        const now = Date.now()
        const existing = this.#store.get(key)
        if (existing !== undefined && existing.expiresAt > now) {
            return Promise.resolve(false)
        }
        const token = crypto.randomUUID()
        this.#store.set(key, { token, expiresAt: now + this.#ttlMs })
        this.#owned.set(key, token)
        return Promise.resolve(true)
    }

    release(task: string, occurrence: Date): Promise<void> {
        const key = MemorySchedulerLock.key(task, occurrence)
        const myToken = this.#owned.get(key)
        const current = this.#store.get(key)
        // Owner-checked delete: only remove the key if it still holds OUR token.
        // A stale token (ours expired, another holder re-claimed) matches
        // nothing and leaves the live claim intact.
        if (
            myToken !== undefined && current !== undefined &&
            current.token === myToken
        ) {
            this.#store.delete(key)
        }
        this.#owned.delete(key)
        return Promise.resolve()
    }
}
