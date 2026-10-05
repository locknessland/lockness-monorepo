#!/usr/bin/env -S deno run -A
/**
 * @fileoverview The `pre-push` hook's one entry point (#433): read git's
 * ref-update lines once, decide whether `deno task gate` has to run, run it
 * when it does, then hand the same bytes to the gitleaks scan
 * (`scripts/prepush_secret_scan.ts`). Either step failing refuses the push.
 *
 * The hook installed by `scripts/install_hooks.ts` is a single
 * `exec deno run -A scripts/prepush.ts`. This script is the only reader of
 * the hook's stdin:
 *
 * 1. stdin is read to the end as raw bytes;
 * 2. {@link decideGate} decides on a decoded copy of them;
 * 3. the decision is printed as `[pre-push] gate <run|skip>: <reason>`;
 * 4. when the decision is `run`, `deno task gate` starts with `stdin: 'null'`
 *    (stdout and stderr inherited) — a gate failure refuses the push and the
 *    scan does not run;
 * 5. the scan starts as its own program with the ORIGINAL bytes, unchanged,
 *    piped to its stdin; its exit code is the hook's.
 *
 * The gate never sees the ref lines, so no gate step can drain them before
 * the scan reads them — the scan would then see an empty stdin and pass with
 * "nothing to scan".
 *
 * ## When the gate is skipped
 *
 * Evaluated in order; the first matching row wins.
 *
 * | # | Condition                                                         | Decision |
 * | -: | :---------------------------------------------------------------- | :------- |
 * | 1 | the ref-update lines cannot be parsed                             | run      |
 * | 2 | zero ref updates — an empty push proves nothing                   | run      |
 * | 3 | any update is a delete                                            | run      |
 * | 4 | `published()` is empty (no `origin/main`)                         | run      |
 * | 5 | any update whose outgoing set is `null` or not all published      | run      |
 * | 6 | every update publishes nothing new                                | **skip** |
 * | — | any exception while deciding (its message is the printed reason) | run      |
 *
 * Row 5 and 6 are the secret scan's own admission predicate, imported, not
 * copied: `publishesNothingNew(outgoing(update), published())` from
 * `scripts/published_objects.ts` (#431). A package mirror push — a branch
 * update over the previous mirror head plus a lightweight tag — sends only
 * trees and blobs `origin/main` already holds, so it skips the gate.
 *
 * ## Why skipping is safe: "gated there"
 *
 * `deno task gate` checks the checkout, not the pushed content. Run during a
 * mirror push it tests the working tree, not the `packages/<name>` subtree of
 * a release tag, so it never proved anything about that push. What does hold
 * for content already reachable from `origin/main` is that it went through
 * the gated route to get there: the pre-push gate on its push to `origin`,
 * `.github/workflows/test.yml` on every push to `main`, and
 * `.github/workflows/publish.yml` before any release. "Gated there" means
 * exactly that route — not "known to be green", which would need CI state and
 * the network. `refs/remotes/origin/main` is the one door both scanned
 * (`secret-scan.yml`) and gated (`test.yml`); widening what counts as
 * published widens this skip too.
 *
 * ## No bypass
 *
 * The decision reads stdin and git state only — no argv, no environment
 * variable. The hook passes no arguments, so git's `$1`/`$2` (remote name and
 * URL) never reach it. The trust boundary is the scan's: whoever can move the
 * local `refs/remotes/origin/main` can skip both. The hook guards against
 * mistakes; CI is the authority.
 *
 * @module
 */

import { fromFileUrl } from '@std/path'
import {
    type GitEnv,
    isDelete,
    parseRefUpdates,
    type RefUpdate,
} from './prepush_secret_scan.ts'
import {
    outgoing,
    published,
    publishesNothingNew,
} from './published_objects.ts'
import { runGit } from './git_env.ts'

/** Whether the pre-push gate runs for a push, and why. */
export interface GateDecision {
    /** `run` unless every ref update publishes nothing new. */
    gate: 'run' | 'skip'
    /** One line naming the rule that decided, printed by the hook. */
    reason: string
}

/** The reason a push skips the gate (rule 6). */
export const SKIP_REASON =
    'every ref update publishes nothing origin/main has not already published'

/**
 * Decide whether the pre-push gate runs, by the ordered rule in this module's
 * documentation. Anything uncertain runs the gate.
 *
 * @param stdin - The hook's stdin, decoded (git's ref-update lines).
 * @param cwd - The repository root.
 * @param env - The environment git runs with, before `runGit` sanitises it.
 *   Defaults to this process's.
 * @returns The decision. Never throws: an error while deciding is a `run`
 *   whose reason carries the error message.
 * @example
 * ```ts
 * const decision = await decideGate(stdin, repoRoot)
 * // { gate: 'skip', reason: 'every ref update publishes nothing …' }
 * ```
 */
export async function decideGate(
    stdin: string,
    cwd: string,
    env?: GitEnv,
): Promise<GateDecision> {
    try {
        let updates: RefUpdate[]
        try {
            updates = parseRefUpdates(stdin)
        } catch (error) {
            return {
                gate: 'run',
                reason: `ref updates unreadable (${
                    error instanceof Error ? error.message : String(error)
                })`,
            }
        }
        if (updates.length === 0) {
            return {
                gate: 'run',
                reason: 'no ref updates on stdin; an empty push proves nothing',
            }
        }
        const deleted = updates.find(isDelete)
        if (deleted !== undefined) {
            return {
                gate: 'run',
                reason: `${deleted.localRef}: a delete is never skipped`,
            }
        }
        const publishedSet = await published(cwd, env)
        if (publishedSet.size === 0) {
            return {
                gate: 'run',
                reason: 'origin/main does not resolve, so nothing counts as ' +
                    'published',
            }
        }
        for (const update of updates) {
            const out = await outgoing(update, cwd, env)
            if (!publishesNothingNew(out, publishedSet)) {
                return {
                    gate: 'run',
                    reason: out === null
                        ? `${update.localRef}: what it sends cannot be ` +
                            'computed (a git failure, a malformed sha, or a ' +
                            'remote tip missing locally)'
                        : `${update.localRef}: sends objects origin/main ` +
                            'has not published',
                }
            }
        }
        return { gate: 'skip', reason: SKIP_REASON }
    } catch (error) {
        return {
            gate: 'run',
            reason: `the gate decision failed (${
                error instanceof Error ? error.message : String(error)
            })`,
        }
    }
}

