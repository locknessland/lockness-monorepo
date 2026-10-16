/**
 * @fileoverview The runtime-neutral script list (plan 274 FR-016): the
 * monorepo scripts held to `lockness-runtime/no-deno`, read by that rule
 * (`runtime_neutral.ts`).
 *
 * The monorepo's tooling stays launched by Deno until the B4 trigger, but a
 * script this epic writes or rewrites joins this list, so the day the tooling
 * moves it already runs on Bun and Node. The rule lints every entry exactly as
 * it lints an in-scope package file.
 *
 * **A ratchet: the list only grows.** An entry leaves only with its file —
 * deleted or renamed, which a test catches (`runtime_neutral_scripts_test.ts`
 * fails on an entry that does not exist). Taking an existing script off the
 * list to let `Deno` back in is a one-line diff to this file, refused in
 * review, as lowering a floor in `coverage-floors.json` is: the repository's
 * other ratchet, which also moves one way by convention and only that way
 * through its tool. A list of names, not a per-file count of `Deno`
 * references, because the target is zero: a count would make a partial
 * migration look like progress.
 *
 * Entries are repository-relative paths, sorted.
 *
 * @module scripts/lint/runtime_neutral_scripts
 */

/** The scripts held to the runtime-neutral rule, repository-relative, sorted. */
export const RUNTIME_NEUTRAL_SCRIPTS: readonly string[] = [
    'scripts/lint/runtime_neutral_scripts.ts',
    'scripts/npm_check.ts',
    'scripts/npm_stage.ts',
]
