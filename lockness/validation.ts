// deno-lint-ignore-file no-explicit-any
import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodSchema } from 'zod'

/**
 * Decorator to validate request data using Zod
 * @param target The part of the request to validate ('json', 'query', 'param', etc.)
 * @param schema The Zod schema to validate against
 */
export function Validate(target: keyof ValidationTargets, schema: ZodSchema) {
    return (_value: any, context: ClassMethodDecoratorContext) => {
        context.addInitializer(function (this: any) {
            const constructor = this.constructor
            if (!constructor._middlewares) constructor._middlewares = {}
            if (!constructor._middlewares[context.name]) {
                constructor._middlewares[context.name] = []
            }

            // Create a wrapper middleware for Hono's zValidator
            const validatorMiddleware = class {
                handle = zValidator(target, schema, (result, c) => {
                    if (!result.success) {
                        return c.json({
                            success: false,
                            message: 'Validation failed',
                            errors: result.error.flatten().fieldErrors
                        }, 400)
                    }
                })
            }

            // Push to the beginning of middlewares for this route
            constructor._middlewares[context.name].unshift(validatorMiddleware)
        })
    }
}
