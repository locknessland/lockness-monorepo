import { assertEquals, assertExists } from '@std/assert'
import { Controller, Get } from '@lockness/core'
import { ApiDoc } from '../decorator.ts'
import { generateOpenAPISpec } from '../generator.ts'
import type { ControllerClass } from '@lockness/core'

@Controller('/users')
class TestController {
    @Get('/', { name: 'users.index' })
    @ApiDoc({
        summary: 'List users',
        description: 'Returns a list of all users',
        tags: ['Users'],
    })
    index() {
        return []
    }

    @Get('/:id', { name: 'users.show' })
    @ApiDoc({
        summary: 'Get user',
        description: 'Returns a single user by ID',
        tags: ['Users'],
        parameters: [
            {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
            },
        ],
    })
    show() {
        return { id: 1 }
    }
}

Deno.test('OpenAPI - generateOpenAPISpec', () => {
    const controllers = [TestController] as unknown as ControllerClass[]

    // Trigger decorators by instantiating the controller
    new TestController()

    const spec = generateOpenAPISpec(controllers, {
        title: 'Test API',
        version: '1.2.3',
        description: 'A test API documentation',
    })

    assertExists(spec)
    assertEquals(spec.info.title, 'Test API')
    assertEquals(spec.info.version, '1.2.3')
    assertEquals(spec.info.description, 'A test API documentation')

    // Check paths
    assertExists(spec.paths['/users/'])
    assertExists(spec.paths['/users/']?.get)
    assertEquals(spec.paths['/users/']?.get?.summary, 'List users')

    assertExists(spec.paths['/users/:id'])
    assertExists(spec.paths['/users/:id']?.get)
    assertEquals(spec.paths['/users/:id']?.get?.summary, 'Get user')
    assertEquals(spec.paths['/users/:id']?.get?.parameters?.length, 1)
})

Deno.test('OpenAPI - tags generation', () => {
    const controllers = [TestController] as unknown as ControllerClass[]
    new TestController()

    const spec = generateOpenAPISpec(controllers, {
        title: 'Test API',
        version: '1.0.0',
    })

    assertExists(spec.tags)
    assertEquals(spec.tags.length, 1)
    assertEquals(spec.tags[0].name, 'Users')
})
