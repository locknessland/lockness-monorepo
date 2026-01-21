# Technical Task: Refactor @lockness/container Package

## 📋 Task Overview

Refactoriser le package `@lockness/container` pour améliorer la séparation des
responsabilités, l'extensibilité et la maintenabilité. Actuellement, tout le
code est dans un seul fichier `mod.ts` (~414 lignes). Cette refactorisation
appliquera les principes SOLID et DRY pour créer une architecture modulaire.

## 🎯 Objectives

1. **Séparation des types**: Extraire les types dans un fichier dédié
2. **Séparation du Container**: Isoler la classe Container dans son propre
   fichier
3. **Séparation des décorateurs**: Extraire `@Service` et `@Inject` dans un
   fichier dédié
4. **Séparation des helpers**: Regrouper `bind`, `resolve`, `createContainer`
5. **Support des scopes**: Préparer l'architecture pour les scopes (singleton,
   transient, scoped)

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/container/mod.ts` - Point d'entrée, réexporte tout

### New Files to Create

- `/packages/container/types.ts` - Types et interfaces
- `/packages/container/container.ts` - Classe Container
- `/packages/container/decorators.ts` - Décorateurs @Service et @Inject
- `/packages/container/helpers.ts` - Fonctions utilitaires
- `/packages/container/errors.ts` - Classes d'erreurs personnalisées

### Test Files

- `/packages/container/tests/container.test.ts` - Tests existants (à mettre à
  jour si nécessaire)
- `/packages/container/tests/decorators.test.ts` - Tests dédiés aux décorateurs
- `/packages/container/tests/helpers.test.ts` - Tests dédiés aux helpers

### Documentation Files to Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### Core Documentation

- `/packages/container/README.md` - Mise à jour avec la nouvelle architecture

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: `mod.ts` contient types, container, décorateurs et
  helpers
- **Solution**: Séparer chaque responsabilité dans son propre fichier

```
packages/container/
├── mod.ts          # Re-exports only
├── types.ts        # Type definitions
├── container.ts    # Container class
├── decorators.ts   # @Service, @Inject
├── helpers.ts      # bind, resolve, createContainer
├── errors.ts       # Custom error classes
└── tests/
```

**2. Open/Closed Principle (OCP)**

- **Current Problem**: Pas de mécanisme d'extension pour le Container
- **Solution**: Préparer une interface pour les providers custom

```typescript
/**
 * Interface for custom service providers.
 */
export interface ServiceProvider<T> {
    provide(): T
    dispose?(): void | Promise<void>
}
```

**3. Liskov Substitution Principle (LSP)**

- **Current Problem**: N/A - Pas de hiérarchie de classes
- **Solution**: Les nouvelles interfaces respecteront LSP

**4. Interface Segregation Principle (ISP)**

- **Current Problem**: Le Container fait tout
- **Solution**: Séparer les responsabilités

```typescript
/**
 * Read-only container interface.
 */
export interface ContainerReader {
    get<T>(token: ServiceToken<T>): T
    has(token: ServiceToken): boolean
    readonly size: number
}

/**
 * Write-only container interface.
 */
export interface ContainerWriter {
    set<T>(token: ServiceToken<T>, instance: T): void
    delete(token: ServiceToken): boolean
    clear(): void
}

/**
 * Full container interface.
 */
export interface IContainer extends ContainerReader, ContainerWriter {}
```

**5. Dependency Inversion Principle (DIP)**

- **Current Problem**: Les décorateurs dépendent directement du container global
- **Solution**: Permettre l'injection d'un container custom

### DRY Principle (Don't Repeat Yourself)

**Current Duplication:**

- Pattern de cache key dans `@Inject` répété pour accessor et field
- Logique de résolution similaire dans `get()` et helpers

**Solution:**

- Extraire la logique de cache key
- Créer une fonction de résolution partagée

### 📝 JSDoc Documentation Standards

Tous les fichiers suivront les standards établis :

- `@fileoverview` et `@module` pour chaque fichier
- `@param`, `@returns`, `@throws`, `@example` pour chaque fonction/méthode
- `@typeParam` pour les génériques
- `@internal` pour les éléments internes

### 🔒 TypeScript Type Safety Standards

- ❌ **Éviter `any`** - Utiliser `unknown` avec type guards quand nécessaire
- ✅ **Types de retour explicites** sur toutes les fonctions publiques
- ✅ **`readonly`** pour les propriétés immuables
- ✅ **Génériques** pour le code réutilisable

## 🎨 Proposed API Design

### API publique (inchangée)

```typescript
// L'API publique reste identique
import {
    bind,
    Constructor,
    Container,
    container,
    createContainer,
    Inject,
    resolve,
    Service,
    ServiceToken,
} from '@lockness/container'

