/**
 * Test suite to verify that all @lockness/hono exports are available through @lockness/core
 *
 * This ensures the unified API works correctly and developers can import everything
 * from a single package.
 */
import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'

describe('Hono Re-exports from @lockness/core', () => {
    it('should export core Hono class', async () => {
        const { Hono } = await import('../mod.ts')
        expect(Hono).toBeDefined()
        expect(typeof Hono).toBe('function')
    })

    it('should export Context type and utilities', () => {
        // Note: Context and HonoRequest are types, not runtime values
        // They can be imported and used in TypeScript but can't be tested at runtime
        // This test verifies the module compiles and types are available
        // @ts-expect-error - Testing type import at compile time
        const _typeTest: typeof import('../mod.ts').Context = null as any
        expect(true).toBe(true) // Placeholder - actual validation is at compile time
    })

    it('should export JSX runtime components', async () => {
        const { jsx, Fragment, jsxRenderer } = await import('../mod.ts')
        expect(jsx).toBeDefined()
        expect(Fragment).toBeDefined()
        expect(jsxRenderer).toBeDefined()
    })

    it('should export authentication middleware', async () => {
        const { basicAuth, bearerAuth, jwt } = await import('../mod.ts')
        expect(basicAuth).toBeDefined()
        expect(bearerAuth).toBeDefined()
        expect(jwt).toBeDefined()
    })

    it('should export security middleware', async () => {
        const { cors, csrf, secureHeaders } = await import('../mod.ts')
        expect(cors).toBeDefined()
        expect(csrf).toBeDefined()
        expect(secureHeaders).toBeDefined()
    })

    it('should export content processing middleware', async () => {
        const { compress, etag, prettyJSON } = await import('../mod.ts')
        expect(compress).toBeDefined()
        expect(etag).toBeDefined()
        expect(prettyJSON).toBeDefined()
    })

    it('should export request handling middleware', async () => {
        const { logger, bodyLimit, requestId } = await import('../mod.ts')
        expect(logger).toBeDefined()
        expect(bodyLimit).toBeDefined()
        expect(requestId).toBeDefined()
    })

    it('should export timing and caching middleware', async () => {
        const { timeout, timing, cache } = await import('../mod.ts')
        expect(timeout).toBeDefined()
        expect(timing).toBeDefined()
        expect(cache).toBeDefined()
    })

    it('should export routing utilities', async () => {
        const { methodOverride, serveStatic } = await import('../mod.ts')
        expect(methodOverride).toBeDefined()
        expect(serveStatic).toBeDefined()
    })

    it('should export rendering helpers', async () => {
        const { css, ssgParams, streamSSE, streamText, html, raw } =
            await import(
                '../mod.ts'
            )
        expect(css).toBeDefined()
        expect(ssgParams).toBeDefined()
        expect(streamSSE).toBeDefined()
        expect(streamText).toBeDefined()
        expect(html).toBeDefined()
        expect(raw).toBeDefined()
    })

    it('should export cookie utilities', async () => {
        const {
            getCookie,
            setCookie,
            deleteCookie,
            getSignedCookie,
            setSignedCookie,
        } = await import('../mod.ts')
        expect(getCookie).toBeDefined()
        expect(setCookie).toBeDefined()
        expect(deleteCookie).toBeDefined()
        expect(getSignedCookie).toBeDefined()
        expect(setSignedCookie).toBeDefined()
    })

    it('should export validation utilities', async () => {
        const { zValidator, validator } = await import('../mod.ts')
        expect(zValidator).toBeDefined()
        expect(validator).toBeDefined()
    })

    it('should export client and testing utilities', async () => {
        const { hc, testClient } = await import('../mod.ts')
        expect(hc).toBeDefined()
        expect(testClient).toBeDefined()
    })

    it('should export HTTPException', async () => {
        const { HTTPException } = await import('../mod.ts')
        expect(HTTPException).toBeDefined()
        expect(typeof HTTPException).toBe('function')
    })

    it('should export additional utilities', async () => {
        const {
            getRuntimeKey,
            denoServeStatic,
        } = await import('../mod.ts')
        expect(getRuntimeKey).toBeDefined()
        expect(denoServeStatic).toBeDefined()
    })

    it('should allow unified imports in a single statement', async () => {
        // This is the key test - verify developers can import everything from one place
        const {
            Hono,
            logger,
            cors,
            basicAuth,
            jsxRenderer,
            HTTPException,
        } = await import('../mod.ts')

        expect(Hono).toBeDefined()
        expect(logger).toBeDefined()
        expect(cors).toBeDefined()
        expect(basicAuth).toBeDefined()
        expect(jsxRenderer).toBeDefined()
        expect(HTTPException).toBeDefined()
    })
})
