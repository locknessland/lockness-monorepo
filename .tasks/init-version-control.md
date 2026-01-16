# Technical Task: Add Version Control to @lockness/init

## 📋 Task Overview

Currently, the `@lockness/init` package scaffolds new projects using the latest
version of Lockness packages. Users cannot specify which version of the
framework they want to use, making it difficult to:

- Initialize projects with specific stable versions
- Test compatibility with older versions
- Create projects matching existing codebases
- Pin framework versions for reproducible builds

This task adds flexible version control to the init system, allowing users to:

1. Use JSR's native versioning for the init package itself
2. Override framework versions in generated projects via CLI flags

## 🎯 Objectives

1. **Primary Objective**: Add `--use` / `-u` flag to control framework versions
   in generated projects
2. **Backward Compatibility Objective**: Maintain current behavior as default
   (latest versions)
3. **User Experience Objective**: Provide clear, intuitive version control
   syntax
4. **Validation Objective**: Validate version strings and provide helpful error
   messages
5. **Documentation Objective**: Document all version control options with
   examples

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/init/mod.ts` - Add version flag parsing and validation logic
- `/packages/init/stubs/init/deno.json.stub` - Use template variable for
  versions

### Test Files

- `/packages/init/tests/init.test.ts` - Test version flag parsing and stub
  generation

### Documentation Files to Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### Core Documentation

- `/packages/init/README.md` - Document version control flags and usage
- `/README.md` - Update quick start examples with version options

#### User Documentation (Web)

- `/app/view/pages/docs/content/getting-started.md` - Add version control
  section
- `/app/view/pages/docs/content/installation.md` - Document version syntax

#### LLM Documentation

- `/public/llms/init.txt` - Update with version control examples
- `/public/llms/full.txt` - Add version control section

#### Stub Templates

- `/packages/init/stubs/init/deno.json.stub` - Add `{{locknessVersion}}`
  template variable

## 🏗️ Architecture Principles

### Single Responsibility Principle (SRP)

**Current State**: `mod.ts` handles both scaffolding and argument parsing

**Solution**: Extract version parsing and validation into separate functions

```typescript
// Separate concerns
function parseVersionArgs(args: string[]): VersionConfig
function validateVersion(version: string): boolean
function scaffoldProject(config: ScaffoldConfig): Promise<void>
```

### Open/Closed Principle (OCP)

**Current State**: Hard-coded version strings in stubs

**Solution**: Template-based version injection, extensible for future version
sources

```typescript
// Open for extension (future: fetch from registry, use version ranges, etc.)
interface VersionResolver {
    resolve(version: string): Promise<string>
}
```

### Dependency Inversion Principle (DIP)

**Current Problem**: Direct dependency on hard-coded version strings

**Solution**: Depend on version configuration abstraction

```typescript
interface VersionConfig {
    lockness: string
    init: string
}
```

### DRY Principle (Don't Repeat Yourself)

**Current Duplication**: Version strings repeated across multiple stub files

**Solution**: Single source of truth via template variables

```typescript
// deno.json.stub uses {{locknessVersion}}
// All packages reference this variable
```

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  User CLI Layer                          │  ← deno run -A jsr:@lockness/init@X.Y.Z --lockness-version W.Z.Y
├─────────────────────────────────────────┤
│  Argument Parsing Layer                  │  ← Parse flags, validate versions
├─────────────────────────────────────────┤
│  Version Resolution Layer                │  ← Resolve version strings
├─────────────────────────────────────────┤
│  Template Injection Layer                │  ← Inject versions into stubs
├─────────────────────────────────────────┤
│  File Scaffolding Layer                  │  ← Generate project files
└─────────────────────────────────────────┘
```

**Key Constraints:**

- Backward compatible: no flags = latest version (current behavior)
- Fail fast: invalid versions should error immediately with helpful message
- Performance: version validation should be fast (< 50ms)

## 🎨 Proposed API Design

### Target User-Facing API (Simple - Default Behavior)

