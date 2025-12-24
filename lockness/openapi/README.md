# @lockness/openapi

OpenAPI 3.0 documentation generator for Lockness framework.

## Features

- 🎯 **Decorator-based**: Document routes with `@ApiDoc()`
- 📝 **OpenAPI 3.0**: Industry-standard API documentation
- 🚀 **Automatic generation**: Scans controllers and builds spec
- 📊 **Swagger UI**: Interactive API documentation interface
- 🔧 **CLI command**: Generate JSON spec files with Ace

## Installation

Already included in Lockness framework. Import from `@lockness/openapi`:

```typescript
import { ApiDoc, generateOpenAPISpec, serveSwaggerUI } from '@lockness/openapi'
```

## Usage

### Document Routes

Use the `@ApiDoc()` decorator to document your controller methods:

```typescript
import { type Context, Controller, Get, Post } from 'lockness'
import { ApiDoc } from '@lockness/openapi'

@Controller('/users')
export class UserController {
    @Get('/')
    @ApiDoc({
        summary: 'List all users',
        description: 'Returns a paginated list of users',
        tags: ['Users'],
        parameters: [
            {
                name: 'page',
                in: 'query',
                schema: { type: 'integer', default: 1 },
            },
            {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', default: 10 },
            },
        ],
        responses: {
            '200': {
                description: 'List of users',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                data: {
                                    type: 'array',
                                    items: {
                                        $ref: '#/components/schemas/User',
                                    },
                                },
                                total: { type: 'integer' },
                            },
                        },
                    },
                },
            },
        },
    })
    async list(c: Context) {
        // ...
    }

    @Post('/')
    @ApiDoc({
        summary: 'Create a new user',
        description: 'Creates a new user with the provided data',
        tags: ['Users'],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        required: ['email', 'password'],
                        properties: {
                            email: { type: 'string', format: 'email' },
                            password: { type: 'string', minLength: 8 },
                            name: { type: 'string' },
                        },
                    },
                },
            },
        },
        responses: {
            '201': {
                description: 'User created successfully',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/User' },
                    },
                },
            },
            '400': {
                description: 'Validation error',
            },
        },
    })
    async create(c: Context) {
        // ...
    }
}
```

### Serve Swagger UI

Create a docs controller to serve the Swagger UI:

```typescript
import { type Context, Controller, Get } from 'lockness'
import {
    ApiDoc,
    type ControllerClass,
    generateOpenAPISpec,
    serveSwaggerUI,
} from '@lockness/openapi'

async function loadControllers(): Promise<ControllerClass[]> {
    // Load your controllers...
}

@Controller('/docs')
export class DocsController {
    @Get('/')
    async index(c: Context) {
        const controllers = await loadControllers()
        const spec = generateOpenAPISpec(controllers, {
            title: 'My API',
            version: '1.0.0',
            description: 'My awesome API documentation',
        })

        const swagger = serveSwaggerUI(spec)
        return swagger.ui(c)
    }

    @Get('/openapi.json')
    async spec(c: Context) {
        const controllers = await loadControllers()
        const spec = generateOpenAPISpec(controllers, {
            title: 'My API',
            version: '1.0.0',
        })

        const swagger = serveSwaggerUI(spec)
        return swagger.spec(c)
    }
}
```

### Generate JSON Spec

Use the Ace CLI command to generate an OpenAPI JSON file:

```bash
deno task ace docs:generate --output public/openapi.json
```

Options:

- `--output <path>`: Output file path (default: `public/openapi.json`)
- `--title <title>`: API title (default: `Lockness API`)
- `--version <version>`: API version (default: `1.0.0`)

## API Documentation Metadata

The `@ApiDoc()` decorator accepts the following properties:

```typescript
{
    summary?: string                  // Short summary
    description?: string              // Detailed description
    operationId?: string              // Unique operation identifier
    tags?: string[]                   // Grouping tags
    parameters?: Parameter[]          // Query/path/header parameters
    requestBody?: RequestBody         // Request body schema
    responses?: Record<string, Response>  // Response schemas by status code
    security?: SecurityRequirement[]  // Security requirements
}
```

### Parameters

```typescript
{
    name: string               // Parameter name
    in: 'query' | 'path' | 'header'  // Location
    required?: boolean         // Is required
    description?: string       // Parameter description
    schema: Schema            // JSON Schema definition
}
```

### Request Body

```typescript
{
    required?: boolean
    description?: string
    content: {
        'application/json': {
            schema: Schema    // JSON Schema
        }
    }
}
```

### Responses

```typescript
{
    '200': {
        description: string
        content?: {
            'application/json': {
                schema: Schema
            }
        }
    }
}
```

## Example: Full API Documentation

```typescript
@Controller('/api/posts')
export class PostController {
    @Get('/:id')
    @ApiDoc({
        summary: 'Get post by ID',
        description: 'Retrieves a single post by its unique identifier',
        tags: ['Posts'],
        parameters: [
            {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
                description: 'Post ID',
            },
        ],
        responses: {
            '200': {
                description: 'Post found',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                id: { type: 'integer' },
                                title: { type: 'string' },
                                content: { type: 'string' },
                                author: { type: 'string' },
                                createdAt: {
                                    type: 'string',
                                    format: 'date-time',
                                },
                            },
                        },
                    },
                },
            },
            '404': {
                description: 'Post not found',
            },
        },
    })
    async show(c: Context) {
        const id = c.req.param('id')
        // ...
    }
}
```

## Architecture

The OpenAPI package follows Lockness patterns:

- **Symbol-based metadata**: Uses `addInitializer` with TypeScript 5.x
  decorators
- **Controller scanning**: Dynamically loads and inspects controllers
- **Zero bundling**: Swagger UI served via CDN
- **100% Deno native**: No external build tools required

## License

MIT
