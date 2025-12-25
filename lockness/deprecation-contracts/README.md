# @lockness/deprecation-contracts

A generic function and convention to trigger deprecation notices in Lockness JS.
Inspired by [symfony/deprecation-contracts](https://github.com/symfony/deprecation-contracts).

## 🚀 Installation

```bash
# Using Nessy
./nessy package:install deprecation-contracts

# Or manual installation via Deno
deno add jsr:@lockness/deprecation-contracts
```

## 🛠 Usage

The package provides a `triggerDeprecation` function to signal that a feature is deprecated.

```typescript
import { triggerDeprecation } from '@lockness/deprecation-contracts'

function oldMethod() {
    triggerDeprecation(
        'my-package', 
        '1.2.0', 
        'The oldMethod() is deprecated, use %s instead', 
        'newMethod()'
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

| Variable | Description |
|----------|-------------|
| `STRICT_DEPRECATIONS=true` | Throws an `Error` instead of logging a warning. Perfect for CI. |
| `IGNORE_DEPRECATIONS=true` | Silences all deprecation notices. |

## 🎨 Aesthetics

Deprecations are logged with a distinctive style in the console:

![Deprecation Preview](https://img.shields.io/badge/Deprecation-Warning-yellow?style=for-the-badge)

```text
[DEPRECATION] Since my-package 1.2.0: The oldMethod() is deprecated...
```
