/**
 * @fileoverview Only `publish.yml → publish` can request an id-token (#480).
 *
 * With `id-token: write`, any process in a job can mint a GitHub OIDC token,
 * and JSR accepts that token to publish as `@lockness` (#476). So the rule
 * fails closed:
 *
 * - `publish.yml → publish` is the one job that may hold an id-token level
 *   other than `none`, and it must grant `write` in its own block, never
 *   through `write-all`;
 * - any other job whose effective permissions (its own block, otherwise the
 *   top-level one) give `read` or `write` fails: `read-all` and `write-all`
 *   count;
 * - a top-level block granting an id-token at any level but `none` fails in
 *   every file, publish.yml included, even when every job overrides it;
 * - a job with no permissions at either level fails: it would run on the
 *   repository's default token, a setting the tree cannot show.
 *
 * {@link holderShapeFindings} then pins the holder itself: its trigger, its
 * keys, its `needs`, its runner, its permissions and its three steps. Any
 * change to the one job that can mint must change this file in the same
 * commit, where a reviewer sees both.
 *
 * Policy cases edit copies of the parsed real tree, never its YAML text, so
 * they cannot go stale against a text anchor. Small YAML strings are used for
 * the syntax cases only: aliases and the `write-all` scalar.
 *
 * @module
 */

import { assert, assertEquals, assertMatch } from '@std/assert'
import {
    parseWorkflow,
    type PermissionLevel,
    type Permissions,
    readWorkflows,
    type Workflow,
    type WorkflowJob,
    type WorkflowStep,
} from './ci_workflows.ts'

const HOLDER_FILE = 'publish.yml'
const HOLDER_JOB = 'publish'
const HOLDER = `.github/workflows/${HOLDER_FILE} → ${HOLDER_JOB}`

/**
 * The id-token level a permissions block gives.
 *
 * @param permissions - The block.
 * @returns `write` for `write-all`, `read` for `read-all`, otherwise the
 * mapping's `id-token` value, `none` when absent.
 */
function idTokenLevel(permissions: Permissions): PermissionLevel {
    if (permissions.kind === 'all') return permissions.level
    return permissions.scopes['id-token'] ?? 'none'
}

/** How a block grants its id-token level, for a message. */
function describe(permissions: Permissions): string {
    return permissions.kind === 'all'
        ? permissions.source
        : `id-token: ${idTokenLevel(permissions)}`
}

/**
 * Every job, top-level block or missing holder that breaks the id-token rule.
 *
 * @param workflows - Every workflow in `.github/workflows/`.
 * @returns One finding per offence, each starting `<path> → <job>:`, where
 * `<job>` is `(top level)` for a top-level block. Empty when the tree passes.
 */
function idTokenFindings(workflows: readonly Workflow[]): string[] {
    const findings: string[] = []
    let holderSeen = false
    for (const workflow of workflows) {
        const top = workflow.permissions
        if (top !== undefined && idTokenLevel(top) !== 'none') {
            findings.push(
                `${workflow.path} → (top level): grants id-token to every job without its own permissions (${
                    describe(top)
                }). Grant it in publish's own block only.`,
            )
        }
        for (const job of workflow.jobs) {
            const at = `${workflow.path} → ${job.id}`
            const isHolder = workflow.file === HOLDER_FILE &&
                job.id === HOLDER_JOB
            const effective = job.permissions ?? top
            if (effective === undefined) {
                findings.push(
                    `${at}: declares no permissions, and neither does the workflow. It would run on the repository's default token, which this check cannot read.`,
                )
            }
            if (isHolder) {
                holderSeen = true
                const own = job.permissions
                if (own === undefined || idTokenLevel(own) !== 'write') {
                    findings.push(
                        `${at}: the holder must grant id-token: write in its own permissions block.`,
                    )
                } else if (own.kind === 'all') {
                    findings.push(
                        `${at}: the holder must grant id-token: write in its own permissions block, not ${own.source}, which grants every scope.`,
                    )
                }
                continue
            }
            if (effective === undefined || idTokenLevel(effective) === 'none') {
                continue
            }
            const origin = job.permissions === undefined
                ? 'inherited from the top-level permissions'
                : 'in its own permissions'
            findings.push(
                `${at}: can request an id-token (${
                    describe(effective)
                }, ${origin}). Only ${HOLDER_FILE} → ${HOLDER_JOB} may hold one.`,
            )
        }
    }
    if (!holderSeen) {
        findings.push(
            `${HOLDER}: no such job. The holder must exist and grant id-token: write in its own permissions block.`,
        )
    }
    return findings
}

