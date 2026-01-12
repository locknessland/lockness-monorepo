# Technical Task: Rename `lockness` Directory to `packages`

## 📋 Task Overview

Refactor the monorepo structure by renaming the root-level `lockness/` directory
to `packages/` to better reflect its purpose as a collection of modular packages
within the Lockness framework.

## 🎯 Objectives

1. Rename the physical directory from `lockness/` to `packages/`
2. Update all import paths throughout the codebase
3. Update workspace configuration references
4. Update documentation and README files
5. Ensure all tests pass after the migration
6. Maintain backward compatibility where necessary

## 📁 Affected File Paths

### Primary Directory

- **Current**: `/lockness/`
- **New**: `/packages/`

### Configuration Files

- `/deno.jsonc` - Workspace configuration and import maps
- `/cli.ts` - CLI entry point with package loading
- `/main.ts` - Application entry point (if applicable)
- `/scripts/dev.sh` - Development script
- `/scripts/generate_routes.ts` - Route generation script
- `/scripts/watch_routes.ts` - Route watching script
- `/scripts/bump.ts` - Version bump script
- `/.gitignore` - Git ignore patterns
- `/Dockerfile` - Docker configuration
- `/drizzle.config.ts` - Drizzle ORM configuration

### Documentation Files

- `/README.md` - Main project README
- `/GEMINI.md` - Technical documentation
- `/STUBS.md` - Stubs documentation
- `/lockness/*/README.md` - Individual package READMEs (will become
  `/packages/*/README.md`)

### Test Files

- All test files in `/lockness/*/tests/` directories
- Test configuration and helper files

### Package-Specific Files

All files within the following package directories that reference `lockness/`:

- `/lockness/core/`
- `/lockness/hono/`
- `/lockness/auth/`
- `/lockness/cache/`
- `/lockness/container/`
- `/lockness/events/`
- `/lockness/logger/`
- `/lockness/mail/`
- `/lockness/openapi/`
- `/lockness/queue/`
- `/lockness/session/`
- `/lockness/socialite/`
- `/lockness/storage/`
- `/lockness/validator/`
- `/lockness/cli/`
- `/lockness/drizzle/`
- `/lockness/init/`
- `/lockness/deprecation-contracts/`
- `/lockness/devtools/`

## 🏗️ Architecture Principles

### SOLID Principles

1. **Single Responsibility Principle (SRP)**: Each component handles one
   specific concern
   - Configuration updates are isolated from code refactoring
   - Test updates are separate from production code changes
   - Documentation updates are handled independently

2. **Open/Closed Principle (OCP)**: The refactoring should be open for extension
   but closed for modification
   - Use find-and-replace patterns that can be extended to future refactorings
   - Maintain API compatibility where possible

3. **Liskov Substitution Principle (LSP)**: Package exports must remain
   substitutable
   - Public APIs from `@lockness/*` packages must remain unchanged
   - JSR package names remain stable

4. **Interface Segregation Principle (ISP)**: Update only necessary interfaces
   - Only modify import paths that directly reference `lockness/`
   - Avoid changes to external-facing APIs

5. **Dependency Inversion Principle (DIP)**: Depend on abstractions, not
   concretions
   - Use workspace aliases to decouple physical paths from logical imports
   - Leverage `deno.json` import maps for flexibility

### DRY Principle (Don't Repeat Yourself)

- Create reusable scripts for bulk path replacements
- Use regex patterns to avoid manual file-by-file changes
- Document the migration process for future directory restructures

### Layered Architecture

This refactoring maintains the existing layered architecture:

```
Controller Layer (app/controller/)
    ↓ (depends on)
Service Layer (app/service/)
    ↓ (depends on)
Repository Layer (app/repository/)
    ↓ (depends on)
Model Layer (app/model/)
    ↓ (depends on)
Package Layer (packages/*/) ← THIS IS BEING RENAMED
```

**Key Constraints:**

- Controllers remain thin, only handling HTTP concerns
- Services contain business logic and orchestrate repositories
- Repositories handle data persistence (no business logic)
- Direct database queries in Controllers are **strictly prohibited**
- All database operations must go through Repository layer

## 📝 Step-by-Step Implementation

### Phase 1: Pre-Migration Validation

**Step 1.1: Run Full Test Suite**

```bash
deno task test
```

- **Expected Result**: All tests pass (baseline)
- **Reason**: Establish a known-good state before changes
- **Success Criteria**: Exit code 0, no test failures

**Step 1.2: Create Git Branch**

```bash
git checkout -b refactor/rename-lockness-to-packages
```

- **Expected Result**: New branch created
- **Reason**: Isolate refactoring changes from main branch

**Step 1.3: Backup Current State**

