# @lockness/validator

Advanced validation system with custom rules, async validation, sanitization,
and conditional logic - going beyond basic schema validation.

## Features

- **30+ Built-in Validators**: Email, URL, UUID, patterns, dates, files, and
  more
- **Conditional Validation**: `requiredIf`, `requiredUnless`, `confirmed`,
  `different`
- **Sanitizers**: Transform data before validation (trim, lowercase, escape
  HTML, etc.)
- **Async Validators**: Support for async validation logic (e.g., database
  checks)
- **Fluent API**: Chain validations with an intuitive interface
- **Custom Rules**: Easy to add custom validation logic
- **Detailed Errors**: Get all errors per field or first error only
- **Type Safe**: Full TypeScript support

## Installation

```typescript
import { email, minLength, validator } from '@lockness/validator'
// or from core
import { email, minLength, validator } from '@lockness/core'
```

## Quick Start

```typescript
import {
    confirmed,
    email,
    lowercase,
    minLength,
    trim,
    validator,
} from '@lockness/validator'

const v = validator()
    .field('email', [email()])
    .field('password', [minLength(8)])
    .field('password_confirmation', [confirmed('password')])
    .sanitize('email', [trim(), lowercase()])

const result = await v.validate({
    email: '  USER@EXAMPLE.COM  ',
    password: 'secure123',
    password_confirmation: 'secure123',
})

if (result.valid) {
    const sanitized = v.applySanitizers(data)
    // email is now 'user@example.com'
} else {
    console.log(result.errors)
    // { email: ['Must be a valid email'], ... }
}
```

## Built-in Validators

### String Validators

- **email()**: Valid email address
- **url()**: Valid URL
- **uuid()**: Valid UUID
- **minLength(n)**: Minimum string length
- **maxLength(n)**: Maximum string length
- **pattern(regex, message)**: Custom regex pattern
- **alphanumeric()**: Letters and numbers only
- **alpha()**: Letters only
- **numeric()**: Numbers only

### Number Validators

- **min(n)**: Minimum value
- **max(n)**: Maximum value
- **between(min, max)**: Value in range (inclusive)

### Array Validators

- **inArray(values)**: Value must be in array
- **notIn(values)**: Value must not be in array

### Relational Validators

- **confirmed(field)**: Must match another field (password confirmation)
- **different(field)**: Must be different from another field
- **requiredIf(field, value)**: Required when another field has specific value
- **requiredUnless(field, value)**: Required unless another field has specific
  value

### Date Validators

- **dateString()**: Valid date string
- **after(date)**: Date after specific date
- **before(date)**: Date before specific date

### File Validators

- **fileSize(maxBytes)**: Maximum file size
- **fileMimeType(types)**: Allowed MIME types

### Special Validators

- **ip()**: Valid IPv4 address
- **json()**: Valid JSON string
- **custom(fn, message)**: Custom validation function

## Sanitizers

Transform data before validation:

```typescript
import {
    defaultValue,
    escapeHtml,
    lowercase,
    stripTags,
    toBoolean,
    toNumber,
    trim,
    uppercase,
} from '@lockness/validator'

const v = validator()
    .field('username', [minLength(3)])
    .sanitize('username', [trim(), lowercase()])
    .field('age', [min(18)])
    .sanitize('age', [toNumber()])

const result = await v.validate({
    username: '  JohnDoe  ', // becomes 'johndoe'
    age: '25', // becomes 25
})
```

**Available Sanitizers:**

- `trim()`: Remove whitespace
- `lowercase()`: Convert to lowercase
- `uppercase()`: Convert to uppercase
- `escapeHtml()`: Escape HTML entities
- `stripTags()`: Remove HTML tags
- `toNumber()`: Convert to number
- `toBoolean()`: Convert to boolean ('true', '1', 'yes' → true)
- `defaultValue(val)`: Use default if empty

## Usage Examples

### User Registration

```typescript
const v = validator()
    .field('username', [minLength(3), maxLength(20), alphanumeric()])
    .field('email', [email()])
    .field('password', [minLength(8)])
    .field('password_confirmation', [confirmed('password')])
    .field('age', [min(18), max(120)])
    .sanitize('username', [trim(), lowercase()])
    .sanitize('email', [trim(), lowercase()])
    .sanitize('age', [toNumber()])

const result = await v.validate(formData)

if (!result.valid) {
    return { errors: result.errors }
}

const sanitizedData = v.applySanitizers(formData)
await createUser(sanitizedData)
```

### Conditional Validation

```typescript
const v = validator()
    .field('payment_method', [inArray(['card', 'paypal', 'cash'])])
    .field('card_number', [minLength(16)], { optional: true })
    .field('card_number', [requiredIf('payment_method', 'card')])

await v.validate({
    payment_method: 'card',
    // card_number is now required
})

await v.validate({
    payment_method: 'cash',
    // card_number is optional
})
```

### Async Custom Validation

