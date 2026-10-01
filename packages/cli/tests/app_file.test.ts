/**
 * The cli imports app files through `importAppFile` (#477).
 *
 * Every command below loads files of the user's app at run time. Each one
 * built its specifier by hand — a bare `${Deno.cwd()}/…` path, or a
 * `` `file://${…}` `` string — which resolves against the registry when the
 * cli is installed from JSR, and turns a `#` in the path into a fragment. In
 * this repository the cli loads from disk, so the registry half cannot fail
 * here; `kits:smoke --registry` covers it. These tests pin the other half:
 * each command loads a file from a directory whose path holds a `#` and a
 * space, and a file that exists but fails to load is reported, never read as
 * "nothing to load".
 *
 * @module @lockness/cli/tests/app_file
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { Cli } from '../mod.ts'
import { loadRouteControllers } from '../commands/router_commands.ts'
import { discoverJobs } from '../commands/queue_commands.ts'
import { loadTinkerContext } from '../commands/tinker_command.ts'

/** A directory name holding both characters `file://${…}` mis-parses. */
const AWKWARD = 'app#dir with space'

/**
 * Create `<cwd>/tmp/<unique>/<AWKWARD>/` with `files` in it, hand its
 * cwd-relative and absolute paths to `run`, and remove it afterwards.
 */
async function withAwkwardDir(
    files: Record<string, string>,
    run: (dir: { rel: string; abs: string }) => Promise<void>,
): Promise<void> {
    const base = `tmp/cli-app-file-${crypto.randomUUID().slice(0, 8)}`
    const rel = `${base}/${AWKWARD}`
    const abs = join(Deno.cwd(), rel)
    await Deno.mkdir(abs, { recursive: true })
    try {
        for (const [name, source] of Object.entries(files)) {
            await Deno.mkdir(join(abs, name, '..'), { recursive: true })
            await Deno.writeTextFile(join(abs, name), source)
        }
        await run({ rel, abs })
    } finally {
        await Deno.remove(join(Deno.cwd(), base), { recursive: true })
    }
}

/** Run `body` and return what it wrote to the console, which stays quiet. */
async function captured(body: () => Promise<void>): Promise<string> {
    const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    }
    const lines: string[] = []
    const record = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '))
    }
    console.log = console.warn = console.error = record
    try {
        await body()
    } finally {
        Object.assign(console, original)
    }
    return lines.join('\n')
}

/** A module that throws while it evaluates. */
const BROKEN = 'throw new Error("broken at load")\nexport {}\n'

// ============================================================================
// Cli.discoverCommands
// ============================================================================

Deno.test("Cli.discoverCommands - registers a command under a path with '#' and a space", async () => {
    const key = `__lockness_477_command_${crypto.randomUUID()}`
    await withAwkwardDir({
        'greet_command.ts': `
export class GreetCommand {
    static _commandName = 'awkward:greet'
    handle() {
        ;(globalThis as Record<string, unknown>)[${JSON.stringify(key)}] = true
    }
}
`,
    }, async ({ rel }) => {
        const cli = new Cli()
        await captured(() => cli.discoverCommands(rel))
        const status = await cli.dispatch(['awkward:greet'])
        assertEquals(status, 0)
        assert((globalThis as Record<string, unknown>)[key] === true)
    })
})

Deno.test('Cli.discoverCommands - reports a command file that fails to load', async () => {
    await withAwkwardDir({ 'broken_command.ts': BROKEN }, async ({ rel }) => {
        const output = await captured(() => new Cli().discoverCommands(rel))
        assertStringIncludes(output, 'broken_command.ts')
        assertStringIncludes(output, 'broken at load')
    })
})

// ============================================================================
// router:list
// ============================================================================

