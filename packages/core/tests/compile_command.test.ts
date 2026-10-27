/**
 * @fileoverview `compile` fails non-zero on every failure path, and builds no
 * binary from stale routes or without a declared asset (#436, T013, FR-003).
 *
 * | Path                          | Outcome                                                        |
 * | :---------------------------- | :------------------------------------------------------------- |
 * | no kernel file                | failure, nothing run                                           |
 * | kernel file has no `@Kernel`  | failure naming the file, nothing run                           |
 * | kernel fails to load          | the error itself reaches the dispatcher (no catch in compile)  |
 * | route generation fails        | failure with `cause`, nothing run                              |
 * | pre-compile script fails      | `<step> failed (<program> exited <code>)`, no `deno compile`   |
 * | a step cannot start           | `<step> could not start (<program>)`, the runner's error as cause |
 * | declared asset missing        | failure, no `deno compile`                                     |
 * | `deno compile` fails          | `Compilation failed (deno compile exited <code>)`, no ✅        |
 *
 * Every child process goes through an injected step runner, so no test spawns
 * a real `deno compile`. Each test runs in its own temporary app directory:
 * `compile` resolves everything from the working directory.
 *
 * @module @lockness/core/tests/compile_command
 */

import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
} from '@std/assert'
import { join } from '@std/path'
import { CompileCommand, type StepRunner } from '../cli/compile_command.ts'
import { CoreCommandFailure } from '../cli/command_failure.ts'
import type { CommandContext } from '../cli/compile_command.ts'

/** One call the fake runner received. */
interface RunnerCall {
    readonly command: string
    readonly args: readonly string[]
}

/**
 * A step runner that records its calls and exits with `exitFor(args)`, 0 by
 * default.
 */
function fakeRunner(
    exitFor: (args: readonly string[]) => number = () => 0,
): { runner: StepRunner; calls: RunnerCall[] } {
    const calls: RunnerCall[] = []
    const runner: StepRunner = (command, args) => {
        calls.push({ command, args })
        return Promise.resolve(exitFor(args))
    }
    return { runner, calls }
}

/** Whether a recorded call is the `deno compile` step. */
function isCompile(call: RunnerCall): boolean {
    return call.args[0] === 'compile'
}

/** A context `compile` ignores. */
const CTX: CommandContext = {
    args: [],
    arg: () => undefined,
    hasFlag: () => false,
    getFlag: () => undefined,
}

/** A kernel module whose `@Kernel` config is `config`. */
function kernelSource(config: Record<string, unknown>): string {
    const decorators = import.meta.resolve('../kernel/kernel_decorators.ts')
    return `
import { KERNEL_CONFIG } from '${decorators}'
export class AppKernel {
    static [KERNEL_CONFIG] = ${JSON.stringify(config)}
}
`
}

/**
 * Create a temporary app holding `files`, make it the working directory, run
 * `body` with console output recorded, then restore both.
 */
async function inApp(
    files: Record<string, string>,
    body: (logs: string[]) => Promise<void>,
): Promise<void> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-compile-' })
    const previous = Deno.cwd()
    const logs: string[] = []
    const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    }
    const record = (...args: unknown[]) => void logs.push(args.join(' '))
    try {
        await Deno.mkdir(join(dir, 'app', 'controller'), { recursive: true })
        for (const [name, source] of Object.entries(files)) {
            await Deno.mkdir(join(dir, name, '..'), { recursive: true })
            await Deno.writeTextFile(join(dir, name), source)
        }
        Deno.chdir(dir)
        console.log = record
        console.warn = record
        console.error = record
        await body(logs)
    } finally {
        console.log = original.log
        console.warn = original.warn
        console.error = original.error
        Deno.chdir(previous)
        await Deno.remove(dir, { recursive: true })
    }
}

/** Assert `error` is a one-line core failure with exit code 1. */
function assertFailure(error: unknown, message: string): CoreCommandFailure {
    assertInstanceOf(error, CoreCommandFailure)
    assertEquals(error.exitCode, 1)
    assertEquals(error.message, message)
    assert(!error.message.includes('\n'), 'a failure message is one line')
    return error
}

Deno.test('compile - succeeds through the runner and reports the binary', async () => {
    await inApp(
        { 'app/kernel.ts': kernelSource({ compile: { output: 'dist/app' } }) },
        async (logs) => {
            const { runner, calls } = fakeRunner()
            await new CompileCommand(runner).handle(CTX)
            assertEquals(calls.length, 1)
            assertEquals(calls[0].command, Deno.execPath())
            assertEquals(calls[0].args, [
                'compile',
                '--output=dist/app',
                '-A',
                'main.ts',
            ])
            assert(
                logs.some((line) => line.includes('✅ Compilation successful')),
            )
        },
    )
})

Deno.test('compile - no kernel file is a failure and runs nothing', async () => {
    await inApp({}, async () => {
        const { runner, calls } = fakeRunner()
        const error = await assertRejects(() =>
            new CompileCommand(runner).handle(CTX)
        )
        assertFailure(
            error,
            'Kernel file not found (tried app/kernel.ts, app/kernel.tsx)',
        )
        assertEquals(calls, [])
    })
})

Deno.test('compile - a kernel file with no @Kernel class is a failure and runs nothing', async () => {
    await inApp(
        { 'app/kernel.ts': 'export const notAKernel = 1\n' },
        async () => {
            const { runner, calls } = fakeRunner()
            const error = await assertRejects(() =>
                new CompileCommand(runner).handle(CTX)
            )
            assertFailure(
                error,
                'No @Kernel decorated class found in app/kernel.ts',
            )
            assertEquals(calls, [])
        },
    )
})

