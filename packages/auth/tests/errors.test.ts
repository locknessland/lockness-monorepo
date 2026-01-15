import { assertEquals, assertExists } from '@std/assert'
import {
    AuthenticationError,
    AuthenticationRequiredError,
    InvalidCredentialsError,
    InvalidGuardConfigError,
    InvalidTokenError,
    SessionExpiredError,
    UnauthorizedAccessError,
} from '../errors.ts'

Deno.test('AuthenticationError - can be instantiated', () => {
    const error = new AuthenticationError('Test error')
    assertEquals(error.message, 'Test error')
    assertEquals(error.name, 'AuthenticationError')
    assertExists(error)
})

Deno.test('InvalidCredentialsError - has correct properties', () => {
    const error = new InvalidCredentialsError('Custom message')
    assertEquals(error.message, 'Custom message')
    assertEquals(error.name, 'InvalidCredentialsError')
    assertEquals(error.status, 401)
    assertEquals(error.code, 'E_INVALID_CREDENTIALS')
})

Deno.test('InvalidCredentialsError - toJSON returns correct structure', () => {
    const error = new InvalidCredentialsError('Login failed')
    const json = error.toJSON()

    assertEquals(json.code, 'E_INVALID_CREDENTIALS')
    assertEquals(json.message, 'Login failed')
    assertEquals(json.status, 401)
})

Deno.test('InvalidCredentialsError - default message', () => {
    const error = new InvalidCredentialsError()
    assertEquals(error.message, 'Invalid user credentials')
    assertEquals(error.toJSON().message, 'Invalid user credentials')
})

Deno.test('UnauthorizedAccessError - has correct properties', () => {
    const error = new UnauthorizedAccessError('Access denied')
    assertEquals(error.message, 'Access denied')
    assertEquals(error.name, 'UnauthorizedAccessError')
    assertEquals(error.status, 401)
    assertEquals(error.code, 'E_UNAUTHORIZED_ACCESS')
})

Deno.test('UnauthorizedAccessError - toJSON returns correct structure', () => {
    const error = new UnauthorizedAccessError('Protected resource')
    const json = error.toJSON()

    assertEquals(json.code, 'E_UNAUTHORIZED_ACCESS')
    assertEquals(json.message, 'Protected resource')
    assertEquals(json.status, 401)
})

Deno.test('UnauthorizedAccessError - default message', () => {
    const error = new UnauthorizedAccessError()
    assertEquals(error.message, 'Unauthorized access')
})

Deno.test('SessionExpiredError - has correct properties', () => {
    const error = new SessionExpiredError('Your session expired')
    assertEquals(error.message, 'Your session expired')
    assertEquals(error.name, 'SessionExpiredError')
    assertEquals(error.status, 401)
    assertEquals(error.code, 'E_SESSION_EXPIRED')
})

Deno.test('SessionExpiredError - toJSON returns correct structure', () => {
    const error = new SessionExpiredError('Session timeout')
    const json = error.toJSON()

    assertEquals(json.code, 'E_SESSION_EXPIRED')
    assertEquals(json.message, 'Session timeout')
    assertEquals(json.status, 401)
})

Deno.test('SessionExpiredError - default message', () => {
    const error = new SessionExpiredError()
    assertEquals(error.message, 'Session has expired')
})

Deno.test('InvalidTokenError - has correct properties', () => {
    const error = new InvalidTokenError('Token invalid')
    assertEquals(error.message, 'Token invalid')
    assertEquals(error.name, 'InvalidTokenError')
    assertEquals(error.status, 401)
    assertEquals(error.code, 'E_INVALID_TOKEN')
})

Deno.test('InvalidTokenError - toJSON returns correct structure', () => {
    const error = new InvalidTokenError('Malformed token')
    const json = error.toJSON()

    assertEquals(json.code, 'E_INVALID_TOKEN')
    assertEquals(json.message, 'Malformed token')
    assertEquals(json.status, 401)
})

Deno.test('InvalidTokenError - default message', () => {
    const error = new InvalidTokenError()
    assertEquals(error.message, 'Invalid or expired token')
})

Deno.test('AuthenticationRequiredError - has correct properties', () => {
    const error = new AuthenticationRequiredError('Please authenticate')
    assertEquals(error.message, 'Please authenticate')
    assertEquals(error.name, 'AuthenticationRequiredError')
    assertEquals(error.status, 401)
    assertEquals(error.code, 'E_AUTHENTICATION_REQUIRED')
})

Deno.test('AuthenticationRequiredError - toJSON returns correct structure', () => {
    const error = new AuthenticationRequiredError('Not authenticated')
    const json = error.toJSON()

    assertEquals(json.code, 'E_AUTHENTICATION_REQUIRED')
    assertEquals(json.message, 'Not authenticated')
    assertEquals(json.status, 401)
})

Deno.test('AuthenticationRequiredError - default message', () => {
    const error = new AuthenticationRequiredError()
    assertEquals(
        error.message,
        'Authentication is required. Please call authenticate() first.',
    )
})

Deno.test('InvalidGuardConfigError - can be instantiated', () => {
    const error = new InvalidGuardConfigError('Invalid config')
    assertEquals(error.message, 'Invalid config')
    assertEquals(error.name, 'InvalidGuardConfigError')
    assertExists(error)
})

Deno.test('All errors inherit from Error', () => {
    const errors = [
        new AuthenticationError('test'),
        new InvalidCredentialsError(),
        new UnauthorizedAccessError(),
        new SessionExpiredError(),
        new InvalidTokenError(),
        new AuthenticationRequiredError(),
        new InvalidGuardConfigError('test'),
    ]

    for (const error of errors) {
        assertEquals(error instanceof Error, true)
    }
})
