import {
    type Context,
    Controller,
    type ControllerClass,
    Get,
} from '@lockness/core'
import { ApiDoc, generateOpenAPISpec, serveSwaggerUI } from '@lockness/openapi'
import { join } from '@std/path'

async function loadControllers(): Promise<ControllerClass[]> {
    const controllers: ControllerClass[] = []
    const controllersDir = './app/controller'

    try {
        for await (const entry of Deno.readDir(controllersDir)) {
            if (
                entry.isFile &&
                (entry.name.endsWith('_controller.ts') ||
                    entry.name.endsWith('_controller.tsx')) &&
                entry.name !== 'api_docs_controller.ts' // Skip self
            ) {
                const modulePath = join(controllersDir, entry.name)
                const module = await import(
                    `file://${Deno.cwd()}/${modulePath}`
                )

                // Get all exported controllers
                for (const key of Object.keys(module)) {
                    const exported = module[key]
                    if (
                        typeof exported === 'function' &&
                        key.endsWith('Controller')
                    ) {
                        controllers.push(exported as ControllerClass)
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error loading controllers:', error)
    }

    return controllers
}

@Controller('/api-docs')
export class ApiDocsController {
    @Get('/', { name: 'api-docs.index' })
    @ApiDoc({
        summary: 'Swagger UI Documentation',
        description: 'Interactive API documentation interface',
        tags: ['Documentation'],
    })
    async index(c: Context) {
        const controllers = await loadControllers()
        const spec = generateOpenAPISpec(controllers, {
            title: 'Lockness API',
            version: '1.0.0',
            description: 'Full-stack Deno framework API documentation',
        })

        const swagger = serveSwaggerUI(spec)
        return swagger.ui(c)
    }

    @Get('/openapi.json', { name: 'api-docs.spec' })
    @ApiDoc({
        summary: 'OpenAPI Specification',
        description: 'Returns the OpenAPI 3.0 specification in JSON format',
        tags: ['Documentation'],
        responses: {
            '200': {
                description: 'OpenAPI 3.0 specification',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                        },
                    },
                },
            },
        },
    })
    async spec(c: Context) {
        const controllers = await loadControllers()
        const spec = generateOpenAPISpec(controllers, {
            title: 'Lockness API',
            version: '1.0.0',
            description: 'Full-stack Deno framework API documentation',
        })

        const swagger = serveSwaggerUI(spec)
        return swagger.spec(c)
    }
}
