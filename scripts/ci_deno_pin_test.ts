/**
 * @fileoverview The Deno version that publishes is one exact version, stated
 * once, and tested (#481).
 *
 * - `.dvmrc` holds one exact `x.y.z`, never a range.
 * - Every `publish.yml` job installs Deno from `.dvmrc` and from nothing else:
 *   `deno publish` rewrites what it uploads, so the toolchain decides whether
 *   a published package works (#474), and a floating `v2.x` lets `gate` and
 *   `publish` run different versions in one run.
 * - `test.yml`'s `pinned` lane installs from the same file, beside the
 *   floating `v2.x`, so the version that publishes is a version CI tested and
 *   no literal version sits in the matrix to drift from `.dvmrc`.
 *
 * - `.bun-version` and `.node-version` are the Bun and Node lanes' pins
 *   (#594), each one exact `x.y.z` at or above the floor the plan measured:
 *   Bun 1.4.0, where `node:test` subtests and `mock.timers` arrive (plan 274
 *   F4); Node 22.18.0, where type stripping is on by default and
 *   `module.registerHooks` exists. Inline versions in YAML are forbidden
 *   (plan 274 §5, "Runtime version pins").
 *
 * The workflows are read through `scripts/ci_workflows.ts`, the one
 * `@std/yaml` reader every workflow-shape test shares (#480), so a shape it
 * does not expect throws instead of reading as an absent field.
 *
 * @module
 */

import { test } from 'node:test'
import { assert, assertEquals, assertMatch } from '@std/assert'
import { readWorkflows, type Workflow } from './ci_workflows.ts'

const DENO_VERSION_FILE = new URL('../.dvmrc', import.meta.url)

/** The other two runtime pins, with the floor each must meet. */
const RUNTIME_PINS = [
    // F4: `node:test` subtests, Node-style hooks and `mock.timers` need 1.4.0.
    { file: '.bun-version', floor: [1, 4, 0] },
    // Type stripping on by default, and `module.registerHooks`.
    { file: '.node-version', floor: [22, 18, 0] },
] as const

/**
 * Whether one `x.y.z` is at or above another.
 *
 * @param version - The version, as three numbers.
 * @param floor - The floor, as three numbers.
 * @returns `true` when `version >= floor`.
 */
function atLeast(
    version: readonly number[],
    floor: readonly number[],
): boolean {
    for (const [i, part] of floor.entries()) {
        if (version[i] !== part) return version[i] > part
    }
    return true
}

/**
 * One workflow of the real tree, by file name.
 *
 * @param file - The file name, such as `publish.yml`.
 * @returns The parsed workflow.
 */
async function workflowNamed(file: string): Promise<Workflow> {
    const workflow = (await readWorkflows()).find((w) => w.file === file)
    assert(workflow !== undefined, `no ${file} in .github/workflows/`)
    return workflow
}

/**
 * Every `denoland/setup-deno` step, with the job it belongs to.
 *
 * @param workflow - The parsed workflow.
 * @returns Each step's job id and `with:` inputs, in file order.
 */
function denoSetups(
    workflow: Workflow,
): { job: string; inputs: Readonly<Record<string, string>> }[] {
    return workflow.jobs.flatMap((job) =>
        job.steps
            .filter((step) => step.uses?.startsWith('denoland/setup-deno@'))
            .map((step) => ({ job: job.id, inputs: step.with }))
    )
}

test('.dvmrc holds one exact x.y.z, never a range', async () => {
    const text = await Deno.readTextFile(DENO_VERSION_FILE)
    // One line: setup-deno reads the whole file as the version unless it
    // finds a `.tool-versions`-style `deno <version>` line.
    assertMatch(text, /^\d+\.\d+\.\d+\n?$/)
})

for (const { file, floor } of RUNTIME_PINS) {
    test(`${file} holds one exact x.y.z, at or above ${floor.join('.')}`, async () => {
        const text = await Deno.readTextFile(
            new URL(`../${file}`, import.meta.url),
        )
        assertMatch(text, /^\d+\.\d+\.\d+\n?$/)
        const version = text.trim().split('.').map(Number)
        assert(
            atLeast(version, floor),
            `${file} pins ${text.trim()}, below the floor ${floor.join('.')}`,
        )
    })
}

test('the floor comparison reads each part as a number', () => {
    assert(atLeast([1, 4, 3], [1, 4, 0]))
    assert(atLeast([1, 10, 0], [1, 4, 0]))
    assert(atLeast([24, 0, 0], [22, 18, 0]))
    assert(!atLeast([1, 3, 9], [1, 4, 0]))
    assert(!atLeast([22, 17, 9], [22, 18, 0]))
})

