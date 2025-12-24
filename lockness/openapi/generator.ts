/**
 * OpenAPI Spec Generator
 * Scans controllers and generates OpenAPI 3.0 spec
 */

import type { ControllerClass } from '@lockness/core'
import { getApiDocMetadata, hasApiDoc } from './decorator.ts'
import type { OpenAPISpec, PathItem, Operation } from './types.ts'

export interface GenerateSpecOptions {
    title: string
    version: string
    description?: string
    servers?: Array<{
        url: string
        description?: string
    }>
}

// Symbol keys from core (we'll read them directly)
const CONTROLLER_METADATA = Symbol('controller_metadata')
const METHOD_METADATA = Symbol('method_metadata')

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

    const tags = new Set<string>()

    for (const controller of controllers) {
        // Read controller metadata
        const controllerAny = controller as {
            _basePath?: string
            _routes?: Array<{ method: string; path: string; methodName: string }>
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
                operationId:
                    apiDoc.operationId || `${controller.name}.${route.methodName}`,
                tags: apiDoc.tags || [
                    controller.name.replace('Controller', ''),
                ],
                parameters: apiDoc.parameters || [],
                responses: apiDoc.responses || {
                    '200': {
                        description: 'Successful response',
                    },
                },
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
