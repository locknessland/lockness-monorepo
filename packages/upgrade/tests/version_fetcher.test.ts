import { assertEquals, assertInstanceOf, assertRejects } from '@std/assert'
import type { VersionProvider } from '../types.ts'
import {
    createVersionProvider,
    JsrVersionProvider,
} from '../version_fetcher.ts'

/**
 * Mock version provider for testing
 */
class MockVersionProvider implements VersionProvider {
    constructor(private mockVersions: Record<string, string>) {}

    async getLatestVersion(packageName: string): Promise<string> {
        const version = this.mockVersions[packageName]
        if (!version) {
            throw new Error(`Package not found: ${packageName}`)
        }
        return await Promise.resolve(version)
    }
}

Deno.test('version_fetcher - MockVersionProvider returns correct version', async () => {
    const provider = new MockVersionProvider({
        '@lockness/core': '0.2.0',
        '@lockness/cli': '0.2.0',
    })

    const version = await provider.getLatestVersion('@lockness/core')
    assertEquals(version, '0.2.0')
})

Deno.test('version_fetcher - MockVersionProvider returns different versions', async () => {
    const provider = new MockVersionProvider({
        '@lockness/core': '0.2.0',
        '@lockness/cli': '0.1.5',
    })

    const coreVersion = await provider.getLatestVersion('@lockness/core')
    const cliVersion = await provider.getLatestVersion('@lockness/cli')

    assertEquals(coreVersion, '0.2.0')
    assertEquals(cliVersion, '0.1.5')
})

Deno.test('version_fetcher - MockVersionProvider throws on unknown package', async () => {
    const provider = new MockVersionProvider({
        'known-package': '1.0.1',
    })

    await assertRejects(
        () => provider.getLatestVersion('unknown-package'),
        Error,
        'Package not found: unknown-package',
    )
})

Deno.test('version_fetcher - MockVersionProvider handles multiple packages', async () => {
    const provider = new MockVersionProvider({
        '@lockness/core': '0.2.0',
        '@lockness/cli': '0.2.0',
        '@lockness/auth': '0.2.0',
        '@lockness/cache': '0.2.0',
    })

    const packages = [
        '@lockness/core',
        '@lockness/cli',
        '@lockness/auth',
        '@lockness/cache',
    ]

    for (const pkg of packages) {
        const version = await provider.getLatestVersion(pkg)
        assertEquals(version, '0.2.0')
    }
})

/** Run `fn` with `globalThis.fetch` replaced, restoring it afterwards. */
async function withFetch(
    fake: (input: string | URL | Request) => Promise<Response>,
    fn: (seen: string[]) => Promise<void>,
): Promise<void> {
    const original = globalThis.fetch
    const seen: string[] = []
    globalThis.fetch = ((input: string | URL | Request) => {
        seen.push(String(input))
        return fake(input)
    }) as typeof fetch
    try {
        await fn(seen)
    } finally {
        globalThis.fetch = original
    }
}

Deno.test('JsrVersionProvider - reads latest from the package meta.json', async () => {
    await withFetch(
        () => Promise.resolve(Response.json({ latest: '0.5.0' })),
        async (seen) => {
            const version = await new JsrVersionProvider()
                .getLatestVersion('@lockness/core')
            assertEquals(version, '0.5.0')
            assertEquals(seen, ['https://jsr.io/@lockness/core/meta.json'])
        },
    )
})

Deno.test('JsrVersionProvider - an error status names the package', async () => {
    await withFetch(
        () =>
            Promise.resolve(
                new Response('nope', { status: 404, statusText: 'Not Found' }),
            ),
        async () => {
            await assertRejects(
                () => new JsrVersionProvider().getLatestVersion('@lockness/x'),
                Error,
                'Failed to fetch version for @lockness/x',
            )
        },
    )
})

Deno.test('JsrVersionProvider - an aborted request reports a timeout', async () => {
    await withFetch(
        () => Promise.reject(new DOMException('aborted', 'AbortError')),
        async () => {
            await assertRejects(
                () => new JsrVersionProvider().getLatestVersion('@lockness/x'),
                Error,
                'Timeout fetching version for @lockness/x',
            )
        },
    )
})

Deno.test('JsrVersionProvider - a network error names the package', async () => {
    await withFetch(
        () => Promise.reject(new TypeError('connection refused')),
        async () => {
            await assertRejects(
                () => new JsrVersionProvider().getLatestVersion('@lockness/x'),
                Error,
                'Failed to fetch version for @lockness/x',
            )
        },
    )
})

Deno.test('JsrVersionProvider - a non-Error rejection passes through', async () => {
    await withFetch(
        () => Promise.reject('offline'),
        async () => {
            const thrown = await new JsrVersionProvider()
                .getLatestVersion('@lockness/x')
                .then(() => undefined, (error: unknown) => error)
            assertEquals(thrown, 'offline')
        },
    )
})

Deno.test('createVersionProvider - returns the JSR provider', () => {
    assertInstanceOf(createVersionProvider(), JsrVersionProvider)
})
