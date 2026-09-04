/**
 * @fileoverview The feature-flag facade — `configureFeatures` + `features()`.
 *
 * Resolution order (one home): the driver **override** wins, then the flag
 * **definition** (boolean / percentage / resolver), then the documented
 * **default off**. Resolution is **fail-closed** — a throwing resolver or an
 * erroring driver resolves to `false`, never propagating or failing open.
 *
 * The scope is **app-supplied**; for a flag that gates access/entitlement it
 * MUST be a server-verified identity (feature flags are a rollout/config
 * mechanism, not an authorization boundary).
 *
 * @module @lockness/features/features
 */

import { type FlagDriver, MemoryFlagDriver } from './driver.ts'
import { inRollout } from './rollout.ts'

/** A flag definition: a boolean, a percentage rollout, or a resolver. */
export type FlagDefinition =
    | boolean
    | { rollout: number }
    | ((scope: unknown) => boolean | Promise<boolean>)

/** App-supplied feature configuration. */
export interface FeaturesConfig {
    /** The named flag definitions. */
    flags: Record<string, FlagDefinition>
    /** The override store (defaults to in-memory). */
    driver?: FlagDriver
}

/** Max scope-key length (a bound on an app-supplied key). */
const MAX_SCOPE_KEY = 256

/**
 * Normalise an app-supplied scope to a stable string key.
 *
 * @param scope - The scope value (string / number / object with `id` / other).
 * @returns A bounded stable key (`''` for no scope).
 */
export function scopeKey(scope: unknown): string {
    if (scope === undefined || scope === null) return ''
    let key: string
    if (typeof scope === 'string') key = scope
    else if (typeof scope === 'number' || typeof scope === 'bigint') {
        key = String(scope)
    } else if (
        typeof scope === 'object' && 'id' in scope &&
        (typeof (scope as { id: unknown }).id === 'string' ||
            typeof (scope as { id: unknown }).id === 'number')
    ) {
        key = String((scope as { id: string | number }).id)
    } else {
        key = JSON.stringify(scope)
    }
    return key.length > MAX_SCOPE_KEY ? key.slice(0, MAX_SCOPE_KEY) : key
}

let current: FeaturesConfig = { flags: {}, driver: new MemoryFlagDriver() }

/**
 * Configure the feature-flag system.
 *
 * @param config - The flags + optional override driver.
 *
 * @example
 * ```ts
 * configureFeatures({ flags: { 'new-ui': { rollout: 25 }, beta: true } })
 * ```
 */
export function configureFeatures(config: FeaturesConfig): void {
    current = {
        flags: config.flags,
        driver: config.driver ?? new MemoryFlagDriver(),
    }
}

/** Reset — test-only. */
export function resetFeatures(): void {
    current = { flags: {}, driver: new MemoryFlagDriver() }
}

/** The feature-flag facade. */
export interface Features {
    /** Whether a flag is active for a scope (fail-closed). */
    active(name: string, scope?: unknown): Promise<boolean>
    /** Alias of {@link Features.active} (boolean flags). */
    value(name: string, scope?: unknown): Promise<boolean>
    /** Force a flag on for a scope (or globally when scope omitted). */
    activate(name: string, scope?: unknown): Promise<void>
    /** Force a flag off for a scope (or globally). */
    deactivate(name: string, scope?: unknown): Promise<void>
    /** Remove an override, reverting to the definition. */
    forget(name: string, scope?: unknown): Promise<void>
}

/**
 * The feature-flag facade over the configured flags + driver.
 *
 * @returns The facade.
 *
 * @example
 * ```ts
 * if (await features().active('new-ui', user)) { … }
 * ```
 */
export function features(): Features {
    const driver = current.driver ?? new MemoryFlagDriver()
    const resolve = async (name: string, scope?: unknown): Promise<boolean> => {
        try {
            const key = scopeKey(scope)
            // 1. override wins
            const override = await driver.get(name, key)
            if (override !== undefined) return override
            // 2. definition
            const def = current.flags[name]
            if (def === undefined) return false // unknown → off (fail-closed)
            if (typeof def === 'boolean') return def
            if (typeof def === 'function') return !!(await def(scope))
            if (typeof def === 'object' && typeof def.rollout === 'number') {
                return inRollout(name, key, def.rollout)
            }
            return false
        } catch (error) {
            // Fail-closed, but never silent: a broken resolver/driver must be
            // distinguishable from a flag that is simply off. Logged as data
            // (no string interpolation of the name) — no log injection.
            console.warn('features: flag resolution failed; treating as off', {
                flag: name,
                error,
            })
            return false
        }
    }
    return {
        active: resolve,
        value: resolve,
        activate: (name, scope) =>
            Promise.resolve(driver.set(name, scopeKey(scope), true)),
        deactivate: (name, scope) =>
            Promise.resolve(driver.set(name, scopeKey(scope), false)),
        forget: (name, scope) =>
            Promise.resolve(driver.remove(name, scopeKey(scope))),
    }
}
