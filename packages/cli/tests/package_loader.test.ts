/**
 * @fileoverview Tests for `addPackage`, which records a package in the
 * project's `lockness.packages` list.
 */

import { assertEquals } from '@std/assert'
import { addPackage } from '../package_loader.ts'

async function inProject<T>(
    denoJson: unknown,
    run: (dir: string) => Promise<T>,
): Promise<T> {
    const dir = await Deno.makeTempDir()
    const previous = Deno.cwd()
    await Deno.writeTextFile(`${dir}/deno.json`, JSON.stringify(denoJson))
    Deno.chdir(dir)
    try {
        return await run(dir)
    } finally {
        Deno.chdir(previous)
        await Deno.remove(dir, { recursive: true })
    }
}

async function packagesIn(dir: string): Promise<unknown> {
    const json = JSON.parse(await Deno.readTextFile(`${dir}/deno.json`))
    return json.lockness?.packages
}

Deno.test('addPackage registers the first package in a fresh deno.json', async () => {
    await inProject({}, async (dir) => {
        await addPackage('@lockness/drizzle')
        assertEquals(await packagesIn(dir), ['drizzle'])
    })
})

Deno.test('addPackage keeps lockness.packages sorted', async () => {
    await inProject({ lockness: { packages: ['session'] } }, async (dir) => {
        await addPackage('openapi')
        await addPackage('cache')
        assertEquals(await packagesIn(dir), ['cache', 'openapi', 'session'])
    })
})

Deno.test('addPackage leaves an already registered package alone', async () => {
    await inProject({ lockness: { packages: ['drizzle'] } }, async (dir) => {
        await addPackage('drizzle')
        assertEquals(await packagesIn(dir), ['drizzle'])
    })
})
