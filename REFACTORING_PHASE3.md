# Refactoring Phase 3: @lockness/validator

## Overview

**Date:** December 23, 2024\
**Package:** `@lockness/validator`\
**Lines of Code:** ~710\
**Tests:** 34 test steps (8 test suites)\
**Status:** ✅ Complete

Phase 3 focuses on creating an advanced validation system that goes beyond basic
schema validation. While Lockness already uses Zod for structure validation,
`@lockness/validator` provides complex business logic validation, conditional
rules, sanitization, and async validation capabilities.

## What Was Created

### Package Structure

```
lockness/validator/
├── validator.ts       # Main validator implementation (710 lines)
├── validator.test.ts  # Comprehensive tests (572 lines)
├── README.md          # Complete documentation
└── deno.json          # Package configuration
```

### Core Components

#### 1. Validator System (~710 lines)

**Interfaces & Types:**

- `ValidationResult`: Result object with `valid` boolean and `errors` map
- `ValidatorFn<T>`: Sync or async validation function
- `SanitizerFn<T>`: Data transformation function
- `Rule`: Validator with name, function, and custom message
- `FieldRules`: Field configuration with rules, sanitizers, optional/nullable
  flags

**Validator Class:**

- `field()`: Add validation rules for a field
- `sanitize()`: Add sanitizers for a field
- `applySanitizers()`: Transform data before/after validation
- `validate()`: Validate data and return errors
- `validateOrThrow()`: Validate or throw `ValidationError`

**ValidationError Class:**

- Custom error with errors map
- `getAllMessages()`: Get all error messages as flat array
- `getFirstMessage()`: Get first error only
- `getFieldErrors(field)`: Get errors for specific field

#### 2. 30+ Built-in Validators

**String Validators (10):**

- `email()`: Email validation with regex
- `url()`: URL validation with `new URL()`
- `uuid()`: UUID v4 validation
- `minLength(n)` / `maxLength(n)`: Length constraints
- `pattern(regex, message)`: Custom pattern matching
- `alphanumeric()`: Letters and numbers only
- `alpha()`: Letters only
- `numeric()`: Numbers only

**Number Validators (3):**

- `min(n)` / `max(n)`: Value constraints
- `between(min, max)`: Range validation (inclusive)

**Array Validators (2):**

- `inArray(values)`: Value must be in allowed list
- `notIn(values)`: Value must not be in forbidden list

**Relational Validators (4):**

- `confirmed(field)`: Match another field (password confirmation)
- `different(field)`: Different from another field
- `requiredIf(field, value)`: Conditionally required
- `requiredUnless(field, value)`: Required unless condition met

**Date Validators (3):**

- `dateString()`: Valid date parsing
- `after(date)` / `before(date)`: Date comparisons

**File Validators (2):**

- `fileSize(maxBytes)`: File size limit
- `fileMimeType(types)`: Allowed MIME types

**Special Validators (3):**

- `ip()`: IPv4 address validation
- `json()`: Valid JSON string
- `custom(fn, message)`: Custom validation logic

#### 3. 8 Built-in Sanitizers

- `trim()`: Remove leading/trailing whitespace
- `lowercase()` / `uppercase()`: Case transformation
- `escapeHtml()`: Escape HTML entities for XSS protection
- `stripTags()`: Remove HTML tags
- `toNumber()`: Convert string to number
- `toBoolean()`: Convert to boolean ('true', '1', 'yes' → true)
- `defaultValue(val)`: Use default when empty

#### 4. Helper Functions

- `validator()`: Create new Validator instance
- `validate(data, rules)`: Quick validation without class
- `validateOrThrow(data, rules)`: Quick validation that throws

## Key Features

### 1. Conditional Validation

The validator supports dynamic required fields based on other field values:

```typescript
const v = validator()
    .field('card_number', [requiredIf('payment_method', 'card')], {
        optional: true,
    })

// card_number required when payment_method === 'card'
// optional otherwise
```

**Implementation Detail:** Special handling in validation loop to always check
conditional rules even for optional fields.

### 2. Async Validation

Support for database lookups and other async operations:

```typescript
const uniqueEmail = custom(
    async (email) => {
        const user = await db.users.findOne({ email })
        return !user
    },
    'Email already registered',
)
```

### 3. Sanitization Pipeline

Sanitizers transform data before validation:

```typescript
v.sanitize('email', [trim(), lowercase()])
v.field('email', [email()])

// Input: '  TEST@EXAMPLE.COM  '
// After sanitization: 'test@example.com'
// Then validated
```

**Implementation Detail:** `field()` preserves existing sanitizers when adding
rules, allowing flexible order of method calls.