```bash
# Latest version (unchanged from current behavior)
deno run -A jsr:@lockness/init my-app

# Specific init package version (JSR native)
deno run -A jsr:@lockness/init@0.1.10 my-app

# Both work identically - generate project with latest framework
```

### Target User-Facing API (Advanced - Version Control)

```bash
# Control framework version in generated project
deno run -A jsr:@lockness/init my-app --use 0.1.15
deno run -A jsr:@lockness/init my-app -u 0.1.15

# Combine init version + framework version
deno run -A jsr:@lockness/init@0.1.10 my-app --use 0.1.8

# Version ranges (future enhancement)
deno run -A jsr:@lockness/init my-app --use "^0.1.0"
deno run -A jsr:@lockness/init my-app --use "~0.1.20"
```

### Internal API Design

```typescript
// Version configuration
interface VersionConfig {
    lockness: string // Framework version for generated project
    init: string // Init package version (from import.meta)
}

// Parse command-line arguments
function parseInitArgs(args: string[]): {
    projectName: string
    use?: string // Framework version to use
    template?: string // Future: starter templates
}

// Validate version string
function validateVersion(version: string): boolean

// Resolve version to exact string
function resolveVersion(version: string): Promise<string>
```

## 📝 Detailed Implementation Steps

### Phase 1: Argument Parsing and Validation

**Step 1.1: Add Version Parsing to mod.ts**

File: `/packages/init/mod.ts`

````typescript
import { parseArgs } from '@std/cli/parse-args'

/**
 * Parse init command arguments with version support
 *
 * @example
 * ```typescript
 * const config = parseInitArgs(['my-app', '--use', '0.1.15'])
 * // { projectName: 'my-app', use: '0.1.15' }
 * ```
 */
function parseInitArgs(args: string[]): {
    projectName: string
    use?: string
    template?: string
} {
    const parsed = parseArgs(args, {
        string: ['use', 'template'],
        alias: {
            'u': 'use',
            't': 'template',
        },
        default: {
            'use': undefined,
            'template': undefined,
        },
    })

    const projectName = String(parsed._[0] || 'lockness-app')
    const use = parsed['use'] as string | undefined
    const template = parsed['template'] as string | undefined

    return { projectName, use, template }
}
````

**Step 1.2: Add Version Validation**

File: `/packages/init/mod.ts`

````typescript
/**
 * Validate semantic version string
 * Supports: X.Y.Z, ^X.Y.Z, ~X.Y.Z, latest
 *
 * @example
 * ```typescript
 * validateVersion('0.1.15')      // true
 * validateVersion('^0.1.0')      // true
 * validateVersion('latest')      // true
 * validateVersion('invalid')     // false
 * ```
 */
function validateVersion(version: string): boolean {
    if (version === 'latest') return true

    // Match semver: X.Y.Z with optional ^ or ~ prefix
    const semverRegex = /^[\^~]?\d+\.\d+\.\d+$/
    return semverRegex.test(version)
}

/**
 * Resolve version string to exact version or range
 *
 * @example
 * ```typescript
 * await resolveVersion('0.1.15')   // '0.1.15'
 * await resolveVersion('latest')   // '^0.1.22'
 * await resolveVersion('^0.1.0')   // '^0.1.0'
 * ```
 */
async function resolveVersion(version?: string): Promise<string> {
    if (!version || version === 'latest') {
        // Default: use caret range of current version (allows patch updates)
        return '^0.1.22' // TODO: Read from package version
    }

    if (!validateVersion(version)) {
        throw new Error(
            `Invalid version format: "${version}"\n` +
                `Expected: X.Y.Z, ^X.Y.Z, ~X.Y.Z, or "latest"\n` +
                `Examples: 0.1.15, ^0.1.0, ~0.1.20, latest`,
        )
    }

    // If version starts with ^ or ~, use as-is (range)
    if (version.startsWith('^') || version.startsWith('~')) {
        return version
    }

    // Exact version: prefix with ^ for patch updates
    return `^${version}`
}
````

**Step 1.3: Unit Tests for Version Parsing**

File: `/packages/init/tests/init.test.ts`

