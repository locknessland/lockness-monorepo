# Lockness OpenAPI

OpenAPI 3.0 documentation generator with decorator-based API documentation and
Swagger UI.

## Overview

@lockness/openapi automatically generates OpenAPI 3.0 specifications from
Lockness controllers using the @ApiDoc() decorator. Includes Swagger UI
integration and CLI command for JSON spec generation.

## Installation

```typescript
import { ApiDoc, generateOpenAPISpec, serveSwaggerUI } from '@lockness/openapi'
```

## Basic Usage

### Document Routes

Use @ApiDoc() decorator to document controller methods:

```typescript
import { type Context, Controller, Get, Post } from '@lockness/core'
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
        // Implementation
    }

    @Post('/')
    @ApiDoc({
        summary: 'Create a new user',
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
            '400': { description: 'Validation error' },
        },
    })
    async create(c: Context) {
        // Implementation
    }
}
```

### Serve Swagger UI

```typescript
import {
    type Context,
    Controller,
    type ControllerClass,
    Get,
} from '@lockness/core'
import { generateOpenAPISpec, serveSwaggerUI } from '@lockness/openapi'

@Controller('/api-docs')
export class ApiDocsController {
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

## CLI Command

Generate OpenAPI JSON spec file:

```bash
deno task cli docs:generate --output public/openapi.json
deno task cli docs:generate --output api-spec.json --title "My API" --version "2.0.0"
```

Options:

- `--output <path>` - Output file path (default: public/openapi.json)
- `--title <title>` - API title (default: Lockness API)
- `--version <version>` - API version (default: 1.0.0)

## API Reference

### @ApiDoc() Properties

```typescript
{
    summary?: string                     // Short summary
    description?: string                 // Detailed description
    operationId?: string                 // Unique operation identifier
    tags?: string[]                      // Grouping tags
    parameters?: Parameter[]             // Query/path/header parameters
    requestBody?: RequestBody            // Request body schema
    responses?: Record<string, Response> // Response schemas by status code
    security?: SecurityRequirement[]     // Security requirements
}
```

### Parameter Definition

```typescript
{
    name: string                        // Parameter name
    in: 'query' | 'path' | 'header'    // Location
    required?: boolean                  // Is required
    description?: string                // Parameter description
    schema: Schema                      // JSON Schema definition
}
```

### Request Body Definition

```typescript
{
    required?: boolean
    description?: string
    content: {
        'application/json': {
            schema: Schema              // JSON Schema
        }
    }
}
```

### Response Definition

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

## Common Use Cases

### Path Parameters

```typescript
@Get('/:id')
@ApiDoc({
    summary: 'Get user by ID',
    tags: ['Users'],
    parameters: [
        {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'User ID',
        },
    ],
    responses: {
        '200': {
            description: 'User found',
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                },
            },
        },
        '404': { description: 'User not found' },
    },
})
async show(c: Context) {
    const id = c.req.param('id')
    // Implementation
}
```

### Query Parameters

```typescript
@Get('/search')
@ApiDoc({
    summary: 'Search users',
    tags: ['Users'],
    parameters: [
        {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Search query',
        },
        {
            name: 'role',
            in: 'query',
            schema: { type: 'string', enum: ['admin', 'user'] },
            description: 'Filter by role',
        },
    ],
    responses: {
        '200': {
            description: 'Search results',
            content: {
                'application/json': {
                    schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' },
                    },
                },
            },
        },
    },
})
async search(c: Context) {
    // Implementation
}
```

### Reusable Schemas from API Resources

An API `Resource` (`@lockness/core`) already declares a model's wire projection
— which is exactly the response schema the document should emit. Register your
resources' schemas via the `resources` option and they populate
`components.schemas`; a `@ApiDoc` response then references one by name and the
generator emits a `$ref` to it (never a dangling one).

A resource derives its schema from a representative instance, or declares an
explicit one by overriding `schema()`:

```typescript
import { generateOpenAPISpec } from '@lockness/openapi'
import { UserResource } from '../app/resource/user_resource.ts'

const spec = generateOpenAPISpec(controllers, {
    title: 'My API',
    version: '1.0.0',
    resources: [
        // Derived from the guarded wire shape (never-serialise fields excluded).
        { name: 'UserResource', schema: new UserResource(sampleUser).schema() },
    ],
})
```

Point a response at a registered resource with `resource` (single) or
`resource` + `resourceCollection` (a `{ data: [...] }` envelope):

```typescript
@Get('/:id')
@ApiDoc({
    summary: 'Get user',
    responses: {
        // → schema: { $ref: '#/components/schemas/UserResource' }
        '200': { description: 'The user', resource: 'UserResource' },
        '404': { description: 'Not found' },
    },
})
show(c: Context) {/* ... */}

@Get('/')
@ApiDoc({
    summary: 'List users',
    responses: {
        // → { type: 'object', properties: { data: { type: 'array',
        //      items: { $ref: '#/components/schemas/UserResource' } } } }
        '200': {
            description: 'A page of users',
            resource: 'UserResource',
            resourceCollection: true,
        },
    },
})
index(c: Context) {/* ... */}
```

A `resource` that is not registered emits no `$ref` — the response keeps its
description untouched, so a reference never dangles. Non-resource bodies stay
hand-authored via `content` as shown above.

### Authentication Documentation

```typescript
@Post('/login')
@ApiDoc({
    summary: 'User login',
    tags: ['Auth'],
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
                    },
                },
            },
        },
    },
    responses: {
        '200': {
            description: 'Login successful',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            token: { type: 'string' },
                            user: { $ref: '#/components/schemas/User' },
                        },
                    },
                },
            },
        },
        '401': { description: 'Invalid credentials' },
    },
})
async login(c: Context) {
    // Implementation
}
```

## Best Practices

- Group related endpoints using `tags`
- Use `$ref` for reusable schemas to reduce duplication
- Document all possible response status codes
- Include descriptions for parameters and request bodies
- Use standard HTTP status codes (200, 201, 400, 401, 404, 500)
- Define schemas in `components` for common data structures
- Add security requirements for protected endpoints
- Use `operationId` for unique endpoint identifiers
- Document query parameter defaults and constraints
- Include examples in schemas for better documentation

## Architecture

- Symbol-based metadata using TypeScript 5.x decorators
- Dynamic controller scanning and inspection
- Zero bundling - Swagger UI served via CDN
- 100% Deno native - no external build tools required