Deno.test("loadRouteControllers - imports a controller under a path with '#' and a space", async () => {
    await withAwkwardDir({
        'awkward_controller.ts':
            "export class AwkwardController { static _basePath = '/awkward' }\n",
    }, async ({ abs }) => {
        const found = await captured(async () => {
            const controllers = await loadRouteControllers(abs)
            assertEquals(controllers.map((c) => c.name), ['AwkwardController'])
        })
        assertEquals(found, '')
    })
})

Deno.test('loadRouteControllers - reports a controller file that fails to load', async () => {
    await withAwkwardDir({
        'broken_controller.ts': BROKEN,
    }, async ({ abs }) => {
        const output = await captured(async () => {
            assertEquals(await loadRouteControllers(abs), [])
        })
        assertStringIncludes(output, 'broken_controller.ts')
        assertStringIncludes(output, 'broken at load')
    })
})

// ============================================================================
// queue:work
// ============================================================================

const JOB = `
export class AwkwardJob {
    name = 'awkward-job'
    payload = {}
    async handle() {}
}
`

Deno.test("discoverJobs - registers a job under a path with '#' and a space", async () => {
    await withAwkwardDir({ 'awkward_job.ts': JOB }, async ({ abs }) => {
        const registered: string[] = []
        const count = await discoverJobs(
            (job) => registered.push(job.name),
            abs,
        )
        assertEquals(registered, ['AwkwardJob'])
        assertEquals(count, 1)
    })
})

Deno.test('discoverJobs - reports a job file that fails to load, and registers the others', async () => {
    await withAwkwardDir({
        'awkward_job.ts': JOB,
        'broken_job.ts': BROKEN,
    }, async ({ abs }) => {
        const registered: string[] = []
        const output = await captured(async () => {
            await discoverJobs((job) => registered.push(job.name), abs)
        })
        assertEquals(registered, ['AwkwardJob'])
        assertStringIncludes(output, 'broken_job.ts')
        assertStringIncludes(output, 'broken at load')
    })
})

Deno.test('discoverJobs - an absent directory is no jobs, and says nothing', async () => {
    await withAwkwardDir({}, async ({ abs }) => {
        const output = await captured(async () => {
            assertEquals(await discoverJobs(() => {}, join(abs, 'job')), 0)
        })
        assertEquals(output, '')
    })
})

// ============================================================================
// tinker
// ============================================================================

Deno.test("loadTinkerContext - loads models and the kernel under a path with '#' and a space", async () => {
    await withAwkwardDir({
        'app/model/user.ts': 'export class User {}\n',
        'app/service/mailer.ts': 'export const mailer = "mailer"\n',
        'app/kernel.ts': 'export const db = "the-db"\n',
    }, async ({ abs }) => {
        const context: Record<string, unknown> = {}
        await captured(() => loadTinkerContext(context, abs))
        assertEquals(typeof context.User, 'function')
        assertEquals(context.mailer, 'mailer')
        assertEquals(context.db, 'the-db')
    })
})

Deno.test('loadTinkerContext - reports a file and a kernel that fail to load', async () => {
    await withAwkwardDir({
        'app/model/broken.ts': BROKEN,
        'app/model/user.ts': 'export class User {}\n',
        'app/kernel.ts': 'throw new Error("kernel broke")\nexport {}\n',
    }, async ({ abs }) => {
        const context: Record<string, unknown> = {}
        const output = await captured(() => loadTinkerContext(context, abs))
        assertEquals(typeof context.User, 'function')
        assertStringIncludes(output, 'broken.ts')
        assertStringIncludes(output, 'broken at load')
        assertStringIncludes(output, 'kernel broke')
    })
})

Deno.test('loadTinkerContext - an app with none of the directories loads nothing, and warns of nothing', async () => {
    await withAwkwardDir({}, async ({ abs }) => {
        const context: Record<string, unknown> = {}
        const output = await captured(() => loadTinkerContext(context, abs))
        assertEquals(Object.keys(context), ['help'])
        assert(!output.includes('❌') && !output.includes('⚠️'), output)
    })
})