```bash
git add -A
git commit -m "chore: pre-refactor snapshot"
```

- **Expected Result**: Clean working directory
- **Reason**: Create restore point if needed

### Phase 2: Directory Rename

**Step 2.1: Rename Physical Directory**

```bash
mv lockness packages
```

- **Expected Result**: Directory renamed at filesystem level
- **Verification**: `ls -la | grep packages` shows the directory
- **Note**: This single command renames all subdirectories automatically

### Phase 3: Update Configuration Files

**Step 3.1: Update `/deno.jsonc` Workspace Paths**

Modify the `workspace` array:

```jsonc
{
    "workspace": [
        "./packages/core", // was ./lockness/core
        "./packages/hono", // was ./lockness/hono
        "./packages/auth", // was ./lockness/auth
        "./packages/cache", // was ./lockness/cache
        "./packages/container", // was ./lockness/container
        "./packages/events", // was ./lockness/events
        "./packages/logger", // was ./lockness/logger
        "./packages/mail", // was ./lockness/mail
        "./packages/openapi", // was ./lockness/openapi
        "./packages/queue", // was ./lockness/queue
        "./packages/session", // was ./lockness/session
        "./packages/socialite", // was ./lockness/socialite
        "./packages/storage", // was ./lockness/storage
        "./packages/validator", // was ./lockness/validator
        "./packages/cli", // was ./lockness/cli
        "./packages/drizzle", // was ./lockness/drizzle
        "./packages/init", // was ./lockness/init
        "./packages/deprecation-contracts", // was ./lockness/deprecation-contracts
        "./packages/devtools" // was ./lockness/devtools
    ]
}
```

**Step 3.2: Update Test Task in `/deno.jsonc`**

Find and replace:

```jsonc
{
    "tasks": {
        "test": "deno test -A packages/", // was lockness/
        "test:watch": "deno test -A --watch packages/", // was lockness/
        "test:coverage": "rm -rf coverage && deno test -A --coverage=coverage packages/ && deno coverage coverage --lcov > coverage/lcov.info && rm -f coverage/*.json"
    }
}
```

**Step 3.3: Update Init Task in `/deno.jsonc`**

Find and replace:

```jsonc
{
    "tasks": {
        "init": "deno run -Ar packages/init/mod.ts _lockness_app" // was lockness/init/mod.ts
    }
}
```

### Phase 4: Update Application Code

**Step 4.1: Update CLI Entry Point (`/cli.ts`)**

Search for all occurrences of `'./lockness'` or `'lockness/'` and replace with
`'./packages'` or `'packages/'`:

```typescript
// Before
await cli.discoverCommands('./lockness/cli/commands')

// After
await cli.discoverCommands('./packages/cli/commands')
```

**Step 4.2: Update Scripts Directory**

For each file in `/scripts/`:

- `/scripts/generate_routes.ts`
- `/scripts/watch_routes.ts`
- `/scripts/bump.ts`

Replace all string references:

```typescript
// Example pattern to find
const paths = ['lockness/core', 'lockness/hono']

// Replace with
const paths = ['packages/core', 'packages/hono']
```

**Step 4.3: Update Import Statements**

Search across all TypeScript files for relative imports:

```bash
# Find all files with lockness imports
grep -r "from.*lockness" --include="*.ts" --include="*.tsx"
```

Replace patterns:

```typescript
// Before
import { something } from '../lockness/core/mod.ts'
import { something } from '../../lockness/auth/mod.ts'

// After
import { something } from '../packages/core/mod.ts'
import { something } from '../../packages/auth/mod.ts'
```

**Note**: JSR imports like `jsr:@lockness/core` remain unchanged - only local
file paths change.

### Phase 5: Update Documentation

**Step 5.1: Update `/README.md`**

Find all mentions of `lockness/` directory and replace with `packages/`:

```markdown
<!-- Before -->

See the [Contribution Guide](lockness/core/README.md) All core libraries are
located in the `lockness/` directory.

<!-- After -->

See the [Contribution Guide](packages/core/README.md) All core libraries are
located in the `packages/` directory.
```

**Step 5.2: Update `/GEMINI.md`**

Same pattern - replace directory references:

```markdown
<!-- Before -->

- Located in: `lockness/core/`
- Package structure: `lockness/[package-name]/`

<!-- After -->

- Located in: `packages/core/`
- Package structure: `packages/[package-name]/`
```

**Step 5.3: Update `/STUBS.md`**

Replace all path references.

**Step 5.4: Update Individual Package READMEs**

For each `/packages/*/README.md`, update any cross-references to other packages:

```markdown
<!-- Before -->

See also: [lockness/auth](../auth/README.md)

<!-- After -->

See also: [packages/auth](../auth/README.md)
```

