#!/usr/bin/env -S deno run -A
/**
 * @fileoverview The one versioned quality gate.
 *
 * `deno task gate` runs this file, and so does everything that gates a change:
 * the pre-push hook, the `/git push` procedure, and CI's `test` job. The ordered
 * step list below is the only copy — a second hand-typed list is how CI and the
 * local gate drifted apart before (#388).
 *
 * The steps run in order and the gate stops at the first one that fails,
 * exiting with that step's code. It is judged by its exit status only.
 *
 * | Flag         | Effect |
 * | :----------- | :----- |
 * | `--leaks`    | runs `deno task test:leaks` (`--trace-leaks`) instead of `deno task test` — what CI runs |
 * | `--registry` | passes `--registry` to the `publish:check` step only — what `publish.yml` runs before `deno publish` |
 *
 * Any other argument is refused rather than ignored: a typo must not silently
 * run a different gate from the one that was asked for.
 *
 * `publish:check` resolves every package against JSR, so the gate needs
 * network access.
 *
 * @example
 * ```bash
 * deno task gate
 * deno task gate --leaks
 * deno task gate --registry
 * ```
 *
 * @module
 */

/** One gate step: a label for the log and the `deno` arguments that run it. */
export interface GateStep {
    /** What the log calls the step. */
    label: string
    /** Arguments passed to the `deno` executable. */
    args: string[]
}

/** Options that select a gate variant. */
export interface GateOptions {
    /** Run the suite with `--trace-leaks` (`deno task test:leaks`). */
    leaks?: boolean
    /** Pass `--registry` to the `publish:check` step only. */
    registry?: boolean
}

/**
 * The ordered gate steps.
 *
 * @param options - The variant to build.
 * @returns The steps, in the order they run.
 *
 * @example
 * ```ts
 * gateSteps().at(-1)?.label                  // 'test'
 * gateSteps({ leaks: true }).at(-1)?.label   // 'test:leaks'
 * gateSteps({ registry: true })[6].args      // ['task', 'publish:check', '--registry']
 * ```
 */
export function gateSteps(options: GateOptions = {}): GateStep[] {
    const suite = options.leaks === true ? 'test:leaks' : 'test'
    const publishCheckArgs = ['task', 'publish:check']
    if (options.registry === true) publishCheckArgs.push('--registry')
    return [
        { label: 'fmt --check', args: ['fmt', '--check'] },
        { label: 'lint', args: ['lint'] },
        { label: 'check', args: ['check'] },
        { label: 'deps:analyze', args: ['task', 'deps:analyze'] },
        {
            label: 'agents:brief --check',
            args: ['task', 'agents:brief', '--check'],
        },
        { label: 'docs:coverage', args: ['task', 'docs:coverage'] },
        { label: 'publish:check', args: publishCheckArgs },
        { label: suite, args: ['task', suite] },
    ]
}

/**
 * Parse the gate's command-line arguments.
 *
 * @param args - The raw arguments.
 * @returns The selected options.
 * @throws {Error} On any argument the gate does not know.
 *
 * @example
 * ```ts
 * parseGateArgs(['--leaks'])      // { leaks: true }
 * parseGateArgs(['--registry'])   // { registry: true }
 * parseGateArgs(['--leak'])       // throws
 * ```
 */
export function parseGateArgs(args: string[]): GateOptions {
    const options: GateOptions = {}
    for (const arg of args) {
        if (arg === '--leaks') options.leaks = true
        else if (arg === '--registry') options.registry = true
        else {
            throw new Error(
                `unknown argument: ${arg} (known: --leaks, --registry)`,
            )
        }
    }
    return options
}

/** The outcome of a gate run. */
export interface GateOutcome {
    /** `0` when every step passed, otherwise the failing step's exit code. */
    code: number
    /** The step that failed, when one did. */
    failed?: GateStep
}

/**
 * Run the steps in order, stopping at the first failure.
 *
 * @param steps - The steps from {@link gateSteps}.
 * @param run - Executes one step and resolves to its exit code.
 * @returns The outcome. A step that exits `0` is the only pass.
 *
 * @example
 * ```ts
 * const outcome = await runGate(gateSteps(), async () => 0)
 * outcome.code   // 0
 * ```
 */
export async function runGate(
    steps: GateStep[],
    run: (step: GateStep) => Promise<number>,
): Promise<GateOutcome> {
    for (const step of steps) {
        const code = await run(step)
        if (code !== 0) return { code, failed: step }
    }
    return { code: 0 }
}

/** Whether this process runs inside GitHub Actions. */
function inActions(): boolean {
    return Deno.env.get('GITHUB_ACTIONS') === 'true'
}

/**
 * Execute one step as a `deno` child process, inheriting stdio.
 *
 * In GitHub Actions each step is folded into its own log group, so CI keeps a
 * per-step view even though the workflow calls the gate as one step. The group
 * is closed whatever happens, and a step that cannot even be started is a
 * failure that names the step — never an exception that leaves the log
 * unattributed.
 *
 * @param step - The step to run.
 * @returns The child's exit code, or `1` when it could not be started.
 */
async function spawnStep(step: GateStep): Promise<number> {
    const actions = inActions()
    if (actions) console.log(`::group::gate: ${step.label}`)
    else console.log(`\n▶ gate: ${step.label}`)
    try {
        const status = await new Deno.Command(Deno.execPath(), {
            args: step.args,
            stdin: 'inherit',
            stdout: 'inherit',
            stderr: 'inherit',
        }).spawn().status
        return status.code
    } catch (error) {
        console.error(
            `❌ gate: step "${step.label}" could not be started: ${error}`,
        )
        return 1
    } finally {
        if (actions) console.log('::endgroup::')
    }
}

/**
 * Run the gate and decide its exit code. Everything but the final
 * `Deno.exit` lives here, so the verdict is testable in-process.
 *
 * @param args - The command-line arguments.
 * @param run - Executes one step; defaults to spawning `deno`.
 * @returns `0` when every step passed, `2` on an unknown argument, otherwise
 *   the failing step's exit code (never `0`).
 * @example
 * ```ts
 * Deno.exit(await main(Deno.args))
 * ```
 */
export async function main(
    args: string[],
    run: (step: GateStep) => Promise<number> = spawnStep,
): Promise<number> {
    let options: GateOptions
    try {
        options = parseGateArgs(args)
    } catch (error) {
        console.error(`❌ gate: ${(error as Error).message}`)
        return 2
    }
    const outcome = await runGate(gateSteps(options), run)
    if (outcome.failed !== undefined) {
        const message =
            `gate failed at "${outcome.failed.label}" (exit ${outcome.code})`
        if (inActions()) console.log(`::error::${message}`)
        console.error(`\n❌ ${message}`)
        return outcome.code
    }
    console.log('\n✅ gate passed')
    return 0
}

if (import.meta.main) {
    Deno.exit(await main(Deno.args))
}
