/**
 * @fileoverview Public surface of `@lockness/features` — feature flags with
 * per-scope resolution, deterministic rollout, and a pluggable override store.
 *
 * @module @lockness/features
 *
 * @example
 * ```ts
 * import { configureFeatures, features } from '@lockness/features'
 *
 * configureFeatures({ flags: { 'new-ui': { rollout: 25 } } })
 * if (await features().active('new-ui', user)) { … }
 * ```
 *
 * Feature flags are a rollout/config mechanism, **not** an authorization
 * boundary: for a flag that gates access or entitlement, pass a **server-
 * verified** scope, never a raw header/cookie/param.
 */

export {
    configureFeatures,
    type Features,
    features,
    type FeaturesConfig,
    type FlagDefinition,
    resetFeatures,
    scopeKey,
} from './features.ts'
export { type FlagDriver, MemoryFlagDriver } from './driver.ts'
export { inRollout, stableHash } from './rollout.ts'
export {
    type Cli,
    FLAGS_DIR,
    handleMakeFlag,
    isContained,
    registerFeaturesCommands,
} from './cli_commands.ts'
