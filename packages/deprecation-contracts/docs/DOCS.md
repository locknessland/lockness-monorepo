# Deprecation Contracts

Lockness provides a built-in system to manage gracefully the evolution of your
code using **Deprecation Contracts**. This system allows you to signal that a
feature is becoming obsolete, while providing guidance on what to use instead.

Inspired by the
[symfony/deprecation-contracts](https://github.com/symfony/deprecation-contracts)
PHP package, it is fully integrated into the Lockness ecosystem (Logger,
Devtools, and Container).

---

## 🚀 Getting Started

The `@lockness/deprecation-contracts` package is a core utility of the
framework.

### Installation

If it's not already installed, you can add it via Nessy:

```bash
./nessy package:install deprecation-contracts
```

---

## 🛠 Usage

There are two main ways to trigger a deprecation notice: using the
`triggerDeprecation` function or the `@Deprecated` decorator.

### 1. Using `@Deprecated` Decorator (Recommended)

The most elegant way to handle deprecations in a class-based environment like
Lockness is using the `@Deprecated` decorator. It can be applied to **classes**,
**methods**, and **accessors**.

#### Decorating a Class

The notice is triggered when a new instance is created.

```typescript
import { Deprecated } from '@lockness/core'

@Deprecated('2.0.0', 'Use AuthService instead')
export class UserRegistrationService {
    // ...
}
```

#### Decorating a Method

The notice is triggered only when the method is called.

```typescript
class UserService {
    @Deprecated('1.5.0', 'Use findByEmail() for better performance')
    find(id: string) {
        // ...
    }
}
```

#### Decorating an Accessor

The notice is triggered when reading or writing the property.

```typescript
class Config {
    @Deprecated('1.1.0', 'Use settings.theme instead')
    accessor theme = 'dark'
}
```

### 2. Using `triggerDeprecation` function

For procedural code or more complex conditions, you can use the function
directly.

```typescript
import { triggerDeprecation } from '@lockness/deprecation-contracts'

function oldHelper() {
    triggerDeprecation(
        'my-package',
        '1.2.0',
        'The oldHelper() is deprecated, use %s instead',
        'newHelper()',
    )
    // ...
}
```

| Argument  | Description                                                       |
| --------- | ----------------------------------------------------------------- |
| `package` | The name of the package/module triggering the deprecation.        |
| `version` | The version that introduced the deprecation.                      |
| `message` | The notification message (supports `%s` placeholders).            |
| `...args` | Optional values to replace placeholders or append to the message. |

---

## ⚙️ Configuration

Deprecation behavior can be controlled via environment variables in your `.env`
file.

| Variable              | Default | Description                                                                    |
| --------------------- | ------- | ------------------------------------------------------------------------------ |
| `STRICT_DEPRECATIONS` | `false` | If `true`, triggers an `Error` instead of a warning. Recommended for CI/Tests. |
| `IGNORE_DEPRECATIONS` | `false` | If `true`, suppresses all deprecation notices.                                 |

---

## 🔧 Devtools Integration

When using the **Lockness Devtools**, all deprecation notices are automatically
captured in a dedicated tab.

- **Stack Trace**: Each notice includes a full stack trace to identify exactly
  where the deprecated code is called.
- **Aggregation**: Overlapping notices are grouped for a cleaner overview.
- **Real-time**: Notices appear instantly in the Devtools dashboard during
  development.

---

## 🎨 Aesthetics

In the console, deprecations are styled for high visibility:

```text
[DEPRECATION] Since my-pkg 1.2.0: Method old() is deprecated. Use new() instead.
```