/** Two lists hold the same strings, whatever their order. */
function sameSet(actual: readonly string[], expected: readonly string[]) {
    return JSON.stringify([...actual].sort()) ===
        JSON.stringify([...expected].sort())
}

/** Two string records hold the same entries, whatever their order. */
function sameRecord(
    actual: Readonly<Record<string, string>>,
    expected: Readonly<Record<string, string>>,
): boolean {
    return sameSet(Object.keys(actual), Object.keys(expected)) &&
        Object.entries(expected).every(([key, value]) => actual[key] === value)
}

/** A step's keys are all among `allowed`. */
function keysWithin(step: WorkflowStep, allowed: readonly string[]): boolean {
    return step.keys.every((key) => allowed.includes(key))
}

/**
 * Every way the holder departs from #476's shape.
 *
 * @param workflows - Every workflow in `.github/workflows/`.
 * @returns One finding per departure, each starting
 * `.github/workflows/publish.yml → publish:`. Empty when the shape holds.
 */
function holderShapeFindings(workflows: readonly Workflow[]): string[] {
    const workflow = workflows.find((w) => w.file === HOLDER_FILE)
    const job = workflow?.jobs.find((j) => j.id === HOLDER_JOB)
    if (workflow === undefined || job === undefined) {
        return [`${HOLDER}: no such job.`]
    }
    const findings: string[] = []
    const fail = (what: string) => findings.push(`${HOLDER}: ${what}`)

    // A `release` event always runs at the release's tag, and publishing
    // the draft is /ship's one consent act.
    if (
        JSON.stringify(workflow.on) !==
            JSON.stringify({ release: { types: ['published'] } })
    ) {
        fail(
            `the workflow must trigger on release: { types: [published] } only, found ${
                JSON.stringify(workflow.on)
            }.`,
        )
    }
    // No workflow `env:` or `defaults:` can reach the holder.
    if (!sameSet(workflow.keys, ['name', 'on', 'permissions', 'jobs'])) {
        fail(
            `the workflow's keys must be name, on, permissions and jobs, found ${
                workflow.keys.join(', ')
            }.`,
        )
    }
    // No `env:` (a JSR_URL could send the token elsewhere), `container:`,
    // `services:`, `strategy:`, `uses:` or `environment:`.
    if (
        !sameSet(job.keys, ['name', 'needs', 'runs-on', 'permissions', 'steps'])
    ) {
        fail(
            `the job's keys must be name, needs, runs-on, permissions and steps, found ${
                job.keys.join(', ')
            }.`,
        )
    }
    // This very test runs in `gate`, so it is a precondition of the publish.
    if (!sameSet(job.needs, ['gate', 'kits'])) {
        fail(`needs must be [gate, kits], found [${job.needs.join(', ')}].`)
    }
    if (job.runsOn !== 'ubuntu-latest') {
        fail(
            `runs-on must be ubuntu-latest, found ${
                JSON.stringify(job.runsOn)
            }.`,
        )
    }
    const permissions = job.permissions
    if (
        permissions?.kind !== 'scopes' ||
        !sameRecord(permissions.scopes, {
            contents: 'read',
            'id-token': 'write',
        })
    ) {
        fail(
            `permissions must be exactly { contents: read, id-token: write }, found ${
                JSON.stringify(permissions)
            }.`,
        )
    }
    const [checkout, setup, publish, ...extra] = job.steps
    if (
        checkout === undefined ||
        !/^actions\/checkout@[0-9a-f]{40}$/.test(checkout.uses ?? '') ||
        !keysWithin(checkout, ['name', 'uses', 'with']) ||
        !sameRecord(checkout.with, {
            ref: '${{ github.sha }}',
            'persist-credentials': 'false',
        })
    ) {
        fail(
            'step 1 must be actions/checkout@<sha> with ref: ${{ github.sha }} and persist-credentials: false, and nothing else.',
        )
    }
    if (
        setup === undefined ||
        !/^denoland\/setup-deno@[0-9a-f]{40}$/.test(setup.uses ?? '') ||
        !keysWithin(setup, ['name', 'uses', 'with']) ||
        !sameRecord(setup.with, { 'deno-version-file': '.dvmrc' })
    ) {
        fail(
            'step 2 must be denoland/setup-deno@<sha> with deno-version-file: .dvmrc, and nothing else.',
        )
    }
    if (
        publish === undefined || publish.run !== 'deno publish' ||
        !keysWithin(publish, ['name', 'run'])
    ) {
        fail('step 3 must be `run: deno publish`, and nothing else.')
    }
    if (extra.length > 0) {
        fail(`the job must have exactly 3 steps, found ${job.steps.length}.`)
    }
    return findings
}

