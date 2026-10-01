import { type Context, Controller, Get } from '@lockness/core'
import {
    ApiDoc,
    generateOpenAPISpec,
    loadDocumentedControllers,
    serveSwaggerUI,
} from '@lockness/openapi'

@Controller('/api-docs')
export class ApiDocsController {
    @Get('/', { name: 'api-docs.index' })
    @ApiDoc({
        summary: 'Swagger UI Documentation',
        description: 'Interactive API documentation interface',
        tags: ['Documentation'],
    })
    async index(c: Context) {
        const controllers = (await loadDocumentedControllers())
            .filter((controller) => controller !== ApiDocsController)
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
        const controllers = (await loadDocumentedControllers())
            .filter((controller) => controller !== ApiDocsController)
        const spec = generateOpenAPISpec(controllers, {
            title: 'Lockness API',
            version: '1.0.0',
            description: 'Full-stack Deno framework API documentation',
        })

        const swagger = serveSwaggerUI(spec)
        return swagger.spec(c)
    }
}
