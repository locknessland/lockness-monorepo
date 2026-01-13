# Technical Task: Lockness Project Upgrade Tool

## 📋 Task Overview

Create a new `@lockness/upgrade` package that allows users to upgrade their
Lockness projects by updating all `@lockness/*` dependencies in the
`deno.json` file. The tool should be runnable directly from JSR without prior
installation, providing a seamless upgrade experience similar to `deno upgrade`.

**Problem Being Solved:**

- Users need a simple way to upgrade all Lockness dependencies at once
- Manual version updates in `deno.json` are error-prone and tedious
- No centralized tool exists to ensure version consistency across all Lockness
  packages

**Why This Approach:**

- Self-contained tool that doesn't depend on the project's current version
- Always runs the latest version from JSR
- Works even if the project is in a broken state
- Follows modern Deno tooling patterns

## 🎯 Objectives

1. **Primary Objective**: Create a standalone upgrade tool that updates all
   `@lockness/*` dependencies in `deno.json`
2. **Version Flexibility**: Support both specific version targeting and
   automatic latest version detection
3. **User Safety**: Provide dry-run mode to preview changes before applying them
4. **Clear Feedback**: Display comprehensive upgrade summary showing old → new
   versions
5. **Documentation**: Comprehensive README and integration into main framework
   docs

## 📁 Affected File Paths

### New Package Structure

```
packages/upgrade/
├── deno.json              # Package configuration
├── mod.ts                 # Entry point CLI
├── upgrader.ts            # Core upgrade logic
├── version_fetcher.ts     # JSR version fetching
├── types.ts               # Type definitions
├── README.md              # Package documentation
└── tests/
    ├── upgrader.test.ts   # Unit tests
    └── fixtures/
        └── sample_deno.json  # Test fixture
```

### Files to Create

- `/packages/upgrade/deno.json` - Package manifest with dependencies
- `/packages/upgrade/mod.ts` - CLI entry point, argument parsing
- `/packages/upgrade/upgrader.ts` - Core upgrade logic (read, parse, update,
  write)
- `/packages/upgrade/version_fetcher.ts` - Fetch latest versions from JSR API
- `/packages/upgrade/types.ts` - TypeScript interfaces
- `/packages/upgrade/README.md` - Package documentation
- `/packages/upgrade/tests/upgrader.test.ts` - Unit tests
- `/packages/upgrade/tests/fixtures/sample_deno.json` - Test data

### Framework Files to Extend

- `/deno.jsonc` - Add `@lockness/upgrade` to workspace
- `/README.md` - Add upgrade documentation section
- `/GEMINI.md` - Document upgrade workflow

### Documentation Files to Update

#### Core Documentation

- `/README.md` - Add "Upgrading Lockness" section
- `/GEMINI.md` - Add upgrade workflow to development section
- `/packages/upgrade/README.md` - Complete package documentation

#### User Documentation (Web)

- `/app/view/pages/docs/content/getting-started.md` - Add upgrade instructions
- Consider creating `/app/view/pages/docs/content/upgrading.md` - Dedicated
  upgrade guide

#### LLM Documentation

- `/public/llms/getting-started.txt` - Add upgrade section
- `/public/llms/full.txt` - Update with upgrade workflow

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Solution**: Clear separation of concerns
  - `mod.ts`: CLI interface and argument parsing only
  - `upgrader.ts`: Core upgrade logic (read/write deno.json)
  - `version_fetcher.ts`: JSR API communication only

```typescript
// Each class has one reason to change
class VersionFetcher {
    async fetchLatestVersion(packageName: string): Promise<string>
}

class Upgrader {
    async upgrade(
        targetVersion?: string,
        dryRun = false,
    ): Promise<UpgradeResult>
}
```

**2. Open/Closed Principle (OCP)**

- **Solution**: Extensible version fetching strategy

```typescript
interface VersionProvider {
    getLatestVersion(packageName: string): Promise<string>
}

class JsrVersionProvider implements VersionProvider {
    async getLatestVersion(packageName: string): Promise<string>
}

// Future: GitHubVersionProvider, NpmVersionProvider
```