test('every publish.yml job installs Deno from .dvmrc only', async () => {
    const workflow = await workflowNamed('publish.yml')
    const steps = denoSetups(workflow)
    // Every job runs `deno`, so every job installs it, once.
    assertEquals(steps.map((s) => s.job), workflow.jobs.map((job) => job.id))
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
    // Belt and braces: no range, and no second statement, in any step.
    for (const job of workflow.jobs) {
        for (const step of job.steps) {
            assert(
                !('deno-version' in step.with),
                `job "${job.id}" states a deno-version`,
            )
        }
    }
})

test("test.yml's pinned lane installs Deno from .dvmrc", async () => {
    const workflow = await workflowNamed('test.yml')
    const job = workflow.jobs.find((j) => j.id === 'test')
    assert(job !== undefined, 'no `test` job in test.yml')
    const matrix = job.matrix
    assert(
        typeof matrix === 'object' && matrix !== null && 'deno' in matrix,
        'no `deno` matrix axis in test.yml',
    )
    assertEquals(matrix.deno, ['v2.x', 'pinned'])
    const [step, ...others] = denoSetups(workflow).filter((s) =>
        s.job === 'test'
    )
    assert(step !== undefined, 'no setup-deno step in the test job')
    assertEquals(others, [])
    assertEquals(step.inputs['deno-version'], '${{ matrix.deno }}')
    // A non-empty `deno-version-file` wins over `deno-version` in setup-deno,
    // so only the `pinned` lane reads the file.
    assertEquals(
        step.inputs['deno-version-file'],
        "${{ matrix.deno == 'pinned' && '.dvmrc' || '' }}",
    )
})

/** Each runtime lane: its job, setup action, inputs, pin file and floating value. */
const LANES = [
    {
        job: 'bun',
        action: 'oven-sh/setup-bun@',
        versionInput: 'bun-version',
        fileInput: 'bun-version-file',
        file: '.bun-version',
        floating: 'latest',
    },
    {
        job: 'node',
        action: 'actions/setup-node@',
        versionInput: 'node-version',
        fileInput: 'node-version-file',
        file: '.node-version',
        floating: 'current',
    },
] as const

for (const lane of LANES) {
    test(`test.yml's ${lane.job} lane installs its runtime from ${lane.file} or floats`, async () => {
        const workflow = await workflowNamed('test.yml')
        const job = workflow.jobs.find((j) => j.id === lane.job)
        assert(job !== undefined, `no \`${lane.job}\` job in test.yml`)
        assertEquals(job.matrix, { [lane.job]: ['pinned', lane.floating] })
        const setups = job.steps.filter((s) => s.uses?.startsWith(lane.action))
        assertEquals(setups.length, 1, `one ${lane.action} step in ${lane.job}`)
        const inputs = setups[0].with
        // Exactly one input is non-empty per lane, so the action's
        // precedence between the two never decides the version.
        assertEquals(
            inputs[lane.fileInput],
            `\${{ matrix.${lane.job} == 'pinned' && '${lane.file}' || '' }}`,
        )
        assertEquals(
            inputs[lane.versionInput],
            `\${{ matrix.${lane.job} == '${lane.floating}' && '${lane.floating}' || '' }}`,
        )
        // The tooling runs on the Deno that publishes.
        const deno = denoSetups(workflow).filter((s) => s.job === lane.job)
        assertEquals(deno.map((s) => s.inputs), [{
            'deno-version-file': '.dvmrc',
        }])
        // The lane runs the one script, for its own runtime, and nothing
        // else: what runs is decided by engines and test_runtime.ts.
        assertEquals(
            job.steps.flatMap((s) => s.run === undefined ? [] : [s.run]),
            [`deno task test:runtime --runtime=${lane.job}`],
        )
    })
}

test('no workflow states a Bun or Node version inline', async () => {
    for (const workflow of await readWorkflows()) {
        for (const job of workflow.jobs) {
            for (const step of job.steps) {
                for (const key of ['bun-version', 'node-version']) {
                    const value = step.with[key]
                    if (value === undefined) continue
                    // Only the floating-lane expression; never a number.
                    assert(
                        !/\d/.test(value.replace(/matrix\.\w+/g, '')),
                        `${workflow.file} job "${job.id}" states ${key}: ${value}`,
                    )
                }
            }
        }
    }
})
