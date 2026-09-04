/**
 * @fileoverview `ResourceCollection` — wraps an array of {@link Resource}s and,
 * when built from a paginated result, carries its `meta` and `links`.
 *
 * @module @lockness/core/resource/collection
 * @since 0.2.1
 *
 * @example
 * ```typescript
 * const env = await paginate<User>(db, users, { page: 1, perPage: 15, baseUrl: '/users' })
 * const body = ResourceCollection.paginated(env, (u) => new UserResource(u))
 * c.json(body) // { data: [...], meta: {...}, links: {...} }
 * ```
 */

import type {
    CursorLinks,
    OffsetLinks,
    PaginationEnvelope,
    PaginationMeta,
} from '@lockness/contract'
import type { Resource } from './resource.ts'

/** The pagination block a collection carries when built from a paginated result. */
interface CollectionPagination {
    readonly meta: PaginationMeta
    readonly links: OffsetLinks | CursorLinks
}

/**
 * A serialisable collection of resources. Its `toJSON()` produces
 * `{ data }`, or `{ data, meta, links }` when constructed from a paginated
 * result via {@link ResourceCollection.paginated}.
 *
 * @typeParam TModel - The model type.
 * @typeParam R - The resource type wrapping it.
 */
export class ResourceCollection<TModel, R extends Resource<TModel>> {
    /**
     * @param items - The resources on this page.
     * @param pagination - Optional pagination `meta`/`links` to embed.
     */
    constructor(
        private readonly items: readonly R[],
        private readonly pagination?: CollectionPagination,
    ) {}

    /**
     * Build a paginated collection from a paginator envelope, mapping each row
     * through a resource factory and carrying the envelope's `meta`/`links`.
     *
     * @typeParam M - The model type.
     * @typeParam RR - The resource type.
     * @param envelope - A `{ data, meta, links }` envelope from the paginator.
     * @param factory - Wraps one model in its resource.
     * @returns The collection carrying pagination metadata.
     */
    static paginated<M, RR extends Resource<M>>(
        envelope: PaginationEnvelope<M>,
        factory: (model: M) => RR,
    ): ResourceCollection<M, RR> {
        return new ResourceCollection<M, RR>(
            envelope.data.map(factory),
            { meta: envelope.meta, links: envelope.links },
        )
    }

    /**
     * Serialise the collection — `{ data }`, plus `meta`/`links` when paginated.
     * The serialisation entry point for `JSON.stringify` / `c.json()`.
     *
     * @returns The wire object.
     */
    toJSON(): {
        data: Record<string, unknown>[]
        meta?: PaginationMeta
        links?: OffsetLinks | CursorLinks
    } {
        const data = this.items.map((r) => r.toJSON())
        if (this.pagination) {
            return {
                data,
                meta: this.pagination.meta,
                links: this.pagination.links,
            }
        }
        return { data }
    }
}