// --- Editing copies of the parsed tree ------------------------------------

/** A mapping block with the given scopes. */
function scopes(given: Record<string, PermissionLevel>): Permissions {
    return { kind: 'scopes', scopes: given }
}

const WRITE_ALL: Permissions = {
    kind: 'all',
    level: 'write',
    source: 'write-all',
}
const READ_ALL: Permissions = { kind: 'all', level: 'read', source: 'read-all' }

/** A copy of `tree` with one workflow's fields replaced. */
function editWorkflow(
    tree: readonly Workflow[],
    file: string,
    patch: Partial<Workflow>,
): Workflow[] {
    assert(tree.some((w) => w.file === file), `no ${file} in the tree`)
    return tree.map((w) => w.file === file ? { ...w, ...patch } : w)
}

/** A copy of `tree` with one job's fields replaced. */
function editJob(
    tree: readonly Workflow[],
    file: string,
    id: string,
    patch: Partial<WorkflowJob>,
): Workflow[] {
    const workflow = tree.find((w) => w.file === file)
    assert(workflow !== undefined, `no ${file} in the tree`)
    assert(workflow.jobs.some((j) => j.id === id), `no ${file} → ${id}`)
    return editWorkflow(tree, file, {
        jobs: workflow.jobs.map((j) => j.id === id ? { ...j, ...patch } : j),
    })
}

/** A copy of `tree` with one job's id-token scope set, keeping contents: read. */
function grant(
    tree: readonly Workflow[],
    file: string,
    id: string,
    level: PermissionLevel,
): Workflow[] {
    return editJob(tree, file, id, {
        permissions: scopes({ contents: 'read', 'id-token': level }),
    })
}

/** The `<path> → <job>` head of each finding. */
function heads(findings: readonly string[]): string[] {
    return findings.map((finding) => finding.slice(0, finding.indexOf(':')))
}

/** The head of a finding about `job` in `file`. */
function head(file: string, job: string): string {
    return `.github/workflows/${file} → ${job}`
}

/** The jobs of test.yml that hold no block of their own. */
const TEST_INHERITORS = ['test', 'mutations', 'coverage']

/** Every finding produced by any case below, for the format test. */
const seen: string[] = []

/** idTokenFindings, recording what it returns for the format test. */
function findingsOf(tree: readonly Workflow[]): string[] {
    const findings = [...idTokenFindings(tree), ...holderShapeFindings(tree)]
    seen.push(...findings)
    return findings
}

const tree = await readWorkflows()

// --- The real tree --------------------------------------------------------

Deno.test('no workflow but publish.yml → publish can request an id-token', () => {
    assertEquals(idTokenFindings(tree), [])
    // The holder exists and holds the grant, so this cannot pass on an empty
    // set of workflows.
    const holder = tree.find((w) => w.file === HOLDER_FILE)?.jobs.find((j) =>
        j.id === HOLDER_JOB
    )
    assert(holder?.permissions?.kind === 'scopes', 'no holder in publish.yml')
    assertEquals(holder.permissions.scopes['id-token'], 'write')
})

Deno.test('publish.yml → publish keeps the shape #476 gave it', () => {
    assertEquals(holderShapeFindings(tree), [])
})

// --- The rule -------------------------------------------------------------

Deno.test('an id-token in publish.yml → gate fails, naming it', () => {
    const findings = findingsOf(grant(tree, 'publish.yml', 'gate', 'write'))
    assertEquals(heads(findings), [head('publish.yml', 'gate')])
})

Deno.test('an id-token in a test.yml job fails, naming that job', () => {
    const findings = findingsOf(grant(tree, 'test.yml', 'live-redis', 'write'))
    assertEquals(heads(findings), [head('test.yml', 'live-redis')])
    assert(findings[0].includes('in its own permissions'))
})

