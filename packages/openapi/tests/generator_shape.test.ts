/**
 * @fileoverview Document-shape and defaulting tests for the OpenAPI generator (#183).
 *
 * The happy path (paths, parameters, tags) is covered in `generator.test.ts`.
 * This file pins the emitted document's SHAPE and the generator's defaulting
 * rules against route-metadata fixtures: the 3.0.0 envelope, default vs custom
 * servers, the derived operationId / tags / responses when `@ApiDoc` omits
 * them, requestBody & security propagation, merging multiple HTTP methods onto
 * one path item, and — importantly — that a controller with no `@ApiDoc` is
 * skipped entirely rather than emitted with empty operations.
 *
 * @module @lockness/openapi/tests/generator_shape
 */

import { assertEquals, assertFalse } from '@std/assert'
import { Controller, Get, Post } from '@lockness/core'
import { ApiDoc, generateOpenAPISpec } from '../mod.ts'
import type { ControllerClass } from '@lockness/core'

// ---- Fixtures ---------------------------------------------------------------

/** Minimal @ApiDoc: forces every default to be exercised. */
@Controller('/things')
class DefaultsController {
    @Get('/', { name: 'things.list' })
    @ApiDoc({ summary: 'List things' })
    list() {
        return []
    }
}

/** A fully specified operation: nothing should be defaulted. */
@Controller('/orders')
class RichController {
    @Post('/', { name: 'orders.create' })
    @ApiDoc({
        summary: 'Create order',
        operationId: 'orders.create',
        tags: ['Orders'],
        responses: { '201': { description: 'Created' } },
        requestBody: {
            required: true,
            content: {
                'application/json': { schema: { type: 'object' } },
            },
        },
        security: [{ bearerAuth: [] }],
    })
    create() {
        return { id: 1 }
    }
}

/** Two HTTP verbs on the same path → one merged path item. */
@Controller('/items')
class MultiMethodController {
    @Get('/', { name: 'items.index' })
    @ApiDoc({ summary: 'List items' })
    index() {
        return []
    }

    @Post('/', { name: 'items.store' })
    @ApiDoc({ summary: 'Create item' })
    store() {
        return { id: 1 }
    }
}

/** No @ApiDoc anywhere → the controller must be skipped. */
@Controller('/hidden')
class UndocumentedController {
    @Get('/', { name: 'hidden.index' })
    index() {
        return []
    }
}

const asClasses = (...c: unknown[]) => c as ControllerClass[]

// ---- Envelope + defaulting --------------------------------------------------

Deno.test('generator - emits the 3.0.0 envelope with a default server', () => {
    new DefaultsController()
    const spec = generateOpenAPISpec(asClasses(DefaultsController), {
        title: 'API',
        version: '1.0.0',
    })

    assertEquals(spec.openapi, '3.0.0')
    assertEquals(spec.info, {
        title: 'API',
        version: '1.0.0',
        description: undefined,
    })
    assertEquals(spec.servers, [
        { url: 'http://localhost:8888', description: 'Development server' },
    ])
})

Deno.test('generator - custom servers override the default', () => {
    new DefaultsController()
    const servers = [{ url: 'https://api.example.test', description: 'prod' }]
    const spec = generateOpenAPISpec(asClasses(DefaultsController), {
        title: 'API',
        version: '1.0.0',
        servers,
    })
    assertEquals(spec.servers, servers)
})

Deno.test('generator - derives operationId, tags and responses when omitted', () => {
    new DefaultsController()
    const spec = generateOpenAPISpec(asClasses(DefaultsController), {
        title: 'API',
        version: '1.0.0',
    })

    const op = spec.paths['/things/']?.get
    assertEquals(op?.operationId, 'DefaultsController.list')
    assertEquals(op?.tags, ['Defaults']) // controller name minus "Controller"
    assertEquals(op?.responses, {
        '200': { description: 'Successful response' },
    })
    // The derived tag also lands in the top-level tag list.
    assertEquals(spec.tags, [{ name: 'Defaults' }])
})

// ---- Propagation ------------------------------------------------------------

Deno.test('generator - propagates requestBody, security and explicit responses', () => {
    new RichController()
    const spec = generateOpenAPISpec(asClasses(RichController), {
        title: 'API',
        version: '1.0.0',
    })

    const op = spec.paths['/orders/']?.post
    assertEquals(op?.operationId, 'orders.create')
    assertEquals(op?.responses, { '201': { description: 'Created' } })
    assertEquals(op?.security, [{ bearerAuth: [] }])
    assertEquals(op?.requestBody?.required, true)
    assertEquals(
        op?.requestBody?.content['application/json']?.schema.type,
        'object',
    )
})

// ---- Path item merging ------------------------------------------------------

Deno.test('generator - merges multiple methods onto one path item', () => {
    new MultiMethodController()
    const spec = generateOpenAPISpec(asClasses(MultiMethodController), {
        title: 'API',
        version: '1.0.0',
    })

    const item = spec.paths['/items/']
    assertEquals(item?.get?.summary, 'List items')
    assertEquals(item?.post?.summary, 'Create item')
})

// ---- Skip rule --------------------------------------------------------------

Deno.test('generator - skips a controller with no @ApiDoc', () => {
    new UndocumentedController()
    const spec = generateOpenAPISpec(asClasses(UndocumentedController), {
        title: 'API',
        version: '1.0.0',
    })

    assertFalse('/hidden/' in spec.paths)
    assertEquals(spec.tags, [])
})
