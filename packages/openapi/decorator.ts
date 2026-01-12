/**
 * @ApiDoc Decorator
 * Documents API routes with OpenAPI metadata
 */

import type { ApiDocMetadata } from './types.ts'

const API_DOC_METADATA = Symbol('api_doc_metadata')

export function ApiDoc(metadata: ApiDocMetadata): (
    target: unknown,
    context: ClassMethodDecoratorContext,
) => void {
    return function (
        _target: unknown,
        context: ClassMethodDecoratorContext,
    ) {
        const methodName = String(context.name)

        let initialized = false
        context.addInitializer(function (this: unknown) {
            if (!initialized) {
                initialized = true
                const constructor =
                    (this as { constructor: unknown }).constructor

                if (
                    !(constructor as Record<PropertyKey, unknown>)[
                        API_DOC_METADATA
                    ]
                ) {
                    ;(constructor as Record<PropertyKey, unknown>)[
                        API_DOC_METADATA
                    ] = new Map()
                }

                const map = (constructor as Record<PropertyKey, unknown>)[
                    API_DOC_METADATA
                ] as Map<
                    string,
                    ApiDocMetadata
                >
                map.set(methodName, metadata)
            }
        })
    }
}

export function getApiDocMetadata(
    target: { prototype: unknown },
    methodName: string,
): ApiDocMetadata | undefined {
    const map = (target as Record<PropertyKey, unknown>)[API_DOC_METADATA] as
        | Map<
            string,
            ApiDocMetadata
        >
        | undefined

    return map?.get(methodName)
}

export function hasApiDoc(target: { prototype: unknown }): boolean {
    return !!(target as Record<PropertyKey, unknown>)[API_DOC_METADATA]
}
