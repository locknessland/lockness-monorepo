# Technical Task: Refactor @lockness/cache Package

## 📋 Task Overview

Le fichier `packages/cache/mod.ts` contient actuellement ~700 lignes de code
regroupant tous les types, configurations, drivers, et l'API publique dans un
seul fichier monolithique.

Cette refactorisation vise à séparer les responsabilités en fichiers distincts
pour améliorer la maintenabilité, la testabilité et permettre l'extension future
du système de cache.

## 🎯 Objectives

1. **Séparation des responsabilités**: Diviser le fichier monolithique en
   modules cohérents
2. **Extensibilité**: Faciliter l'ajout de nouveaux drivers (Redis, Memcached,
   etc.)
3. **Testabilité**: Permettre de tester chaque composant isolément
4. **Maintien de la compatibilité**: Aucun breaking change sur l'API publique
5. **Documentation**: Conserver et améliorer la JSDoc existante

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/cache/mod.ts` - Réduire à un fichier d'exports publics uniquement

### New Files to Create

```
packages/cache/
├── mod.ts                      # Re-exports publics (point d'entrée)
├── types.ts                    # CacheConfig, CacheItem, CacheDriver
├── config.ts                   # Configuration globale et helpers
├── store.ts                    # CacheStore (fluent API)
├── api.ts                      # Fonctions publiques (get, set, remember, etc.)
├── drivers/
│   ├── mod.ts                  # Export des drivers
│   ├── memory_driver.ts        # MemoryCacheDriver
│   └── deno_kv_driver.ts       # DenoKvCacheDriver
└── tests/
    ├── basic.test.ts           # (existant)
    ├── features.test.ts        # (existant)
    ├── advanced.test.ts        # (existant)
    ├── memory_driver.test.ts   # Tests unitaires driver mémoire
    └── deno_kv_driver.test.ts  # Tests unitaires driver KV
```

### Documentation Files to Update

- `/packages/cache/README.md` - Documenter la nouvelle structure

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: Un seul fichier gère types, config, 2 drivers, manager,
  et API
- **Solution**: Séparer en modules distincts par responsabilité
  ```
  types.ts      → Définitions de types uniquement
  config.ts     → Gestion de la configuration
  drivers/*.ts  → Un fichier par driver
  api.ts        → Fonctions publiques
  store.ts      → Classe CacheStore
  ```

**2. Open/Closed Principle (OCP)**

- **Current Problem**: Ajouter un driver nécessite de modifier mod.ts
- **Solution**: Structure drivers/ extensible, factory pattern pour
  instanciation
  ```typescript
  // drivers/mod.ts
  export type { CacheDriver } from '../types.ts'
  export { MemoryCacheDriver } from './memory_driver.ts'
  export { DenoKvCacheDriver } from './deno_kv_driver.ts'
  // Nouveaux drivers ajoutés ici sans modifier le code existant
  ```

**3. Interface Segregation Principle (ISP)**

- **Current Problem**: CacheDriver a toutes les méthodes, même si certains
  drivers n'en supportent pas certaines
- **Solution**: Conserver l'interface unifiée mais documenter les capacités
  optionnelles

**4. Dependency Inversion Principle (DIP)**

- **Current Problem**: getDriver() crée directement les instances
- **Solution**: Factory function configurable
  ```typescript
  // config.ts
  export type DriverFactory = (config: CacheConfig) => CacheDriver

  const driverFactories: Record<string, DriverFactory> = {
      'memory': () => new MemoryCacheDriver(),
      'deno-kv': (config) => new DenoKvCacheDriver(config.kvPath),
  }

  export function registerDriver(name: string, factory: DriverFactory): void
  ```

### DRY Principle (Don't Repeat Yourself)

**Current Duplication:**

- `getCacheKey()`, `isExpired()`, `getExpiresAt()` utilisés par les 2 drivers

**Solution:**

- Créer `config.ts` avec les helpers partagés

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  mod.ts (Public API exports)            │  ← Point d'entrée unique
├─────────────────────────────────────────┤
│  api.ts + store.ts (User-facing API)    │  ← Fonctions & fluent API
├─────────────────────────────────────────┤
│  config.ts (Configuration & Helpers)    │  ← Config globale, getDriver()
├─────────────────────────────────────────┤
│  drivers/*.ts (Driver implementations)  │  ← Implémentations concrètes
├─────────────────────────────────────────┤
│  types.ts (Type definitions)            │  ← Contrats et types
└─────────────────────────────────────────┘
```

## 🎨 Proposed API Design

### API Publique (inchangée - backward compatible)

```typescript
// L'API publique reste identique
import { cache, configureCache, get, remember, set } from '@lockness/cache'

await set('key', value, 3600)
const data = await get('key')
await cache('users').set('user:1', user)
```

### Imports internes pour extension

```typescript
// Pour créer un driver custom
import { CacheConfig, CacheDriver } from '@lockness/cache/types'
import { registerDriver } from '@lockness/cache/config'

class RedisCacheDriver implements CacheDriver {
    // ...
}

registerDriver('redis', (config) => new RedisCacheDriver(config))
```

## 📝 Detailed Implementation Steps

### Phase 1: Extraction des Types

**Step 1.1: Créer types.ts**

File: `/packages/cache/types.ts`

```typescript
/**
 * @fileoverview Type definitions for the cache system.
 * @module @lockness/cache/types
 */