Deno.test('a top-level grant fails, and so does every job inheriting it', () => {
    const inTest = findingsOf(
        editWorkflow(tree, 'test.yml', {
            permissions: scopes({ contents: 'read', 'id-token': 'write' }),
        }),
    )
    assertEquals(heads(inTest), [
        head('test.yml', '(top level)'),
        ...TEST_INHERITORS.map((job) => head('test.yml', job)),
    ])
    assert(inTest[1].includes('inherited from the top-level permissions'))

    // publish.yml too, although `publish` keeps its own block and no job
    // inherits the grant.
    const inPublish = findingsOf(
        editWorkflow(tree, 'publish.yml', {
            permissions: scopes({ contents: 'read', 'id-token': 'write' }),
        }),
    )
    assertEquals(heads(inPublish), [head('publish.yml', '(top level)')])
})

Deno.test('write-all fails at the top level and per job', () => {
    const top = findingsOf(
        editWorkflow(tree, 'test.yml', { permissions: WRITE_ALL }),
    )
    assertEquals(heads(top), [
        head('test.yml', '(top level)'),
        ...TEST_INHERITORS.map((job) => head('test.yml', job)),
    ])
    assert(top[0].includes('(write-all)'))

    const perJob = findingsOf(
        editJob(tree, 'test.yml', 'kits', { permissions: WRITE_ALL }),
    )
    assertEquals(heads(perJob), [head('test.yml', 'kits')])

    // The scalar as YAML spells it.
    const parsed = parseWorkflow(
        'scalar.yml',
        'on: push\njobs:\n  a:\n    permissions: write-all\n    steps: []\n',
    )
    assertEquals(heads(findingsOf([...tree, parsed])), [
        head('scalar.yml', 'a'),
    ])
})

Deno.test('id-token: none passes anywhere; read and read-all fail', () => {
    assertEquals(findingsOf(grant(tree, 'test.yml', 'kits', 'none')), [])
    assertEquals(
        findingsOf(
            editWorkflow(tree, 'test.yml', {
                permissions: scopes({ contents: 'read', 'id-token': 'none' }),
            }),
        ),
        [],
    )
    assertEquals(heads(findingsOf(grant(tree, 'test.yml', 'kits', 'read'))), [
        head('test.yml', 'kits'),
    ])
    assertEquals(
        heads(
            findingsOf(
                editJob(tree, 'test.yml', 'kits', { permissions: READ_ALL }),
            ),
        ),
        [head('test.yml', 'kits')],
    )
    assertEquals(
        heads(
            findingsOf(
                editWorkflow(tree, 'test.yml', { permissions: READ_ALL }),
            ),
        ),
        [
            head('test.yml', '(top level)'),
            ...TEST_INHERITORS.map((job) => head('test.yml', job)),
        ],
    )
})

Deno.test('a job with no permissions, in a workflow with none, fails', () => {
    const findings = findingsOf(
        editWorkflow(tree, 'test.yml', { permissions: undefined }),
    )
    assertEquals(
        heads(findings),
        TEST_INHERITORS.map((job) => head('test.yml', job)),
    )
    for (const finding of findings) {
        assert(finding.includes('declares no permissions'), finding)
    }
})

Deno.test('a reusable-workflow call is judged, and so is the file it calls', () => {
    const caller: WorkflowJob = {
        id: 'call',
        keys: ['uses', 'permissions'],
        uses: './.github/workflows/called.yml',
        permissions: scopes({ 'id-token': 'write' }),
        needs: [],
        runsOn: undefined,
        matrix: undefined,
        steps: [],
    }
    const testYml = tree.find((w) => w.file === 'test.yml')
    assert(testYml !== undefined)
    const withCaller = editWorkflow(tree, 'test.yml', {
        jobs: [...testYml.jobs, caller],
    })
    assertEquals(heads(findingsOf(withCaller)), [head('test.yml', 'call')])

    const called = parseWorkflow(
        'called.yml',
        [
            'on: workflow_call',
            'permissions: {}',
            'jobs:',
            '  inner:',
            '    permissions:',
            '      id-token: write',
            '    steps: []',
            '',
        ].join('\n'),
    )
    assertEquals(heads(findingsOf([...tree, called])), [
        head('called.yml', 'inner'),
    ])
})

