// deno-lint-ignore-file no-explicit-any
import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodSchema } from 'zod'

/**
 * Validation error response structure
 */
export interface ValidationErrorResponse {
    success: false
    message: string
    errors: Record<string, string[] | undefined>
}

/**
 * Custom error handler for validation errors
 * Override this to customize the error response format
 */
export type ValidationErrorHandler = (
    errors: Record<string, string[] | undefined>,
    c: any,
) => Response | Promise<Response>

let globalValidationErrorHandler: ValidationErrorHandler = (errors, c) => {
    return c.json(
        {
            success: false,
            message: 'Validation failed',
            errors,
        } satisfies ValidationErrorResponse,
        400,
    )
}

/**
 * Set a custom global validation error handler
 */
export function setValidationErrorHandler(
    handler: ValidationErrorHandler,
): void {
    globalValidationErrorHandler = handler
}

/**
 * Decorator to validate request data using Zod
 * @param target The part of the request to validate ('json', 'query', 'param', 'header', 'cookie', 'form')
 * @param schema The Zod schema to validate against
 *
 * @example
 * ```ts
 * import { z } from 'zod'
 *
 * const CreateUserSchema = z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8),
 * })
 *
 * @Controller('/users')
 * class UserController {
 *   @Post()
 *   @Validate('json', CreateUserSchema)
 *   create(c: Context) {
 *     const data = c.req.valid('json')
 *     // data is typed as { email: string, password: string }
 *   }
 * }
 * ```
 */
export function Validate(
    target: keyof ValidationTargets,
    schema: ZodSchema,
): MethodDecorator {
    return (
        classTarget: any,
        propertyKey: string | symbol,
        _descriptor: PropertyDescriptor,
    ) => {
        const constructor = classTarget.constructor
        if (!constructor._validators) constructor._validators = {}

        const key = propertyKey as string
        if (!constructor._validators[key]) {
            constructor._validators[key] = []
        }

        // Store validation config
        constructor._validators[key].push({
            target,
            schema,
            middleware: zValidator(target, schema, (result, c) => {
                if (!result.success) {
                    return globalValidationErrorHandler(
                        result.error.flatten().fieldErrors,
                        c,
                    )
                }
            }),
        })
    }
}