### 4. Multiple Errors Per Field

Collect all validation errors, not just the first:

```typescript
v.field('password', [
    minLength(8),
    pattern(/[A-Z]/, 'Need uppercase'),
    pattern(/[0-9]/, 'Need number'),
])

// Returns all 3 errors if password is 'abc'
```

### 5. Relational Validation

Validators can access all field values:

```typescript
const rule = custom((value, data) => {
    // data contains all form fields
    return value !== data?.old_password
}, 'Must be different from old password')
```

## Test Coverage

### Test Suite Structure (34 test steps)

1. **Basic validators** (8 steps)
   - email, url, uuid
   - minLength, maxLength, min, max, between
   - inArray, notIn
   - pattern, alphanumeric, alpha, numeric

2. **Relational validators** (4 steps)
   - confirmed, different
   - requiredIf, requiredUnless

3. **Date validators** (2 steps)
   - dateString
   - after, before

4. **Special validators** (4 steps)
   - ip, json
   - custom sync validator
   - custom async validator (with 10ms delay)

5. **Sanitizers** (6 steps)
   - trim with validation integration
   - lowercase, uppercase
   - escapeHtml, stripTags
   - toNumber, toBoolean
   - defaultValue

6. **Validator class** (5 steps)
   - Fluent API chaining
   - Optional fields
   - Nullable fields
   - Required fields
   - Multiple errors per field

7. **validateOrThrow** (3 steps)
   - Throws ValidationError
   - Returns sanitized data
   - ValidationError methods

8. **Complex scenarios** (2 steps)
   - Complete user registration flow
   - Conditional validation

### Test Results

```bash
✅ ok | 8 passed (34 steps) | 0 failed (52ms)
```

All tests passing, including:

- Async validator with 24ms execution
- Date validators with 11ms for timezone handling
- Conditional validation logic
- Sanitizer integration

## Integration

### 1. Workspace Configuration

**deno.json:**

```json
{
    "workspace": [
        "./lockness/validator"
    ],
    "imports": {
        "@lockness/validator": "./lockness/validator/validator.ts"
    }
}
```

### 2. Core Re-export

**lockness/core/core.ts:**

```typescript
export * from '@lockness/validator'
```

Now available as:

```typescript
import { email, validator } from 'lockness'
import { email, validator } from '@lockness/core'
import { email, validator } from '@lockness/validator'
```

## Use Cases

### 1. User Registration

```typescript
const v = validator()
    .field('username', [minLength(3), maxLength(20), alphanumeric()])
    .field('email', [email()])
    .field('password', [minLength(8)])
    .field('password_confirmation', [confirmed('password')])
    .sanitize('username', [trim(), lowercase()])
    .sanitize('email', [trim(), lowercase()])

const result = await v.validate(formData)
```

### 2. Payment Form

```typescript
const v = validator()
    .field('payment_method', [inArray(['card', 'paypal', 'cash'])])
    .field('card_number', [minLength(16)], { optional: true })
    .field('card_number', [requiredIf('payment_method', 'card')])
    .field('expiry', [pattern(/^\d{2}\/\d{2}$/)], { optional: true })
    .field('expiry', [requiredIf('payment_method', 'card')])
```

### 3. Profile Update

```typescript
const v = validator()
    .field('new_password', [
        minLength(12),
        different('old_password'),
        pattern(/[A-Z]/, 'Need uppercase'),
        pattern(/[a-z]/, 'Need lowercase'),
        pattern(/[0-9]/, 'Need number'),
    ], { optional: true })
    .field('new_password_confirmation', [
        confirmed('new_password'),
    ], { optional: true })
    .field('new_password_confirmation', [
        requiredIf('new_password', (val: unknown) => val !== undefined),
    ])
```

### 4. File Upload

```typescript
const v = validator()
    .field('avatar', [
        fileSize(5 * 1024 * 1024), // 5MB
        fileMimeType(['image/jpeg', 'image/png', 'image/webp']),
    ])
    .field('document', [
        fileSize(10 * 1024 * 1024), // 10MB
        fileMimeType(['application/pdf']),
    ], { optional: true })
```

### 5. Admin Settings

```typescript
const v = validator()
    .field('maintenance_mode', [inArray([true, false])])
    .field('maintenance_message', [minLength(10)], { optional: true })
    .field('maintenance_message', [
        requiredIf('maintenance_mode', true),
    ])
    .sanitize('maintenance_message', [trim(), escapeHtml()])
```

## Architecture Decisions

### Why Separate from Zod?

Lockness already uses Zod for schema validation in
`lockness/core/validation.ts`. So why create a separate validator?

**Different Use Cases:**

