#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Install the project's Git hooks (`deno task hooks:install`).
 *
 * Hooks are shared by every worktree of a repository, so the hooks directory is
 * resolved from `git rev-parse --git-common-dir` rather than assumed to be
 * `.git/hooks`: in a linked worktree `.git` is a file, not a directory. Running
 * the installer from the main checkout or from any linked worktree therefore
 * writes into the same shared directory.
 *
 * `git` is spawned with every inherited `GIT_*` variable removed. Under a hook,
 * or from another worktree's shell, `GIT_DIR` and friends would otherwise point
 * the query at a different repository than the one the installer runs in.
 *
 * It refuses, rather than reports a success that would not hold, in two cases:
 * `core.hooksPath` is set (git would never run hooks from the common dir), or a
 * hook it would replace was not written by this installer (it would be lost).
 *
 * @module
 */

import { isAbsolute, join, resolve } from '@std/path'
import { gitEnvFromCwd } from '@mutations/harness.ts'

/** The line that marks a hook as written by this installer. */
export const HOOK_MARKER =
    '# Installed by `deno task hooks:install` (Lockness).'

/**
 * Openings of hooks this installer wrote before {@link HOOK_MARKER} existed,
 * so an existing Lockness install is upgraded rather than refused.
 */
const LEGACY_OPENINGS = [
    '#!/bin/bash\n# Pre-commit: type-check, lint, and format THE STAGED FILES',
    // #385 onwards, until the marker.
    '#!/bin/bash\n# Pre-push: runs `deno task gate`',
    // Before #385, when the hook listed the gate steps itself.
    '#!/bin/bash\n# Pre-push: the full quality gate.',
]

/** The hook scripts, by hook name. */
export const hooks: Record<string, string> = {
    'pre-commit': `#!/bin/bash
${HOOK_MARKER}
# Pre-commit: type-check, lint, and format THE STAGED FILES, then re-stage them.
#
# The previous version ran \`deno fmt\` and \`deno lint --fix\` across the whole
# working tree without re-staging. Both modify files, so the commit could carry
# unformatted content while the hook reported success — the fix landed in the
# working tree, not in the commit.
set -e

echo "🔍 Running pre-commit checks..."

staged=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx|json|jsonc|md)$' || true)

echo "  ✓ Type checking..."
deno check

echo "  ✓ Linting (with auto-fix)..."
deno lint --fix

echo "  ✓ Linting (verify)..."
deno lint

if [ -n "$staged" ]; then
    echo "  ✓ Formatting staged files..."
    # \`deno fmt\` exits non-zero with "No target files found" when EVERY staged
    # path is excluded by deno.jsonc (\`.claude/skills/\`, \`.specnaut/\`, …).
    # That is an empty set, not a formatting failure. Narrow the exemption to
    # exactly that message rather than suppressing the exit code wholesale —
    # a blanket \`|| true\` here would hide real formatting errors.
    if ! fmt_output=$(echo "$staged" | xargs deno fmt 2>&1); then
        if ! echo "$fmt_output" | grep -q "No target files found"; then
            echo "$fmt_output"
            exit 1
        fi
    fi
    # Re-stage, or the formatting again misses the commit.
    echo "$staged" | xargs git add
fi

echo "  ✓ Formatting (verify)..."
deno fmt --check

echo "✅ Pre-commit checks passed!"
`,
    'pre-push': `#!/bin/bash
${HOOK_MARKER}
# Pre-push: runs \`deno task gate\`, the quality gate defined in deno.jsonc,
# then a ranged gitleaks scan of exactly the commits being pushed
# (scripts/prepush_secret_scan.ts). Either step failing refuses the push;
# the scan reads git's ref-update lines from this hook's own stdin.
set -e
deno task gate
exec deno run -A scripts/prepush_secret_scan.ts
`,
}

/**
 * Resolve the hooks directory shared by every worktree of the repository that
 * contains `cwd`.
 *
 * @param cwd - A directory inside the repository (main checkout or worktree).
 * @param env - The environment for `git`; defaults to this process's without
 *   its `GIT_*` variables.
 * @returns The absolute path of `<git common dir>/hooks`.
 * @throws {Error} When `cwd` is not inside a git repository, or when
 *   `core.hooksPath` is set — git would then never run hooks from there.
 * @example
 * ```ts
 * await resolveHooksDir('/repo/.claude/worktrees/agent-x')   // '/repo/.git/hooks'
 * ```
 */
