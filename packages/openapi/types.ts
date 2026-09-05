/**
 * OpenAPI Types
 */

export interface OpenAPISpec {
    openapi: string
    info: {
        title: string
        version: string
        description?: string
    }
    servers?: Array<{
        url: string
        description?: string
    }>
    paths: Record<string, PathItem>
    components?: {
        schemas?: Record<string, Schema>
        securitySchemes?: Record<string, SecurityScheme>
    }
    tags?: Array<{
        name: string
        description?: string
    }>
}

export interface PathItem {
    get?: Operation
    post?: Operation
    put?: Operation
    patch?: Operation
    delete?: Operation
}

export interface Operation {
    summary?: string
    description?: string
    operationId?: string
    tags?: string[]
    parameters?: Parameter[]
    requestBody?: RequestBody
    responses: Record<string, Response>
    security?: Array<Record<string, string[]>>
}

export interface Parameter {
    name: string
    in: 'query' | 'header' | 'path' | 'cookie'
    description?: string
    required?: boolean
    schema: Schema
}

export interface RequestBody {
    description?: string
    required?: boolean
    content: Record<string, MediaType>
}

export interface MediaType {
    schema: Schema
    example?: unknown
}

export interface Response {
    description: string
    content?: Record<string, MediaType>
    /**
     * Name of the API Resource whose projection is this response body. When it
     * matches a resource registered via {@link GenerateSpecOptions.resources},
     * the generator sets `content['application/json'].schema` to a `$ref` at
     * `#/components/schemas/<resource>`; unmatched names emit no `$ref` (so a
     * reference never dangles). Hand-authored `content` takes precedence.
     */
    resource?: string
    /**
     * When paired with {@link Response.resource}, wraps the `$ref` in the
     * collection envelope `{ data: [ ...ref ] }` — the shape a
     * `ResourceCollection` serialises to.
     */
    resourceCollection?: boolean
}

export interface Schema {
    type?: string
    format?: string
    properties?: Record<string, Schema>
    items?: Schema
    required?: string[]
    example?: unknown
    description?: string
    enum?: unknown[]
    $ref?: string
}

export interface SecurityScheme {
    type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect'
    description?: string
    name?: string
    in?: 'query' | 'header' | 'cookie'
    scheme?: string
    bearerFormat?: string
}

export interface ApiDocMetadata {
    summary?: string
    description?: string
    tags?: string[]
    parameters?: Parameter[]
    requestBody?: RequestBody
    responses?: Record<string, Response>
    security?: Array<Record<string, string[]>>
    operationId?: string
}