// Nouvelles interfaces exposées
import type {
    ContainerReader,
    ContainerWriter,
    IContainer,
} from '@lockness/container'
```

### Nouvelle structure interne

```typescript
// types.ts - Types fondamentaux
export type Constructor<T = unknown> = new (...args: any[]) => T
export type ServiceToken<T = unknown> = Constructor<T> | symbol | string

export interface ContainerReader {
    get<T>(token: ServiceToken<T>): T
    has(token: ServiceToken): boolean
    readonly size: number
}

export interface ContainerWriter {
    set<T>(token: ServiceToken<T>, instance: T): void
    delete(token: ServiceToken): boolean
    clear(): void
}

export interface IContainer extends ContainerReader, ContainerWriter {}
```

## 📝 Detailed Implementation Steps

### Phase 1: Créer les fichiers de base

**Step 1.1: Créer errors.ts**

File: `/packages/container/errors.ts`

````typescript
/**
 * @fileoverview Custom error classes for the container package.
 * @module @lockness/container/errors
 */

/**
 * Error thrown when a service cannot be resolved.
 *
 * @example
 * ```typescript
 * throw new ServiceNotFoundError(Symbol('ILogger'))
 * ```
 */
export class ServiceNotFoundError extends Error {
    /**
     * The token that could not be resolved.
     */
    readonly token: symbol | string

    constructor(token: symbol | string) {
        super(`Service not found for token: ${String(token)}`)
        this.name = 'ServiceNotFoundError'
        this.token = token
    }
}
````

**Step 1.2: Créer types.ts**

File: `/packages/container/types.ts`

```typescript
/**
 * @fileoverview Type definitions for the container package.
 * @module @lockness/container/types
 */

/**
 * Constructor type for instantiable classes.
 * @typeParam T - The instance type
 */
// deno-lint-ignore no-explicit-any
export type Constructor<T = unknown> = new (...args: any[]) => T

/**
 * Token type for service registration.
 * @typeParam T - The instance type
 */
export type ServiceToken<T = unknown> = Constructor<T> | symbol | string

/**
 * Read-only container interface.
 */
export interface ContainerReader {
    /**
     * Get a service instance.
     * @typeParam T - The service type
     * @param token - The service token
     */
    get<T>(token: Constructor<T> | ServiceToken<T>): T

    /**
     * Check if a service is registered.
     * @param token - The service token
     */
    has(token: ServiceToken): boolean

    /**
     * Number of registered services.
     */
    readonly size: number
}

/**
 * Write-only container interface.
 */
export interface ContainerWriter {
    /**
     * Register a service instance.
     * @typeParam T - The service type
     * @param token - The service token
     * @param instance - The instance to register
     */
    set<T>(token: Constructor<T> | ServiceToken<T>, instance: T): void

    /**
     * Remove a service.
     * @param token - The service token
     */
    delete(token: ServiceToken): boolean

    /**
     * Remove all services.
     */
    clear(): void
}

/**
 * Full container interface combining read and write operations.
 */
