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
 * @module
 */

import { isAbsolute, join, resolve } from '@std/path'
import { gitEnvFromCwd } from '@mutations/harness.ts'

/** The hook scripts, by hook name. */
export const hooks: Record<string, string> = {
    'pre-commit': `#!/bin/bash
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
# Pre-push: runs \`deno task gate\`, the quality gate defined in deno.jsonc.
exec deno task gate
`,
}

/**
 * Resolve the hooks directory shared by every worktree of the repository that
 * contains `cwd`.
 *
 * @param cwd - A directory inside the repository (main checkout or worktree).
 * @returns The absolute path of `<git common dir>/hooks`.
 * @throws {Error} When `cwd` is not inside a git repository.
 * @example
 * ```ts
 * await resolveHooksDir('/repo/.claude/worktrees/agent-x')   // '/repo/.git/hooks'
 * ```
 */
export async function resolveHooksDir(cwd: string): Promise<string> {
    const run = await new Deno.Command('git', {
        args: ['rev-parse', '--git-common-dir'],
        cwd,
        clearEnv: true,
        env: gitEnvFromCwd(),
        stdout: 'piped',
        stderr: 'piped',
    }).output()
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
    return join(absolute, 'hooks')
}

/**
 * Write every hook into `hooksDir` and make it executable.
 *
 * @param hooksDir - The directory from {@link resolveHooksDir}.
 * @returns The paths written, in hook order.
 * @example
 * ```ts
 * await installHooks(await resolveHooksDir(Deno.cwd()))
 * ```
 */
export async function installHooks(hooksDir: string): Promise<string[]> {
    await Deno.mkdir(hooksDir, { recursive: true })
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
    try {
        hooksDir = await resolveHooksDir(Deno.cwd())
    } catch (error) {
        console.error(`❌ ${(error as Error).message}. Run: git init`)
        Deno.exit(1)
    }

    for (const path of await installHooks(hooksDir)) {
        console.log(`✅ Installed ${path.split('/').pop()} hook`)
    }

    console.log(`\n🎉 Git hooks installed in ${hooksDir}`)
    console.log('\nHooks installed:')
    console.log('  • pre-commit: typecheck, lint, fmt staged files (re-staged)')
    console.log('  • pre-push: deno task gate')
}
