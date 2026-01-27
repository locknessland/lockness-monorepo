import type { MiddlewareHandler } from 'hono'
import {
    type CacheOptions,
    CacheServiceToken,
    type ICache,
} from '@lockness/contract'
import { container } from '@lockness/container'

/**
 * Creates a middleware that handles caching based on the @Cache decorator options.
 *
 * This middleware supports:
 * - 'http' strategy: Sets Cache-Control headers using Hono's cache middleware.
 * - 'server' strategy: Intercepts the response and stores it in the global ICache provider.
 * - 'both' strategy: Combines both server-side and client-side caching.
 *
 * @param options - Cache configuration from the decorator
 * @returns Hono middleware handler
 */
export function cacheDecoratorMiddleware(
    options: CacheOptions,
): MiddlewareHandler {
    const strategy = options.strategy || 'server'
    const ttl = options.ttl || 3600 // Default to 1 hour if not specified

    return async (c, next) => {
        // --- HTTP Strategy (Client/CDN) ---
        if (strategy === 'http' || strategy === 'both') {
            c.header('Cache-Control', `max-age=${ttl}, s-maxage=${ttl}, public`)
        }

        // --- Server Strategy ---
        if (strategy === 'server' || strategy === 'both') {
            const cacheKey = options.key || c.req.url

            // Try to resolve cache service from container
            let cache: ICache | null = null
            try {
                if (container.has(CacheServiceToken)) {
                    cache = container.get<ICache>(CacheServiceToken)
                }
            } catch {
                // Silently ignore container resolution errors
            }

            if (!cache) {
                // If no cache provider is registered, we just skip caching
                console.warn(
                    '[Lockness] @Cache used but no cache provider registered. Please install @lockness/cache and register it in your kernel.',
                )
                return next()
            }

            // Check if result is in cache
            const cachedResponse = await cache.get<{
                body: string
                headers: Record<string, string>
                status: number
            }>(cacheKey)

            if (cachedResponse) {
                // Return cached response
                return new Response(cachedResponse.body, {
                    status: cachedResponse.status,
                    headers: cachedResponse.headers,
                })
            }

            // Execute next middleware/handler
            await next()

            // After execution, if the response is successful, cache it
            if (c.res.ok && cache) {
                try {
                    const responseToCache = c.res.clone()
                    const body = await responseToCache.text()
                    const headers: Record<string, string> = {}
                    responseToCache.headers.forEach((value, key) => {
                        headers[key] = value
                    })

                    await cache.set(cacheKey, {
                        body,
                        headers,
                        status: responseToCache.status,
                    }, ttl)
                } catch (error) {
                    console.error(
                        `[Lockness] Failed to store response in cache: ${
                            (error as Error).message
                        }`,
                    )
                }
            }
            return
        }

        return next()
    }
}