**3. Dependency Inversion Principle (DIP)**

- **Solution**: Depend on abstractions, not concrete implementations

```typescript
// Upgrader depends on VersionProvider interface, not JSR specifics
class Upgrader {
    constructor(private versionProvider: VersionProvider) {}
}
```

### DRY Principle (Don't Repeat Yourself)

**Solution:**

- Shared JSON parsing/writing utilities
- Reusable version comparison logic
- Common error handling patterns

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  CLI Layer (mod.ts)                      │  ← User interface, argument parsing
├─────────────────────────────────────────┤
│  Business Logic (upgrader.ts)           │  ← Upgrade orchestration
├─────────────────────────────────────────┤
│  Data Access (version_fetcher.ts)       │  ← External API communication
├─────────────────────────────────────────┤
│  File System (Deno.readTextFile/write)  │  ← Low-level I/O
└─────────────────────────────────────────┘
```

**Key Constraints:**

- No state mutation during dry-run
- Fail fast on invalid `deno.json` format
- Preserve JSON formatting and comments (use `@std/jsonc`)
- Network requests should have timeout (5s default)

## 🎨 Proposed API Design

### Target User-Facing CLI (Simple Version)

```bash
# Upgrade to latest version of all @lockness/* packages
deno run -Ar jsr:@lockness/upgrade

# Output:
# 🔍 Detecting Lockness packages in deno.json...
# 
# 📦 Found 5 packages to upgrade:
#   @lockness/core:    0.1.19 → 0.2.0
#   @lockness/cli:     0.1.19 → 0.2.0
#   @lockness/auth:    0.1.19 → 0.2.0
#   @lockness/drizzle: 0.1.19 → 0.2.0
#   @lockness/cache:   0.1.19 → 0.2.0
#
# ✅ deno.json updated successfully!
#
# ⚠️  Don't forget to:
#   - Review the changes with git diff
#   - Check the changelog: https://github.com/locknessjs/lockness/releases/tag/v0.2.0
#   - Test your application
```

### Target User-Facing CLI (Advanced Version)

```bash
# Upgrade to specific version
deno run -Ar jsr:@lockness/upgrade 0.2.0

# Dry-run (preview changes without applying)
deno run -Ar jsr:@lockness/upgrade --dry-run

# Specific version with dry-run
deno run -Ar jsr:@lockness/upgrade 0.2.0 --dry-run

# Output for dry-run:
# 🔍 Detecting Lockness packages in deno.json...
# 
# 📦 Would upgrade 5 packages:
#   @lockness/core:    0.1.19 → 0.2.0
#   @lockness/cli:     0.1.19 → 0.2.0
#   @lockness/auth:    0.1.19 → 0.2.0
#   @lockness/drizzle: 0.1.19 → 0.2.0
#   @lockness/cache:   0.1.19 → 0.2.0
#
# ℹ️  This was a dry run. No files were modified.
# Run without --dry-run to apply changes.
```

## 📝 Detailed Implementation Steps

### Phase 1: Package Setup and Core Types

**Step 1.1: Package Configuration**

File: `/packages/upgrade/deno.json`

```json
{
    "name": "@lockness/upgrade",
    "version": "0.1.0",
    "exports": "./mod.ts",
    "publish": {
        "include": [
            "mod.ts",
            "upgrader.ts",
            "version_fetcher.ts",
            "types.ts",
            "README.md",
            "deno.json"
        ]
    },
    "imports": {
        "@std/cli": "jsr:@std/cli@1",
        "@std/jsonc": "jsr:@std/jsonc@1",
        "@std/path": "jsr:@std/path@1",
        "@std/assert": "jsr:@std/assert@1"
    },
    "tasks": {
        "test": "deno test -A"
    }
}
```

**Step 1.2: Type Definitions**

File: `/packages/upgrade/types.ts`

```typescript
/**
 * Represents a single package upgrade
 */
