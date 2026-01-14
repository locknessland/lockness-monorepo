import { assertEquals, assertRejects } from '@std/assert'
import type { VersionProvider } from '../types.ts'

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