export interface IContainer extends ContainerReader, ContainerWriter {}
```

### Phase 2: Extraire Container et Decorators

**Step 2.1: Créer container.ts**

File: `/packages/container/container.ts`

````typescript
/**
 * @fileoverview Dependency Injection Container implementation.
 * @module @lockness/container/container
 */

import { ServiceNotFoundError } from './errors.ts'
import type { Constructor, IContainer, ServiceToken } from './types.ts'

/**
 * Dependency Injection Container.
 *
 * Manages service instances with automatic singleton creation.
 *
 * @example
 * ```ts
 * const container = new Container()
 * const userService = container.get(UserService)
 * ```
 */
export class Container implements IContainer {
    /**
     * Internal service registry.
     * @internal
     */
    private readonly services = new Map<ServiceToken, unknown>()

    /**
     * Get or create an instance of a service.
     *
     * @typeParam T - The service type
     * @param token - The class constructor or token to resolve
     * @returns The singleton instance of the service
     * @throws {ServiceNotFoundError} When token is not a constructor and not registered
     */
    get<T>(token: Constructor<T> | ServiceToken<T>): T {
        if (!this.services.has(token)) {
            if (typeof token === 'function') {
                this.services.set(token, new token())
            } else {
                throw new ServiceNotFoundError(token as symbol | string)
            }
        }
        return this.services.get(token) as T
    }

    /**
     * Manually register a service instance.
     *
     * @typeParam T - The service type
     * @param token - The token to register
     * @param instance - The instance to register
     */
    set<T>(token: Constructor<T> | ServiceToken<T>, instance: T): void {
        this.services.set(token, instance)
    }

    /**
     * Check if a service is registered.
     *
     * @param token - The token to check
     * @returns True if the service exists
     */
    has(token: ServiceToken): boolean {
        return this.services.has(token)
    }

    /**
     * Remove a service from the container.
     *
     * @param token - The service token to remove
     * @returns True if the service was removed
     */
    delete(token: ServiceToken): boolean {
        return this.services.delete(token)
    }

    /**
     * Clear all services from the container.
     */
    clear(): void {
        this.services.clear()
    }

    /**
     * Get the number of registered services.
     */
    get size(): number {
        return this.services.size
    }
}

/**
 * Global singleton container instance.
 */
export const container: Container = new Container()
````

**Step 2.2: Créer decorators.ts**

File: `/packages/container/decorators.ts`

````typescript
/**
 * @fileoverview Decorators for dependency injection.
 * @module @lockness/container/decorators
 */

import { container } from './container.ts'
import type { Constructor, ServiceToken } from './types.ts'

/**
 * Decorator to mark a class as a Service.
 *
 * @returns A class decorator
 *
 * @example
 * ```typescript
 * @Service()
 * export class UserService {}
 * ```
 */
export function Service(): <T extends Constructor>(target: T) => T {
    return function <T extends Constructor>(target: T): T {
        return target
    }
}

/**
 * Decorator to inject a service into a class property.
 *
 * @typeParam T - The service type being injected
 * @param ServiceClass - The service class or token to inject
 * @returns A decorator that handles lazy service injection
 *
 * @example
 * ```typescript
 * @Service()
 * export class UserController {
 *     @Inject(UserService)
 *     accessor userService!: UserService
 * }
 * ```
 */
// deno-lint-ignore no-explicit-any
export function Inject<T>(ServiceClass: Constructor<T> | ServiceToken<T>): any {
    return function (
        _value: ClassAccessorDecoratorTarget<unknown, T> | undefined,
        context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext,
    ): ClassAccessorDecoratorResult<unknown, T> | ((initialValue: T) => T) {
        const cacheKeyPrefix = `_${String(context.name)}_injected`

        if (context.kind === 'accessor') {
            return {
                get(this: Record<string, T>): T {
                    if (!this[cacheKeyPrefix]) {
                        this[cacheKeyPrefix] = container.get(ServiceClass) as T
                    }
                    return this[cacheKeyPrefix]
                },
                set(this: Record<string, T>, newValue: T): void {
                    this[cacheKeyPrefix] = newValue
                },
            }
        } else {
            return function (this: Record<string, T>, initialValue: T): T {
                const propertyKey = String(context.name)
                Object.defineProperty(this, propertyKey, {
                    get(): T {
                        if (!this[cacheKeyPrefix]) {
                            this[cacheKeyPrefix] = container.get(
                                ServiceClass,
                            ) as T
                        }
                        return this[cacheKeyPrefix]
                    },
                    set(newValue: T): void {
                        this[cacheKeyPrefix] = newValue
                    },
                    enumerable: true,
                    configurable: true,
                })
                return initialValue
            }
        }
    }
}
````

**Step 2.3: Créer helpers.ts**

File: `/packages/container/helpers.ts`

````typescript
/**
 * @fileoverview Helper functions for the container.
 * @module @lockness/container/helpers
 */

import { Container, container } from './container.ts'
import type { Constructor } from './types.ts'

/**
 * Create a new isolated container instance.
 *
 * @returns A new Container instance
 *
 * @example
 * ```typescript
 * const testContainer = createContainer()
 * ```
 */
export function createContainer(): Container {
    return new Container()
}

/**
 * Bind a service to the global container.
 *
 * @typeParam T - The service instance type
 * @param ServiceClass - The service class constructor
 * @param instance - Optional pre-created instance
 *
 * @example
 * ```typescript
 * bind(UserService)
 * bind(Config, new Config({ debug: true }))
 * ```
 */
export function bind<T>(ServiceClass: Constructor<T>, instance?: T): void {
    if (instance) {
        container.set(ServiceClass, instance)
    } else {
        container.get(ServiceClass)
    }
}

/**
 * Resolve a service from the global container.
 *
 * @typeParam T - The service instance type
 * @param ServiceClass - The service class to resolve
 * @returns The singleton service instance
 *
 * @example
 * ```typescript
 * const userService = resolve(UserService)
 * ```
 */
export function resolve<T>(ServiceClass: Constructor<T>): T {
    return container.get<T>(ServiceClass)
}
````

### Phase 3: Refactoriser mod.ts

**Step 3.1: Mettre à jour mod.ts**

File: `/packages/container/mod.ts`

````typescript
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

// Types
export type {
    Constructor,
    ContainerReader,
    ContainerWriter,
    IContainer,
    ServiceToken,
} from './types.ts'

// Errors
export { ServiceNotFoundError } from './errors.ts'

// Container
export { Container, container } from './container.ts'

// Decorators
export { Inject, Service } from './decorators.ts'

// Helper functions
export { bind, createContainer, resolve } from './helpers.ts'
````

## 🔄 Migration Guide

### For Existing Users

**Aucun changement breaking** - L'API publique reste identique.

**Nouvelles fonctionnalités disponibles:**

```typescript
// Nouveaux types/interfaces exposés
import type {
    ContainerReader,
    ContainerWriter,
    IContainer,
} from '@lockness/container'