### Phase 6: Update Git and Docker Configuration

**Step 6.1: Update `.gitignore`**

If there are explicit references to `lockness/`:

```gitignore
# Before
lockness/*/node_modules

# After
packages/*/node_modules
```

**Step 6.2: Update `Dockerfile`**

Search for `COPY lockness/` or `WORKDIR lockness/` patterns:

```dockerfile
# Before
COPY lockness/ /app/lockness/

# After
COPY packages/ /app/packages/
```

### Phase 7: Testing & Validation

**Step 7.1: Type Check**

```bash
deno check main.ts
deno check cli.ts
```

- **Expected Result**: No type errors
- **Success Criteria**: All files type-check successfully

**Step 7.2: Run Full Test Suite**

```bash
deno task test
```

- **Expected Result**: All tests pass
- **Success Criteria**: Same number of passing tests as baseline
- **Critical**: Zero database interactions in unit tests (all mocked)

**Step 7.3: Test Init Command**

```bash
deno task init
cd _lockness_app
deno task dev
```

- **Expected Result**: New project scaffolds correctly
- **Success Criteria**: No errors, server starts successfully

**Step 7.4: Test CLI Commands**

```bash
deno task cli --help
deno task cli make:controller Test
deno task cli router:list
```

- **Expected Result**: All commands execute without errors
- **Success Criteria**: Commands reference correct package paths

**Step 7.5: Test Package Loading**

```bash
# Verify package discovery works
deno task cli package:add cache
```

- **Expected Result**: Packages load from new `packages/` directory
- **Success Criteria**: No "module not found" errors

### Phase 8: Final Verification

**Step 8.1: Coverage Report**

```bash
deno task test:coverage
```

- **Expected Result**: Coverage report generates successfully
- **Success Criteria**: Coverage percentage unchanged or improved

**Step 8.2: Build Production Artifacts**

```bash
deno task build
deno task compile
```

- **Expected Result**: CSS compiles, binary builds successfully
- **Success Criteria**: No compilation errors

**Step 8.3: Manual Smoke Test**

```bash
deno task dev
# Visit http://localhost:8888
# Test basic routes, authentication, database queries
```

- **Expected Result**: Application runs normally
- **Success Criteria**: No console errors, all features functional

## 🧪 Testing Strategy

### Unit Tests (Primary Focus)

**Critical Requirements:**

1. **No Live Database Access**: All database operations MUST be mocked
2. **Fast Execution**: Tests should run in milliseconds, not seconds
3. **Deterministic**: Same input always produces same output
4. **Isolated**: Each test is independent, no shared state

**Testing Approach for This Refactoring:**

Since this is a path refactoring task, unit tests validate:

**Test 1: Workspace Configuration Parsing**

```typescript
// File: tests/workspace_config.test.ts
import { assertEquals } from '@std/assert'

Deno.test('workspace paths use packages/ directory', async () => {
    const config = JSON.parse(await Deno.readTextFile('./deno.jsonc'))

    for (const workspace of config.workspace) {
        assertEquals(
            workspace.startsWith('./packages/'),
            true,
            `Workspace path should start with ./packages/, got: ${workspace}`,
        )
    }
})
```

**Test 2: Import Path Validation**

```typescript
// File: tests/import_paths.test.ts
import { assertEquals } from '@std/assert'
import { walk } from '@std/fs'

Deno.test('no TypeScript files reference old lockness/ directory', async () => {
    const oldPathPattern = /from\s+['"]\.\.?\/lockness\//
    let filesWithOldPaths = []

    for await (const entry of walk('./packages', { exts: ['ts', 'tsx'] })) {
        if (entry.isFile) {
            const content = await Deno.readTextFile(entry.path)
            if (oldPathPattern.test(content)) {
                filesWithOldPaths.push(entry.path)
            }
        }
    }

    assertEquals(
        filesWithOldPaths.length,
        0,
        `Found files with old lockness/ imports: ${
            filesWithOldPaths.join(', ')
        }`,
    )
})
```

**Test 3: Package Discovery**

```typescript
// File: tests/package_discovery.test.ts
import { assertEquals } from '@std/assert'

Deno.test('CLI discovers packages from packages/ directory', async () => {
    // Mock file system operations
    const mockPackageLoader = {
        async discoverPackages() {
            // This should use packages/ not lockness/
            return ['packages/core', 'packages/auth', 'packages/cli']
        },
    }

    const packages = await mockPackageLoader.discoverPackages()

    for (const pkg of packages) {
        assertEquals(
            pkg.startsWith('packages/'),
            true,
            `Package path should use packages/, got: ${pkg}`,
        )
    }
})
```

