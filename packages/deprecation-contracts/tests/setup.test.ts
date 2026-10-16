/**
 * @fileoverview The `@lockness/deprecation-contracts/setup` step (#592): the
 * named `setup` export `./nessy package:install deprecation-contracts` runs
 * with a `SetupContext`. It replaces the `install.ts` that imported
 * `@lockness/cli`; the project check and the manifest write are the
 * context's, so they are faked here and covered through the real command in
 * `packages/cli/tests/package_install.test.ts`.
 *
 * @module @lockness/deprecation-contracts/tests/setup
 */

import { test } from 'node:test'
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { join } from 'node:path'
import type { SetupContext } from '@lockness/contract/setup'
import { setup } from '../setup.ts'

/** Run `fn` in a fresh directory with `console.log` silenced. */
async function inDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness_dc_setup_' })
    const log = console.log
    console.log = () => {}
    try {
        await fn(dir)
    } finally {
        console.log = log
        await Deno.remove(dir, { recursive: true })
    }
}

/** A context rooted at `root` that records the packages it registers. */
function contextAt(root: string, registered: string[]): SetupContext {
    return {
        root,
        registerPackage: (name) => {
            registered.push(name)
            return Promise.resolve()
        },
    }
}

test('setup - registers the package and adds the env configuration', async () => {
    await inDir(async (dir) => {
        await Deno.writeTextFile(join(dir, '.env'), 'APP_NAME=demo\n')
        const registered: string[] = []

        await setup(contextAt(dir, registered))

        assertEquals(registered, ['deprecation-contracts'])
        const env = await Deno.readTextFile(join(dir, '.env'))
        assertStringIncludes(env, 'APP_NAME=demo\n')
        assertStringIncludes(env, 'STRICT_DEPRECATIONS=false')
        assertStringIncludes(env, 'IGNORE_DEPRECATIONS=false')
    })
})

test('setup - an env file that already has the variables is left alone', async () => {
    await inDir(async (dir) => {
        const original = 'STRICT_DEPRECATIONS=true\n'
        await Deno.writeTextFile(join(dir, '.env'), original)

        await setup(contextAt(dir, []))

        assertEquals(await Deno.readTextFile(join(dir, '.env')), original)
    })
})

test('setup - a missing env file is not created', async () => {
    await inDir(async (dir) => {
        await setup(contextAt(dir, []))

        await assertRejects(
            () => Deno.stat(join(dir, '.env')),
            Deno.errors.NotFound,
        )
    })
})

test('setup - a registration failure stops it before any env file is written', async () => {
    await inDir(async (dir) => {
        await Deno.writeTextFile(join(dir, '.env'), 'APP_NAME=demo\n')
        const failure = Object.assign(new Error('not a project'), {
            exitCode: 1,
        })
        const context: SetupContext = {
            root: dir,
            registerPackage: () => Promise.reject(failure),
        }

        const thrown = await assertRejects(() => setup(context))

        assertEquals(thrown, failure)
        assertEquals(
            await Deno.readTextFile(join(dir, '.env')),
            'APP_NAME=demo\n',
        )
    })
})

test('setup - an unreadable .env is not skipped silently', async () => {
    await inDir(async (dir) => {
        await Deno.mkdir(join(dir, '.env'))

        const thrown = await assertRejects(() => setup(contextAt(dir, [])))
        assertEquals(thrown instanceof Deno.errors.NotFound, false)
    })
})