export async function resolveHooksDir(
    cwd: string,
    env: Record<string, string> = gitEnvFromCwd(),
): Promise<string> {
    const git = (args: string[]) =>
        new Deno.Command('git', {
            args,
            cwd,
            clearEnv: true,
            env,
            stdout: 'piped',
            stderr: 'piped',
        }).output()

    const run = await git(['rev-parse', '--git-common-dir'])
    if (!run.success) {
        const stderr = new TextDecoder().decode(run.stderr).trim()
        throw new Error(
            `not a git repository (${stderr || `exit ${run.code}`})`,
        )
    }
    const common = new TextDecoder().decode(run.stdout).trim()
    // Relative to `cwd` from the main checkout (`.git`), absolute from a
    // linked worktree. Normalise both.
    const absolute = isAbsolute(common) ? common : resolve(cwd, common)
    const hooksDir = join(absolute, 'hooks')

    // `git config --get` exits 1 when the key is unset; 0 means it is set.
    const configured = await git(['config', '--get', 'core.hooksPath'])
    if (configured.code === 0) {
        const value = new TextDecoder().decode(configured.stdout).trim()
        throw new Error(
            `core.hooksPath is set (${value}), so git would never run hooks ` +
                `installed in ${hooksDir}. Unset it with ` +
                '`git config --unset core.hooksPath` and re-run.',
        )
    }
    if (configured.code !== 1) {
        throw new Error(
            `git config --get core.hooksPath exited ${configured.code}: ${
                new TextDecoder().decode(configured.stderr).trim()
            }`,
        )
    }
    return hooksDir
}

/**
 * Whether an existing hook file was written by this installer.
 *
 * @param content - The hook's current content.
 * @returns `true` when it is safe to overwrite.
 * @example
 * ```ts
 * isLocknessHook(hooks['pre-push'])        // true
 * isLocknessHook('#!/bin/sh\nhusky run')   // false
 * ```
 */
export function isLocknessHook(content: string): boolean {
    return content.includes(HOOK_MARKER) ||
        LEGACY_OPENINGS.some((opening) => content.startsWith(opening))
}

/**
 * Read a hook that may not exist yet.
 *
 * Only "not there" means absent. Any other failure — a hook that is writable
 * but unreadable, a directory in its place — is thrown: treating it as absent
 * would overwrite exactly the hook the foreign-hook guard exists to protect.
 *
 * @param hookPath - The hook's path.
 * @returns Its content, or `null` when no file exists there.
 * @throws {Error} On any read failure other than `NotFound`.
 */
async function readExistingHook(hookPath: string): Promise<string | null> {
    try {
        return await Deno.readTextFile(hookPath)
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return null
        throw new Error(
            `cannot read the existing hook ${hookPath} (${error}); ` +
                'refusing to overwrite what cannot be inspected. Nothing was written.',
        )
    }
}

/**
 * Write every hook into `hooksDir` and make it executable.
 * Nothing is written unless every hook can be: a hook that exists and was not
 * written by this installer makes the whole install refuse, so a foreign hook
 * is never silently destroyed.
 *
 * @param hooksDir - The directory from {@link resolveHooksDir}.
 * @returns The paths written, in hook order.
 * @throws {Error} When an existing hook was not written by this installer, or
 *   cannot be read.
 * @example
 * ```ts
 * await installHooks(await resolveHooksDir(Deno.cwd()))
 * ```
 */
export async function installHooks(hooksDir: string): Promise<string[]> {
    await Deno.mkdir(hooksDir, { recursive: true })

    const foreign: string[] = []
    for (const name of Object.keys(hooks)) {
        const hookPath = join(hooksDir, name)
        const existing = await readExistingHook(hookPath)
        if (existing !== null && !isLocknessHook(existing)) {
            foreign.push(hookPath)
        }
    }
    if (foreign.length > 0) {
        throw new Error(
            `refusing to overwrite hook(s) not written by this installer: ` +
                `${foreign.join(', ')}. Move them aside (or merge them into ` +
                'scripts/install_hooks.ts) and re-run. Nothing was written.',
        )
    }

    const written: string[] = []
    for (const [name, content] of Object.entries(hooks)) {
        const hookPath = join(hooksDir, name)
        await Deno.writeTextFile(hookPath, content)
        await Deno.chmod(hookPath, 0o755)
        written.push(hookPath)
    }
    return written
}

if (import.meta.main) {
    let hooksDir: string
    let written: string[]
    try {
        hooksDir = await resolveHooksDir(Deno.cwd())
        written = await installHooks(hooksDir)
    } catch (error) {
        console.error(`❌ ${(error as Error).message}`)
        Deno.exit(1)
    }

    for (const path of written) {
        console.log(`✅ Installed ${path.split('/').pop()} hook`)
    }

    console.log(`\n🎉 Git hooks installed in ${hooksDir}`)
    console.log('\nHooks installed:')
    console.log('  • pre-commit: typecheck, lint, fmt staged files (re-staged)')
    console.log('  • pre-push: deno task gate')
}
