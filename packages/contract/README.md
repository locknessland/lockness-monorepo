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

## License

MIT
