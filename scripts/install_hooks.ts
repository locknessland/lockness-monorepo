#!/usr/bin/env -S deno run -A
/**
 * Install Git hooks for the project
 */

const hooks = {
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
# Pre-push: the full quality gate. Last thing between a broken tree and origin.
#
# Steps 4 and 5 are cheap and catch classes of damage the others cannot see:
# a new import cycle, an import missing from its own package's deno.json (which
# resolves inside the workspace and breaks for a JSR consumer), and a package
# brief whose generated blocks no longer match the code.
set -e

echo "🚀 Running pre-push checks..."

echo "  ✓ Formatting..."
deno fmt --check

echo "  ✓ Linting..."
deno lint

echo "  ✓ Type checking..."
deno check

echo "  ✓ Dependency integrity..."
deno task deps:analyze

echo "  ✓ Agent briefs..."
deno task agents:brief --check

echo "  ✓ Running tests..."
deno task test

echo "✅ Pre-push checks passed!"
`,
}

const hooksDir = '.git/hooks'

try {
    // Check if .git directory exists
    const gitStat = await Deno.stat('.git')
    if (!gitStat.isDirectory) {
        console.error('❌ .git is not a directory')
        Deno.exit(1)
    }
} catch (_error) {
    console.error('❌ Not a git repository. Run: git init')
    Deno.exit(1)
}

// Ensure hooks directory exists
await Deno.mkdir(hooksDir, { recursive: true })

// Install each hook
for (const [name, content] of Object.entries(hooks)) {
    const hookPath = `${hooksDir}/${name}`

    await Deno.writeTextFile(hookPath, content)

    // Make executable
    await Deno.chmod(hookPath, 0o755)

    console.log(`✅ Installed ${name} hook`)
}

console.log('\n🎉 Git hooks installed successfully!')
console.log('\nHooks installed:')
console.log('  • pre-commit: typecheck, lint, fmt staged files (re-staged)')
console.log('  • pre-push: fmt, lint, check, deps:analyze, agents:brief, test')