export interface PackageUpgrade {
    /** Package name (e.g., "@lockness/core") */
    name: string
    /** Current version */
    currentVersion: string
    /** Target version */
    targetVersion: string
}

/**
 * Result of an upgrade operation
 */
export interface UpgradeResult {
    /** Whether the upgrade was successful */
    success: boolean
    /** List of packages that were/would be upgraded */
    upgrades: PackageUpgrade[]
    /** Error message if upgrade failed */
    error?: string
    /** Whether this was a dry run */
    dryRun: boolean
}

/**
 * Options for the upgrade operation
 */
export interface UpgradeOptions {
    /** Target version (undefined = latest) */
    targetVersion?: string
    /** Whether to perform a dry run */
    dryRun?: boolean
    /** Path to deno.json (defaults to ./deno.json) */
    configPath?: string
}

/**
 * Interface for version providers
 */
export interface VersionProvider {
    /**
     * Get the latest version of a package
     * @param packageName Full package name (e.g., "@lockness/core")
     * @returns Latest version string (e.g., "0.2.0")
     */
    getLatestVersion(packageName: string): Promise<string>
}
```

**Step 1.3: Unit Tests for Types**

File: `/packages/upgrade/tests/upgrader.test.ts`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import type { PackageUpgrade, UpgradeResult } from '../types.ts'

Deno.test('PackageUpgrade - structure validation', () => {
    const upgrade: PackageUpgrade = {
        name: '@lockness/core',
        currentVersion: '0.1.19',
        targetVersion: '0.2.0',
    }

    assertExists(upgrade.name)
    assertExists(upgrade.currentVersion)
    assertExists(upgrade.targetVersion)
})

Deno.test('UpgradeResult - successful upgrade', () => {
    const result: UpgradeResult = {
        success: true,
        upgrades: [],
        dryRun: false,
    }

    assertEquals(result.success, true)
    assertEquals(result.upgrades.length, 0)
})
```

**Testing Principles:**

- ✅ All tests use mocks for file system and network calls
- ✅ Tests are fast (< 10ms each)
- ✅ Tests are isolated and deterministic
- ✅ Focus on behavior, not implementation details

### Phase 2: Version Fetching

**Step 2.1: JSR Version Fetcher**

File: `/packages/upgrade/version_fetcher.ts`

```typescript
import type { VersionProvider } from './types.ts'

/**
 * Fetches latest version from JSR API
 */
export class JsrVersionProvider implements VersionProvider {
    private readonly baseUrl = 'https://jsr.io'
    private readonly timeout = 5000 // 5 seconds

    /**
     * Fetch the latest version of a package from JSR
     * @param packageName Package name like "@lockness/core"
     * @returns Latest version string like "0.2.0"
     */
    async getLatestVersion(packageName: string): Promise<string> {
        const scope = packageName.split('/')[0].replace('@', '')
        const name = packageName.split('/')[1]
        const url = `${this.baseUrl}/@${scope}/${name}/meta.json`

        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), this.timeout)

            const response = await fetch(url, {
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch version for ${packageName}: ${response.statusText}`,
                )
            }

            const data = await response.json()
            return data.latest as string
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(
                        `Timeout fetching version for ${packageName}`,
                    )
                }
                throw new Error(
                    `Failed to fetch version for ${packageName}: ${error.message}`,
                )
            }
            throw error
        }
    }
}

/**
 * Create a version provider instance
 * @returns VersionProvider instance
 */
export function createVersionProvider(): VersionProvider {
    return new JsrVersionProvider()
}
```

**Step 2.2: Version Fetcher Tests**

File: `/packages/upgrade/tests/version_fetcher.test.ts`

```typescript
import { assertEquals, assertRejects } from '@std/assert'
import { JsrVersionProvider } from '../version_fetcher.ts'

// Mock version provider for tests
class MockVersionProvider {
    constructor(private mockVersions: Record<string, string>) {}

    async getLatestVersion(packageName: string): Promise<string> {
        const version = this.mockVersions[packageName]
        if (!version) {
            throw new Error(`Package ${packageName} not found`)
        }
        return version
    }
}