/**
 * Configuration options for the cache system.
 */
export interface CacheConfig {
    driver: 'memory' | 'deno-kv' | string
    ttl: number
    kvPath?: string
    prefix?: string
}

/**
 * Internal representation of a cached item.
 * @typeParam T - The type of the cached value
 * @internal
 */
export interface CacheItem<T = unknown> {
    readonly value: T
    readonly expiresAt: number | null
    readonly tags?: string[]
}

/**
 * Contract for cache driver implementations.
 */
export interface CacheDriver {
    get<T = unknown>(key: string): Promise<T | null>
    set<T = unknown>(
        key: string,
        value: T,
        ttl?: number,
        tags?: string[],
    ): Promise<void>
    has(key: string): Promise<boolean>
    forget(key: string): Promise<void>
    flush(): Promise<void>
    many<T = unknown>(keys: string[]): Promise<Record<string, T | null>>
    putMany<T = unknown>(values: Record<string, T>, ttl?: number): Promise<void>
    increment(key: string, value?: number): Promise<number>
    decrement(key: string, value?: number): Promise<number>
    forgetByTag(tag: string): Promise<void>
    flushByTag(tag: string): Promise<void>
}
```

### Phase 2: Extraction de la Configuration

**Step 2.1: Créer config.ts**

File: `/packages/cache/config.ts`

```typescript
/**
 * @fileoverview Cache configuration and driver management.
 * @module @lockness/cache/config
 */

import type { CacheConfig, CacheDriver } from './types.ts'

const defaultConfig: CacheConfig = {
    driver: 'memory',
    ttl: 3600,
    prefix: 'lockness',
}

let globalCacheConfig: CacheConfig = { ...defaultConfig }
let cacheDriver: CacheDriver | null = null

// Driver factory registry
type DriverFactory = (config: CacheConfig) => CacheDriver
const driverFactories = new Map<string, DriverFactory>()

export function configureCache(config: Partial<CacheConfig>): void {
    globalCacheConfig = { ...globalCacheConfig, ...config }
    cacheDriver = null // Reset driver on config change
}

export function getCacheConfig(): CacheConfig {
    return globalCacheConfig
}

export function registerDriver(name: string, factory: DriverFactory): void {
    driverFactories.set(name, factory)
}

