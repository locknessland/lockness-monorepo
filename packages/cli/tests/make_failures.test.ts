/**
 * @fileoverview How the `make:*` generators fail (#436, US1).
 *
 * A generator that did not write what it was asked to write throws, so
 * `Cli.dispatch()` prints it once and returns a non-zero status — a script
 * that runs `./nessy make:controller && git add .` stops instead of going on.
 *
 * | Case                                   | Status | Printed                                 |
 * | :------------------------------------- | :----- | :-------------------------------------- |
 * | no name                                | 1      | one `❌ <reason>` line                   |
 * | a write fails                          | 1      | one line, the dispatcher's catch-all     |
 * | one step of a multi-step command fails | 1      | one `❌ <n> of <m> steps failed:` line   |
 *
 * @module @lockness/cli/tests/make_failures
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { Cli } from '../mod.ts'
import { MAKE_COMMANDS } from '../commands/make/index.ts'
import { captureConsole, inTempDir } from './helpers.ts'

/** A `Cli` with every `make:*` command registered. */
function makeCli(): Cli {
    const cli = new Cli()
    for (const command of MAKE_COMMANDS) {
        cli.register(command.name, command.handler, command.description)
    }
    return cli
}

/** Dispatch `args` in a fresh temp dir, after `prepare` ran in it. */
function dispatchIn(
    args: string[],
    prepare: () => Promise<void> = () => Promise.resolve(),
) {
    return inTempDir(async () => {
        await prepare()
        return await captureConsole(() => makeCli().dispatch(args))
    })
}

/** The one line printed to stderr, asserting there is exactly one. */
function onlyErrorLine(error: unknown[][]): string {
    assertEquals(
        error.length,
        1,
        `expected one console.error, got ${error.length}`,
    )
    assertEquals(error[0].length, 1)
    return String(error[0][0])
}

/** Every `make:*` command that needs a name, with the reason it prints. */
const NEEDS_A_NAME = MAKE_COMMANDS.filter((command) =>
    command.name !== 'make:error-pages'
)

Deno.test('make:* with no name', async (t) => {
    for (const command of NEEDS_A_NAME) {
        await t.step(`${command.name} exits 1 with one ❌ line`, async () => {
            const { result, error } = await dispatchIn([command.name])

            assertEquals(result, 1)
            const line = onlyErrorLine(error)
            assert(line.startsWith('❌ '), line)
            assert(!line.includes('\n'), `one line: ${line}`)
        })
    }
})

Deno.test('make:action usage', async (t) => {
    await t.step('the usage hint is on the failure line', async () => {
        const { result, error } = await dispatchIn(['make:action', 'User'])

        assertEquals(result, 1)
        const line = onlyErrorLine(error)
        assertStringIncludes(line, 'make:action <ControllerName> <actionName>')
        assertStringIncludes(line, '--method=')
        assertStringIncludes(line, '--view')
    })

    await t.step('an unknown --method exits 1', async () => {
        const { result, error } = await dispatchIn([
            'make:action',
            'User',
            'show',
            '--method=fetch',
        ])

        assertEquals(result, 1)
        assertStringIncludes(onlyErrorLine(error), 'Invalid method')
    })

    await t.step('a missing controller names the fix', async () => {
        const { result, error } = await dispatchIn([
            'make:action',
            'User',
            'show',
        ])

        assertEquals(result, 1)
        const line = onlyErrorLine(error)
        assertStringIncludes(line, 'Controller not found')
        assertStringIncludes(line, 'make:controller User')
    })

    await t.step('a controller with no closing brace exits 1', async () => {
        const { result, error } = await dispatchIn(
            ['make:action', 'User', 'show'],
            async () => {
                await Deno.mkdir('app/controller', { recursive: true })
                await Deno.writeTextFile(
                    'app/controller/user_controller.tsx',
                    'export class UserController {',
                )
            },
        )

        assertEquals(result, 1)
        assertStringIncludes(onlyErrorLine(error), 'closing brace')
    })
})

/** Make `app` a file, so every `mkdir` under it fails. */
async function blockAppDir(): Promise<void> {
    await Deno.writeTextFile('app', 'not a directory')
}

Deno.test('make:* when a write fails', async (t) => {
    for (const command of MAKE_COMMANDS) {
        const args = command.name === 'make:action'
            ? [command.name, 'User', 'show']
            : [command.name, 'Widget']
        await t.step(`${command.name} exits 1, printed once`, async () => {
            const { result, error } = await dispatchIn(args, blockAppDir)

            assertEquals(result, 1)
            const printed = onlyErrorLine(error)
            assert(printed.startsWith('❌ '), printed)
        })
    }
})

Deno.test('make:controller --view finishes, then fails', async (t) => {
    await t.step('a failed view still writes the controller', async () => {
        await inTempDir(async () => {
            // A directory where the view file goes makes the view write fail.
            await Deno.mkdir('app/view/pages/user.tsx', { recursive: true })

            const { result, error } = await captureConsole(() =>
                makeCli().dispatch(['make:controller', 'User', '--view'])
            )

            assertEquals(result, 1)
            const line = onlyErrorLine(error)
            assertStringIncludes(line, '1 of 2 steps failed: view')
            const controller = await Deno.readTextFile(
                'app/controller/user_controller.tsx',
            )
            assertStringIncludes(controller, 'class User')
        })
    })

    await t.step('both steps passing exits 0', async () => {
        const { result, error } = await dispatchIn([
            'make:controller',
            'User',
            '--view',
        ])

        assertEquals(result, 0)
        assertEquals(error.length, 0)
    })
})