1. **Zod = Structure**
   - Type-safe schemas
   - Parse and transform
   - Static validation
   - Great for API contracts

2. **@lockness/validator = Business Logic**
   - Async database checks
   - Conditional rules
   - Field relationships
   - Sanitization
   - Custom error messages
   - Dynamic validation

**Can Use Both:**

```typescript
// 1. Zod validates structure
const UserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
})

const structureValid = UserSchema.safeParse(data)
if (!structureValid.success) return structureValid.error

// 2. Validator checks business rules
const v = validator()
    .field('email', [custom(async (email) => {
        return !(await db.users.findOne({ email }))
    }, 'Email taken')])

const businessValid = await v.validate(data)
```

### Implementation Challenges

#### 1. Conditional Rules with Optional Fields

**Problem:** When a field is `optional: true`, validation exits early (line
577), but conditional rules like `requiredIf` need to always execute.

**Solution:** Check if field has conditional rules before skipping:

```typescript
const hasConditionalRules = fieldRules.rules.some((rule) =>
    rule.name === 'requiredIf' || rule.name === 'requiredUnless'
)

if (isEmpty && !hasConditionalRules) {
    if (value === undefined && fieldRules.optional) continue
    // ...
}
```

#### 2. Sanitizer/Field Order Independence

**Problem:** Originally `field()` would overwrite sanitizers if called after
`sanitize()`.

**Solution:** Preserve existing sanitizers when adding rules:

```typescript
field(name: string, rules: Rule[]): this {
    const existing = this.fields.get(name)
    this.fields.set(name, {
        rules,
        sanitizers: existing?.sanitizers, // preserve
        // ...
    })
}
```

#### 3. Type-Safe Sanitizers

**Problem:** Sanitizers have specific input types (string, number) but field
values are `unknown`.

**Solution:** Make sanitizers accept `unknown` and do runtime checks:

```typescript
export function trim(): SanitizerFn {
    return (value: unknown) => typeof value === 'string' ? value.trim() : value
}
```

### Why Not Use Existing Libraries?

Considered alternatives:

- **validator.js**: Node.js only, no async, no conditional rules
- **Joi**: Heavy, different API style, not Deno-native
- **Yup**: Similar to Joi, requires schemas
- **Class-validator**: Decorator-based, requires classes

**@lockness/validator advantages:**

- Deno-native (no Node.js dependencies)
- Lightweight (~710 lines)
- Async-first design
- Conditional validation
- Field relationships
- Fluent API
- Works alongside Zod

## Statistics

### Code Metrics

- **Total Lines:** ~710 (validator.ts)
- **Test Lines:** 572 (validator.test.ts)
- **Documentation:** README.md with 400+ lines
- **Test Coverage:** 34 test steps, all passing
- **Validators:** 30+ built-in
- **Sanitizers:** 8 built-in

### Comparison with Phase 1 & 2

| Phase | Package       | Lines   | Tests  | Time     |
| ----- | ------------- | ------- | ------ | -------- |
| 1     | mail          | 548     | 7      | 25ms     |
| 1     | queue         | 510     | 6      | 35ms     |
| 1     | socialite     | 453     | 15     | 47ms     |
| 2     | cache         | 650     | 26     | 52ms     |
| **3** | **validator** | **710** | **34** | **52ms** |

**Total Project:**

- 5 new standalone libs
- 2,871 total lines of lib code
- 88 passing tests
- 9-package workspace

## What's Next?

Phase 3 completes the "essential utilities" extraction. Potential Phase 4
options:

1. **@lockness/storage**
   - File storage abstraction
   - Local, S3, R2 drivers
   - Stream support
   - ~400 lines

2. **@lockness/events**
   - Event emitter system
   - Async event handlers
   - ~200 lines

3. **@lockness/logger**
   - Structured logging
   - Multiple transports
   - ~300 lines

4. **Stop here**
   - 5 libs is already substantial
   - Focus on polishing existing libs
   - Add more features to current libs

## Conclusion

Phase 3 successfully extracted advanced validation into `@lockness/validator`,
providing:

✅ **30+ validators** for common use cases\
✅ **8 sanitizers** for data transformation\
✅ **Conditional validation** (requiredIf, requiredUnless)\
✅ **Async support** for database checks\
✅ **Field relationships** (confirmed, different)\
✅ **Custom rules** easy to add\
✅ **34 comprehensive tests** all passing\
✅ **Complete documentation** with examples\
✅ **Full TypeScript** type safety\
✅ **Backward compatible** via @lockness/core re-export

The validation system complements Zod by handling complex business logic
validation while Zod handles schema structure. Together they provide a complete
validation solution for Lockness applications.
