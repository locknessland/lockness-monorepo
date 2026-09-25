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
 * | Flag       | Effect |
 * | :--------- | :----- |
 * | `--leaks`  | runs `deno task test:leaks` (`--trace-leaks`) instead of `deno task test` — what CI runs |
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
 * ```
 */
export function gateSteps(options: GateOptions = {}): GateStep[] {
    const suite = options.leaks === true ? 'test:leaks' : 'test'
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
        { label: 'publish:check', args: ['task', 'publish:check'] },
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
 * parseGateArgs(['--leaks'])   // { leaks: true }
 * parseGateArgs(['--leak'])    // throws
 * ```
 */
export function parseGateArgs(args: string[]): GateOptions {
    const options: GateOptions = {}
    for (const arg of args) {
        if (arg === '--leaks') options.leaks = true
        else throw new Error(`unknown argument: ${arg} (known: --leaks)`)
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

/**
 * Execute one step as a `deno` child process, inheriting stdio.
 *
 * In GitHub Actions each step is folded into its own log group, so CI keeps a
 * per-step view even though the workflow calls the gate as one step.
 *
 * @param step - The step to run.
 * @returns The child's exit code.
 */
async function spawnStep(step: GateStep): Promise<number> {
    const actions = Deno.env.get('GITHUB_ACTIONS') === 'true'
    if (actions) console.log(`::group::gate: ${step.label}`)
    else console.log(`\n▶ gate: ${step.label}`)
    const status = await new Deno.Command(Deno.execPath(), {
        args: step.args,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
    }).spawn().status
    if (actions) console.log('::endgroup::')
    return status.code
}

if (import.meta.main) {
    let options: GateOptions
    try {
        options = parseGateArgs(Deno.args)
    } catch (error) {
        console.error(`❌ gate: ${(error as Error).message}`)
        Deno.exit(2)
    }
    const outcome = await runGate(gateSteps(options), spawnStep)
    if (outcome.failed !== undefined) {
        const message =
            `gate failed at "${outcome.failed.label}" (exit ${outcome.code})`
        if (Deno.env.get('GITHUB_ACTIONS') === 'true') {
            console.log(`::error::${message}`)
        }
        console.error(`\n❌ ${message}`)
        Deno.exit(outcome.code)
    }
    console.log('\n✅ gate passed')
}
