/**
 * OpenAPI Spec Generator
 * Scans controllers and generates OpenAPI 3.0 spec
 */

import type { ControllerClass, ResourceSchema } from '@lockness/contract'
import { getApiDocMetadata, hasApiDoc } from './decorator.ts'
import type {
    OpenAPISpec,
    Operation,
    PathItem,
    Response,
    Schema,
} from './types.ts'

export interface GenerateSpecOptions {
    title: string
    version: string
    description?: string
    servers?: Array<{
        url: string
        description?: string
    }>
    /**
     * API Resource projection schemas to publish under `components.schemas`.
     * Each `name` becomes a component key that a `@ApiDoc` response can target
     * via {@link Response.resource}. Build them from your resources — e.g.
     * `{ name: 'UserResource', schema: new UserResource(sample).schema() }`.
     */
    resources?: ResourceSchema[]
}

/**
 * Resolve a resource-backed {@link Response} into one whose JSON content is a
 * `$ref` to a registered schema. A response is transformed only when it names a
 * {@link Response.resource} that is registered *and* carries no hand-authored
 * `content`; otherwise it is returned unchanged (so a `$ref` never dangles).
 * The marker fields (`resource`, `resourceCollection`) are dropped from output.
 *
 * @param response - The response as authored on `@ApiDoc`.
 * @param registered - Names present in `components.schemas`.
 * @returns The response with a `$ref` body, or the original response.
 */
function resolveResourceResponse(
    response: Response,
    registered: ReadonlySet<string>,
): Response {
    const { resource, resourceCollection, ...rest } = response
    if (!resource || rest.content || !registered.has(resource)) {
        return rest
    }

    const ref: Schema = { $ref: `#/components/schemas/${resource}` }
    const schema: Schema = resourceCollection
        ? {
            type: 'object',
            properties: { data: { type: 'array', items: ref } },
        }
        : ref

    return { ...rest, content: { 'application/json': { schema } } }
}

export function generateOpenAPISpec(
    controllers: ControllerClass[],
    options: GenerateSpecOptions,
): OpenAPISpec {
    const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: {
            title: options.title,
            version: options.version,
            description: options.description,
        },
        servers: options.servers || [
            {
                url: 'http://localhost:8888',
                description: 'Development server',
            },
        ],
        paths: {},
        tags: [],
    }

    // Publish registered Resource projections as reusable component schemas.
    const registered = new Set<string>()
    if (options.resources && options.resources.length > 0) {
        const schemas: Record<string, Schema> = {}
        for (const { name, schema } of options.resources) {
            schemas[name] = schema
            registered.add(name)
        }
        spec.components = { ...spec.components, schemas }
    }

    const tags = new Set<string>()

    for (const controller of controllers) {
        // Read controller metadata
        const controllerAny = controller as {
            _basePath?: string
            _routes?: Array<
                { method: string; path: string; methodName: string }
            >
        }

        // Create a temporary instance to trigger decorator initializers if needed
        if (!controllerAny._routes || controllerAny._routes.length === 0) {
            try {
                new controller()
            } catch {
                // Ignore instantiation errors
            }
        }

        if (!hasApiDoc(controller)) {
            continue // Skip controllers without @ApiDoc
        }

        const basePath = controllerAny._basePath || ''
        const routes = controllerAny._routes || []

        for (const route of routes) {
            const apiDoc = getApiDocMetadata(controller, route.methodName)

            if (!apiDoc) continue

            const fullPath = `/${basePath}/${route.path}`.replace(/\/+/g, '/')
            const httpMethod = route.method.toLowerCase()

            if (!spec.paths[fullPath]) {
                spec.paths[fullPath] = {}
            }

            const operation: Operation = {
                summary: apiDoc.summary,
                description: apiDoc.description,
                operationId: apiDoc.operationId ||
                    `${controller.name}.${route.methodName}`,
                tags: apiDoc.tags || [
                    controller.name.replace('Controller', ''),
                ],
                parameters: apiDoc.parameters || [],
                responses: apiDoc.responses
                    ? Object.fromEntries(
                        Object.entries(apiDoc.responses).map((
                            [status, response],
                        ) => [
                            status,
                            resolveResourceResponse(response, registered),
                        ]),
                    )
                    : { '200': { description: 'Successful response' } },
            }

            if (apiDoc.requestBody) {
                operation.requestBody = apiDoc.requestBody
            }

            if (apiDoc.security) {
                operation.security = apiDoc.security
            }

            // Add tags
            if (operation.tags) {
                operation.tags.forEach((tag) => tags.add(tag))
            }

            spec.paths[fullPath][httpMethod as keyof PathItem] = operation
        }
    }

    // Convert tags set to array
    spec.tags = Array.from(tags).map((name) => ({ name }))

    return spec
}
