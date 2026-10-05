/**
 * @fileoverview The pre-push secret scan's admission rule (#431): a ref update
 * that sends no tree or blob beyond what `origin/main` already holds publishes
 * nothing new, so it passes without a gitleaks run.
 *
 * `origin/main` is public. Content reachable from it has already been
 * published — and already scanned by `.github/workflows/secret-scan.yml` — so
 * copying it to another ref or another remote (a package mirror, a fork, a
 * new host) exposes nothing that was not exposed before. Every other update is
 * scanned exactly as before by `scripts/prepush_secret_scan.ts`.
 *
 * - {@link published}: every object reachable from `refs/remotes/origin/main`
 *   (`git rev-list --objects`). Empty when that ref does not resolve.
 * - {@link outgoing}: the trees and blobs a ref update would send
 *   (`git rev-list --objects <localSha> [--not <remoteSha>]`) minus that
 *   range's commit ids. `null` on any git failure — including a remote tip
 *   absent from the local object store.
 * - {@link publishesNothingNew}: `outgoing` is non-null, `published` is
 *   non-empty, and every outgoing object is in it.
 *
 * Why the outgoing set is NOT computed as `--not origin/main`: the question is
 * "is everything this push carries already public?", which is a subset test
 * against the published set. Excluding `origin/main` inside `rev-list` would
 * answer a different question with `rev-list`'s edge approximations.
 *
 * Commit ids are left out because a mirror commit is new by construction
 * (its tree is a subtree, its parent a mirror head) while carrying nothing
 * but published content. Commit MESSAGES are therefore not part of the
 * comparison — and they are not part of the scan either: verified against the
 * real gitleaks 8.30.1 binary, `gitleaks git` does not scan commit messages
 * (a key-shaped value in a message alone produced no finding and "~3 bytes"
 * scanned; the same value in a file was flagged). Admitting on trees and
 * blobs alone therefore drops nothing the scan would have read.
 *
 * Trust boundary: `refs/remotes/origin/main` is the local remote-tracking
 * ref. It moves on fetch and on a successful push to `origin`; the hook
 * trusts it exactly as much as it trusts the local repository it runs in.
 *
 * @module
 */

import { OBJECT_ID_RE, runGit, ZERO_SHA_RE } from './git_env.ts'

/** The ref whose reachable objects count as published. */
const PUBLISHED_REF = 'refs/remotes/origin/main'

/** The two shas of a pre-push ref update this module reads. */
export interface OutgoingUpdate {
    /** The commit (or tag) being pushed. */
    localSha: string
    /** The remote ref's current tip, all zeros when it does not exist yet. */
    remoteSha: string
}

/**
 * Run `git` in `cwd` and return its stdout lines, or `null` on failure.
 *
 * @param args - Arguments to `git`.
 * @param cwd - The repository root.
 * @param env - The environment git runs with (see `runGit`).
 * @returns Non-empty stdout lines, or `null` when git exits non-zero.
 */
async function gitLines(
    args: string[],
    cwd: string,
    env?: Record<string, string>,
): Promise<string[] | null> {
    const run = await runGit(args, cwd, env)
    if (!run.ok) return null
    return run.stdout.split('\n').filter((line) => line.length > 0)
}

/**
 * The object ids in `git rev-list --objects` output (`<id>[ <path>]` per
 * line).
 *
 * @param lines - The output lines.
 * @returns The ids.
 */
function objectIds(lines: string[]): Set<string> {
    return new Set(lines.map((line) => line.split(' ', 1)[0]))
}

/**
 * Every object reachable from `origin/main` — the published set.
 *
 * @param cwd - The repository root.
 * @param env - The environment git runs with. Defaults to this process's.
 * @returns The object ids, or an empty set when `origin/main` does not
 *   resolve (then {@link publishesNothingNew} admits nothing).
 * @example
 * ```ts
 * const set = await published(repoRoot)   // ~22k ids for the monorepo, ~0.14 s
 * ```
 */
export async function published(
    cwd: string,
    env?: Record<string, string>,
): Promise<Set<string>> {
    const lines = await gitLines(
        ['rev-list', '--objects', PUBLISHED_REF, '--'],
        cwd,
        env,
    )
    return lines === null ? new Set() : objectIds(lines)
}

/**
 * The trees and blobs one ref update would send: every object reachable from
 * `localSha` and not from `remoteSha` (all of `localSha`'s history for a new
 * ref), minus the range's commit ids.
 *
 * @param update - The ref update's local and remote shas.
 * @param cwd - The repository root.
 * @param env - The environment git runs with. Defaults to this process's.
 * @returns The outgoing object ids, or `null` when either sha is not a full
 *   object id or `git rev-list` fails — for example because `remoteSha` is
 *   not in the local object store. `null` never admits.
 * @example
 * ```ts
 * await outgoing({ localSha: tip, remoteSha: mirrorHead }, repoRoot)
 * // Set { <tree ids…>, <blob ids…> }
 * ```
 */
export async function outgoing(
    update: OutgoingUpdate,
    cwd: string,
    env?: Record<string, string>,
): Promise<Set<string> | null> {
    const shas = [update.localSha]
    if (!OBJECT_ID_RE.test(update.localSha)) return null
    const isNewRef = ZERO_SHA_RE.test(update.remoteSha)
    if (!isNewRef && !OBJECT_ID_RE.test(update.remoteSha)) return null
    if (!isNewRef) shas.push('--not', update.remoteSha)

    const objects = await gitLines(
        ['rev-list', '--objects', ...shas],
        cwd,
        env,
    )
    if (objects === null) return null
    const commits = await gitLines(['rev-list', ...shas], cwd, env)
    if (commits === null) return null

    const out = objectIds(objects)
    for (const commit of commits) out.delete(commit)
    return out
}

/**
 * Whether a ref update publishes nothing `origin/main` has not already
 * published, and so may pass without a scan.
 *
 * @param out - From {@link outgoing}; `null` (a git failure) never admits.
 * @param pub - From {@link published}; an empty set (no `origin/main`)
 *   never admits, not even an empty `out`.
 * @returns `true` only when every outgoing object is published.
 * @example
 * ```ts
 * publishesNothingNew(await outgoing(update, cwd), await published(cwd))
 * ```
 */
export function publishesNothingNew(
    out: Set<string> | null,
    pub: Set<string>,
): boolean {
    if (out === null || pub.size === 0) return false
    for (const id of out) {
        if (!pub.has(id)) return false
    }
    return true
}
