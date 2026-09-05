/**
 * @fileoverview Derive a {@link JsonSchema} from a sample resource projection.
 *
 * A `Resource`'s wire shape is whatever its `toArray()`/`toJSON()` returns. When
 * a subclass has not *declared* an explicit schema, this infers one from a
 * representative projected object — the "derive" half of "declare or derive".
 * Pure and I/O-free, so it belongs in the foundation package: both the core
 * (which owns `Resource`) and the doc generator can reach it.
 *
 * @module @lockness/contract/resource/derive
 * @since 0.2.1
 */

import type { JsonSchema } from './types.ts'

/**
 * Infer a schema for a single value.
 *
 * `null` yields an open schema (`{}`) because a null carries no type; arrays are
 * sampled from their first element (an empty array yields open `items`); numbers
 * split into `integer` vs `number` by {@link Number.isInteger}.
 *
 * @param value - The value to describe.
 * @returns The inferred schema fragment.
 */
function deriveValueSchema(value: unknown): JsonSchema {
    if (value === null) return {}

    if (Array.isArray(value)) {
        return {
            type: 'array',
            items: value.length > 0 ? deriveValueSchema(value[0]) : {},
        }
    }

    switch (typeof value) {
        case 'string':
            return { type: 'string' }
        case 'number':
            return { type: Number.isInteger(value) ? 'integer' : 'number' }
        case 'bigint':
            return { type: 'integer' }
        case 'boolean':
            return { type: 'boolean' }
        case 'object':
            return deriveJsonSchema(value as Record<string, unknown>)
        default:
            // symbol / function / undefined have no JSON representation.
            return {}
    }
}

/**
 * Derive an object {@link JsonSchema} from a sample resource projection.
 *
 * Every own enumerable key with a defined value becomes a property; a key is
 * marked `required` when its sampled value has a concrete inferred type (i.e.
 * is neither `undefined` nor `null`). `undefined` values are omitted entirely,
 * matching `JSON.stringify` semantics.
 *
 * @param sample - A representative projected object (e.g. `resource.toJSON()`).
 * @returns The object schema describing the projection.
 *
 * @example
 * ```typescript
 * deriveJsonSchema({ id: 1, name: 'ada' })
 * // → { type: 'object',
 * //     properties: { id: { type: 'integer' }, name: { type: 'string' } },
 * //     required: ['id', 'name'] }
 * ```
 */
export function deriveJsonSchema(
    sample: Record<string, unknown>,
): JsonSchema {
    const properties: Record<string, JsonSchema> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(sample)) {
        if (value === undefined) continue
        properties[key] = deriveValueSchema(value)
        if (value !== null) required.push(key)
    }

    const schema: JsonSchema = { type: 'object', properties }
    if (required.length > 0) schema.required = required
    return schema
}
