/**
 * @fileoverview `defineViteConfig()` — merges a partial user config over the
 * authoritative {@link DEFAULTS}, giving every Lockness Vite plugin a single,
 * fully-populated config object.
 *
 * @module @lockness/vite/define_config
 */

import { DEFAULTS, type LocknessViteConfig } from './shared.ts'

/**
 * Merge a partial Lockness Vite config over {@link DEFAULTS}.
 *
 * Only the keys the caller provides override the defaults; every other key keeps
 * its `DEFAULTS` value, so the result is always fully populated.
 *
 * @param config - A partial config; omitted keys fall back to `DEFAULTS`.
 * @returns A fully-resolved config with every field set.
 *
 * @example
 * ```typescript
 * defineViteConfig({ port: 3000 }) // { …DEFAULTS, port: 3000 }
 * ```
 */
export function defineViteConfig(
    config: Partial<LocknessViteConfig> = {},
): Required<LocknessViteConfig> {
    // Drop explicit `undefined` values so `{ port: undefined }` keeps the default
    // rather than punching a hole in the Required<> result.
    const provided: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) provided[key] = value
    }
    return { ...DEFAULTS, ...(provided as Partial<LocknessViteConfig>) }
}
