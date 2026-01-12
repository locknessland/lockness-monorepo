#!/usr/bin/env -S deno run -A
/**
 * Install Git hooks for the project
 */

const hooks = {
    'pre-commit': `#!/bin/bash
# Pre-commit hook: typecheck, lint --fix, lint, fmt
set -e

echo "🔍 Running pre-commit checks..."

echo "  ✓ Type checking..."
deno check

echo "  ✓ Linting (with auto-fix)..."
deno lint --fix

echo "  ✓ Linting (verify)..."
deno lint

echo "  ✓ Formatting..."
deno fmt

echo "✅ Pre-commit checks passed!"
`,
    'pre-push': `#!/bin/bash
# Pre-push hook: lint and test
set -e

echo "🚀 Running pre-push checks..."

echo "  ✓ Linting..."
deno lint

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
console.log('  • pre-commit: typecheck, lint --fix, lint, fmt')
console.log('  • pre-push: lint, test')
