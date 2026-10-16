/**
 * @fileoverview Tests for the package loader: `addPackage` and `removePackage`,
 * which record a
 * package in, and drop it from, the project's `lockness.packages` list.
 */

import { test } from 'node:test'
import { assertEquals, assertInstanceOf, assertRejects } from '@std/assert'
import * as queueRoot from '@lockness/queue'
import {
    addPackage,
    findRegisterFunction,
    loadFailureSource,
    packagesToLoad,
    removePackage,
} from '../package_loader.ts'
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

test('addPackage registers the first package in a fresh deno.json', async () => {
    await inProject({}, async (dir) => {
        await addPackage('@lockness/drizzle')
        assertEquals(await packagesIn(dir), ['drizzle'])
    })
})

test('addPackage keeps lockness.packages sorted', async () => {
    await inProject({ lockness: { packages: ['session'] } }, async (dir) => {
        await addPackage('openapi')
        await addPackage('cache')
        assertEquals(await packagesIn(dir), ['cache', 'openapi', 'session'])
    })
})

test('addPackage leaves an already registered package alone', async () => {
    await inProject({ lockness: { packages: ['drizzle'] } }, async (dir) => {
        await addPackage('drizzle')
        assertEquals(await packagesIn(dir), ['drizzle'])
    })
})

test('addPackage and removePackage keep a caught error as the cause', async (t) => {
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
        await t.test(name, async () => {
            // No deno.json nor deno.jsonc: the read fails.
            await inTempDir(async () => {
                const error = await assertRejects(() => run('drizzle'), Error)
                assertEquals(error.message, message)
                assertInstanceOf(error.cause, Deno.errors.NotFound)
            })
        })
    }
})

test('packagesToLoad - core first, then the packages lockness.packages lists', () => {
    assertEquals(packagesToLoad({ lockness: { packages: ['drizzle'] } }), [
        'core',
        'drizzle',
    ])
    assertEquals(packagesToLoad({}), ['core'])
})

test('packagesToLoad - adds queue to the load list when the app maps @lockness/queue (#592)', () => {
    // The adapter that keeps queue:work where it was when the commands moved
    // out of @lockness/cli; config/packages.ts replaces it (plan 274, C19).
    assertEquals(
        packagesToLoad({
            imports: { '@lockness/queue': 'jsr:@lockness/queue@^0.4.0' },
            lockness: { packages: ['drizzle'] },
        }),
        ['core', 'drizzle', 'queue'],
    )
})

test('packagesToLoad - queue is never loaded twice, nor without the mapping', () => {
    const imports = { '@lockness/queue': 'jsr:@lockness/queue@^0.4.0' }
    assertEquals(
        packagesToLoad({ imports, lockness: { packages: ['queue'] } }),
        ['core', 'queue'],
    )
    assertEquals(
        packagesToLoad({
            imports,
            lockness: { packages: ['@lockness/queue'] },
        }),
        ['core', '@lockness/queue'],
    )
    assertEquals(packagesToLoad({ imports: { '@lockness/cache': 'x' } }), [
        'core',
    ])
})

test("findRegisterFunction - picks registerQueueCommands from @lockness/queue's root (#592)", () => {
    // The other half of the queue adapter: once queue is in the load list,
    // the name scan must find its commands on the package root.
    assertEquals(typeof queueRoot.registerQueueCommands, 'function')
    assertEquals(
        findRegisterFunction(queueRoot),
        queueRoot.registerQueueCommands,
    )
})

test('findRegisterFunction - only a function with a register…Command(s) name', () => {
    const registerThings = () => {}
    const registerDemoCommands = () => {}
    assertEquals(findRegisterFunction({ registerThings }), undefined)
    assertEquals(
        findRegisterFunction({ registerDemoCommands: 'not a function' }),
        undefined,
    )
    assertEquals(
        findRegisterFunction({ registerThings, registerDemoCommands }),
        registerDemoCommands,
    )
})

test('loadFailureSource - names where the loader found the package', () => {
    const imports = { '@lockness/queue': 'jsr:@lockness/queue@^0.4.0' }
    const listed = loadFailureSource('drizzle', {
        lockness: { packages: ['drizzle'] },
    })
    assertEquals(listed.reason.includes('"lockness.packages"'), true)
    assertEquals(listed.fix.includes('package:remove drizzle'), true)

    const mapped = loadFailureSource('queue', { imports })
    assertEquals(mapped.reason.includes('mapped in "imports"'), true)
    assertEquals(mapped.fix.includes('"@lockness/queue"'), true)

    const core = loadFailureSource('core', {})
    assertEquals(core.reason.includes('always loaded'), true)
})