Deno.test('an aliased grant fails on both jobs', () => {
    const aliased = parseWorkflow(
        'alias.yml',
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
    assertEquals(heads(findingsOf([...tree, aliased])), [
        head('alias.yml', 'a'),
        head('alias.yml', 'b'),
    ])
})

Deno.test('the holder must hold the grant itself', () => {
    // Inherited from the top level: the top-level grant fails, and so does
    // the holder, which no longer grants it in its own block.
    const inherited = editJob(
        editWorkflow(tree, 'publish.yml', {
            permissions: scopes({ contents: 'read', 'id-token': 'write' }),
        }),
        'publish.yml',
        'publish',
        { permissions: undefined },
    )
    assertEquals(heads(idTokenFindings(inherited)), [
        head('publish.yml', '(top level)'),
        HOLDER,
    ])
    seen.push(...idTokenFindings(inherited))

    const writeAll = idTokenFindings(
        editJob(tree, 'publish.yml', 'publish', { permissions: WRITE_ALL }),
    )
    assertEquals(heads(writeAll), [HOLDER])
    assert(writeAll[0].includes('write-all'))
    seen.push(...writeAll)

    const publishYml = tree.find((w) => w.file === HOLDER_FILE)
    assert(publishYml !== undefined)
    const missing = editWorkflow(tree, HOLDER_FILE, {
        jobs: publishYml.jobs.filter((j) => j.id !== HOLDER_JOB),
    })
    assertEquals(heads(findingsOf(missing)), [HOLDER, HOLDER])
})

// --- The holder's shape ---------------------------------------------------

/** The holder job of the real tree. */
function holderJob(): WorkflowJob {
    const job = tree.find((w) => w.file === HOLDER_FILE)?.jobs.find((j) =>
        j.id === HOLDER_JOB
    )
    assert(job !== undefined)
    return job
}

/** Asserts `edited` breaks the holder's shape and nothing else. */
function assertShapeBroken(edited: readonly Workflow[]): void {
    const findings = findingsOf(edited)
    assert(findings.length > 0, 'the edit broke nothing')
    assertEquals(new Set(heads(findings)), new Set([HOLDER]))
}

Deno.test('the holder refuses a second trigger', () => {
    const publishYml = tree.find((w) => w.file === HOLDER_FILE)
    assert(publishYml !== undefined)
    assert(typeof publishYml.on === 'object' && publishYml.on !== null)
    assertShapeBroken(
        editWorkflow(tree, HOLDER_FILE, {
            on: { ...publishYml.on, workflow_dispatch: null },
        }),
    )
})

Deno.test('the holder refuses an env: at the job or the workflow', () => {
    const job = holderJob()
    assertShapeBroken(
        editJob(tree, HOLDER_FILE, HOLDER_JOB, { keys: [...job.keys, 'env'] }),
    )
    const publishYml = tree.find((w) => w.file === HOLDER_FILE)
    assert(publishYml !== undefined)
    assertShapeBroken(
        editWorkflow(tree, HOLDER_FILE, { keys: [...publishYml.keys, 'env'] }),
    )
})

Deno.test('the holder refuses an extra step', () => {
    const job = holderJob()
    const extra: WorkflowStep = { keys: ['run'], run: 'deno task x', with: {} }
    assertShapeBroken(
        editJob(tree, HOLDER_FILE, HOLDER_JOB, {
            steps: [...job.steps, extra],
        }),
    )
    assertShapeBroken(
        editJob(tree, HOLDER_FILE, HOLDER_JOB, {
            steps: [extra, ...job.steps],
        }),
    )
})

Deno.test('the holder refuses an action not pinned to a SHA', () => {
    const [checkout, ...rest] = holderJob().steps
    assertShapeBroken(
        editJob(tree, HOLDER_FILE, HOLDER_JOB, {
            steps: [{ ...checkout, uses: 'actions/checkout@v4' }, ...rest],
        }),
    )
})

Deno.test('the holder refuses needs without gate', () => {
    assertShapeBroken(
        editJob(tree, HOLDER_FILE, HOLDER_JOB, { needs: ['kits'] }),
    )
})

Deno.test('the holder refuses an environment: key', () => {
    const job = holderJob()
    assertShapeBroken(
        editJob(tree, HOLDER_FILE, HOLDER_JOB, {
            keys: [...job.keys, 'environment'],
        }),
    )
})

// Registered last, so every case above has run and recorded its findings.
Deno.test('every finding starts with .github/workflows/<file> → <job>:', () => {
    assert(seen.length > 20, `only ${seen.length} findings recorded`)
    for (const finding of seen) {
        assertMatch(
            finding,
            /^\.github\/workflows\/[\w.-]+\.ya?ml → (\(top level\)|[\w-]+): \S/,
        )
    }
})