```typescript
import { assertEquals, assertThrows } from '@std/assert'

Deno.test('parseInitArgs - basic project name', () => {
    const result = parseInitArgs(['my-app'])
    assertEquals(result.projectName, 'my-app')
    assertEquals(result.use, undefined)
})

Deno.test('parseInitArgs - with version flag', () => {
    const result = parseInitArgs(['my-app', '--use', '0.1.15'])
    assertEquals(result.projectName, 'my-app')
    assertEquals(result.use, '0.1.15')
})

Deno.test('parseInitArgs - with short version flag', () => {
    const result = parseInitArgs(['my-app', '-u', '0.1.15'])
    assertEquals(result.projectName, 'my-app')
    assertEquals(result.use, '0.1.15')
})

Deno.test('validateVersion - valid versions', () => {
    assertEquals(validateVersion('0.1.15'), true)
    assertEquals(validateVersion('^0.1.0'), true)
    assertEquals(validateVersion('~0.1.20'), true)
    assertEquals(validateVersion('latest'), true)
})

Deno.test('validateVersion - invalid versions', () => {
    assertEquals(validateVersion('invalid'), false)
    assertEquals(validateVersion('0.1'), false)
    assertEquals(validateVersion('v0.1.15'), false)
})

Deno.test('resolveVersion - exact version', async () => {
    const result = await resolveVersion('0.1.15')
    assertEquals(result, '^0.1.15')
})

Deno.test('resolveVersion - version range', async () => {
    const result = await resolveVersion('^0.1.0')
    assertEquals(result, '^0.1.0')
})

Deno.test('resolveVersion - latest', async () => {
    const result = await resolveVersion('latest')
    assertEquals(result.startsWith('^'), true)
})

Deno.test('resolveVersion - invalid throws', async () => {
    await assertThrows(
        async () => await resolveVersion('invalid'),
        Error,
        'Invalid version format',
    )
})
```

### Phase 2: Template Variable Injection

**Step 2.1: Update deno.json.stub**

File: `/packages/init/stubs/init/deno.json.stub`

```json
{
    "name": "{{projectName}}",
    "version": "1.0.0",
    "tasks": {
        "dev": "deno run --allow-net --allow-read --allow-env --allow-write --watch main.ts",
        "start": "deno run --allow-net --allow-read --allow-env main.ts",
        "compile": "deno compile --allow-net --allow-read --allow-env --output ./dist/app main.ts",
        "css:build": "postcss app/view/assets/app.css -o public/css/app.css",
        "css:watch": "postcss app/view/assets/app.css -o public/css/app.css --watch",
        "routes:generate": "deno run -A scripts/generate_routes.ts",
        "routes:watch": "deno run -A scripts/watch_routes.ts"
    },
    "imports": {
        "@lockness/core": "jsr:@lockness/core@{{locknessVersion}}",
        "@lockness/drizzle": "jsr:@lockness/drizzle@{{locknessVersion}}",
        "@lockness/auth": "jsr:@lockness/auth@{{locknessVersion}}",
        "@lockness/session": "jsr:@lockness/session@{{locknessVersion}}",
        "@lockness/logger": "jsr:@lockness/logger@{{locknessVersion}}",
        "@lockness/cli": "jsr:@lockness/cli@{{locknessVersion}}",
        "@std/dotenv": "jsr:@std/dotenv@^0.225",
        "@std/assert": "jsr:@std/assert@^1",
        "@controller/": "./app/controller/",
        "@middleware/": "./app/middleware/",
        "@model/": "./app/model/",
        "@repository/": "./app/repository/",
        "@service/": "./app/service/",
        "@view/": "./app/view/"
    },
    "compilerOptions": {
        "jsx": "precompile",
        "jsxImportSource": "@lockness/core"
    }
}
```

**Step 2.2: Update registerInitCommand to Use Versions**

File: `/packages/init/mod.ts`