// Nouvelle classe d'erreur
import { ServiceNotFoundError } from '@lockness/container'

try {
    container.get(Symbol('unknown'))
} catch (e) {
    if (e instanceof ServiceNotFoundError) {
        console.log('Token not found:', e.token)
    }
}
```

### Breaking Changes

Aucun changement breaking. L'API reste 100% compatible.

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Mettre à jour `/packages/container/README.md` avec la nouvelle
      architecture
- [ ] Ajouter section sur les nouvelles interfaces

### JSDoc

- [ ] `@fileoverview` dans tous les nouveaux fichiers
- [ ] Documentation complète de toutes les APIs publiques

## 🧪 Testing Strategy

### Unit Tests

- [ ] Tests pour `ServiceNotFoundError`
- [ ] Tests pour les interfaces `ContainerReader`/`ContainerWriter`
- [ ] Vérifier que tous les tests existants passent

### Manual Testing

```bash
# Vérifier les imports
deno check packages/container/mod.ts

# Linter
deno lint packages/container/

# Tests
deno test packages/container/tests/

# Vérifier que l'application principale compile
deno check main.ts
```

## 🔍 Quality Checks

```bash
# Type checking
deno check packages/container/mod.ts packages/container/types.ts \
    packages/container/container.ts packages/container/decorators.ts \
    packages/container/helpers.ts packages/container/errors.ts

# Linting
deno lint packages/container/

# Tests
deno test packages/container/tests/

# Format
deno fmt packages/container/
```

## ✅ Definition of Done

- [ ] Tous les fichiers créés selon l'architecture proposée
- [ ] mod.ts réexporte tout correctement
- [ ] Tests existants passent sans modification
- [ ] Nouveaux tests pour ServiceNotFoundError
- [ ] `deno check` passe sur tous les fichiers
- [ ] `deno lint` passe sans erreurs
- [ ] `deno test` passe à 100%
- [ ] Application principale (`main.ts`) compile
- [ ] README.md mis à jour

## 📁 Structure Finale

```
packages/container/
├── mod.ts              # Re-exports (point d'entrée)
├── types.ts            # Constructor, ServiceToken, interfaces
├── errors.ts           # ServiceNotFoundError
├── container.ts        # Container class + container instance
├── decorators.ts       # @Service, @Inject
├── helpers.ts          # createContainer, bind, resolve
├── deno.json           # Package config (inchangé)
├── README.md           # Documentation (à mettre à jour)
└── tests/
    └── container.test.ts
```

## 📝 Notes

- La refactorisation maintient une compatibilité à 100% avec l'API existante
- Les nouvelles interfaces (`ContainerReader`, `ContainerWriter`) préparent
  l'extensibilité future
- `ServiceNotFoundError` améliore le debugging avec le token inclus
- L'architecture permet d'ajouter facilement des scopes (transient, scoped) dans
  le futur

---

_Task created: 2026-01-21_ _Estimated completion: 2026-01-21_
