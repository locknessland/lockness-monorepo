/**
 * @fileoverview The command-runner port the `db:*` commands spawn
 * `drizzle-kit` through, and its production implementation (#445).
 *
 * The port types — {@link CommandSpec}, {@link CommandResult} and
 * {@link CommandRunner} — are public: `DrizzleCommandDeps` names them, so
 * `cli_commands.ts` re-exports them. The default implementation,
 * {@link defaultRunCommand}, is not: this module is absent from the package's
 * `exports`, so nothing outside `@lockness/drizzle` and its own tests can reach
 * it (#564). A test imports it by relative path.
 *
 * Imports nothing, which also keeps `kit_outcome.ts` — it needs only
 * {@link CommandResult} — out of a cycle with `cli_commands.ts`.
 *
 * @module @lockness/drizzle/command-runner
 * @internal
 */

/**
 * A process to spawn: an executable plus its argument vector.
 */
export interface CommandSpec {
    /** The executable to run (e.g. `'deno'`). */
    readonly cmd: string
    /** The argument vector passed to the executable. */
    readonly args: readonly string[]
}

/**
 * What a {@link CommandRunner} observed of one finished process: facts only.
 * Whether the step worked is decided by the command, not the runner (#445).
 */
export interface CommandResult {
    /** The process exit code. */
    readonly code: number
    /**
     * What the process wrote to stderr, decoded as UTF-8. The production
     * runner keeps only the first 64 KiB; all of it has already been shown on
     * the terminal.
     */
    readonly stderr: string
}

/**
 * Command-runner port — spawns a process and resolves what it observed.
 *
 * The stdio contract (#445): **stdin and stdout are inherited**, so a prompt
 * drizzle-kit shows on a terminal still works — its prompt library checks
 * exactly those two streams, and without a TTY it refuses rather than waits,
 * so a run never hangs. **stderr is shown and returned**: each chunk is
 * forwarded to the terminal as it arrives, and a copy comes back in
 * {@link CommandResult.stderr}, because drizzle-kit reports a refused prompt
 * or a failed statement there while exiting 0.
 *
 * The production default wraps {@link Deno.Command}; a test injects a fake that
 * records the constructed argv (asserting the `drizzle-kit` command line)
 * without ever executing it.
 *
 * @param spec - The command and arguments to run.
 * @returns The exit code and the stderr the process wrote.
 */
export type CommandRunner = (spec: CommandSpec) => Promise<CommandResult>

/**
 * Where the production runner forwards a child's stderr: the terminal's,
 * unless a test records it.
 */
export interface StderrSink {
    /** Write some bytes; resolves how many were written. */
    write(chunk: Uint8Array): Promise<number>
}

/**
 * How much of a child's stderr the production runner keeps for the verdict.
 * The verdict needs only to know that stderr is not blank and whether it holds
 * the TTY refusal, which comes first; the rest is forwarded, never kept.
 */
export const RETAINED_STDERR_BYTES = 64 * 1024

/**
 * Production command-runner: spawns a real process via {@link Deno.Command}
 * under the {@link CommandRunner} stdio contract — stdin and stdout inherited,
 * stderr piped, forwarded live and returned. It judges nothing.
 *
 * @param spec - The command and arguments to run.
 * @param sink - Where stderr is forwarded; the process's own stderr by
 *   default.
 * @returns The exit code, and the first {@link RETAINED_STDERR_BYTES} bytes of
 *   stderr.
 * @throws Whatever spawning the process, or writing to the sink, throws; a
 *   failed write first kills and reaps the child.
 *
 * @example
 * ```ts
 * const { code, stderr } = await defaultRunCommand({
 *     cmd: Deno.execPath(),
 *     args: ['eval', "console.error('x')"],
 * })
 * // code === 0, stderr === 'x\n'
 * ```
 */
export async function defaultRunCommand(
    spec: CommandSpec,
    sink: StderrSink = Deno.stderr,
): Promise<CommandResult> {
    const child = new Deno.Command(spec.cmd, {
        args: [...spec.args],
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'piped',
    }).spawn()
    const kept = new Uint8Array(RETAINED_STDERR_BYTES)
    let size = 0
    try {
        for await (const chunk of child.stderr) {
            for (let written = 0; written < chunk.length;) {
                written += await sink.write(chunk.subarray(written))
            }
            const room = Math.min(RETAINED_STDERR_BYTES - size, chunk.length)
            kept.set(chunk.subarray(0, room), size)
            size += room
        }
    } catch (error) {
        // Forwarding failed (stderr closed, `| head` gone: EPIPE). Nobody
        // can see the child's report any more, so it must not finish a push
        // unwatched: kill it, reap it, then surface the failure.
        child.kill()
        await child.status
        throw error
    }
    const { code } = await child.status
    return { code, stderr: new TextDecoder().decode(kept.subarray(0, size)) }
}
