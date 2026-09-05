/**
 * @fileoverview Tests for feeding API Resources into the OpenAPI document
 * (#251): registered Resource projections populate `components.schemas`, and a
 * `@ApiDoc` response that names a resource emits a `$ref` to it — with no
 * dangling reference remaining.
 *
 * @module @lockness/openapi/tests/generator_resources
 */

import { assertEquals, assertExists } from '@std/assert'
import { Controller, Get } from '@lockness/core'
import { ApiDoc, generateOpenAPISpec } from '../mod.ts'
import type { ControllerClass } from '@lockness/core'
import type { OpenAPISpec } from '../types.ts'

/** The projection schema a `UserResource` would contribute. */
const userSchema = {
    type: 'object',
    properties: { id: { type: 'integer' }, name: { type: 'string' } },
    required: ['id', 'name'],
}

@Controller('/users')
class UsersController {
    @Get('/:id', { name: 'users.show' })
    @ApiDoc({
        summary: 'Get user',
        tags: ['Users'],
        responses: {
            '200': { description: 'The user', resource: 'UserResource' },
            '404': { description: 'Not found' },
        },
    })
    show() {
        return { id: 1 }
    }

    @Get('/', { name: 'users.index' })
    @ApiDoc({
        summary: 'List users',
        tags: ['Users'],
        responses: {
            '200': {
                description: 'A page of users',
                resource: 'UserResource',
                resourceCollection: true,
            },
        },
    })
    index() {
        return []
    }
}

const asClasses = (...c: unknown[]) => c as ControllerClass[]

/** Every `$ref` in the document must resolve to a defined component schema. */
function collectRefs(node: unknown, out: string[]): void {
    if (Array.isArray(node)) {
        for (const item of node) collectRefs(item, out)
        return
    }
    if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
            if (key === '$ref' && typeof value === 'string') out.push(value)
            else collectRefs(value, out)
        }
    }
}

function assertNoDanglingRefs(spec: OpenAPISpec): void {
    const refs: string[] = []
    collectRefs(spec.paths, refs)
    const defined = new Set(
        Object.keys(spec.components?.schemas ?? {}).map(
            (name) => `#/components/schemas/${name}`,
        ),
    )
    for (const ref of refs) {
        assertEquals(
            defined.has(ref),
            true,
            `dangling $ref: ${ref} is not in components.schemas`,
        )
    }
}

Deno.test('generator - populates components.schemas from registered resources', () => {
    new UsersController()
    const spec = generateOpenAPISpec(asClasses(UsersController), {
        title: 'API',
        version: '1.0.0',
        resources: [{ name: 'UserResource', schema: userSchema }],
    })

    assertExists(spec.components?.schemas?.UserResource)
    assertEquals(spec.components?.schemas?.UserResource, userSchema)
})

Deno.test('generator - a resource-backed response emits a $ref to the schema', () => {
    new UsersController()
    const spec = generateOpenAPISpec(asClasses(UsersController), {
        title: 'API',
        version: '1.0.0',
        resources: [{ name: 'UserResource', schema: userSchema }],
    })

    const ok = spec.paths['/users/:id']?.get?.responses['200']
    assertEquals(ok?.content?.['application/json']?.schema, {
        $ref: '#/components/schemas/UserResource',
    })
    // A response with no resource is left untouched.
    assertEquals(spec.paths['/users/:id']?.get?.responses['404'], {
        description: 'Not found',
    })
})

Deno.test('generator - a collection response wraps the $ref in a data array', () => {
    new UsersController()
    const spec = generateOpenAPISpec(asClasses(UsersController), {
        title: 'API',
        version: '1.0.0',
        resources: [{ name: 'UserResource', schema: userSchema }],
    })

    const ok = spec.paths['/users/']?.get?.responses['200']
    assertEquals(ok?.content?.['application/json']?.schema, {
        type: 'object',
        properties: {
            data: {
                type: 'array',
                items: { $ref: '#/components/schemas/UserResource' },
            },
        },
    })
})

Deno.test('generator - no dangling $ref remains for resource-backed responses', () => {
    new UsersController()
    const spec = generateOpenAPISpec(asClasses(UsersController), {
        title: 'API',
        version: '1.0.0',
        resources: [{ name: 'UserResource', schema: userSchema }],
    })

    assertNoDanglingRefs(spec)
})

Deno.test('generator - an unregistered resource emits no $ref (never dangles)', () => {
    new UsersController()
    // No resources registered → no schema to reference.
    const spec = generateOpenAPISpec(asClasses(UsersController), {
        title: 'API',
        version: '1.0.0',
    })

    const ok = spec.paths['/users/:id']?.get?.responses['200']
    // The description survives; no content/$ref is invented.
    assertEquals(ok?.description, 'The user')
    assertEquals(ok?.content, undefined)
    assertNoDanglingRefs(spec)
})
