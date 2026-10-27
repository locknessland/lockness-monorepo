# @lockness/contract

Shared contracts, types, and decorators for the Lockness framework.

This package provides the foundational architecture for the Lockness ecosystem,
allowing sub-packages to define decorators and interact with the framework
without creating circular dependencies on the full `@lockness/contract`.

## Features

- **Routing Decorators**: `@Controller`, `@Get`, `@Post`, etc.
- **Middleware System**: `compose()` and `@UseMiddleware`
- **Core Types**: `Context`, `Next`, `ControllerClass`
- **Route Generation**: Utilities for production route registry generation

## Why this package?

In complex frameworks like Lockness, sub-packages (like `auth` or `openapi`)
often need access to core framework decorators and types. If they depend on
`@lockness/contract`, they create a circular dependency because `core` also
depends on them to provide features.

`@lockness/contract` breaks this cycle by providing the base definitions that
both `core` and sub-packages can depend on.

## Installation

```typescript
import { Context, Controller, Get } from '@lockness/contract'
```

## Upgrading to v0.5.0

One item. **Migration step:** rename `DENO_ENV` to `APP_ENV` wherever you set
it.

### 1. `APP_ENV` is the only environment signal; `DENO_ENV` is no longer read

Until v0.5.0 the environment helpers resolved `DENO_ENV` first, then `APP_ENV`,
while scaffolded apps read `APP_ENV` alone. The two could disagree, and where
they did a security control failed open (#504). `resolveEnvName()`,
`isProduction()`, `isDevelopment()` and `isExplicitlyDevelopment()` now read
`APP_ENV` only, trimmed and lower-cased. An unset or blank `APP_ENV` is
`development` for the conveniences, but never production and never explicit
development. `isProduction()` and `isExplicitlyDevelopment()` are never both
true.

- **Newly refused:** a process whose `DENO_ENV` disagrees with `APP_ENV`,
  including `DENO_ENV=production` with `APP_ENV` unset. `createApp()` refuses to
  boot, and the destructive `db:*` commands and factory writes refuse to run,
  with a message naming `APP_ENV` and the fix. `--allow-production` does not
  override it.
- **Warned:** a `DENO_ENV` equal to `APP_ENV` boots, with one warning saying it
  is ignored.
- **The fix:** set `APP_ENV` to the intended environment and remove `DENO_ENV`.
  The `Dockerfile` generated before v0.5.0 set `ENV DENO_ENV=production`; change
  it to `ENV APP_ENV=production`.
- The tripwire is removed in v0.7.0. After that, a `DENO_ENV` is ignored.

## License

MIT