/** The steps {@link runPrepush} drives, injected so they can be recorded. */
export interface PrepushDeps {
    /**
     * Run `deno task gate` without the hook's stdin.
     *
     * @returns The gate's exit code.
     */
    runGate(): Promise<number>
    /**
     * Run the secret scan with `input` as its whole stdin.
     *
     * @param input - git's ref-update bytes, exactly as the hook read them.
     * @returns The scan's exit code.
     */
    runScan(input: Uint8Array): Promise<number>
    /**
     * Where the decision line and the refusal go. Defaults to `console.log`.
     */
    log?: (line: string) => void
    /** The environment the decision's git runs with. Defaults to this process's. */
    env?: GitEnv
}

/**
 * Run the pre-push hook: decide, gate when the decision says so, then scan.
 *
 * @param input - The hook's stdin, read to the end, as raw bytes.
 * @param cwd - The repository root the decision reads.
 * @param deps - The gate and scan runners, and an optional logger and git
 *   environment.
 * @returns The hook's exit code: the gate's when it fails (non-zero, and the
 *   scan is not run), otherwise the scan's.
 * @example
 * ```ts
 * Deno.exit(await runPrepush(input, repoRoot, { runGate, runScan }))
 * ```
 */
export async function runPrepush(
    input: Uint8Array,
    cwd: string,
    deps: PrepushDeps,
): Promise<number> {
    const log = deps.log ?? ((line: string) => console.log(line))
    const decision = await decideGate(
        new TextDecoder().decode(input),
        cwd,
        deps.env,
    )
    log(`[pre-push] gate ${decision.gate}: ${decision.reason}`)
    if (decision.gate === 'run') {
        const code = await deps.runGate()
        if (code !== 0) {
            log(
                `[pre-push] push refused: the gate failed (exit ${code}); ` +
                    'the secret scan was not run.',
            )
            return code
        }
    }
    return await deps.runScan(input)
}

/**
 * Start `deno task gate` with no stdin and inherited output, from the hook's
 * working directory and environment.
 *
 * @returns The gate's exit code, or `1` when it could not be started.
 */
async function spawnGate(): Promise<number> {
    try {
        const status = await new Deno.Command(Deno.execPath(), {
            args: ['task', 'gate'],
            stdin: 'null',
            stdout: 'inherit',
            stderr: 'inherit',
        }).spawn().status
        return status.code
    } catch (error) {
        console.error(`[pre-push] the gate could not be started: ${error}`)
        return 1
    }
}

/** The secret scan program {@link spawnScan} starts by default. */
const SCAN_PROGRAM = fromFileUrl(
    new URL('./prepush_secret_scan.ts', import.meta.url),
)

/**
 * Start the secret scan as its own program and write `input` to its stdin,
 * unchanged.
 *
 * A scan that exits 0 without reading all of `input` did not judge the push:
 * the write fails (a broken pipe) and the result is `1`, never the scan's `0`.
 *
 * @internal Exported for `scripts/prepush_test.ts` only; the hook always
 *   runs it with the default `scan`.
 * @param input - git's ref-update bytes.
 * @param scan - The scan program's path. Defaults to
 *   `scripts/prepush_secret_scan.ts`; tests hand in a stub.
 * @returns The scan's exit code; `1` when it could not be started, and never
 *   `0` when its stdin could not be written in full.
 * @example
 * ```ts
 * const code = await spawnScan(new TextEncoder().encode(refLines))
 * ```
 */
export async function spawnScan(
    input: Uint8Array,
    scan: string = SCAN_PROGRAM,
): Promise<number> {
    let child: Deno.ChildProcess
    try {
        child = new Deno.Command(Deno.execPath(), {
            args: ['run', '-A', scan],
            stdin: 'piped',
            stdout: 'inherit',
            stderr: 'inherit',
        }).spawn()
    } catch (error) {
        console.error(
            `[pre-push] the secret scan could not be started: ${error}`,
        )
        return 1
    }
    let handedOff = true
    const writer = child.stdin.getWriter()
    try {
        await writer.write(input)
        await writer.close()
    } catch (error) {
        handedOff = false
        console.error(
            `[pre-push] could not hand the ref updates to the secret scan: ${error}`,
        )
    }
    const status = await child.status
    return status.code === 0 && !handedOff ? 1 : status.code
}

if (import.meta.main) {
    const input = new Uint8Array(
        await new Response(Deno.stdin.readable).arrayBuffer(),
    )
    const toplevel = await runGit(['rev-parse', '--show-toplevel'], Deno.cwd())
    if (!toplevel.ok) {
        console.error(
            `[pre-push] git rev-parse --show-toplevel failed (exit ${toplevel.code}: ${
                toplevel.stderr || 'no stderr'
            }); deciding from ${Deno.cwd()}`,
        )
    }
    const cwd = toplevel.ok ? toplevel.stdout : Deno.cwd()
    Deno.exit(
        await runPrepush(input, cwd, {
            runGate: spawnGate,
            runScan: (bytes) => spawnScan(bytes),
        }),
    )
}
