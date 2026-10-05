/**
 * @fileoverview The Deno version that publishes is one exact version, stated
 * once, and tested (#481).
 *
 * - `.dvmrc` holds one exact `x.y.z`, never a range.
 * - Every `publish.yml` job installs Deno from `.dvmrc` and from nothing else:
 *   `deno publish` rewrites what it uploads, so the toolchain decides whether
 *   a published package works (#474), and a floating `v2.x` lets `gate` and
 *   `publish` run different versions in one run.
 *
 * The workflows are read line by line rather than through a YAML library: the
 * files are `deno fmt`-formatted, so their indentation is stable, and a shape
 * this reader does not recognise fails the test instead of passing it.
 *
 * @module
 */

import { assert, assertEquals, assertMatch } from '@std/assert'

const DENO_VERSION_FILE = new URL('../.dvmrc', import.meta.url)
const PUBLISH_WORKFLOW = new URL(
    '../.github/workflows/publish.yml',
    import.meta.url,
)

/** One `denoland/setup-deno` step, with the job it belongs to. */
interface SetupDenoStep {
    /** The key of the job under `jobs:`. */
    job: string
    /** The step's `with:` inputs, values unquoted. */
    inputs: Record<string, string>
}

/** The indentation of a line, in spaces. */
function indentOf(line: string): number {
    return line.length - line.trimStart().length
}

/** A blank line or a comment, which never ends a block. */
function isFiller(line: string): boolean {
    const trimmed = line.trim()
    return trimmed === '' || trimmed.startsWith('#')
}

/**
 * Every job key under `jobs:`, in order.
 *
 * @param workflow - The workflow file's text.
 * @returns The job keys.
 */
function jobsOf(workflow: string): string[] {
    const jobs: string[] = []
    let inJobs = false
    for (const line of workflow.split('\n')) {
        if (isFiller(line)) continue
        if (indentOf(line) === 0) {
            inJobs = /^jobs:\s*$/.test(line)
            continue
        }
        const job = inJobs ? line.match(/^ {4}([\w-]+):\s*$/) : null
        if (job !== null) jobs.push(job[1])
    }
    return jobs
}

/**
 * Every `denoland/setup-deno` step, with its job and its `with:` inputs.
 *
 * @param workflow - The workflow file's text.
 * @returns The steps, in file order.
 */
function setupDenoSteps(workflow: string): SetupDenoStep[] {
    const lines = workflow.split('\n')
    const steps: SetupDenoStep[] = []
    let job = ''
    let inJobs = false
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (isFiller(line)) continue
        if (indentOf(line) === 0) {
            inJobs = /^jobs:\s*$/.test(line)
            continue
        }
        const jobKey = inJobs ? line.match(/^ {4}([\w-]+):\s*$/) : null
        if (jobKey !== null) {
            job = jobKey[1]
            continue
        }
        const uses = line.match(/^(\s*)(- )?uses:\s*denoland\/setup-deno@/)
        if (uses === null) continue
        // The column of the step's own keys: `uses:`, `with:`, `name:`.
        const keyIndent = uses[1].length + (uses[2] === undefined ? 0 : 2)
        const inputs: Record<string, string> = {}
        let inWith = false
        for (let j = i + 1; j < lines.length; j++) {
            const next = lines[j]
            if (isFiller(next)) continue
            const indent = indentOf(next)
            if (indent < keyIndent) break // the next step, or the next job
            if (indent === keyIndent) {
                inWith = /^\s*with:\s*$/.test(next)
                continue
            }
            if (!inWith) continue
            const input = next.match(/^\s*([\w-]+):\s*(.*?)\s*$/)
            assert(input !== null, `unreadable setup-deno input: ${next}`)
            inputs[input[1]] = input[2].replace(/^(['"])(.*)\1$/, '$2')
        }
        steps.push({ job, inputs })
    }
    return steps
}

Deno.test('.dvmrc holds one exact x.y.z, never a range', async () => {
    const text = await Deno.readTextFile(DENO_VERSION_FILE)
    // One line: setup-deno reads the whole file as the version unless it
    // finds a `.tool-versions`-style `deno <version>` line.
    assertMatch(text, /^\d+\.\d+\.\d+\n?$/)
})

Deno.test('every publish.yml job installs Deno from .dvmrc only', async () => {
    const workflow = await Deno.readTextFile(PUBLISH_WORKFLOW)
    const steps = setupDenoSteps(workflow)
    // Every job runs `deno`, so every job installs it, once.
    assertEquals(steps.map((s) => s.job), jobsOf(workflow))
    assert(steps.length > 0, 'no setup-deno step in publish.yml')
    for (const { job, inputs } of steps) {
        assertEquals(
            inputs['deno-version-file'],
            '.dvmrc',
            `job "${job}" does not install Deno from .dvmrc`,
        )
        // setup-deno ignores `deno-version` when a version file is given, so
        // a second statement of the version could only mislead a reader.
        assert(
            !('deno-version' in inputs),
            `job "${job}" also states deno-version: ${inputs['deno-version']}`,
        )
    }
    // Belt and braces: no range, and no second statement, anywhere in the file.
    assert(
        !/^\s*deno-version:/m.test(workflow),
        'publish.yml states a deno-version',
    )
})
