/**
 * @fileoverview The resource-schema contract — the shared vocabulary a
 * {@link https://spec.openapis.org/oas/v3.0.3#schema-object | JSON Schema}
 * projection speaks so that `@lockness/core`'s `Resource` (which produces it)
 * and `@lockness/openapi` (which documents it) agree without depending on each
 * other.
 *
 * These live in `@lockness/contract` — the foundation package everything may
 * import — for the same reason the pagination envelope does: it lets the
 * documentation generator describe a model's wire projection without a
 * dependency on the framework core, and lets the core declare that projection
 * without a dependency on the doc tooling.
 *
 * Types only; the derivation runtime lives beside this file in `derive.ts`.
 *
 * @module @lockness/contract/resource/types
 * @since 0.2.1
 */

/**
 * A minimal, self-referential JSON Schema fragment — the subset an API resource
 * projection needs to describe itself. Structurally compatible with the OpenAPI
 * 3.0 Schema Object, so `@lockness/openapi` can drop it straight into
 * `components.schemas`.
 *
 * @example
 * ```typescript
 * const schema: JsonSchema = {
 *     type: 'object',
 *     properties: { id: { type: 'integer' }, name: { type: 'string' } },
 *     required: ['id', 'name'],
 * }
 * ```
 */
export interface JsonSchema {
    /** JSON Schema primitive/composite type (`object`, `array`, `string`, …). */
    type?: string
    /** Semantic format hint (`date-time`, `email`, …). */
    format?: string
    /** Property schemas when `type` is `object`. */
    properties?: Record<string, JsonSchema>
    /** Element schema when `type` is `array`. */
    items?: JsonSchema
    /** Names of required properties. */
    required?: string[]
    /** Allowed values, when the field is an enumeration. */
    enum?: unknown[]
    /** A representative example value. */
    example?: unknown
    /** Human-readable description. */
    description?: string
    /** A reference to another schema (`#/components/schemas/Name`). */
    $ref?: string
}

/**
 * A named resource projection schema — what a `Resource` contributes to a
 * document's reusable schema catalogue. The `name` is the key under
 * `components.schemas`; the `schema` is the projection's shape.
 *
 * @example
 * ```typescript
 * const descriptor: ResourceSchema = {
 *     name: 'UserResource',
 *     schema: { type: 'object', properties: { id: { type: 'integer' } } },
 * }
 * ```
 */
export interface ResourceSchema {
    /** The component key — the name a `$ref` points at. */
    readonly name: string
    /** The projection's JSON Schema. */
    readonly schema: JsonSchema
}
