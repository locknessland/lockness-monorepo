/**
 * @fileoverview Tests for `addPackage` and `removePackage`, which record a
 * package in, and drop it from, the project's `lockness.packages` list.
 */

import { assertEquals, assertInstanceOf, assertRejects } from '@std/assert'
import { addPackage, removePackage } from '../package_loader.ts'
import { inTempDir } from './helpers.ts'

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

Deno.test('addPackage and removePackage keep a caught error as the cause', async (t) => {
    const cases = [
        {
            name: 'addPackage',
            run: addPackage,
            message: 'Failed to add package',
        },
        {
            name: 'removePackage',
            run: removePackage,
            message: 'Failed to remove package',
        },
    ]
    for (const { name, run, message } of cases) {
        await t.step(name, async () => {
            // No deno.json nor deno.jsonc: the read fails.
            await inTempDir(async () => {
                const error = await assertRejects(() => run('drizzle'), Error)
                assertEquals(error.message, message)
                assertInstanceOf(error.cause, Deno.errors.NotFound)
            })
        })
    }
})
