/**
 * @fileoverview The one reader of `.github/workflows/` (#480).
 *
 * Every workflow-shape rule in this repository (`ci_deno_pin_test.ts`,
 * `ci_id_token_test.ts`) reads the workflows through this module, so "what is
 * a job" and "what is a permissions block" are decided once. It parses only
 * and holds no policy: it changes when the workflow format does, and for no
 * other reason.
 *
 * The YAML is parsed by `@std/yaml`, so flow mappings, quoted keys, anchors,
 * aliases and merge keys are resolved the way a YAML parser resolves them, and
 * a duplicate key is an error. Every field the model interprets is checked: a
 * shape this reader does not expect throws a {@link WorkflowShapeError} naming
 * the file and the job, rather than reading as an absent field.
 *
 * The model holds only what today's consumers need, plus each mapping's key
 * list, so that a check can refuse a key it does not expect.
 *
 * @example
 * ```ts
 * import { readWorkflows } from './ci_workflows.ts'
 *
 * for (const workflow of await readWorkflows()) {
 *     console.log(workflow.path, workflow.jobs.map((job) => job.id))
 * }
 * ```
 *
 * @module
 */

import { parse } from '@std/yaml'

/** The repository's workflow directory, `.github/workflows/`. */
export const WORKFLOWS_DIR: URL = new URL(
    '../.github/workflows/',
    import.meta.url,
)

/** One scope's level in a `permissions` mapping. */
export type PermissionLevel = 'read' | 'write' | 'none'

/**
 * A `permissions` block: either a `read-all` / `write-all` scalar, or a
 * mapping from scope to level. An empty mapping (`permissions: {}`) is a
 * mapping with no scope, which GitHub reads as every scope at `none`.
 */
export type Permissions =
    | {
        /** A scalar granting every scope one level. */
        kind: 'all'
        /** The level every scope receives. */
        level: 'read' | 'write'
        /** The scalar as written. */
        source: 'read-all' | 'write-all'
    }
    | {
        /** A mapping from scope to level. */
        kind: 'scopes'
        /** Each scope as written, with its level. */
        scopes: Readonly<Record<string, PermissionLevel>>
    }

/** One entry of a job's `steps`. */
export interface WorkflowStep {
    /** The step's keys, in file order. */
    keys: readonly string[]
    /** `name:`, when present. */
    name?: string
    /** `uses:`, when present. */
    uses?: string
    /** `run:`, when present. */
    run?: string
    /** `with:` inputs, every scalar stringified (`false` reads `'false'`). */
    with: Readonly<Record<string, string>>
}

/** One entry under `jobs:`. */
export interface WorkflowJob {
    /** The job's key under `jobs:`. */
    id: string
    /** The job's keys, in file order. */
    keys: readonly string[]
    /** The job's own `permissions`; `undefined` when it has no block. */
    permissions?: Permissions
    /** `uses:` of a reusable-workflow call. */
    uses?: string
    /** `needs:`, always as a list. */
    needs: readonly string[]
    /** `runs-on:`, uninterpreted. */
    runsOn: unknown
    /** `strategy.matrix`, uninterpreted: its consumer narrows it. */
    matrix: unknown
    /** The job's steps; `[]` for a reusable-workflow call. */
    steps: readonly WorkflowStep[]
}

/** One workflow file. */
export interface Workflow {
    /** The path from the repository root, `.github/workflows/<file>`. */
    path: string
    /** The file name, `publish.yml`. */
    file: string
    /** The top-level keys, in file order. */
    keys: readonly string[]
    /** `on:`, uninterpreted. */
    on: unknown
    /** The top-level `permissions`; `undefined` when there is no block. */
    permissions?: Permissions
    /** The jobs, in file order. */
    jobs: readonly WorkflowJob[]
}

/**
 * A workflow this reader cannot model: a YAML error, or a field whose shape it
 * does not expect. The message names the file, and the job when there is one.
 */
