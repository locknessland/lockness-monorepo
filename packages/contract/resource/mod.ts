/**
 * @fileoverview Public entry point for the `@lockness/contract` resource-schema
 * module — the JSON Schema contract a `Resource` projection speaks, plus the
 * derivation helper that infers one from a sample projection.
 *
 * Re-exported by `@lockness/contract` (so `import { deriveJsonSchema } from
 * '@lockness/core'` works through core's `export *`) and reachable directly via
 * the `@lockness/contract/resource` subpath.
 *
 * @module @lockness/contract/resource
 * @since 0.2.1
 */

export { deriveJsonSchema } from './derive.ts'
export type { JsonSchema, ResourceSchema } from './types.ts'
