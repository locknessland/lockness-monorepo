# Technical Task: Simplify Mount Point API

## 📋 Task Overview

The current mount points API accepts an array of `MountPoint[]`, but in practice
only one mount point is ever needed. The main use case is i18n
(`/:langId/:countryId`). Other patterns like API versioning (`/api/:version`)
are better handled at the controller level with `@Controller('/api/:version')`.

This task simplifies the API from an array to a single optional object, reducing
complexity and making the intent clearer.

## 🎯 Objectives

1. **Simplify API**: Change `mountPoints: MountPoint[]` to
   `mountPoint?: MountPoint`
2. **Remove Array Syntax**: No backward compatibility needed (framework in dev)
3. **Update Documentation**: Reflect the simplified API in all docs
4. **Update Live Demo**: Update demo controller and view to reflect new API
5. **Clean Implementation**: Follow SOLID principles

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/core/types.ts` - Change `mountPoints` to `mountPoint`
- `/packages/core/routing/mount_manager.ts` - Handle single mount point
- `/packages/core/kernel/kernel_decorators.ts` - Update KernelConfig interface
- `/packages/core/kernel/loader.ts` - Update config passing

### Application Files to Update

- `/app/kernel.tsx` - Use new singular syntax

### Live Demo Files to Update

- `/app/controller/demo_controller.tsx` - Update JSDoc comments
- `/app/view/pages/demo/mount_points.tsx` - Update code examples in view

### Test Files

- `/packages/core/tests/mount_points.test.ts` - Update tests for new API

### Documentation Files to Update

- `/packages/core/docs/mount-points.md` - Update all examples to singular
- `/GEMINI.md` - Update architecture documentation

## 🏗️ Architecture Principles

### Single Responsibility Principle (SRP)

- **Current Problem**: MountManager handles array iteration for a single use
  case
- **Solution**: Simplify to handle one mount point directly

### Interface Segregation Principle (ISP)

- **Current Problem**: Array interface suggests multiple mount points are common
- **Solution**: Single object interface reflects actual usage

### DRY Principle

**Current Duplication:**

- Examples always show single-element arrays
- Documentation explains array but only one is used

**Solution:**

- Single mount point = simpler code everywhere

## 🎨 Proposed API Design

### Before (Current API)

```typescript
@Kernel({
    mountPoints: [
        {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    ],
})
export class AppKernel {}
```

### After (Simplified API)

```typescript
@Kernel({
    mountPoint: {
        pattern: '/:langId/:countryId',
        middleware: i18nMiddleware,
    },
})
export class AppKernel {}
```

## 📝 Detailed Implementation Steps

### Phase 1: Update Type Definitions

**Step 1.1: Update types.ts**

File: `/packages/core/types.ts`

````typescript
export interface AppConfig {
    // ... other fields

    /**
     * Configuration for mounting the app on a URL pattern prefix.
     *
     * When defined, the application will be accessible both at root AND under
     * the mount point's pattern. This is typically used for i18n to make routes
     * accessible with locale prefixes.
     *
     * Controllers registered with `@Get('/users')` will be available at:
     * - `/users` (root access)
     * - `/:langId/:countryId/users` (with locale context)
     *
     * For API versioning, prefer using `@Controller('/api/:version')` instead,
     * as it's more explicit and doesn't require global mount points.
     *
     * @example
     * ```typescript
     * await app.init({
     *     controllersDir: './app/controller',
     *     mountPoint: {
     *         pattern: '/:langId/:countryId',
     *         middleware: i18nMiddleware,
     *     },
     * })
     * ```
     */
    readonly mountPoint?: MountPoint
}
````

**Step 1.2: Update kernel_decorators.ts**

File: `/packages/core/kernel/kernel_decorators.ts`

````typescript
export interface KernelConfig {
    // ... other fields

    /**
     * Mount point for URL prefixing (i18n, multi-tenancy).
     *
     * When defined, the application is accessible under the mount point's pattern
     * in addition to the root path.
     *
     * @example i18n routing
     * ```typescript
     * @Kernel({
     *     mountPoint: {
     *         pattern: '/:langId/:countryId',
     *         middleware: i18nMiddleware,
     *     },
     * })
     * ```
     */
    mountPoint?: MountPoint
}
````

### Phase 2: Update MountManager

**Step 2.1: Update mount_manager.ts**

File: `/packages/core/routing/mount_manager.ts`

```typescript
import type { Hono } from 'hono'
import type { Env, Schema } from 'hono'
import type {
    AppConfig,
    Module,
    ModuleWithMiddleware,
    MountPoint,
} from '../types.ts'

/**
 * Manages the mounting of the application on a URL pattern prefix.
 * Implements the dual-layer routing strategy for i18n and similar use cases.
 */
export class MountManager {
    constructor(
        private readonly rootHono: Hono<Env, Schema, string>,
        private readonly internalHono: Hono<Env, Schema, string>,
    ) {}

    /**
     * Sets up mount point by connecting rootHono to internalHono.
     * If no mount point is defined, only mounts at root `/`.
     */
    setup(config: Module | ModuleWithMiddleware | AppConfig): void {
        const mountPoint = 'mountPoint' in config
            ? config.mountPoint
            : undefined

        // Always mount at root FIRST - this ensures routes like /demo/mount-points
        // are matched before the mount point pattern /:langId/:countryId
        this.rootHono.route('/', this.internalHono)

        if (mountPoint) {
            // Apply mount-specific middleware if provided
            if (mountPoint.middleware) {
                this.rootHono.use(
                    `${mountPoint.pattern}/*`,
                    mountPoint.middleware,
                )
            }

            // Route requests under this pattern to internal hono
            this.rootHono.route(mountPoint.pattern, this.internalHono)
        }
    }
}
```

### Phase 3: Update Kernel Loader

**Step 3.1: Update loader.ts**

File: `/packages/core/kernel/loader.ts`

Update the config passing to use the new singular property:

```typescript
// In the loadKernel function, when building AppConfig:
mountPoint: config.mountPoint,
```

### Phase 4: Update Application Kernel

**Step 4.1: Update app/kernel.tsx**

File: `/app/kernel.tsx`

```typescript
@Kernel({
    // ... other config

    // Mount point for i18n URL pattern
    // Routes are accessible at root AND under /:langId/:countryId/
    mountPoint: {
        pattern: '/:langId/:countryId',
        middleware: i18nMiddleware,
    },
    // ... rest of config
})
export class AppKernel {}
```

### Phase 5: Update Live Demo

**Step 5.1: Update demo view code example**

File: `/app/view/pages/demo/mount_points.tsx`

Update the `KERNEL_CODE` constant to use singular syntax:

```typescript
const KERNEL_CODE = `// app/kernel.tsx - Mount point with locale prefix at START
@Kernel({
    controllers: controllers,
    mountPoint: {
        pattern: '/:langId/:countryId',
        middleware: async (c: Context, next: Next) => {
            c.set('langId', c.req.param('langId'))
            c.set('countryId', c.req.param('countryId'))
            return await next()
        },
    },
})
export class AppKernel {}

// Routes accessible at:
// /demo/mount-points → without locale context
// /fr/ca/demo/mount-points → WITH locale context ✅`
```

**Step 5.2: Update demo controller JSDoc**

File: `/app/controller/demo_controller.tsx`

Update comments to reference singular `mountPoint` instead of `mountPoints`.

### Phase 6: Update Tests

**Step 6.1: Update mount_points.test.ts**

File: `/packages/core/tests/mount_points.test.ts`

```typescript
Deno.test('App - mounts at root when no mountPoint defined', async () => {
    // Test without mount point
})

Deno.test('App - mounts at pattern when mountPoint is defined', async () => {
    // Test with mount point
})

Deno.test('App - applies middleware for mount point pattern', async () => {
    // Test middleware execution
})
```

### Phase 7: Update Documentation

**Step 7.1: Update mount-points.md**

File: `/packages/core/docs/mount-points.md`

- Replace all `mountPoints: [...]` with `mountPoint: {...}`
- Remove "Multiple Mount Points" section
- Update API versioning section to recommend `@Controller('/api/:version')`
  instead

**Step 7.2: Update GEMINI.md**

File: `/GEMINI.md`

Update the Multi-Mount Routing Strategy section to use singular syntax.

## 🔍 Quality Checks

```bash
# Type check modified files
deno check packages/core/types.ts packages/core/routing/mount_manager.ts \
  packages/core/kernel/kernel_decorators.ts packages/core/kernel/loader.ts \
  app/kernel.tsx app/controller/demo_controller.tsx \
  app/view/pages/demo/mount_points.tsx

# Lint modified files
deno lint packages/core/types.ts packages/core/routing/mount_manager.ts \
  packages/core/kernel/kernel_decorators.ts packages/core/kernel/loader.ts \
  app/kernel.tsx app/controller/demo_controller.tsx \
  app/view/pages/demo/mount_points.tsx

# Run tests
deno test packages/core/tests/mount_points.test.ts
```

## ✅ Definition of Done

### Core Implementation

- [x] `mountPoint` singular property added to `AppConfig` in types.ts
- [x] `mountPoint` singular property added to `KernelConfig` in
      kernel_decorators.ts
- [x] `mountPoints` array removed from all interfaces
- [x] MountManager simplified to handle single mount point
- [x] Kernel loader updated to pass singular property

### Application Updates

- [x] app/kernel.tsx updated to singular syntax

### Live Demo Updates

- [x] demo_controller.tsx JSDoc comments updated
- [x] mount_points.tsx KERNEL_CODE example updated to singular

### Documentation Updates

- [x] /packages/core/docs/mount-points.md - All examples use singular
- [x] /GEMINI.md - Architecture section uses singular
- [x] Remove "Multiple Mount Points" section from docs

### Tests

- [x] mount_points.test.ts updated for new API
- [x] All tests pass

### Quality Checks

- [x] `deno check` passes on all modified files
- [x] `deno lint` passes on all modified files
- [x] `deno test` passes

## 📝 Notes

- No backward compatibility needed - framework is in active development
- The array syntax was over-engineered for a single use case
- API versioning is better handled at controller level:
  `@Controller('/api/:version')`
- i18n remains the primary (and essentially only) use case for mount points
- This simplification reduces cognitive load and makes the API more intuitive

---

_Task created: 2026-01-26_