**Test 4: Documentation Consistency**

```typescript
// File: tests/documentation.test.ts
import { assertEquals } from '@std/assert'

Deno.test('README references packages/ not lockness/', async () => {
    const readme = await Deno.readTextFile('./README.md')
    const oldDirPattern = /`lockness\/\w+`/g

    const matches = readme.match(oldDirPattern) || []

    assertEquals(
        matches.length,
        0,
        `README still references old lockness/ directory: ${
            matches.join(', ')
        }`,
    )
})
```

### Mock Strategy

For any code that interacts with the file system during package discovery:

```typescript
// Mock file system operations
interface FileSystemMock {
    readDir(path: string): Promise<string[]>
    exists(path: string): Promise<boolean>
    readFile(path: string): Promise<string>
}

const mockFS: FileSystemMock = {
    async readDir(path: string) {
        if (path === './packages') {
            return ['core', 'auth', 'cli', 'drizzle', 'init']
        }
        return []
    },
    async exists(path: string) {
        return path.startsWith('./packages/')
    },
    async readFile(path: string) {
        return '{ "name": "test" }'
    },
}
```

### Functional Tests (Minimal)

Only run functional tests **after** all unit tests pass:

**Functional Test 1: Init Command Integration**

```bash
# This tests the actual init command with real file system
deno task init
test -d _lockness_app && echo "PASS" || echo "FAIL"
```

**Functional Test 2: CLI Package Loading**

```bash
# Tests that CLI actually loads packages from new directory
deno task cli --help | grep "make:controller" && echo "PASS" || echo "FAIL"
```

### Test Execution Order

1. **Phase 1**: Run unit tests (fast, mocked) ✓
2. **Phase 2**: Run type checks ✓
3. **Phase 3**: Run functional tests (slow, real I/O) ✓
4. **Phase 4**: Run full application smoke test ✓

## ✅ Success Criteria

### Must Have

- [ ] Physical directory renamed from `lockness/` to `packages/`
- [ ] All workspace paths in `deno.jsonc` updated
- [ ] All import statements use new paths
- [ ] All tests pass (same count as baseline)
- [ ] `deno task test` executes without errors
- [ ] `deno task init` creates new projects successfully
- [ ] `deno task dev` starts server without errors
- [ ] No TypeScript compilation errors
- [ ] All documentation updated

### Should Have

- [ ] Git history preserved (use `git mv` if redoing)
- [ ] All package READMEs updated
- [ ] Docker configuration updated
- [ ] Coverage report unchanged or improved
- [ ] No console warnings during execution

### Nice to Have

- [ ] Migration script created for future use
- [ ] Architecture diagram updated
- [ ] CHANGELOG entry added

## 🚫 Anti-Patterns to Avoid

1. **DON'T** update JSR package names (e.g., `jsr:@lockness/core` stays the
   same)
2. **DON'T** change public API exports
3. **DON'T** modify version numbers during this refactor
4. **DON'T** combine this refactor with feature changes
5. **DON'T** skip test validation between changes
6. **DON'T** use real database in unit tests - always mock
7. **DON'T** put business logic in Controllers
8. **DON'T** access database directly from Controllers

## 🔄 Rollback Plan

If issues arise:

```bash
# Revert to previous commit
git reset --hard HEAD~1

# Or restore from backup branch
git checkout main
git branch -D refactor/rename-lockness-to-packages
```

## 📦 Deliverables

1. Renamed directory structure (`packages/` instead of `lockness/`)
2. Updated `deno.jsonc` configuration
3. Updated import paths across all TypeScript files
4. Updated documentation (README, GEMINI.md, STUBS.md)
5. Passing test suite (all existing tests pass)
6. New validation tests for import paths
7. Git commit with clear message:
   `refactor: rename lockness directory to packages`

## 🔗 Related Documentation

- [Deno Workspaces Documentation](https://deno.com/manual/basics/workspaces)
- [Monorepo Best Practices](https://monorepo.tools/)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Lockness Architecture Guide](./GEMINI.md)

## ⏱️ Estimated Time

- **Phase 1-2**: 15 minutes (validation + rename)
- **Phase 3**: 30 minutes (configuration updates)
- **Phase 4**: 45 minutes (code updates)
- **Phase 5**: 30 minutes (documentation)
- **Phase 6-8**: 45 minutes (testing + validation)

**Total**: ~3 hours

## 👥 Stakeholders

- **Developer Team**: Must update local environments
- **CI/CD Pipeline**: May need configuration updates
- **Documentation Team**: Must review all doc changes
- **QA Team**: Must run full regression tests

---

**Note**: This is a pure refactoring task with zero functional changes. The
application behavior must remain identical before and after the migration.