```typescript
export function registerInitCommand(cli: Cli) {
    cli.register('init', async (args: string[]) => {
        // Parse arguments with version support
        const { projectName, use, template } = parseInitArgs(args)

        // Resolve version (validate and normalize)
        let resolvedVersion: string
        try {
            resolvedVersion = await resolveVersion(use)
        } catch (error) {
            console.error(`❌ ${(error as Error).message}`)
            Deno.exit(1)
        }

        // Template variables
        const templateVars = {
            projectName,
            locknessVersion: resolvedVersion,
        }

        console.log(`🌊 Scaffolding Lockness project: ${projectName}`)
        console.log(`📦 Framework version: ${resolvedVersion}`)
        if (template) {
            console.log(`📋 Template: ${template}`)
        }

        // Handle both local file:// and remote https:// URLs
        let stubsDir: string
        const isRemote = !import.meta.url.startsWith('file://')

        if (import.meta.url.startsWith('file://')) {
            const currentFile = fromFileUrl(import.meta.url)
            stubsDir = join(dirname(currentFile), 'stubs', 'init')
        } else {
            // When running from JSR, use URL
            stubsDir = new URL('./stubs/init', import.meta.url).href
        }

        try {
            // Scaffold with version variables
            await Stub.scaffoldFrom(
                stubsDir,
                projectName,
                templateVars,
                isRemote ? INIT_STUB_FILES : undefined,
            )

            // Copy binary files (favicon, images)
            if (!isRemote) {
                for (const file of BINARY_FILES) {
                    try {
                        const sourcePath = join(stubsDir, file)
                        const targetPath = join(projectName, file)
                        await Deno.mkdir(dirname(targetPath), {
                            recursive: true,
                        })
                        await Deno.copyFile(sourcePath, targetPath)
                    } catch (error) {
                        console.warn(
                            `⚠️  Could not copy binary file ${file}: ${
                                (error as Error).message
                            }`,
                        )
                    }
                }
            }

            // Create empty directories
            const dirs = ['public', 'public/css']
            for (const dir of dirs) {
                await Deno.mkdir(`${projectName}/${dir}`, { recursive: true })
            }

            // Copy .env.exemple to .env
            try {
                const envContent = await Deno.readTextFile(
                    `${projectName}/.env.exemple`,
                )
                await Deno.writeTextFile(`${projectName}/.env`, envContent)
            } catch {
                // Ignore if .env.exemple doesn't exist
            }

            // Create .env.production.local
            try {
                await Deno.writeTextFile(
                    `${projectName}/.env.production.local`,
                    'APP_ENV=production\n',
                )
            } catch {
                console.error('⚠️  Could not create .env.production.local')
            }

            console.log('\n✅ Done! To get started:')
            console.log(`  cd ${projectName}`)
            console.log('  deno task dev')
        } catch (error) {
            console.error(
                `❌ Initialization failed: ${(error as Error).message}`,
            )
            Deno.exit(1)
        }
    }, 'Initialize a new Lockness project')
}

// Update main entry point
if (import.meta.main) {
    const { projectName, use } = parseInitArgs(Deno.args)

    const cliMock = {
        register: (
            _name: string,
            handler: (args: string[]) => Promise<void>,
        ) => {
            const args = [projectName]
            if (use) {
                args.push('--use', use)
            }
            return handler(args)
        },
    }

    registerInitCommand(cliMock as unknown as Cli)
}
```

### Phase 3: Enhanced Error Handling and UX

**Step 3.1: Add Helpful Error Messages**

```typescript
/**
 * Display helpful version error message
 */
function displayVersionHelp() {
    console.log(`
📦 Lockness Init - Project Scaffolding

Usage:
  deno run -A jsr:@lockness/init <project-name> [options]

Options:
  --use, -u <version>       Specify framework version (default: latest)
  --template, -t <name>     Use starter template (future)
  --help, -h                Show this help message
  --version, -v             Show init package version

Version Formats:
  0.1.15         Exact version (will use ^0.1.15)
  ^0.1.0         Caret range (patch + minor updates)
  ~0.1.20        Tilde range (patch updates only)
  latest         Latest stable version