```typescript
import { custom } from '@lockness/validator'

const emailNotTaken = custom(
    async (email) => {
        const user = await db.users.findOne({ email })
        return !user
    },
    'Email already registered',
)

const v = validator().field('email', [email(), emailNotTaken])

const result = await v.validate({ email: 'test@example.com' })
```

### Complex Business Logic

```typescript
const v = validator()
    .field('new_password', [
        minLength(12),
        pattern(/[A-Z]/, 'Must contain uppercase'),
        pattern(/[a-z]/, 'Must contain lowercase'),
        pattern(/[0-9]/, 'Must contain number'),
        pattern(/[!@#$%^&*]/, 'Must contain special character'),
        different('old_password'),
    ])

const result = await v.validate({
    old_password: 'oldpass123!A',
    new_password: 'NewSecureP@ss456',
})
```

### File Upload Validation

```typescript
import { fileMimeType, fileSize } from '@lockness/validator'

const v = validator()
    .field('avatar', [
        fileSize(5 * 1024 * 1024), // 5MB
        fileMimeType(['image/jpeg', 'image/png', 'image/webp']),
    ])

const file = formData.get('avatar') as File
const result = await v.validate({ avatar: file })
```

### Optional and Nullable Fields

```typescript
const v = validator()
    .field('nickname', [minLength(3)], { optional: true })
    .field('bio', [maxLength(500)], { nullable: true })
    .field('website', [url()], { optional: true })

await v.validate({
    // nickname can be undefined
    nickname: undefined, // ✅ valid

    // bio can be null
    bio: null, // ✅ valid

    // website can be omitted or must be valid URL
    website: 'https://example.com', // ✅ valid
})
```

### Quick Helpers

For simple validation without class instantiation:

```typescript
import { validate, validateOrThrow } from '@lockness/validator'

// Returns ValidationResult
const result = await validate(
    { email: 'test@example.com', age: 25 },
    { email: [email()], age: [min(18)] },
)

if (!result.valid) {
    console.log(result.errors)
}

// Throws ValidationError on failure
try {
    const data = await validateOrThrow(
        { email: 'invalid' },
        { email: [email()] },
    )
} catch (error) {
    if (error instanceof ValidationError) {
        console.log(error.getAllMessages())
        console.log(error.getFirstMessage())
        console.log(error.getFieldErrors('email'))
    }
}
```

## API Reference

### Validator Class

```typescript
class Validator {
    field(
        name: string,
        rules: Rule[],
        options?: { optional?: boolean; nullable?: boolean },
    ): this
    sanitize(name: string, sanitizers: SanitizerFn[]): this
    applySanitizers(data: Record<string, unknown>): Record<string, unknown>
    validate(data: Record<string, unknown>): Promise<ValidationResult>
    validateOrThrow(
        data: Record<string, unknown>,
    ): Promise<Record<string, unknown>>
}
```

### ValidationResult

```typescript
interface ValidationResult {
    valid: boolean
    errors: Record<string, string[]>
}
```

### ValidationError

```typescript
class ValidationError extends Error {
    errors: Record<string, string[]>
    getAllMessages(): string[]
    getFirstMessage(): string | undefined
    getFieldErrors(field: string): string[]
}
```

### Custom Validators

Create custom validation logic:

```typescript
import { custom, type Rule } from '@lockness/validator'

// Simple custom validator
const even = custom(
    (value) => typeof value === 'number' && value % 2 === 0,
    'Must be an even number',
)

// Async custom validator
const uniqueUsername = custom(
    async (username) => {
        const exists = await checkUsername(username)
        return !exists
    },
    'Username already taken',
)

// Access other field values
const passwordStrength = custom(
    (password, data) => {
        // data contains all form fields
        const username = data?.username
        if (username && password.includes(username)) {
            return false
        }
        return password.length >= 12
    },
    'Password must be strong and not contain username',
)
```

## Integration with Zod

While @lockness/validator provides advanced business logic validation, you can
still use Zod for schema validation:

```typescript
import { z } from 'zod'
import { custom, validator } from '@lockness/validator'

// Zod for structure
const UserSchema = z.object({
    email: z.string().email(),
    age: z.number().min(18),
})

// Validator for business logic
const v = validator()
    .field('email', [custom(async (email) => {
        const exists = await db.users.findOne({ email })
        return !exists
    }, 'Email already registered')])
    .field('age', [custom((age) => age !== 69, 'Nice try!')])

// Use both
const structureValid = UserSchema.safeParse(data)
const businessValid = await v.validate(data)
```

## Testing

```typescript
import { assertEquals } from '@std/assert'
import { email, minLength, validator } from '@lockness/validator'

Deno.test('validates user input', async () => {
    const v = validator()
        .field('email', [email()])
        .field('password', [minLength(8)])

    const result = await v.validate({
        email: 'test@example.com',
        password: 'secure123',
    })

    assertEquals(result.valid, true)
})
```

## License

MIT