/** Write a minimal `UserController` for `make:action` to append to. */
async function writeUserController(): Promise<void> {
    await Deno.mkdir('app/controller', { recursive: true })
    await Deno.writeTextFile(
        'app/controller/user_controller.tsx',
        'export class UserController {\n}\n',
    )
}

/** Where `make:action User show --view` writes its view. */
const USER_SHOW_VIEW = 'app/view/pages/user/show.tsx'

Deno.test('make:action --view finishes, then fails', async (t) => {
    await t.step('a failed view still adds the action', async () => {
        await inTempDir(async () => {
            await writeUserController()
            // `app/view` as a file makes the view's mkdir fail.
            await Deno.writeTextFile('app/view', 'not a directory')

            const { result, error } = await captureConsole(() =>
                makeCli().dispatch(['make:action', 'User', 'show', '--view'])
            )

            assertEquals(result, 1)
            assertStringIncludes(
                onlyErrorLine(error),
                '1 of 2 steps failed: view',
            )
            const controller = await Deno.readTextFile(
                'app/controller/user_controller.tsx',
            )
            assertStringIncludes(controller, 'show(')
            // Without its view, the action does not render one.
            assert(!controller.includes('<UserShow'), controller)
        })
    })

    await t.step('an existing view is kept, not overwritten', async () => {
        await inTempDir(async () => {
            await writeUserController()
            await Deno.mkdir('app/view/pages/user', { recursive: true })
            await Deno.writeTextFile(USER_SHOW_VIEW, 'the user wrote this')

            const { result, error } = await captureConsole(() =>
                makeCli().dispatch(['make:action', 'User', 'show', '--view'])
            )

            assertEquals(result, 0)
            assertEquals(error.length, 0)
            assertEquals(
                await Deno.readTextFile(USER_SHOW_VIEW),
                'the user wrote this',
            )
            assertStringIncludes(
                await Deno.readTextFile('app/controller/user_controller.tsx'),
                '<UserShow />',
            )
        })
    })

    await t.step('a directory at the view path fails the view', async () => {
        await inTempDir(async () => {
            await writeUserController()
            await Deno.mkdir(USER_SHOW_VIEW, { recursive: true })

            const { result, error } = await captureConsole(() =>
                makeCli().dispatch(['make:action', 'User', 'show', '--view'])
            )

            assertEquals(result, 1)
            assertStringIncludes(
                onlyErrorLine(error),
                '1 of 2 steps failed: view',
            )
        })
    })

    await t.step('both steps passing exits 0', async () => {
        await inTempDir(async () => {
            await writeUserController()

            const { result, error } = await captureConsole(() =>
                makeCli().dispatch(['make:action', 'User', 'show', '--view'])
            )

            assertEquals(result, 0)
            assertEquals(error.length, 0)
            assertStringIncludes(
                await Deno.readTextFile(USER_SHOW_VIEW),
                'UserShow',
            )
        })
    })
})

Deno.test('make:crud finishes, then fails', async (t) => {
    await t.step('a failed step leaves the others written', async () => {
        await inTempDir(async () => {
            // A directory where the service file goes makes that write fail.
            await Deno.mkdir('app/service/post_service.ts', {
                recursive: true,
            })

            const { result, error } = await captureConsole(() =>
                makeCli().dispatch(['make:crud', 'Post'])
            )

            assertEquals(result, 1)
            assertStringIncludes(
                onlyErrorLine(error),
                '1 of 6 steps failed: service',
            )
            await Deno.stat('app/model/post.ts')
            await Deno.stat('app/repository/post_repository.ts')
            await Deno.stat('app/controller/post_controller.tsx')
            await Deno.stat('app/view/pages/post/index.tsx')
            await Deno.stat('app/view/pages/post/show.tsx')
        })
    })

    await t.step('every step passing exits 0', async () => {
        const { result, error } = await dispatchIn(['make:crud', 'Post'])

        assertEquals(result, 0)
        assertEquals(error.length, 0)
    })

    await t.step('the controller class is PostController', async () => {
        await inTempDir(async () => {
            await captureConsole(() =>
                makeCli().dispatch(['make:crud', 'Post'])
            )

            const controller = await Deno.readTextFile(
                'app/controller/post_controller.tsx',
            )
            assertStringIncludes(controller, 'export class PostController {')
            assert(!controller.includes('ControllerController'), controller)
        })
    })
})

Deno.test('make:controller when the routes registry cannot be written', async (t) => {
    await t.step('warns with the routes:generate hint, exits 0', async () => {
        await inTempDir(async () => {
            // A directory where the registry goes makes its write fail.
            await Deno.mkdir('app/routes.ts', { recursive: true })

            const { result, warn, error } = await captureConsole(() =>
                makeCli().dispatch(['make:controller', 'User'])
            )

            assertEquals(result, 0)
            assertEquals(error, [])
            assertEquals(warn.length, 1, String(warn))
            const line = String(warn[0][0])
            assertStringIncludes(line, 'routes:generate')
            // D4: the caught error's text is not printed.
            assert(!/os error|directory/i.test(line), line)
            await Deno.stat('app/controller/user_controller.tsx')
        })
    })
})