Examples:
  # Latest version (default)
  deno run -A jsr:@lockness/init my-app

  # Specific version
  deno run -A jsr:@lockness/init my-app --use 0.1.15

  # Version range
  deno run -A jsr:@lockness/init my-app -u "^0.1.0"

  # Pin init package version + framework version
  deno run -A jsr:@lockness/init@0.1.10 my-app --use 0.1.8
`)
}
```

**Step 3.2: Add --help and --version Flags**

```typescript
function parseInitArgs(args: string[]): {
    projectName: string
    use?: string
    template?: string
} {
    const parsed = parseArgs(args, {
        boolean: ['help', 'version'],
        string: ['use', 'template'],
        alias: {
            'h': 'help',
            'v': 'version',
            'u': 'use',
            't': 'template',
        },
    })

    // Handle --help flag
    if (parsed.help) {
        displayVersionHelp()
        Deno.exit(0)
    }

    // Handle --version flag (show init package version, NOT scaffold)
    if (parsed.version) {
        // Read version from deno.json
        const denoJson = JSON.parse(
            Deno.readTextFileSync(new URL('../deno.json', import.meta.url)),
        )
        console.log(`@lockness/init v${denoJson.version}`)
        Deno.exit(0)
    }

    return {
        projectName: String(parsed._[0] || 'lockness-app'),
        use: parsed['use'] as string | undefined,
        template: parsed['template'] as string | undefined,
    }
}
```

### Phase 4: Testing and Documentation

**Step 4.1: Integration Test**

File: `/packages/init/tests/init.test.ts`

```typescript
Deno.test('init - generates project with custom version', async () => {
    const tempDir = await Deno.makeTempDir()
    const projectName = 'test-app'
    const version = '0.1.15'

    try {
        // Run init command
        await registerInitCommand({
            register: (
                _name: string,
                handler: (args: string[]) => Promise<void>,
            ) => handler([projectName, '--use', version]),
        } as unknown as Cli)

        // Verify deno.json contains correct version
        const denoJson = JSON.parse(
            await Deno.readTextFile(`${tempDir}/${projectName}/deno.json`),
        )

        assertEquals(
            denoJson.imports['@lockness/core'],
            `jsr:@lockness/core@^${version}`,
        )
    } finally {
        await Deno.remove(tempDir, { recursive: true })
    }
})
```

**Step 4.2: Update README.md**

File: `/packages/init/README.md`

````markdown
## Version Control

### Using Latest Version (Default)

```bash
# Always scaffolds project with latest Lockness version
deno run -A jsr:@lockness/init my-app
```
````

### Specifying Framework Version

Control which version of Lockness your project will use:

```bash
# Use specific version
deno run -A jsr:@lockness/init my-app --use 0.1.15

# Use short flag
deno run -A jsr:@lockness/init my-app -u 0.1.15

# Use version range (caret)
deno run -A jsr:@lockness/init my-app --use "^0.1.0"

# Use version range (tilde)
deno run -A jsr:@lockness/init my-app --use "~0.1.20"
```

### Pinning Init Package Version

Use JSR's native version syntax to pin the init package itself:

```bash
# Use specific init package version
deno run -A jsr:@lockness/init@0.1.10 my-app

# Combine: specific init + specific framework
deno run -A jsr:@lockness/init@0.1.10 my-app --use 0.1.8
```

### Version Format Reference

| Format   | Description   | Example   | Result in deno.json |
| -------- | ------------- | --------- | ------------------- |
| `X.Y.Z`  | Exact version | `0.1.15`  | `^0.1.15`           |
| `^X.Y.Z` | Caret range   | `^0.1.0`  | `^0.1.0`            |
| `~X.Y.Z` | Tilde range   | `~0.1.20` | `~0.1.20`           |
| `latest` | Latest stable | `latest`  | `^0.1.22`           |

**Caret (`^`)**: Allows patch and minor updates (recommended)

- `^0.1.15` matches `0.1.15`, `0.1.16`, `0.1.999`
- Won't match `0.2.0` or `1.0.0`

**Tilde (`~`)**: Allows patch updates only

- `~0.1.15` matches `0.1.15`, `0.1.16`
- Won't match `0.2.0`

