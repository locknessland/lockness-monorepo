/**
 * `queue:work` imports the app's job files through `importAppFile` (#477):
 * a job under a path holding `#` and a space registers, a job file that
 * fails to load is reported and the others still register, and an absent
 * directory is no jobs. Moved from `@lockness/cli` with the commands (#592).
 *
 * @module @lockness/queue/tests/discover_jobs
 */

import { test } from 'node:test'
import { assertEquals, assertStringIncludes } from '@std/assert'
import { join } from 'node:path'
import { discoverJobs } from '../commands.ts'

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
    const base = `tmp/queue-discover-jobs-${crypto.randomUUID().slice(0, 8)}`
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
// queue:work
// ============================================================================

const JOB = `
export class AwkwardJob {
    name = 'awkward-job'
    payload = {}
    async handle() {}
}
`

test("discoverJobs - registers a job under a path with '#' and a space", async () => {
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

test('discoverJobs - reports a job file that fails to load, and registers the others', async () => {
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

test('discoverJobs - an absent directory is no jobs, and says nothing', async () => {
    await withAwkwardDir({}, async ({ abs }) => {
        const output = await captured(async () => {
            assertEquals(await discoverJobs(() => {}, join(abs, 'job')), 0)
        })
        assertEquals(output, '')
    })
})