Deno.test('MockVersionProvider - returns correct version', async () => {
    const provider = new MockVersionProvider({
        '@lockness/core': '0.2.0',
        '@lockness/cli': '0.2.0',
    })

    const version = await provider.getLatestVersion('@lockness/core')
    assertEquals(version, '0.2.0')
})

Deno.test('MockVersionProvider - throws on unknown package', async () => {
    const provider = new MockVersionProvider({})

    await assertRejects(
        () => provider.getLatestVersion('@lockness/unknown'),
        Error,
        'not found',
    )
})

// Note: Real JSR API tests would need network access
// In CI, these should be integration tests, not unit tests
```

### Phase 3: Core Upgrader Logic

**Step 3.1: Upgrader Implementation**

File: `/packages/upgrade/upgrader.ts`

```typescript
import { parse, stringify } from '@std/jsonc'
import { join } from '@std/path'
import type {
    PackageUpgrade,
    UpgradeOptions,
    UpgradeResult,
    VersionProvider,
} from './types.ts'

/**
 * Main upgrader class
 */
export class Upgrader {
    constructor(private versionProvider: VersionProvider) {}

    /**
     * Perform upgrade operation
     * @param options Upgrade options
     * @returns Upgrade result with details
     */
    async upgrade(options: UpgradeOptions = {}): Promise<UpgradeResult> {
        const {
            targetVersion,
            dryRun = false,
            configPath = './deno.json',
        } = options

        try {
            // Read deno.json
            const configContent = await Deno.readTextFile(configPath)
            const config = parse(configContent) as {
                imports?: Record<string, string>
            }

            if (!config.imports) {
                return {
                    success: false,
                    upgrades: [],
                    error: 'No imports found in deno.json',
                    dryRun,
                }
            }

            // Find all @lockness/* packages
            const locknessPackages = Object.entries(config.imports)
                .filter(([key]) => key.startsWith('@lockness/'))
                .filter(([, value]) => value.startsWith('jsr:@lockness/'))

            if (locknessPackages.length === 0) {
                return {
                    success: false,
                    upgrades: [],
                    error: 'No Lockness packages found in imports',
                    dryRun,
                }
            }

            // Determine target version for each package
            const upgrades: PackageUpgrade[] = []

            for (const [packageName, importValue] of locknessPackages) {
                const currentVersion = this.extractVersion(importValue)
                const newVersion = targetVersion ||
                    await this.versionProvider.getLatestVersion(packageName)

                if (currentVersion !== newVersion) {
                    upgrades.push({
                        name: packageName,
                        currentVersion,
                        targetVersion: newVersion,
                    })
                }
            }

            if (upgrades.length === 0) {
                return {
                    success: true,
                    upgrades: [],
                    dryRun,
                }
            }

            // Apply upgrades if not dry-run
            if (!dryRun) {
                for (const upgrade of upgrades) {
                    const oldImport = config.imports[upgrade.name]
                    config.imports[upgrade.name] = this.updateVersion(
                        oldImport,
                        upgrade.targetVersion,
                    )
                }

                // Write back to file
                await Deno.writeTextFile(
                    configPath,
                    stringify(config, { indent: 4 }),
                )
            }

            return {
                success: true,
                upgrades,
                dryRun,
            }
        } catch (error) {
            return {
                success: false,
                upgrades: [],
                error: error instanceof Error ? error.message : 'Unknown error',
                dryRun,
            }
        }
    }

    /**
     * Extract version from JSR import string
     * @param importValue Import string like "jsr:@lockness/core@^0.1.19"
     * @returns Version string like "0.1.19"
     */
    private extractVersion(importValue: string): string {
        const match = importValue.match(/@([0-9.]+)/)
        return match ? match[1] : 'unknown'
    }