### Why Version Control?

**Use Cases:**

- **Stability**: Pin to tested versions for production
- **Compatibility**: Match existing codebases
- **Testing**: Verify compatibility with specific versions
- **Migration**: Gradually upgrade across projects

### Getting Help

```bash
# Display version help
deno run -A jsr:@lockness/init --help

# Show init package version
deno run -A jsr:@lockness/init --version
```

````
## 🔄 Migration Guide

### For Existing Users (No Changes Required)

Current behavior is unchanged - all existing commands work identically:

```bash
# Before: Works the same
deno run -A jsr:@lockness/init my-app

# After: Still works the same (uses latest version)
deno run -A jsr:@lockness/init my-app
````

### For Users Wanting Version Control

New capability - specify versions:

```bash
# New: Control framework version
deno run -A jsr:@lockness/init my-app --use 0.1.15
```

### Breaking Changes

- ⚠️ **None** - This is a purely additive feature

### Deprecation Strategy

Not applicable - no APIs are being deprecated.

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Update `/packages/init/README.md` with version control section
- [ ] Add version examples to all usage sections
- [ ] Document version format reference table
- [ ] Add JSDoc comments to new functions

### User Documentation (Web Docs)

- [ ] Update `/app/view/pages/docs/content/getting-started.md`
- [ ] Add "Version Control" section to installation guide
- [ ] Include troubleshooting for version errors
- [ ] Add examples of version pinning strategies

### LLM Documentation

- [ ] Update `/public/llms/init.txt` with version examples
- [ ] Add version control patterns to `/public/llms/full.txt`
- [ ] Include common version troubleshooting

### Stub Templates

- [ ] Update `/packages/init/stubs/init/deno.json.stub` with
      `{{locknessVersion}}`
- [ ] Verify template variable substitution works correctly
- [ ] Test with various version formats

### README Files

- [ ] Update root `/README.md` quick start with version example
- [ ] Add version control section to Getting Started

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test `parseInitArgs()` with all flag combinations
- [ ] Test `validateVersion()` with valid/invalid versions
- [ ] Test `resolveVersion()` with all version formats
- [ ] Test error handling for invalid versions
- [ ] Mock all file system operations

### Integration Tests

- [ ] Test full init flow with version flag
- [ ] Verify generated deno.json contains correct versions
- [ ] Test with exact versions, caret ranges, tilde ranges
- [ ] Test with invalid versions (should fail gracefully)
- [ ] Test with no version (should use latest)

### Manual Testing

- [ ] Test local: `deno task cli init test-app --use 0.1.15`
- [ ] Test remote: `deno run -A jsr:@lockness/init test-app -u 0.1.15`
- [ ] Test JSR pinning: `deno run -A jsr:@lockness/init@0.1.10 test-app`
- [ ] Test --help flag displays correctly
- [ ] Test --version flag shows init version (DOES NOT scaffold)
- [ ] Test --version does NOT create any directories
- [ ] Verify generated project runs: `cd test-app && deno task dev`
- [ ] Check deno.json has correct version strings

## 🔍 Quality Checks

> ⚠️ **Critical**: Run quality checks on **modified files only** before marking
> the task as complete.

### Type Checking

```bash
# Check init package
deno check packages/init/mod.ts
```

**What it checks:**

- Version parsing types are correct
- Template variables are properly typed
- No any types unless necessary

### Linting

```bash
# Lint init package
deno lint packages/init/
```

**What it checks:**

- Consistent code style
- No unused variables
- Proper error handling

### Test Suite

```bash
# Run init tests
deno test packages/init/tests/

# Run with coverage
deno test --coverage=coverage/ packages/init/tests/
deno coverage coverage/
```

**What it checks:**

- All version parsing works
- Template substitution works
- Error handling is correct
- No regressions

### Combined Check (Recommended)

```bash
# Run all checks
deno check packages/init/mod.ts && \
deno lint packages/init/ && \
deno test packages/init/tests/

