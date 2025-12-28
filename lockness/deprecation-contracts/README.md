# @lockness/deprecation-contracts

A generic function and convention to trigger deprecation notices in Lockness JS.
Inspired by
[symfony/deprecation-contracts](https://github.com/symfony/deprecation-contracts).

## 🚀 Installation

```bash
# Using Nessy
./nessy package:install deprecation-contracts

# Or manual installation via Deno
deno add jsr:@lockness/deprecation-contracts
```

## 🛠 Usage

The package provides a `triggerDeprecation` function to signal that a feature is
deprecated.

```typescript
import { triggerDeprecation } from '@lockness/deprecation-contracts'

function oldMethod() {
    triggerDeprecation(
        'my-package',
        '1.2.0',
        'The oldMethod() is deprecated, use %s instead',
        'newMethod()',
    )

    // ... logic
}
```

### Signature

`triggerDeprecation(package: string, version: string, message: string, ...args: any[]): void`

- **package**: The name of the package triggering the deprecation.
- **version**: The version that introduced the deprecation.
- **message**: The message (supports `%s` placeholders).
- **args**: Values to replace placeholders or append to the message.

## ⚙️ Configuration

You can control the behavior of deprecations via environment variables:

| Variable                   | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `STRICT_DEPRECATIONS=true` | Throws an `Error` instead of logging a warning. Perfect for CI. |
| `IGNORE_DEPRECATIONS=true` | Silences all deprecation notices.                               |

## 🎨 Aesthetics

Deprecations are logged with a distinctive style in the console:

![Deprecation Preview](https://img.shields.io/badge/Deprecation-Warning-yellow?style=for-the-badge)

```text
[DEPRECATION] Since my-package 1.2.0: The oldMethod() is deprecated...
```

## 🔧 Devtools Integration

For Lockness applications, deprecations can be automatically tracked in the
**Lockness Devtools** dashboard.

### Installation

Install both packages:

```bash
./nessy package:install deprecation-contracts
./nessy package:install devtools
```

### Automatic Integration

No configuration needed! When both packages are installed:

- ✅ Deprecations appear in the Devtools dashboard
- ✅ Full stack traces for debugging
- ✅ Timestamp and occurrence tracking
- ✅ Package and version information
- ✅ Quick navigation to source code

The integration happens automatically when you enable devtools in your kernel:

```typescript
import { collectAppRoutes, enableDevtools } from '@lockness/devtools'

const isDevelopment = Deno.env.get('APP_ENV') === 'development'

if (isDevelopment) {
    enableDevtools(app.getHono())
}
```

### Standalone Usage

You can also use `@lockness/deprecation-contracts` **without** devtools. In this
case, deprecations will be logged to the console with styled warnings.

**Pro tip:** Install devtools in development to get visual tracking of all
deprecations in your application!