    /**
     * Update version in import string
     * @param importValue Current import string
     * @param newVersion New version to set
     * @returns Updated import string
     */
    private updateVersion(importValue: string, newVersion: string): string {
        return importValue.replace(/@\^?[0-9.]+/, `@^${newVersion}`)
    }
}
```

**Step 3.2: Upgrader Tests**

File: `/packages/upgrade/tests/upgrader.test.ts`

```typescript
import { assertEquals } from '@std/assert'
import { Upgrader } from '../upgrader.ts'

// Mock version provider
class TestVersionProvider {
    async getLatestVersion(_packageName: string): Promise<string> {
        return '0.2.0'
    }
}

Deno.test('Upgrader - dry run does not modify files', async () => {
    const upgrader = new Upgrader(new TestVersionProvider())

    // This test would need a fixture file
    // For now, just test the logic
    const result = await upgrader.upgrade({
        dryRun: true,
        configPath: './tests/fixtures/sample_deno.json',
    })

    assertEquals(result.dryRun, true)
})

// Additional tests would follow similar patterns
```

### Phase 4: CLI Entry Point

**Step 4.1: Main CLI**

File: `/packages/upgrade/mod.ts`

```typescript
#!/usr/bin/env -S deno run -A
import { parseArgs } from '@std/cli'
import { Upgrader } from './upgrader.ts'
import { createVersionProvider } from './version_fetcher.ts'
import type { PackageUpgrade } from './types.ts'

/**
 * Print upgrade summary
 */
function printSummary(
    upgrades: PackageUpgrade[],
    dryRun: boolean,
): void {
    if (upgrades.length === 0) {
        console.log('\n✅ All packages are already up to date!')
        return
    }

    const verb = dryRun ? 'Would upgrade' : 'Found'
    console.log(`\n📦 ${verb} ${upgrades.length} package(s):\n`)

    for (const upgrade of upgrades) {
        console.log(
            `  ${
                upgrade.name.padEnd(30)
            } ${upgrade.currentVersion} → ${upgrade.targetVersion}`,
        )
    }

    console.log()
}

/**
 * Print success message
 */
function printSuccess(dryRun: boolean): void {
    if (dryRun) {
        console.log('ℹ️  This was a dry run. No files were modified.')
        console.log('Run without --dry-run to apply changes.\n')
    } else {
        console.log('✅ deno.json updated successfully!\n')
        console.log("⚠️  Don't forget to:")
        console.log('  - Review the changes with git diff')
        console.log(
            '  - Check the changelog at https://github.com/locknessjs/lockness/releases',
        )
        console.log('  - Test your application\n')
    }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
    const args = parseArgs(Deno.args, {
        boolean: ['dry-run', 'help'],
        alias: {
            'dry-run': 'd',
            'help': 'h',
        },
    })

    if (args.help) {
        console.log(`
Lockness Upgrade Tool

Usage:
  deno run -Ar jsr:@lockness/upgrade [version] [options]

Arguments:
  [version]         Target version (e.g., 0.2.0). If omitted, upgrades to latest.

Options:
  --dry-run, -d     Preview changes without applying them
  --help, -h        Show this help message

Examples:
  # Upgrade to latest version
  deno run -Ar jsr:@lockness/upgrade

  # Upgrade to specific version
  deno run -Ar jsr:@lockness/upgrade 0.2.0

  # Dry run (preview only)
  deno run -Ar jsr:@lockness/upgrade --dry-run
        `)
        Deno.exit(0)
    }

    const targetVersion = args._[0]?.toString()
    const dryRun = args['dry-run'] === true

    console.log('🔍 Detecting Lockness packages in deno.json...')

    const versionProvider = createVersionProvider()
    const upgrader = new Upgrader(versionProvider)

    const result = await upgrader.upgrade({
        targetVersion,
        dryRun,
    })

    if (!result.success) {
        console.error(`\n❌ Error: ${result.error}\n`)
        Deno.exit(1)
    }

    printSummary(result.upgrades, result.dryRun)
    printSuccess(result.dryRun)
}