# If all pass, feature is complete! ✅
```

### Manual Smoke Test

```bash
# Test the actual user workflow
deno run -A jsr:@lockness/init test-app --use 0.1.15
cd test-app
deno task dev

# Should start successfully and show devtools dashboard
```

## ✅ Definition of Done

- [ ] All implementation steps completed
- [ ] Version parsing works for all formats (X.Y.Z, ^X.Y.Z, ~X.Y.Z, latest)
- [ ] Version validation provides helpful error messages
- [ ] Template variable substitution works in deno.json.stub
- [ ] All tests passing (unit + integration)
- [ ] Manual testing completed (local + JSR remote)
- [ ] --help flag displays usage information
- [ ] --version flag shows init package version
- [ ] Documentation updated (README, web docs, LLM docs)
- [ ] Stub templates updated with `{{locknessVersion}}`
- [ ] No breaking changes for existing users
- [ ] ✅ **Quality checks passed**:
  - [ ] `deno check packages/init/mod.ts` passes
  - [ ] `deno lint packages/init/` passes
  - [ ] `deno test packages/init/tests/` passes (100% success)
- [ ] Examples tested and working
- [ ] Backward compatibility verified
- [ ] Version bumped to 0.1.23
- [ ] Commit messages document the feature
- [ ] PR description includes usage examples

## 🔗 Related Tasks

- [init package structure](../packages/init/README.md)
- [CLI stub system](.tasks/framework-core.md)

## 📅 Timeline

- **Start Date**: 2026-01-16
- **Estimated Completion**: 2026-01-17 (3-4 hours)
- **Actual Completion**: [To be filled]

## 📝 Notes

### Design Decisions

**Why template variables instead of post-processing?**

- Cleaner separation of concerns
- Easier to test
- More maintainable
- Aligns with existing stub system

**Why default to caret (^) ranges?**

- Allows patch + minor updates (safest)
- Matches npm/JSR best practices
- Prevents breaking changes (major versions)

**Why not fetch versions from JSR registry?**

- Adds network dependency and latency
- Offline functionality important
- Version validation is sufficient
- Can add in future if needed

### Future Enhancements

**Starter Templates** (v0.2.0):

```bash
deno run -A jsr:@lockness/init my-app --template api
deno run -A jsr:@lockness/init my-app -t fullstack
```

**Interactive Mode** (v0.3.0):

```bash
deno run -A jsr:@lockness/init
# Prompts:
# ? Project name: my-app
# ? Lockness version: (latest) 
# ? Template: (none)
```

**Version Discovery** (v0.4.0):

```bash
# List available versions
deno run -A jsr:@lockness/init --list-versions

# Show version info
deno run -A jsr:@lockness/init --info 0.1.15
```

### Security Considerations

- Version strings are validated before use
- No arbitrary code execution from version input
- Template variables are escaped in stub system
- File paths are validated and sanitized

### Performance Considerations

- Version validation is synchronous (< 1ms)
- No network calls during init (fast offline usage)
- Template substitution adds negligible overhead

---

## 🎓 Implementation Checklist

### Phase 1: Argument Parsing (1 hour)

- [ ] Add `parseInitArgs()` function
- [ ] Add `validateVersion()` function
- [ ] Add `resolveVersion()` function
- [ ] Write unit tests for parsing/validation
- [ ] Test with all version formats

### Phase 2: Template Injection (1 hour)

- [ ] Update `deno.json.stub` with `{{locknessVersion}}`
- [ ] Update `registerInitCommand()` to inject versions
- [ ] Test template substitution works
- [ ] Verify generated projects use correct versions

### Phase 3: UX Improvements (1 hour)

- [ ] Add `--help` flag with usage guide
- [ ] Add `--version` flag to show init version
- [ ] Improve error messages for invalid versions
- [ ] Add success messages showing version used

### Phase 4: Testing and Docs (1 hour)

- [ ] Write integration tests
- [ ] Update README.md with version examples
- [ ] Update web docs with version guide
- [ ] Manual testing with all version formats
- [ ] Smoke test generated projects

---

_Task created: 2026-01-16_ _Last updated: 2026-01-16_
