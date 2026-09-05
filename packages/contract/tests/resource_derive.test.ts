/**
 * @fileoverview Tests for {@link deriveJsonSchema} — inferring a JSON Schema
 * from a sample resource projection (the `toArray()`/`toJSON()` output).
 *
 * @module @lockness/contract/tests/resource_derive
 */

import { assertEquals } from '@std/assert'
import { deriveJsonSchema } from '../resource/derive.ts'

Deno.test('deriveJsonSchema - infers primitive property types', () => {
    const schema = deriveJsonSchema({
        id: 1,
        ratio: 1.5,
        name: 'ada',
        active: true,
    })

    assertEquals(schema.type, 'object')
    assertEquals(schema.properties, {
        id: { type: 'integer' },
        ratio: { type: 'number' },
        name: { type: 'string' },
        active: { type: 'boolean' },
    })
    assertEquals(schema.required, ['id', 'ratio', 'name', 'active'])
})

Deno.test('deriveJsonSchema - infers array items from the first element', () => {
    const schema = deriveJsonSchema({ tags: ['a', 'b'], empty: [] })

    assertEquals(schema.properties?.tags, {
        type: 'array',
        items: { type: 'string' },
    })
    // An empty array cannot be sampled → items is an open schema.
    assertEquals(schema.properties?.empty, { type: 'array', items: {} })
})

Deno.test('deriveJsonSchema - recurses into nested objects', () => {
    const schema = deriveJsonSchema({
        author: { id: 7, name: 'grace' },
    })

    assertEquals(schema.properties?.author, {
        type: 'object',
        properties: { id: { type: 'integer' }, name: { type: 'string' } },
        required: ['id', 'name'],
    })
})

Deno.test('deriveJsonSchema - null becomes an open schema and is optional', () => {
    const schema = deriveJsonSchema({ id: 1, deletedAt: null })

    assertEquals(schema.properties?.deletedAt, {})
    // A null-valued field cannot be proven present-with-a-type → not required.
    assertEquals(schema.required, ['id'])
})

Deno.test('deriveJsonSchema - undefined values are omitted entirely', () => {
    const schema = deriveJsonSchema({
        id: 1,
        missing: undefined,
    } as Record<string, unknown>)

    assertEquals(schema.properties, { id: { type: 'integer' } })
    assertEquals(schema.required, ['id'])
})

Deno.test('deriveJsonSchema - empty projection yields an empty object schema', () => {
    const schema = deriveJsonSchema({})

    assertEquals(schema, { type: 'object', properties: {} })
})
