import { assertEquals, assertRejects } from '@std/assert'
import {
    after,
    alpha,
    alphanumeric,
    before,
    between,
    confirmed,
    custom,
    dateString,
    defaultValue,
    different,
    email,
    escapeHtml,
    inArray,
    ip,
    json,
    lowercase,
    max,
    maxLength,
    min,
    minLength,
    notIn,
    numeric,
    pattern,
    requiredIf,
    requiredUnless,
    stripTags,
    toBoolean,
    toNumber,
    trim,
    uppercase,
    url,
    uuid,
    validate,
    validateOrThrow,
    ValidationError,
    validator,
} from './validator.ts'

Deno.test('Validator - Basic validators', async (t) => {
    await t.step('email validator', async () => {
        const result = await validate(
            { email: 'test@example.com' },
            { email: [email()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { email: 'invalid-email' },
            { email: [email()] },
        )
        assertEquals(invalid.valid, false)
        assertEquals(invalid.errors.email?.[0], 'Must be a valid email address')
    })

    await t.step('url validator', async () => {
        const result = await validate(
            { website: 'https://example.com' },
            { website: [url()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { website: 'not-a-url' },
            { website: [url()] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('uuid validator', async () => {
        const result = await validate(
            { id: '550e8400-e29b-41d4-a716-446655440000' },
            { id: [uuid()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { id: 'not-a-uuid' },
            { id: [uuid()] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('minLength and maxLength', async () => {
        const result = await validate(
            { password: 'secure123' },
            { password: [minLength(8), maxLength(20)] },
        )
        assertEquals(result.valid, true)

        const tooShort = await validate(
            { password: '123' },
            { password: [minLength(8)] },
        )
        assertEquals(tooShort.valid, false)

        const tooLong = await validate(
            { password: 'a'.repeat(21) },
            { password: [maxLength(20)] },
        )
        assertEquals(tooLong.valid, false)
    })

    await t.step('min and max', async () => {
        const result = await validate(
            { age: 25 },
            { age: [min(18), max(100)] },
        )
        assertEquals(result.valid, true)

        const tooYoung = await validate(
            { age: 15 },
            { age: [min(18)] },
        )
        assertEquals(tooYoung.valid, false)
    })

    await t.step('between', async () => {
        const result = await validate(
            { score: 75 },
            { score: [between(0, 100)] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { score: 150 },
            { score: [between(0, 100)] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('inArray and notIn', async () => {
        const result = await validate(
            { role: 'admin' },
            { role: [inArray(['admin', 'user', 'guest'])] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { role: 'superadmin' },
            { role: [inArray(['admin', 'user', 'guest'])] },
        )
        assertEquals(invalid.valid, false)

        const notInResult = await validate(
            { username: 'john' },
            { username: [notIn(['admin', 'root'])] },
        )
        assertEquals(notInResult.valid, true)
    })

    await t.step('pattern, alphanumeric, alpha, numeric', async () => {
        const alphanumericResult = await validate(
            { code: 'ABC123' },
            { code: [alphanumeric()] },
        )
        assertEquals(alphanumericResult.valid, true)

        const alphaResult = await validate(
            { name: 'John' },
            { name: [alpha()] },
        )
        assertEquals(alphaResult.valid, true)

        const numericResult = await validate(
            { pin: '1234' },
            { pin: [numeric()] },
        )
        assertEquals(numericResult.valid, true)

        const customPattern = await validate(
            { hex: 'FF00AA' },
            { hex: [pattern(/^[A-F0-9]+$/, 'Must be hex')] },
        )
        assertEquals(customPattern.valid, true)
    })
})

Deno.test('Validator - Relational validators', async (t) => {
    await t.step('confirmed', async () => {
        const result = await validate(
            { password: 'secret123', password_confirmation: 'secret123' },
            { password_confirmation: [confirmed('password')] },
        )
        assertEquals(result.valid, true)

        const mismatch = await validate(
            { password: 'secret123', password_confirmation: 'different' },
            { password_confirmation: [confirmed('password')] },
        )
        assertEquals(mismatch.valid, false)
    })

    await t.step('different', async () => {
        const result = await validate(
            { new_password: 'newpass123', old_password: 'oldpass123' },
            { new_password: [different('old_password')] },
        )
        assertEquals(result.valid, true)

        const same = await validate(
            { new_password: 'samepass', old_password: 'samepass' },
            { new_password: [different('old_password')] },
        )
        assertEquals(same.valid, false)
    })

    await t.step('requiredIf', async () => {
        const v = validator()
        v.field('card_number', [requiredIf('payment_method', 'card')], { optional: true })

        const result = await v.validate(
            { payment_method: 'card', card_number: '1234' },
        )
        assertEquals(result.valid, true)

        const missing = await v.validate(
            { payment_method: 'card' },
        )
        assertEquals(missing.valid, false)

        const notRequired = await v.validate(
            { payment_method: 'cash' },
        )
        assertEquals(notRequired.valid, true)
    })

    await t.step('requiredUnless', async () => {
        const v = validator()
        v.field('reason', [requiredUnless('status', 'approved')], { optional: true })

        const result = await v.validate(
            { status: 'pending', reason: 'Waiting approval' },
        )
        assertEquals(result.valid, true)

        const notRequired = await v.validate(
            { status: 'approved' },
        )
        assertEquals(notRequired.valid, true)
    })
})

Deno.test('Validator - Date validators', async (t) => {
    await t.step('dateString', async () => {
        const result = await validate(
            { birthdate: '2000-01-01' },
            { birthdate: [dateString()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { birthdate: 'not-a-date' },
            { birthdate: [dateString()] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('after and before', async () => {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)

        const afterResult = await validate(
            { event_date: tomorrow.toISOString() },
            { event_date: [after(new Date())] },
        )
        assertEquals(afterResult.valid, true)

        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)

        const beforeResult = await validate(
            { event_date: yesterday.toISOString() },
            { event_date: [before(new Date())] },
        )
        assertEquals(beforeResult.valid, true)
    })
})

Deno.test('Validator - Special validators', async (t) => {
    await t.step('ip validator', async () => {
        const result = await validate(
            { ip: '192.168.1.1' },
            { ip: [ip()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { ip: '999.999.999.999' },
            { ip: [ip()] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('json validator', async () => {
        const result = await validate(
            { config: '{"key": "value"}' },
            { config: [json()] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { config: '{invalid json}' },
            { config: [json()] },
        )
        assertEquals(invalid.valid, false)
    })

    await t.step('custom validator', async () => {
        const evenNumber = custom(
            (value: unknown) => typeof value === 'number' && value % 2 === 0,
            'Must be an even number',
        )

        const result = await validate(
            { number: 4 },
            { number: [evenNumber] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { number: 5 },
            { number: [evenNumber] },
        )
        assertEquals(invalid.valid, false)
        assertEquals(invalid.errors.number?.[0], 'Must be an even number')
    })

    await t.step('async custom validator', async () => {
        const asyncValidator = custom(
            async (value: unknown) => {
                await new Promise((resolve) => setTimeout(resolve, 10))
                return value === 'async-value'
            },
            'Async validation failed',
        )

        const result = await validate(
            { field: 'async-value' },
            { field: [asyncValidator] },
        )
        assertEquals(result.valid, true)

        const invalid = await validate(
            { field: 'wrong' },
            { field: [asyncValidator] },
        )
        assertEquals(invalid.valid, false)
    })
})

Deno.test('Validator - Sanitizers', async (t) => {
    await t.step('trim sanitizer', async () => {
        const v = validator()
        v.sanitize('name', [trim()])
        v.field('name', [minLength(3)])

        const result = await v.validate({ name: '  John  ' })
        assertEquals(result.valid, true)

        const sanitized = v.applySanitizers({ name: '  John  ' })
        assertEquals(sanitized.name, 'John')
    })

    await t.step('lowercase and uppercase', () => {
        const v = validator()
        v.sanitize('email', [lowercase()])
        v.sanitize('code', [uppercase()])

        const sanitized = v.applySanitizers({
            email: 'TEST@EXAMPLE.COM',
            code: 'abc123',
        })
        assertEquals(sanitized.email, 'test@example.com')
        assertEquals(sanitized.code, 'ABC123')
    })

    await t.step('escapeHtml', () => {
        const v = validator()
        v.sanitize('content', [escapeHtml()])

        const sanitized = v.applySanitizers({
            content: '<script>alert("xss")</script>',
        })
        assertEquals(
            sanitized.content,
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
        )
    })

    await t.step('stripTags', () => {
        const v = validator()
        v.sanitize('text', [stripTags()])

        const sanitized = v.applySanitizers({
            text: '<p>Hello <strong>World</strong></p>',
        })
        assertEquals(sanitized.text, 'Hello World')
    })

    await t.step('toNumber and toBoolean', () => {
        const v = validator()
        v.sanitize('age', [toNumber()])
        v.sanitize('active', [toBoolean()])

        const sanitized = v.applySanitizers({
            age: '25',
            active: 'true',
        })
        assertEquals(sanitized.age, 25)
        assertEquals(sanitized.active, true)
    })

    await t.step('defaultValue', () => {
        const v = validator()
        v.sanitize('status', [defaultValue('pending')])

        const sanitized = v.applySanitizers({ status: '' })
        assertEquals(sanitized.status, 'pending')
    })
})

Deno.test('Validator - Validator class', async (t) => {
    await t.step('fluent API', async () => {
        const v = validator()
            .field('email', [email()])
            .field('password', [minLength(8)])
            .sanitize('email', [lowercase(), trim()])

        const result = await v.validate({
            email: '  TEST@EXAMPLE.COM  ',
            password: 'secure123',
        })
        assertEquals(result.valid, true)
    })

    await t.step('optional fields', async () => {
        const v = validator()
        v.field('nickname', [minLength(3)], { optional: true })

        const withoutField = await v.validate({})
        assertEquals(withoutField.valid, true)

        const withField = await v.validate({ nickname: 'Jo' })
        assertEquals(withField.valid, false)
    })

    await t.step('nullable fields', async () => {
        const v = validator()
        v.field('middle_name', [minLength(2)], { nullable: true })

        const withNull = await v.validate({ middle_name: null })
        assertEquals(withNull.valid, true)
    })

    await t.step('required fields', async () => {
        const v = validator()
        v.field('username', [minLength(3)])

        const missing = await v.validate({})
        assertEquals(missing.valid, false)
        assertEquals(missing.errors.username?.[0], 'username is required')
    })

    await t.step('multiple errors per field', async () => {
        const v = validator()
        v.field('password', [minLength(8), alphanumeric()])

        const result = await v.validate({ password: 'ab!' })
        assertEquals(result.valid, false)
        assertEquals(result.errors.password?.length, 2)
    })
})

Deno.test('Validator - validateOrThrow', async (t) => {
    await t.step('throws on validation error', async () => {
        await assertRejects(
            async () => {
                await validateOrThrow(
                    { email: 'invalid' },
                    { email: [email()] },
                )
            },
            ValidationError,
            'Validation failed',
        )
    })

    await t.step('returns sanitized data on success', async () => {
        const v = validator()
        v.field('email', [email()])
        v.sanitize('email', [trim(), lowercase()])

        const data = await v.validateOrThrow(
            { email: '  TEST@EXAMPLE.COM  ' },
        )
        // Validator class applies sanitizers
        assertEquals(data.email, 'test@example.com')
    })

    await t.step('ValidationError methods', async () => {
        try {
            await validateOrThrow(
                { email: 'invalid', password: '123' },
                { email: [email()], password: [minLength(8)] },
            )
        } catch (error) {
            const validationError = error as ValidationError
            assertEquals(validationError.getAllMessages().length, 2)
            assertEquals(typeof validationError.getFirstMessage(), 'string')
            assertEquals(validationError.getFieldErrors('email').length, 1)
            assertEquals(validationError.getFieldErrors('missing').length, 0)
        }
    })
})

Deno.test('Validator - Complex scenarios', async (t) => {
    await t.step('user registration', async () => {
        const v = validator()
            .field('username', [minLength(3), maxLength(20), alphanumeric()])
            .field('email', [email()])
            .field('password', [minLength(8)])
            .field('password_confirmation', [confirmed('password')])
            .field('age', [min(18)])
            .sanitize('username', [trim(), lowercase()])
            .sanitize('email', [trim(), lowercase()])

        const result = await v.validate({
            username: '  JohnDoe  ',
            email: '  JOHN@EXAMPLE.COM  ',
            password: 'secure123',
            password_confirmation: 'secure123',
            age: 25,
        })
        assertEquals(result.valid, true)

        const sanitized = v.applySanitizers({
            username: '  JohnDoe  ',
            email: '  JOHN@EXAMPLE.COM  ',
        })
        assertEquals(sanitized.username, 'johndoe')
        assertEquals(sanitized.email, 'john@example.com')
    })

    await t.step('conditional validation', async () => {
        const v = validator()
            .field('shipping_address', [minLength(10)], {
                optional: true,
            })

        v.field('shipping_address', [
            requiredIf('needs_shipping', true),
            minLength(10),
        ])

        const withShipping = await v.validate({
            needs_shipping: true,
            shipping_address: '123 Main St, City',
        })
        assertEquals(withShipping.valid, true)

        const withoutShipping = await v.validate({
            needs_shipping: false,
        })
        // Will fail because shipping_address is required when needs_shipping is true
        // but here needs_shipping is false, so it should pass the requiredIf
        // However, the field is marked required by default unless optional: true
        assertEquals(withoutShipping.valid, false)
    })
})
