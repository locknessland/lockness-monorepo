/**
 * @fileoverview The health-check registry — where a package announces a
 * dependency probe, without importing `@lockness/core`.
 *
 * **Why here.** A subsystem that owns a dependency (a DB pool, a Redis
 * connection, a queue driver) needs to tell the framework how to check that the
 * dependency is reachable, so `/ready` can report it. Importing `@lockness/core`
 * to register would close a cycle for every such package — the exact reason
 * {@link file://./disposables.ts | the disposables registry} lives here. This
 * module imports nothing, so an edge to it can never close a cycle.
 *
 * The registration side ({@link registerHealthCheck} /
 * {@link deregisterHealthCheck} / {@link healthCheckCount}) is re-exported by
 * `lifecycle/mod.ts` and is public. {@link collectHealthChecks} is deliberately
 * NOT re-exported there — running every dependency probe is a capability
 * `@lockness/core` reaches through the `@lockness/contract/lifecycle/health/internal`
 * entry point, so it cannot be triggered from a controller or a copied example.
 *
 * **What this module deliberately does NOT do.** It never runs a check (core
 * does, with the per-check timeout and the 200/503 aggregation), never touches
 * `Deno`, never logs, and never asks whether core is present.
 *
 * @module @lockness/contract/lifecycle/health
 * @since 0.2.1
 */

/**
 * The outcome of one dependency probe.
 *
 * `detail` is for logs and authenticated diagnostics only — the unauthenticated
 * `/ready` body carries the check name and the boolean, never the detail, so a
 * dependency's raw error (a hostname, a port, a driver version) is not disclosed
 * to an anonymous caller.
 */
export interface HealthResult {
    /** Whether the dependency is reachable and usable right now. */
    readonly ok: boolean
    /**
     * Optional human-readable detail for logs / authenticated diagnostics.
     * **Never** returned in the unauthenticated `/ready` body.
     */
    readonly detail?: string
}

/**
 * A named dependency probe. Registered by the subsystem that owns the
 * dependency; run by `@lockness/core` on `/ready`.
 *
 * @example
 * ```typescript
 * registerHealthCheck({
 *     name: 'redis',
 *     check: async () => {
 *         try {
 *             await client.command('PING')
 *             return { ok: true }
 *         } catch (e) {
 *             return { ok: false, detail: (e as Error).message }
 *         }
 *     },
 * })
 * ```
 */
export interface HealthCheck {
    /**
     * A label for the readiness report and logs. It is the ONLY per-check field
     * an unauthenticated `/ready` caller sees, so it must name the dependency
     * (`'database'`, `'redis'`, `'queue'`) without embedding a secret.
     */
    readonly name: string

    /**
     * Probe the dependency. Should resolve quickly; core bounds it with a
     * per-check timeout so a hung dependency cannot hang the probe. Must not
     * throw — return `{ ok: false, detail }` instead; core treats a thrown
     * check as `ok: false`.
     */
    check(): Promise<HealthResult>
}

/**
 * An opaque receipt for one registration.
 *
 * Deregistration takes **this**, never a name — otherwise any module could
 * cancel another's check by registering a colliding name.
 */
export interface HealthCheckHandle {
    /** @internal */
    readonly _check: HealthCheck
}

/**
 * The live set. Identity is the object, so registering the same check twice
 * runs it once.
 */
const checks = new Set<HealthCheck>()

/**
 * Announce a dependency probe for `/ready`.
 *
 * Safe to call with no framework present: it records and returns.
 *
 * @param check - The probe, and the dependency name it reports under.
 * @returns A handle to pass to {@link deregisterHealthCheck}.
 *
 * @example
 * ```typescript
 * const handle = registerHealthCheck({ name: 'database', check: () => db.probe() })
 * ```
 */
export function registerHealthCheck(check: HealthCheck): HealthCheckHandle {
    checks.add(check)
    return { _check: check }
}

/**
 * Withdraw a registration — e.g. when a driver is torn down so its check must
 * no longer run. Calling it twice, or after nothing is registered, is harmless.
 *
 * @param handle - The receipt from {@link registerHealthCheck}.
 */
export function deregisterHealthCheck(handle: HealthCheckHandle): void {
    checks.delete(handle._check)
}

/**
 * How many checks are currently registered. For tests and diagnostics.
 *
 * @returns The count.
 */
export function healthCheckCount(): number {
    return checks.size
}

/**
 * Take a snapshot of the registered checks for one `/ready` evaluation.
 *
 * **Does not clear** (unlike `drainDisposables`): checks are long-lived and
 * re-run on every probe. Returns a fresh array so the caller can iterate while
 * registration continues.
 *
 * Internal: reached by `@lockness/core` via the
 * `@lockness/contract/lifecycle/health/internal` entry point, never re-exported
 * onto the public surface.
 *
 * @returns The currently-registered checks, in no particular order.
 */
export function collectHealthChecks(): readonly HealthCheck[] {
    return [...checks]
}