// Run CLI if executed directly
if (import.meta.main) {
    main()
}
```

## 🔄 Migration Guide

### For Existing Users

**Before (Manual Update):**

```json
{
    "imports": {
        "@lockness/core": "jsr:@lockness/core@^0.1.19",
        "@lockness/cli": "jsr:@lockness/cli@^0.1.19"
    }
}
```

Manually edit each version...

**After (Using Upgrade Tool):**

```bash
deno run -Ar jsr:@lockness/upgrade
```

All versions updated automatically!

### Breaking Changes

- N/A - This is a new feature with no breaking changes

## 📚 Documentation Updates Checklist

### Core Documentation

- [x] Create `/packages/upgrade/README.md` with complete API documentation
- [ ] Update `/README.md` with "Upgrading Your Project" section
- [ ] Update `/GEMINI.md` with upgrade workflow in development section
- [ ] Add JSDoc comments to all public APIs

### User Documentation (Web Docs)

- [ ] Update `/app/view/pages/docs/content/getting-started.md` with upgrade
      instructions
- [ ] Consider creating dedicated `/app/view/pages/docs/content/upgrading.md`
      page

### LLM Documentation

- [ ] Update `/public/llms/getting-started.txt` with upgrade section
- [ ] Update `/public/llms/full.txt` with complete upgrade reference

### README Files

- [ ] Create `/packages/upgrade/README.md` with usage examples
- [ ] Update root `/README.md` with upgrade documentation
- [ ] Ensure all examples are tested and working

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test `Upgrader` class with mock version provider
- [ ] Test version extraction logic
- [ ] Test version update logic
- [ ] Test error handling (invalid deno.json, network errors)
- [ ] Test dry-run mode (no file modifications)
- [ ] Mock all network requests
- [ ] Target 90%+ code coverage

### Integration Tests

- [ ] Test with real fixture `deno.json` files
- [ ] Test end-to-end upgrade flow
- [ ] Test with missing `deno.json`
- [ ] Test with malformed `deno.json`
- [ ] Test with no Lockness packages

### Manual Testing

- [ ] Test in a fresh Lockness project created with `deno task init`
- [ ] Test with specific version parameter
- [ ] Test with `--dry-run` flag
- [ ] Test with latest version (no parameter)
- [ ] Verify output formatting and messages
- [ ] Test error scenarios (no internet, invalid version)

## ✅ Definition of Done

- [ ] All implementation steps completed
- [ ] All tests passing (unit + integration)
- [ ] Package published to JSR
- [ ] Documentation updated (GEMINI.md, README, web docs, LLM docs)
- [ ] Examples tested and working
- [ ] Manual testing completed on real projects
- [ ] Code formatted and linted
- [ ] PR description complete with examples
- [ ] Verified tool works without installation
      (`deno run -Ar jsr:@lockness/upgrade`)

## 🔗 Related Tasks

- None (new standalone feature)

## 📅 Timeline

- **Start Date**: 2026-01-13
- **Estimated Completion**: 2026-01-15
- **Actual Completion**: TBD

## 📝 Notes

### Design Decisions

1. **Why JSR instead of npm/GitHub?**
   - Lockness is primarily published to JSR
   - JSR has a simple, stable API
   - Consistent with Deno ecosystem

2. **Why not integrate into `@lockness/cli`?**
   - Separation of concerns (CLI is for project-level commands)
   - Upgrade tool needs to work even if CLI is broken
   - Always runs latest version from JSR

3. **Why no backup feature?**
   - Users should use Git for version control
   - Keeping tool simple and focused
   - Standard practice in Deno ecosystem

4. **Future Enhancements (Not in MVP):**
   - Interactive mode with confirmation prompts
   - Selective package upgrades (only upgrade specific packages)
   - Rollback feature
   - Migration script execution for breaking changes
   - Lock file updates

### Performance Considerations

- Fetch all versions in parallel (use `Promise.all()`)
- Cache version lookups to avoid duplicate requests
- Timeout network requests (5s default)

### Security Considerations

- Validate version strings to prevent injection
- Use secure HTTPS for JSR API calls
- No arbitrary code execution
- Read/write only `deno.json` (no other file access)

---

_Task created: 2026-01-13_ _Last updated: 2026-01-13_
