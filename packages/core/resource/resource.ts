/**
 * @fileoverview The API `Resource` base — an explicit, opt-in projection of a
 * model into its wire shape.
 *
 * **Opt-in, fails closed (security S2).** `toArray()` is abstract: a subclass
 * MUST name the fields it exposes; there is no full-model default, so adding a
 * column to a model never changes the wire output until the resource names it.
 * As defence-in-depth, the serialisation path ({@link Resource.toJSON}) drops a
 * central never-serialise name set even if a subclass names one by mistake.
 *
 * @module @lockness/core/resource
 * @since 0.2.1
 *
 * @example
 * ```typescript
 * class UserResource extends Resource<User> {
 *     toArray() {
 *         return { id: this.model.id, name: this.model.name }
 *         // note: this.model.passwordHash is never named → never exposed
 *     }
 * }
 * c.json(new UserResource(user)) // { id, name }
 * ```
 */

import { deriveJsonSchema, type JsonSchema } from '@lockness/contract'

/**
 * Field names never emitted on the wire, applied by {@link Resource.toJSON}
 * even if a subclass names one. Exact-match, case-sensitive — a belt-and-braces
 * guard behind the primary opt-in control, not a substitute for it.
 */
export const NEVER_SERIALISE: readonly string[] = [
    'password',
    'passwordHash',
    'password_hash',
    'token',
    'secret',
    'hash',
]

/** Drop {@link NEVER_SERIALISE} keys from a projection (shallow). */
function stripNeverSerialise(
    obj: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
        if (!NEVER_SERIALISE.includes(key)) out[key] = value
    }
    return out
}

/**
 * A single-model transformer. Extend it and implement {@link Resource.toArray}
 * to declare the exact fields your API exposes.
 *
 * @typeParam TModel - The model (entity/row) being projected.
 */
export abstract class Resource<TModel> {
    /**
     * @param model - The model instance to project.
     */
    constructor(protected readonly model: TModel) {}

    /**
     * Project {@link Resource.model} into its wire shape. **Abstract on
     * purpose** — a resource that names no fields exposes none (fails closed).
     * Return only the fields the API should expose.
     *
     * @returns The projected object.
     */
    abstract toArray(): Record<string, unknown>

    /**
     * The serialisation entry point — what `JSON.stringify` / `c.json()` call.
     * Applies the {@link NEVER_SERIALISE} guard to {@link Resource.toArray}'s
     * output.
     *
     * @returns The guarded wire object.
     */
    toJSON(): Record<string, unknown> {
        return stripNeverSerialise(this.toArray())
    }

    /**
     * The projection's JSON Schema — a model's wire shape *is* the response
     * schema the OpenAPI document should emit. **Declare or derive:** the
     * default *derives* one from {@link Resource.toJSON} (so the guarded wire
     * shape, never a never-serialise field, is described); override it to
     * *declare* an exact schema (formats, descriptions, enums) instead.
     *
     * Deriving reads `this.model`, so build the resource with a representative
     * instance when registering its schema with the doc generator.
     *
     * @returns The JSON Schema describing this resource's projection.
     *
     * @example
     * ```typescript
     * // Register with @lockness/openapi's generator:
     * const resources = [
     *     { name: 'UserResource', schema: new UserResource(sample).schema() },
     * ]
     * ```
     */
    schema(): JsonSchema {
        return deriveJsonSchema(this.toJSON())
    }
}
