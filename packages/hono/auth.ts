/**
 * Authentication Middleware
 *
 * Provides authentication mechanisms including:
 * - Basic Auth (HTTP Basic Authentication)
 * - Bearer Auth (Token-based authentication)
 * - JWT (JSON Web Tokens)
 * - JWK (JSON Web Key for JWT verification)
 *
 * @module
 */

export * from 'hono/basic-auth'
export * from 'hono/bearer-auth'
export * from 'hono/jwt'
export * from 'hono/jwk'
