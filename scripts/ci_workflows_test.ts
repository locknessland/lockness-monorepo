/**
 * @fileoverview Tests for `scripts/ci_workflows.ts`, the one workflow reader
 * (#480): which files it reads, what it models, and every shape it refuses.
 *
 * @module
 */

import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert'
import { join, toFileUrl } from '@std/path'
import {
    parseWorkflow,
    type Permissions,
    readWorkflows,
    type WorkflowJob,
    WorkflowShapeError,
} from './ci_workflows.ts'

/** A one-job workflow whose job body is `job`, indented under `jobs: a:`. */
function oneJob(job: string): string {
    return `on: push\njobs:\n  a:\n${
        job.split('\n').map((line) => `    ${line}`).join('\n')
    }\n`
}

/** The only job of {@link oneJob}'s workflow around `body`. */
function onlyJob(body: string): WorkflowJob {
    const [job, ...others] = parseWorkflow('ci.yml', oneJob(body)).jobs
    assert(job !== undefined)
    assertEquals(others, [])
    return job
}

Deno.test('readWorkflows reads .yml and .yaml, sorted, not recursively', async () => {
    const dir = await Deno.makeTempDir()
    try {
        const body = oneJob('steps: []')
        await Deno.writeTextFile(join(dir, 'b.yaml'), body)
        await Deno.writeTextFile(join(dir, 'a.yml'), body)
        await Deno.writeTextFile(join(dir, 'c.txt'), 'not a workflow')
        await Deno.mkdir(join(dir, 'nested'))
        await Deno.writeTextFile(join(dir, 'nested', 'd.yml'), body)
        const workflows = await readWorkflows(toFileUrl(`${dir}/`))
        assertEquals(workflows.map((w) => w.file), ['a.yml', 'b.yaml'])
        assertEquals(workflows.map((w) => w.path), [
            '.github/workflows/a.yml',
            '.github/workflows/b.yaml',
        ])
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('readWorkflows refuses a workflow name that is not a regular file', async () => {
    const dir = await Deno.makeTempDir()
    try {
        await Deno.writeTextFile(join(dir, 'real.txt'), oneJob('steps: []'))
        await Deno.symlink(join(dir, 'real.txt'), join(dir, 'link.yml'))
        const error = await assertRejects(
            () => readWorkflows(toFileUrl(`${dir}/`)),
            WorkflowShapeError,
        )
        assert(error.message.includes('.github/workflows/link.yml'))
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('the real workflows parse, each job in file order', async () => {
    const workflows = await readWorkflows()
    assertEquals(workflows.map((w) => w.file), [
        'publish.yml',
        'secret-scan.yml',
        'test.yml',
    ])
    assertEquals(workflows.map((w) => w.jobs.map((job) => job.id)), [
        ['gate', 'kits', 'publish'],
        ['gitleaks'],
        [
            'test',
            'live-redis',
            'live-postgres',
            'live-mysql',
            'mutations',
            'coverage',
            'kits',
        ],
    ])
})

Deno.test('a flow mapping with a quoted key reads as a scopes block', () => {
    const job = onlyJob(
        'permissions: { "id-token": write, contents: read }\nsteps: []',
    )
    assertEquals(job.permissions, {
        kind: 'scopes',
        scopes: { 'id-token': 'write', contents: 'read' },
    })
})

Deno.test('read-all and write-all read as every-scope blocks', () => {
    const workflow = parseWorkflow(
        'ci.yml',
        'on: push\npermissions: write-all\njobs:\n  a:\n    permissions: read-all\n    steps: []\n',
    )
    assertEquals(workflow.permissions, {
        kind: 'all',
        level: 'write',
        source: 'write-all',
    })
    assertEquals(workflow.jobs[0].permissions, {
        kind: 'all',
        level: 'read',
        source: 'read-all',
    })
})

Deno.test('an alias resolves to the anchored block', () => {
    const workflow = parseWorkflow(
        'ci.yml',
        [
            'on: push',
            'jobs:',
            '  a:',
            '    permissions: &p',
            '      id-token: write',
            '    steps: []',
            '  b:',
            '    permissions: *p',
            '    steps: []',
            '',
        ].join('\n'),
    )
    const expected: Permissions = {
        kind: 'scopes',
        scopes: { 'id-token': 'write' },
    }
    assertEquals(workflow.jobs.map((job) => job.permissions), [
        expected,
        expected,
    ])
})

Deno.test('a reusable-workflow call has no steps', () => {
    const job = onlyJob('uses: ./.github/workflows/other.yml\nneeds: x')
    assertEquals(job.uses, './.github/workflows/other.yml')
    assertEquals(job.needs, ['x'])
    assertEquals(job.steps, [])
})

Deno.test('step inputs read back as strings', () => {
    const job = onlyJob(
        [
            'steps:',
            '  - uses: actions/checkout@abc',
            '    with:',
            '      persist-credentials: false',
            '      fetch-depth: 0',
        ].join('\n'),
    )
    assertEquals(job.steps[0].with, {
        'persist-credentials': 'false',
        'fetch-depth': '0',
    })
    assertEquals(job.steps[0].keys, ['uses', 'with'])
})

/** Asserts `text` is refused with a message naming the file and `job`. */
function assertRefused(text: string, job: string): void {
    const error = assertThrows(
        () => parseWorkflow('ci.yml', text),
        WorkflowShapeError,
    )
    assert(
        error.message.startsWith('.github/workflows/ci.yml'),
        `no file in: ${error.message}`,
    )
    assert(error.message.includes(job), `no job "${job}" in: ${error.message}`)
}

Deno.test('a duplicate key is refused, with the YAML error as cause', () => {
    const text = [
        'on: push',
        'jobs:',
        '  twice:',
        '    steps: []',
        '  twice:',
        '    steps: []',
        '',
    ].join('\n')
    assertRefused(text, 'twice')
    const error = assertThrows(() => parseWorkflow('ci.yml', text))
    assert(error instanceof Error && error.cause instanceof Error)
})

Deno.test('an empty permissions block is refused', () => {
    assertRefused(oneJob('permissions:\nsteps: []'), '→ a')
})

Deno.test('an unknown permissions scalar is refused', () => {
    assertRefused(oneJob('permissions: write\nsteps: []'), '→ a')
})

Deno.test('an unknown permission level is refused', () => {
    assertRefused(oneJob('permissions:\n  id-token: admin\nsteps: []'), '→ a')
})

Deno.test('a job with neither steps nor uses is refused', () => {
    assertRefused(oneJob('runs-on: ubuntu-latest'), '→ a')
})

Deno.test('jobs that is not a mapping is refused', () => {
    assertRefused('on: push\njobs: [a]\n', 'jobs')
})
