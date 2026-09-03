/**
 * @fileoverview Authentication error classes.
 *
 * Custom error classes for authentication failures.
 *
 * @module @lockness/auth/errors
 */

/**
 * Base authentication error.
 *
 * All authentication-related errors extend this class.
 *
 * @example
 * ```typescript
 * try {
 *   await auth.authenticate()
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     console.log('Auth failed:', error.message)
 *   }
 * }
 * ```
 */
export class AuthenticationError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'AuthenticationError'
    }
}

/**
 * Error thrown when an authenticated user is denied an action by the
 * authorization layer (a gate or policy).
 *
 * Distinct from the authentication errors: this is a `403` ("you are known but
 * not allowed"), not a `401` ("you are not known"). {@link Gate.authorize}
 * throws it when a check fails, so the framework's error handler renders a 403.
 *
 * @example
 * ```typescript
 * try {
 *   await gate.authorize(user, 'update', post)
 * } catch (error) {
 *   if (error instanceof AuthorizationError) return c.json(error.toJSON(), 403)
 * }
 * ```
 */
export class AuthorizationError extends Error {
    /** HTTP status code. */
    readonly status = 403

    /**
     * @param message - Human-readable denial reason.
     * @param options - Standard error options (e.g. `cause`).
     */
    constructor(
        message = 'This action is unauthorized',
        options?: ErrorOptions,
    ) {
        super(message, options)
        this.name = 'AuthorizationError'
    }

    /**
     * Serialize to a plain object for a JSON response body.
     *
     * @returns The error name, message and status.
     */
    toJSON(): { error: string; message: string; status: number } {
        return { error: this.name, message: this.message, status: this.status }
    }
}

/**
 * Error thrown when authentication fails due to invalid credentials.
 *
 * Returned when email/password combination doesn't match.
 *
 * @example
 * ```typescript
 * try {
 *   await guard.login('user@example.com', 'wrongpassword')
 * } catch (error) {
 *   if (error instanceof InvalidCredentialsError) {
 *     return c.json(error.toJSON(), 401)
 *   }
 * }
 * ```
 */
export class InvalidCredentialsError extends AuthenticationError {
    /** HTTP status code */
    readonly status = 401
    /** Error code for client handling */
    readonly code = 'E_INVALID_CREDENTIALS'

    constructor(message = 'Invalid user credentials', options?: ErrorOptions) {
        super(message, options)
        this.name = 'InvalidCredentialsError'
    }

    /**
     * Create a structured response for the error
     */
    toJSON(): { code: string; message: string; status: number } {
        return {
            code: this.code,
            message: this.message,
            status: this.status,
        }
    }
}

/**
 * Error thrown when accessing protected routes without authentication.
 *
 * Indicates the user needs to authenticate before accessing the resource.
 *
 * @example
 * ```typescript
 * app.onError((err, c) => {
 *   if (err instanceof UnauthorizedAccessError) {
 *     return c.redirect('/login')
 *   }
 * })
 * ```
 */
export class UnauthorizedAccessError extends AuthenticationError {
    /** HTTP status code */
    readonly status = 401
    /** Error code for client handling */
    readonly code = 'E_UNAUTHORIZED_ACCESS'

    constructor(message = 'Unauthorized access', options?: ErrorOptions) {
        super(message, options)
        this.name = 'UnauthorizedAccessError'
    }

    /**
     * Create a structured response for the error
     */
    toJSON(): { code: string; message: string; status: number } {
        return {
            code: this.code,
            message: this.message,
            status: this.status,
        }
    }
}

/**
 * Error thrown when a session has expired.
 *
 * User needs to re-authenticate to continue.
 */
export class SessionExpiredError extends AuthenticationError {
    /** HTTP status code */
    readonly status = 401
    /** Error code for client handling */
    readonly code = 'E_SESSION_EXPIRED'

    constructor(message = 'Session has expired', options?: ErrorOptions) {
        super(message, options)
        this.name = 'SessionExpiredError'
    }

    toJSON(): { code: string; message: string; status: number } {
        return {
            code: this.code,
            message: this.message,
            status: this.status,
        }
    }
}

/**
 * Error thrown when a token is invalid or expired.
 *
 * The API token provided is not valid or has expired.
 */
export class InvalidTokenError extends AuthenticationError {
    /** HTTP status code */
    readonly status = 401
    /** Error code for client handling */
    readonly code = 'E_INVALID_TOKEN'

    constructor(message = 'Invalid or expired token', options?: ErrorOptions) {
        super(message, options)
        this.name = 'InvalidTokenError'
    }

    toJSON(): { code: string; message: string; status: number } {
        return {
            code: this.code,
            message: this.message,
            status: this.status,
        }
    }
}

/**
 * Error thrown when attempting operations that require authentication.
 *
 * Thrown when calling `getUserOrFail()` before `authenticate()`.
 */
export class AuthenticationRequiredError extends AuthenticationError {
    /** HTTP status code */
    readonly status = 401
    /** Error code for client handling */
    readonly code = 'E_AUTHENTICATION_REQUIRED'

    constructor(
        message =
            'Authentication is required. Please call authenticate() first.',
        options?: ErrorOptions,
    ) {
        super(message, options)
        this.name = 'AuthenticationRequiredError'
    }

    toJSON(): { code: string; message: string; status: number } {
        return {
            code: this.code,
            message: this.message,
            status: this.status,
        }
    }
}

/**
 * Error thrown when guard configuration is invalid.
 *
 * Check that all required options are provided for the guard type.
 */
export class InvalidGuardConfigError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'InvalidGuardConfigError'
    }
}