export class WorkflowShapeError extends Error {
    /**
     * @param message - What is wrong, prefixed with the file and job.
     * @param options - The underlying error, as `cause`.
     */
    constructor(message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'WorkflowShapeError'
    }
}

const LEVELS: readonly string[] = ['read', 'write', 'none']

/** A YAML mapping: a plain object, not a list and not null. */
function isMapping(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A scalar `with:` accepts: string, number or boolean. */
function isScalar(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' ||
        typeof value === 'boolean'
}

/**
 * Reads a `permissions` value.
 *
 * @param value - The parsed value.
 * @param where - The `<path> → <job>` prefix for an error.
 * @returns The block.
 * @throws {WorkflowShapeError} On an empty block, an unknown scalar or an
 * unknown level.
 */
function readPermissions(value: unknown, where: string): Permissions {
    if (value === 'read-all') {
        return { kind: 'all', level: 'read', source: 'read-all' }
    }
    if (value === 'write-all') {
        return { kind: 'all', level: 'write', source: 'write-all' }
    }
    if (value === null) {
        throw new WorkflowShapeError(
            `${where}: \`permissions:\` is empty; write \`{}\` for no scope`,
        )
    }
    if (!isMapping(value)) {
        throw new WorkflowShapeError(
            `${where}: unknown permissions value ${JSON.stringify(value)}`,
        )
    }
    const scopes: Record<string, PermissionLevel> = {}
    for (const [scope, level] of Object.entries(value)) {
        if (typeof level !== 'string' || !LEVELS.includes(level)) {
            throw new WorkflowShapeError(
                `${where}: unknown level for permission "${scope}": ${
                    JSON.stringify(level)
                }`,
            )
        }
        scopes[scope] = level as PermissionLevel
    }
    return { kind: 'scopes', scopes }
}

/** Reads an optional string field, refusing any other shape. */
function optionalString(
    node: Record<string, unknown>,
    key: string,
    where: string,
): string | undefined {
    const value = node[key]
    if (!(key in node)) return undefined
    if (typeof value !== 'string') {
        throw new WorkflowShapeError(
            `${where}: \`${key}:\` is not a string: ${JSON.stringify(value)}`,
        )
    }
    return value
}

/** Reads one step. */
function readStep(value: unknown, index: number, where: string): WorkflowStep {
    const at = `${where}, step ${index + 1}`
    if (!isMapping(value)) {
        throw new WorkflowShapeError(`${at}: a step is not a mapping`)
    }
    const inputs: Record<string, string> = {}
    if ('with' in value) {
        const given = value.with
        if (!isMapping(given)) {
            throw new WorkflowShapeError(`${at}: \`with:\` is not a mapping`)
        }
        for (const [input, scalar] of Object.entries(given)) {
            if (!isScalar(scalar)) {
                throw new WorkflowShapeError(
                    `${at}: input "${input}" is not a scalar`,
                )
            }
            inputs[input] = String(scalar)
        }
    }
    return {
        keys: Object.keys(value),
        name: optionalString(value, 'name', at),
        uses: optionalString(value, 'uses', at),
        run: optionalString(value, 'run', at),
        with: inputs,
    }
}

/** Reads one job. */
function readJob(id: string, value: unknown, path: string): WorkflowJob {
    const where = `${path} → ${id}`
    if (!isMapping(value)) {
        throw new WorkflowShapeError(`${where}: the job is not a mapping`)
    }
    const uses = optionalString(value, 'uses', where)
    const hasSteps = 'steps' in value
    if (uses === undefined && !hasSteps) {
        throw new WorkflowShapeError(
            `${where}: the job has neither \`steps:\` nor \`uses:\``,
        )
    }
    if (uses !== undefined && hasSteps) {
        throw new WorkflowShapeError(
            `${where}: the job has both \`steps:\` and \`uses:\``,
        )
    }
    if (hasSteps && !Array.isArray(value.steps)) {
        throw new WorkflowShapeError(`${where}: \`steps:\` is not a list`)
    }
    const steps: unknown[] = Array.isArray(value.steps) ? value.steps : []

    let needs: string[] = []
    if (typeof value.needs === 'string') {
        needs = [value.needs]
    } else if (Array.isArray(value.needs)) {
        needs = value.needs.map((need: unknown) => {
            if (typeof need !== 'string') {
                throw new WorkflowShapeError(
                    `${where}: \`needs:\` holds a non-string`,
                )
            }
            return need
        })
    } else if ('needs' in value) {
        throw new WorkflowShapeError(
            `${where}: \`needs:\` is neither a string nor a list`,
        )
    }

    if ('strategy' in value && !isMapping(value.strategy)) {
        throw new WorkflowShapeError(`${where}: \`strategy:\` is not a mapping`)
    }
    const matrix = isMapping(value.strategy) ? value.strategy.matrix : undefined

    return {
        id,
        keys: Object.keys(value),
        permissions: 'permissions' in value
            ? readPermissions(value.permissions, where)
            : undefined,
        uses,
        needs,
        runsOn: value['runs-on'],
        matrix,
        steps: steps.map((step, index) => readStep(step, index, where)),
    }
}

/**
 * Parses one workflow file.
 *
 * `path` is always `.github/workflows/<file>`: the model describes the file
 * where GitHub reads it, whichever directory it was loaded from.
 *
 * @param file - The file name, such as `publish.yml`.
 * @param text - The file's contents.
 * @returns The workflow.
 * @throws {WorkflowShapeError} On a YAML error (with `cause`), or on a shape
 * the reader does not expect.
 *
 * @example
 * ```ts
 * const workflow = parseWorkflow(
 *     'ci.yml',
 *     'on: push\npermissions: { contents: read }\njobs:\n  a:\n    steps: []\n',
 * )
 * workflow.jobs[0].id // 'a'
 * ```
 */
export function parseWorkflow(file: string, text: string): Workflow {
    const path = `.github/workflows/${file}`
    let root: unknown
    try {
        root = parse(text)
    } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause)
        throw new WorkflowShapeError(`${path}: ${reason}`, { cause })
    }
    if (!isMapping(root)) {
        throw new WorkflowShapeError(`${path}: the file is not a mapping`)
    }
    if (!isMapping(root.jobs)) {
        throw new WorkflowShapeError(`${path}: \`jobs:\` is not a mapping`)
    }
    return {
        path,
        file,
        keys: Object.keys(root),
        on: root.on,
        permissions: 'permissions' in root
            ? readPermissions(root.permissions, `${path} → (top level)`)
            : undefined,
        jobs: Object.entries(root.jobs).map(([id, job]) =>
            readJob(id, job, path)
        ),
    }
}

/**
 * Reads every workflow GitHub would run: each `*.yml` and `*.yaml` directly
 * under `dir`, not recursively, sorted by name.
 *
 * @param dir - The directory; defaults to {@link WORKFLOWS_DIR}.
 * @returns The workflows, sorted by file name.
 * @throws {WorkflowShapeError} On an entry with a workflow name that is not a
 * regular file (a symlink, a directory), or on any file
 * {@link parseWorkflow} refuses.
 *
 * @example
 * ```ts
 * const files = (await readWorkflows()).map((workflow) => workflow.file)
 * ```
 */
export async function readWorkflows(
    dir: URL = WORKFLOWS_DIR,
): Promise<Workflow[]> {
    const names: string[] = []
    for await (const entry of Deno.readDir(dir)) {
        if (!/\.ya?ml$/.test(entry.name)) continue
        if (!entry.isFile) {
            throw new WorkflowShapeError(
                `.github/workflows/${entry.name}: not a regular file`,
            )
        }
        names.push(entry.name)
    }
    names.sort()
    const workflows: Workflow[] = []
    for (const name of names) {
        const text = await Deno.readTextFile(new URL(name, dir))
        workflows.push(parseWorkflow(name, text))
    }
    return workflows
}
