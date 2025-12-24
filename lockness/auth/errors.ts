/**
 * @lockness/auth - Authentication Errors
 *
 * Custom error classes for authentication failures.
 */

/**
 * Base authentication error
 */
export class AuthenticationError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'AuthenticationError'
    }
}

/**
 * Error thrown when authentication fails due to invalid credentials
 */
export class InvalidCredentialsError extends AuthenticationError {
    status = 401
    code = 'E_INVALID_CREDENTIALS'

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
 * Error thrown when accessing protected routes without authentication
 */
export class UnauthorizedAccessError extends AuthenticationError {
    status = 401
    code = 'E_UNAUTHORIZED_ACCESS'

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
 * Error thrown when a session has expired
 */
export class SessionExpiredError extends AuthenticationError {
    status = 401
    code = 'E_SESSION_EXPIRED'

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
 * Error thrown when a token is invalid or expired
 */
export class InvalidTokenError extends AuthenticationError {
    status = 401
    code = 'E_INVALID_TOKEN'

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
 * Error thrown when attempting operations that require authentication
 */
export class AuthenticationRequiredError extends AuthenticationError {
    status = 401
    code = 'E_AUTHENTICATION_REQUIRED'

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
 * Error thrown when guard configuration is invalid
 */
export class InvalidGuardConfigError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'InvalidGuardConfigError'
    }
}