export function getDriver(): CacheDriver {
    if (!cacheDriver) {
        const factory = driverFactories.get(globalCacheConfig.driver)
        if (!factory) {
            throw new Error(`Unknown cache driver: ${globalCacheConfig.driver}`)
        }
        cacheDriver = factory(globalCacheConfig)
    }
    return cacheDriver
}

export function setCacheDriver(driver: CacheDriver): void {
    cacheDriver = driver
}

// Helper functions
export function getCacheKey(key: string): string {
    const prefix = globalCacheConfig.prefix || ''
    return prefix ? `${prefix}:${key}` : key
}

export function isExpired(expiresAt: number | null): boolean {
    if (expiresAt === null) return false
    return Date.now() > expiresAt
}

export function getExpiresAt(ttl?: number): number | null {
    const seconds = ttl ?? globalCacheConfig.ttl
    if (seconds === 0) return null
    return Date.now() + seconds * 1000
}
```

### Phase 3: Extraction des Drivers

**Step 3.1: Créer drivers/memory_driver.ts**

File: `/packages/cache/drivers/memory_driver.ts`

```typescript
/**
 * @fileoverview In-memory cache driver implementation.
 * @module @lockness/cache/drivers/memory
 */

import type { CacheDriver, CacheItem } from '../types.ts'
import { getCacheKey, getExpiresAt, isExpired } from '../config.ts'

const memoryStore = new Map<string, CacheItem>()
const tagStore = new Map<string, Set<string>>()

export class MemoryCacheDriver implements CacheDriver {
    // ... implémentation existante
}
```

**Step 3.2: Créer drivers/deno_kv_driver.ts**

File: `/packages/cache/drivers/deno_kv_driver.ts`

```typescript
/**
 * @fileoverview Deno KV cache driver implementation.
 * @module @lockness/cache/drivers/deno-kv
 */

import type { CacheDriver, CacheItem } from '../types.ts'
import { getCacheKey, getExpiresAt, isExpired } from '../config.ts'

export class DenoKvCacheDriver implements CacheDriver {
    private kv: Deno.Kv | null = null
    private readonly kvPath?: string

    // ... implémentation existante
}
```

**Step 3.3: Créer drivers/mod.ts**

File: `/packages/cache/drivers/mod.ts`

```typescript
/**
 * @fileoverview Cache driver exports and registration.
 * @module @lockness/cache/drivers
 */

export { MemoryCacheDriver } from './memory_driver.ts'
export { DenoKvCacheDriver } from './deno_kv_driver.ts'

import { registerDriver } from '../config.ts'
import { MemoryCacheDriver } from './memory_driver.ts'
import { DenoKvCacheDriver } from './deno_kv_driver.ts'

// Register built-in drivers
registerDriver('memory', () => new MemoryCacheDriver())
registerDriver('deno-kv', (config) => new DenoKvCacheDriver(config.kvPath))
```

### Phase 4: Extraction de l'API

**Step 4.1: Créer api.ts**

File: `/packages/cache/api.ts`

```typescript
/**
 * @fileoverview Public cache API functions.
 * @module @lockness/cache/api
 */

import { getDriver } from './config.ts'

export function get<T = unknown>(key: string): Promise<T | null> {
    return getDriver().get<T>(key)
}

export function set<T = unknown>(
    key: string,
    value: T,
    ttl?: number,
    tags?: string[],
): Promise<void> {
    return getDriver().set(key, value, ttl, tags)
}

export async function remember<T = unknown>(
    key: string,
    callback: () => T | Promise<T>,
    ttl?: number,
    tags?: string[],
): Promise<T> {
    const cached = await get<T>(key)
    if (cached !== null) return cached

    const value = await callback()
    await set(key, value, ttl, tags)
    return value
}

// ... autres fonctions (has, forget, flush, many, etc.)
```

**Step 4.2: Créer store.ts**

File: `/packages/cache/store.ts`

```typescript
/**
 * @fileoverview Fluent cache API with tag support.
 * @module @lockness/cache/store
 */

import { flushByTag, get, remember, set } from './api.ts'
import { getDriver } from './config.ts'

