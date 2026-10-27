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
 * The workflows are read through `scripts/ci_workflows.ts`, the one
 * `@std/yaml` reader every workflow-shape test shares (#480), so a shape it
 * does not expect throws instead of reading as an absent field.
 *
 * @module
 */

import { assert, assertEquals, assertMatch } from '@std/assert'
import { readWorkflows, type Workflow } from './ci_workflows.ts'

const DENO_VERSION_FILE = new URL('../.dvmrc', import.meta.url)

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

Deno.test('.dvmrc holds one exact x.y.z, never a range', async () => {
    const text = await Deno.readTextFile(DENO_VERSION_FILE)
    // One line: setup-deno reads the whole file as the version unless it
    // finds a `.tool-versions`-style `deno <version>` line.
    assertMatch(text, /^\d+\.\d+\.\d+\n?$/)
})

Deno.test('every publish.yml job installs Deno from .dvmrc only', async () => {
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

Deno.test("test.yml's pinned lane installs Deno from .dvmrc", async () => {
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
