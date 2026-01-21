/**
 * @fileoverview Lightweight Dependency Injection container for TypeScript/Deno.
 *
 * Provides a simple yet powerful DI container with:
 * - Singleton management with lazy instantiation
 * - Constructor injection via class tokens
 * - Property injection via @Inject decorator
 * - @Service marker decorator for documentation
 *
 * @module @lockness/container
 *
 * @example
 * ```ts
 * import { container, Service, Inject } from '@lockness/container'
 *
 * @Service()
 * class UserRepository {
 *   findAll() { return [] }
 * }
 *
 * @Service()
 * class UserService {
 *   @Inject(UserRepository)
 *   accessor repo!: UserRepository
 *
 *   getUsers() {
 *     return this.repo.findAll()
 *   }
 * }
 *
 * const service = container.get(UserService)
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
    Constructor,
    ContainerReader,
    ContainerWriter,
    IContainer,
    ServiceToken,
} from './types.ts'

// =============================================================================
// Errors
// =============================================================================

export { ServiceNotFoundError } from './errors.ts'

// =============================================================================
// Container
// =============================================================================

export { Container, container } from './container.ts'

// =============================================================================
// Decorators
// =============================================================================

export { Inject, Service } from './decorators.ts'

// =============================================================================
// Helper Functions
// =============================================================================

export { bind, createContainer, resolve } from './helpers.ts'
