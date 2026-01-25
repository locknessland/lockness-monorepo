# Technical Task: Binary Compilation Orchestration

## 📋 Task Overview

Lockness provides a streamlined way to compile applications into standalone
binaries. However, current compilation requires manual asset copying and
registry generation through custom scripts (`prepare_dist.ts`).

This task aims to centralize binary compilation configuration within the
`@Kernel` decorator and provide a standard `deno task cli compile` command that
orchestrates the entire process: running pre-compile scripts (registries),
copying assets, and executing `deno compile`.

## 🎯 Objectives

1. **[DONE] Declarative Configuration**: Add a `compile` section to the
   `@Kernel` configuration.
2. **[DONE] Unified Command**: Implement `deno task cli compile` in
   `@lockness/cli`.
3. **[DONE] Asset Management**: Automatic copying of declared assets
   (folders/files) to the distribution directory.
4. **[DONE] Script Orchestration**: Automatic execution of pre-compile scripts
   (e.g., route generation).
5. **[DONE] Standardized Output**: Consistent distribution structure across all
   Lockness projects.

## 📁 Affected File Paths

### Framework Files Extended

- `packages/core/types.ts` - Added `CompileConfig` interface.
- `packages/core/kernel/kernel_decorators.ts` - Updated `@Kernel` to support the
  new `compile` config.
- `packages/cli/core_commands.ts` - Registered the new `compile` command.
- `packages/cli/commands/compile_command.ts` - (New) Orchestration engine for
  binary compilation.

### Project Files Updated (Site Specific)

- `app/kernel.tsx` - Added declarative `compile` configuration.
- `deno.jsonc` - Simplified `compile` task to use `deno task cli compile`.
- `scripts/prepare_docs.ts` - (New) Project-specific script to sync package
  docs.
- `scripts/generate_ui_registry.ts` - (Legacy) Refactored to delegate to package
  logic.

## 🏗️ Architecture Principles (Refined)

### 1. SOLID Principles: Separation of Concerns (Framework vs App)

The final implementation explicitly separates **Framework Invariants** from
**Application Logic**:

- **Framework (CLI)**: Automatically handles `routes.ts` generation (required
  for all Lockness apps).
- **Application (Site)**: Handles documentation syncing and UI registries via
  user-defined `scripts` in the Kernel.

### 2. Single Source of Truth

The `@Kernel` configuration is the only place where the build process is
defined, making `deno.jsonc` clean and the build portable.

## 🎨 Final API Design

### Kernel Configuration

```typescript
// app/kernel.tsx
@Kernel({
    // ... metadata
    compile: {
        output: '_dist/lockness',
        main: 'main.ts',
        flags: ['-A', '--env-file=.env.production.local'],
        assets: [
            'public',
            'docs',
            'deno.jsonc',
            {
                source: 'packages/ui/components',
                target: 'packages/ui/components',
            },
        ],
        scripts: [
            'scripts/generate_ui_registry.ts', // Project-specific task
            'deno task css:build', // Project-specific task
            'scripts/prepare_docs.ts', // Project-specific task
        ],
    },
})
export class AppKernel {}
```

## ✅ Definition of Done

- [x] `deno task cli compile` successfully orchestrates the entire build.
- [x] Assets are correctly copied to the output directory.
- [x] Pre-compile scripts (both framework and user) are executed before
      compilation.
- [x] Documentation reflects the new configuration pattern.
- [x] `prepare_dist.ts` is removed and replaced by orchestrated logic.
- [x] Separation of responsibilities correctly implemented (CLI is
      project-agnostic).
- [x] The Terminology used is "compile" and not "bundle".
