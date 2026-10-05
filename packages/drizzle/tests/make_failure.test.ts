/**
 * @fileoverview The `make:*` generators meet the CLI exit contract (#436): a
 * failed `make:factory`, `make:seeder` or `make:model` exits non-zero through a
 * real `Cli.dispatch`, printing exactly one `❌` line, and `make:model -a`
 * finishes every step before it fails, naming the ones that failed.
 *
 * Every test runs in a throwaway temp directory, because the generators write
 * project-relative paths. A write is made to fail by putting a plain file
 * where the generator needs a directory.
 *
 * @module @lockness/drizzle/tests/make_failure
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { Cli } from '@lockness/cli'
import { registerDrizzleCommands } from '../mod.ts'

/** What one dispatch printed and returned. */
interface Dispatched {
    readonly status: number
    readonly errors: readonly string[]
}

/**
 * Dispatch `args` on a real `Cli` inside a fresh temp directory, after
 * `arrange` has prepared it, and return the status with every
 * `console.error` call joined into one string; `console.log` is muted.
 * `inspect` runs in the same directory before it is removed.
 */
async function dispatchIn(
    args: string[],
    arrange: () => Promise<void> = () => Promise.resolve(),
    inspect: () => Promise<void> = () => Promise.resolve(),
): Promise<Dispatched> {
    const original = Deno.cwd()
    const dir = await Deno.makeTempDir({ prefix: 'lockness_make_failure_' })
    const errors: string[] = []
    const { log, error } = console
    const previousUrl = Deno.env.get('DATABASE_URL')
    Deno.env.delete('DATABASE_URL')
    try {
        Deno.chdir(dir)
        await arrange()
        console.log = () => {}
        console.error = (...parts: unknown[]) =>
            void errors.push(parts.map(String).join(' '))
        const cli = new Cli()
        registerDrizzleCommands(cli)
        const status = await cli.dispatch(args)
        console.log = log
        console.error = error
        await inspect()
        return { status, errors }
    } finally {
        console.log = log
        console.error = error
        if (previousUrl !== undefined) Deno.env.set('DATABASE_URL', previousUrl)
        Deno.chdir(original)
        await Deno.remove(dir, { recursive: true })
    }
}

/** Put a plain file at `path`, so creating a file under it fails. */
async function blockDirectory(path: string): Promise<void> {
    const parent = path.slice(0, path.lastIndexOf('/'))
    if (parent && parent !== '.') await Deno.mkdir(parent, { recursive: true })
    await Deno.writeTextFile(path, 'not a directory')
}

/** Assert `path` exists as a file. */
async function assertFile(path: string): Promise<void> {
    assert((await Deno.stat(path)).isFile, `${path} should have been written`)
}

for (
    const [command, reason] of [
        ['make:factory', 'Please provide a factory name'],
        ['make:seeder', 'Please provide a seeder name'],
        ['make:model', 'Please provide a model name'],
    ] as const
) {
    Deno.test(`#436 ${command} with no name exits 1 with one ❌ line`, async () => {
        const { status, errors } = await dispatchIn([command])

        assertEquals(status, 1)
        assertEquals(errors.length, 1, JSON.stringify(errors))
        const [line] = errors
        assert(line.startsWith(`❌ ${reason}`), line)
        assert(!line.includes('\n'), `a failure message is one line: ${line}`)
    })
}

Deno.test('#436 make:model with no name folds its usage into the one line', async () => {
    const { errors } = await dispatchIn(['make:model'])

    assertStringIncludes(errors[0], 'make:model <Name>')
    assertStringIncludes(errors[0], '--dialect')
})

for (
    const [command, blocked] of [
        ['make:factory', './database/factories'],
        ['make:seeder', './database/seeders'],
    ] as const
) {
    Deno.test(`#436 ${command} exits 1 when the file cannot be written, printed once`, async () => {
        const { status, errors } = await dispatchIn(
            [command, 'User'],
            () => blockDirectory(blocked),
        )

        assertEquals(status, 1)
        // The restating catch is gone: the dispatcher's catch-all prints the
        // error once, rendered, under the command's name.
        assertEquals(errors.length, 1, JSON.stringify(errors))
        assert(errors[0].startsWith(`❌ ${command} failed:`), errors[0])
    })
}

Deno.test('#436 make:model -a writes every file it can, then exits 1 naming the failed step', async () => {
    const { status, errors } = await dispatchIn(
        ['make:model', 'Post', '-a'],
        () => blockDirectory('./app/repository'),
        async () => {
            await assertFile('./app/model/post.ts')
            await assertFile('./database/seeders/post_seeder.ts')
            await assertFile('./app/controller/post_controller.ts')
        },
    )

    assertEquals(status, 1)
    assertEquals(errors.length, 1, JSON.stringify(errors))
    assert(
        errors[0].startsWith('❌ 1 of 4 steps failed: repository caused by: '),
        errors[0],
    )
})

Deno.test('#436 make:model -a keeps going after the model itself fails', async () => {
    const { status, errors } = await dispatchIn(
        ['make:model', 'Post', '-a'],
        () => blockDirectory('./app/model'),
        async () => {
            await assertFile('./app/repository/post_repository.ts')
            await assertFile('./database/seeders/post_seeder.ts')
            await assertFile('./app/controller/post_controller.ts')
        },
    )

    assertEquals(status, 1)
    assertEquals(errors.length, 1, JSON.stringify(errors))
    assert(
        errors[0].startsWith('❌ 1 of 4 steps failed: model caused by: '),
        errors[0],
    )
})

Deno.test('#436 make:model counts only the steps its flags selected', async () => {
    const { status, errors } = await dispatchIn(
        ['make:model', 'Post', '-s'],
        () => blockDirectory('./database/seeders'),
        () => assertFile('./app/model/post.ts'),
    )

    assertEquals(status, 1)
    assert(
        errors[0].startsWith('❌ 1 of 2 steps failed: seeder caused by: '),
        errors[0],
    )
})

Deno.test('#436 make:model -a succeeds with status 0 and no error output', async () => {
    const { status, errors } = await dispatchIn(
        ['make:model', 'Post', '-a'],
        undefined,
        async () => {
            await assertFile('./app/model/post.ts')
            await assertFile('./app/repository/post_repository.ts')
            await assertFile('./database/seeders/post_seeder.ts')
            await assertFile('./app/controller/post_controller.ts')
        },
    )

    assertEquals(status, 0)
    assertEquals(errors, [])
})
