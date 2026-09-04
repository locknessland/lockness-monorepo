/**
 * @fileoverview Queued mail — an identifiers-only job + an allowlist registry.
 *
 * A queued mailable serialises **identifiers only** (`mailableName` +
 * `constructorPayload`), never a rendered `MailMessage` (no recipients/HTML at
 * rest in the queue store or DLQ). Rehydration resolves the mailable **only
 * through an explicit allowlist registry** — never a dynamic `import()` /
 * global lookup / `eval` of a payload-supplied name (CWE-502, security S3).
 * `@lockness/queue` is soft: the app injects the dispatcher.
 *
 * @module @lockness/mail/queued
 */

import type { Mailable } from './mailable.ts'

/** Reconstruct a mailable from its queued constructor payload. */
export type MailableFactory = (payload: unknown) => Mailable

const registry = new Map<string, MailableFactory>()

/**
 * Register a mailable for queued rehydration (the allowlist).
 *
 * @param name - The registry key (matches `Mailable.mailableName()`).
 * @param factory - Rebuilds the mailable from its constructor payload (which it
 *   should validate as data before constructing).
 */
export function registerMailable(name: string, factory: MailableFactory): void {
    registry.set(name, factory)
}

/**
 * Look up a registered mailable factory.
 *
 * @param name - The registry key.
 * @returns The factory, or `undefined` when unregistered.
 */
export function getMailableFactory(name: string): MailableFactory | undefined {
    return registry.get(name)
}

/** Clear the registry — test-only. */
export function resetMailableRegistry(): void {
    registry.clear()
}

/** The identifiers-only queued job. */
export interface QueuedMailJob {
    /** The mailable registry key. */
    readonly mailableName: string
    /** The mailable's constructor payload (identifiers, never a rendered body). */
    readonly constructorPayload: unknown
}

/** A dispatcher enqueuing a job (wired from `@lockness/queue` by the app). */
export type MailDispatcher = (job: QueuedMailJob) => void | Promise<void>

/** Raised when a mailable is queued but no dispatcher is configured. */
export class MailQueueNotConfiguredError extends Error {
    constructor(mailableName: string) {
        super(
            `mailable "${mailableName}" was queued but no dispatcher is configured; ` +
                'call configureMailQueue(dispatcher), wired from @lockness/queue',
        )
        this.name = 'MailQueueNotConfiguredError'
    }
}

let dispatcher: MailDispatcher | undefined

/**
 * Wire the queue dispatcher (from `@lockness/queue`).
 *
 * @param dispatch - The dispatcher.
 */
export function configureMailQueue(dispatch: MailDispatcher): void {
    dispatcher = dispatch
}

/** Reset the dispatcher — test-only. */
export function resetMailQueue(): void {
    dispatcher = undefined
}

/**
 * Enqueue a mailable as an identifiers-only job.
 *
 * @param mailable - The mailable to queue.
 * @returns Resolves once enqueued.
 * @throws {MailQueueNotConfiguredError} When no dispatcher is configured.
 */
export function queueMailable(mailable: Mailable): void | Promise<void> {
    if (!dispatcher) {
        throw new MailQueueNotConfiguredError(mailable.mailableName())
    }
    return dispatcher({
        mailableName: mailable.mailableName(),
        constructorPayload: mailable.toQueue(),
    })
}

/**
 * Run a queued mail job in the worker: rehydrate via the allowlist registry and
 * send. An unregistered name is **rejected without instantiation**.
 *
 * @param job - The identifiers-only job.
 * @returns Resolves once sent.
 * @throws {Error} When the mailable is not registered.
 */
export async function handleMailJob(job: QueuedMailJob): Promise<void> {
    const factory = getMailableFactory(job.mailableName)
    if (!factory) {
        throw new Error(
            `queued mailable "${job.mailableName}" is not registered; ` +
                'call registerMailable(name, factory) at boot (unregistered names are rejected without instantiation)',
        )
    }
    const mailable = factory(job.constructorPayload)
    await mailable.send()
}