Deno.test('compile - a kernel that fails to load reaches the dispatcher as itself', async () => {
    await inApp(
        { 'app/kernel.ts': 'throw new Error("kernel exploded")\n' },
        async () => {
            const { runner, calls } = fakeRunner()
            const error = await assertRejects(() =>
                new CompileCommand(runner).handle(CTX)
            )
            assert(!(error instanceof CoreCommandFailure))
            assertEquals(calls, [])
        },
    )
})

Deno.test('compile - failed route generation is a failure with cause, before any step runs', async () => {
    await inApp(
        {
            'app/kernel.ts': kernelSource({
                compile: { scripts: ['scripts/build.ts'] },
            }),
            // A directory where the registry file goes: the write throws.
            'app/routes.ts/.keep': '',
        },
        async (logs) => {
            const { runner, calls } = fakeRunner()
            const error = await assertRejects(() =>
                new CompileCommand(runner).handle(CTX)
            )
            const failure = assertFailure(
                error,
                'Failed to generate ./app/routes.ts from ./app/controller',
            )
            assertInstanceOf(failure.cause, Error)
            assertEquals(calls, [])
            assert(!logs.some((line) => line.includes('⚠️')))
        },
    )
})

Deno.test('compile - a failed pre-compile script is a failure and stops before deno compile', async () => {
    await inApp(
        {
            'app/kernel.ts': kernelSource({
                compile: { scripts: ['scripts/build.ts', 'make assets'] },
            }),
        },
        async () => {
            const { runner, calls } = fakeRunner((args) =>
                args.includes('scripts/build.ts') ? 3 : 0
            )
            const error = await assertRejects(() =>
                new CompileCommand(runner).handle(CTX)
            )
            const failure = assertFailure(
                error,
                'Pre-compile script "scripts/build.ts" failed (deno exited 3)',
            )
            assertEquals(failure.cause, undefined)
            assertEquals(calls.length, 1)
            assertEquals(calls[0].args, ['run', '-A', 'scripts/build.ts'])
        },
    )
})

Deno.test('compile - a pre-compile command runs its own program', async () => {
    await inApp(
        {
            'app/kernel.ts': kernelSource({
                compile: { scripts: ['make assets'] },
            }),
        },
        async () => {
            const { runner, calls } = fakeRunner((args) =>
                args[0] === 'assets' ? 2 : 0
            )
            const error = await assertRejects(() =>
                new CompileCommand(runner).handle(CTX)
            )
            assertFailure(
                error,
                'Pre-compile script "make assets" failed (make exited 2)',
            )
            assertEquals(calls, [{ command: 'make', args: ['assets'] }])
        },
    )
})

Deno.test('compile - a pre-compile program that cannot start is a failure with cause', async () => {
    await inApp(
        {
            'app/kernel.ts': kernelSource({
                compile: { scripts: ['missing-tool build'] },
            }),
        },
        async () => {
            const notFound = new Deno.errors.NotFound('missing-tool')
            const runner: StepRunner = () => Promise.reject(notFound)
            const error = await assertRejects(() =>
                new CompileCommand(runner).handle(CTX)
            )
            const failure = assertFailure(
                error,
                'Pre-compile script "missing-tool build" could not start (missing-tool)',
            )
            assertEquals(failure.cause, notFound)
        },
    )
})

Deno.test('compile - a deno compile that cannot start is a failure with cause', async () => {
    await inApp(
        { 'app/kernel.ts': kernelSource({ compile: {} }) },
        async (logs) => {
            const denied = new Deno.errors.PermissionDenied('run')
            const runner: StepRunner = () => Promise.reject(denied)
            const error = await assertRejects(() =>
                new CompileCommand(runner).handle(CTX)
            )
            const failure = assertFailure(
                error,
                'Compilation could not start (deno compile)',
            )
            assertEquals(failure.cause, denied)
            assert(!logs.some((line) => line.includes('✅ Compilation')))
        },
    )
})

Deno.test('compile - a missing declared asset is a failure before deno compile', async () => {
    await inApp(
        {
            'app/kernel.ts': kernelSource({
                compile: { assets: ['public', 'missing'] },
            }),
            'public/app.css': 'body {}',
        },
        async () => {
            const { runner, calls } = fakeRunner()
            const error = await assertRejects(() =>
                new CompileCommand(runner).handle(CTX)
            )
            assertFailure(error, 'Declared asset not found: missing')
            assertEquals(calls.filter(isCompile), [])
        },
    )
})

Deno.test('compile - a failed deno compile is a failure and reports no binary', async () => {
    await inApp(
        { 'app/kernel.ts': kernelSource({ compile: {} }) },
        async (logs) => {
            const { runner, calls } = fakeRunner((args) =>
                args[0] === 'compile' ? 1 : 0
            )
            const error = await assertRejects(() =>
                new CompileCommand(runner).handle(CTX)
            )
            const failure = assertFailure(
                error,
                'Compilation failed (deno compile exited 1)',
            )
            assertEquals(failure.cause, undefined)
            assertEquals(calls.filter(isCompile).length, 1)
            assert(!logs.some((line) => line.includes('✅ Compilation')))
        },
    )
})

// The real runner, on a script only: it must hand the child's exit code back,
// so a failing script stops the command before `deno compile` is ever spawned.
Deno.test('compile - the default runner reports a script exit code', async () => {
    await inApp(
        {
            'app/kernel.ts': kernelSource({
                compile: { scripts: ['scripts/fail.ts'] },
            }),
            'scripts/fail.ts': 'Deno.exit(4)\n',
        },
        async () => {
            const error = await assertRejects(() =>
                new CompileCommand().handle(CTX)
            )
            assertFailure(
                error,
                'Pre-compile script "scripts/fail.ts" failed (deno exited 4)',
            )
        },
    )
})
