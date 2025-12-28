# @lockness/hono

> Hono bridge for Lockness framework - Centralized Hono dependency management

## Overview

`@lockness/hono` is a **proxy package** that manages the Hono dependency for the
entire Lockness ecosystem. Instead of each Lockness package importing Hono
directly from npm, they import through this bridge, ensuring version consistency
and simplifying dependency management.

## Why This Package Exists

### The Problem

Without a bridge, every Lockness package would need to:

- Import `npm:hono@^4.11.1` directly
- Manage their own Hono version
- Risk version conflicts across the ecosystem

### The Solution

`@lockness/hono` acts as a single source of truth:

- ✅ **One Hono version** for the entire framework
- ✅ **Centralized updates** - change one place, update everywhere
- ✅ **Clean imports** - `import { Hono } from 'hono'` instead of
  `import { Hono } from 'npm:hono@^4.11.1'`
- ✅ **JSR compatibility** - packages can be published to JSR while depending on
  npm packages

## Architecture

```
┌─────────────────────────────────────────┐
│  Lockness Packages                      │
│  (@lockness/core, @lockness/auth, etc)  │
└──────────────┬──────────────────────────┘
               │ import { Hono } from 'hono'
               │ (resolved via deno.json)
               ▼
┌─────────────────────────────────────────┐
│  @lockness/hono (This Package)          │
│  Re-exports from npm:hono@^4.11.1       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  npm:hono@^4.11.1 (npm package)         │
└─────────────────────────────────────────┘
```

## Usage

### In Lockness Packages

Add to your package's `deno.json`:

```json
{
    "imports": {
        "hono": "jsr:@lockness/hono@^0.1.0"
    }
}
```

Then import normally:

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { zValidator } from 'hono/zod-validator'
```

### Available Exports

All Hono modules are re-exported through dedicated entry points:

| Import Path          | Description                              |
| -------------------- | ---------------------------------------- |
| `hono`               | Main Hono export                         |
| `hono/jsx`           | JSX pragma and factory                   |
| `hono/jsx-runtime`   | JSX runtime for React-like JSX           |
| `hono/jsx-renderer`  | JSX renderer middleware                  |
| `hono/deno`          | Deno-specific utilities                  |
| `hono/html`          | HTML helper                              |
| `hono/types`         | TypeScript types                         |
| `hono/cookie`        | Cookie utilities                         |
| `hono/cors`          | CORS middleware                          |
| `hono/zod-validator` | Zod validation (via @hono/zod-validator) |

## How It Works

### 1. Package Configuration

Each re-export file is registered in `deno.json`:

```json
{
    "exports": {
        ".": "./mod.ts",
        "./jsx": "./jsx.ts",
        "./jsx-runtime": "./jsx-runtime.ts",
        "./zod-validator": "./zod-validator.ts"
        // ... etc
    }
}
```

### 2. Re-export Files

Each file simply re-exports from the npm package:

```typescript
// mod.ts
export * from 'hono'

// jsx-runtime.ts
export * from 'hono/jsx-runtime'

// zod-validator.ts
export * from '@hono/zod-validator'
```

### 3. Import Resolution

When a Lockness package imports `hono/zod-validator`:

1. Deno resolves `hono` → `jsr:@lockness/hono@^0.1.0`
2. Deno looks for export `./zod-validator` in package
3. Finds `zod-validator.ts` which exports from npm
4. Final resolution: `npm:@hono/zod-validator@^0.7.6`

## Updating Hono Version

To update Hono across the entire Lockness ecosystem:

1. Edit `deno.json` in this package:
   ```json
   {
       "imports": {
           "hono": "npm:hono@^4.12.0" // Updated version
           // ... update other hono imports
       }
   }
   ```

2. Bump package version:
   ```bash
   ./nessy bump 0.2.0
   ```

3. All Lockness packages automatically get the new Hono version

## Development

### Running Tests

```bash
deno task test
```

### Publishing

```bash
deno publish
```

## Design Principles

1. **Transparency**: This package should be invisible to end users
2. **Simplicity**: Just re-export, no modifications
3. **Consistency**: Single Hono version for all Lockness packages
4. **Standards**: Follow Hono's export structure exactly

## Maintained By

This package is maintained by the Lockness team as part of the official
framework distribution.

## License

MIT - See LICENSE file for details