export class CacheStore {
    constructor(private readonly tags: string[] = []) {}

    tag(...tags: string[]): CacheStore {
        return new CacheStore([...this.tags, ...tags])
    }

    get<T = unknown>(key: string): Promise<T | null> {
        return get<T>(key)
    }

    set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
        return set(key, value, ttl, this.tags.length ? this.tags : undefined)
    }

    // ... autres méthodes
}

export function cache(...tags: string[]): CacheStore {
    return new CacheStore(tags)
}
```

### Phase 5: Mise à jour du Point d'Entrée

**Step 5.1: Refactoriser mod.ts**

File: `/packages/cache/mod.ts`

```typescript
/**
 * @fileoverview High-performance caching system with multiple driver support.
 * @module @lockness/cache
 */

// Types
export type { CacheConfig, CacheDriver, CacheItem } from './types.ts'

// Configuration
export {
    configureCache,
    getCacheConfig,
    registerDriver,
    setCacheDriver,
} from './config.ts'

// Drivers
export { DenoKvCacheDriver, MemoryCacheDriver } from './drivers/mod.ts'

// API
export {
    add,
    decrement,
    flush,
    flushByTag,
    forever,
    forget,
    forgetByTag,
    get,
    has,
    increment,
    many,
    pull,
    put,
    putMany,
    remember,
    rememberForever,
    set,
} from './api.ts'

// Fluent API
export { cache, CacheStore } from './store.ts'

// Initialize built-in drivers
import './drivers/mod.ts'
```

## 🔄 Migration Guide

### Pour les Utilisateurs Existants

**Aucun changement requis** - L'API publique reste identique.

```typescript
// Avant et après - même code
import { cache, get, remember, set } from '@lockness/cache'
```

### Breaking Changes

**Aucun** - Cette refactorisation est 100% backward compatible.

### Nouvelles Possibilités

```typescript
// Nouveau: Enregistrer un driver custom
import { registerDriver } from '@lockness/cache'
import { RedisCacheDriver } from './my-redis-driver.ts'

registerDriver('redis', (config) => new RedisCacheDriver(config))

configureCache({ driver: 'redis' })
```

## 🧪 Testing Strategy

### Unit Tests

- [ ] `types.ts` - Pas de logique, pas de tests
- [ ] `config.ts` - Tester registerDriver, getDriver, helpers
- [ ] `drivers/memory_driver.ts` - Tests existants + isolation
- [ ] `drivers/deno_kv_driver.ts` - Tests existants + isolation
- [ ] `api.ts` - Tests avec mock driver
- [ ] `store.ts` - Tests CacheStore avec mock

### Integration Tests

- [ ] Vérifier que les tests existants passent sans modification
- [ ] Tester le flow complet avec chaque driver

## 🔍 Quality Checks

```bash
# Type check
deno check packages/cache/mod.ts

# Lint
deno lint packages/cache/

# Tests
deno test packages/cache/tests/
```

## ✅ Definition of Done

- [ ] Tous les fichiers créés selon la structure proposée
- [ ] `mod.ts` réduit à ~50 lignes (exports uniquement)
- [ ] Tous les tests existants passent sans modification
- [ ] `deno check` passe sans erreur
- [ ] `deno lint` passe sans warning
- [ ] JSDoc maintenue dans tous les nouveaux fichiers
- [ ] README.md mis à jour avec la nouvelle structure
- [ ] Aucun breaking change sur l'API publique

## 📅 Timeline

- **Start Date**: À définir
- **Estimated Completion**: 2-3 heures de travail
- **Actual Completion**: -

## 📝 Notes

- La refactorisation suit le même pattern que proposé pour `@lockness/session`
- Le registre de drivers permet l'extension future (Redis, Memcached, etc.)
- Les helpers partagés (`getCacheKey`, `isExpired`, `getExpiresAt`) restent
  internes

---

_Task created: 2026-01-21_
