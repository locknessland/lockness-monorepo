# Phase 2 : Création de @lockness/cache

## ✅ Complétée le 23 décembre 2025

### Nouvelle lib créée

```
lockness/
├── cache/         # ✨ NOUVELLE LIB
│   ├── cache.ts
│   ├── cache.test.ts
│   ├── deno.json
│   └── README.md
```

### @lockness/cache (~650 lignes)

Système de cache haute performance avec support multi-driver.

#### Fonctionnalités

**API Simple**

- `get<T>(key)` - Récupérer une valeur
- `set<T>(key, value, ttl?, tags?)` - Définir une valeur
- `remember<T>(key, callback, ttl?, tags?)` - Cache le résultat d'un callback
- `has(key)` - Vérifier l'existence
- `forget(key)` - Supprimer une clé
- `flush()` - Vider tout le cache

**Fonctionnalités avancées**

- ⏱️ **TTL (Time To Live)** - Expiration automatique
- 🏷️ **Tags** - Grouper et invalider par lot
- 🔢 **Compteurs** - `increment()`, `decrement()`
- 📦 **Batch operations** - `many()`, `putMany()`
- 🎯 **Helpers** - `add()`, `pull()`, `forever()`
- 💾 **Drivers** - Memory (défaut), Deno KV

**API Fluente avec Tags**

```typescript
const postsCache = cache('posts')
await postsCache.set('post:1', post)
await postsCache.flush() // Invalide tous les posts
```

### Configuration workspace

**deno.json** (racine)

```json
{
    "workspace": [
        "./lockness/core",
        "./lockness/cache", // ✨ Nouveau
        "./lockness/mail",
        "./lockness/queue",
        "./lockness/socialite",
        "./lockness/ace",
        "./lockness/drizzle",
        "./lockness/init"
    ],
    "imports": {
        "@lockness/cache": "./lockness/cache/cache.ts"
    }
}
```

**lockness/core/core.ts**

```typescript
// Re-export cache
export * from '@lockness/cache'
```

### Exemples d'utilisation

#### Caching basique

```typescript
import { get, remember, set } from '@lockness/cache'

// Simple set/get
await set('user:1', { name: 'John' })
const user = await get('user:1')

// Remember pattern (cache le résultat)
const users = await remember('all-users', async () => {
    return await db.query.users.findMany()
}, 3600) // Cache 1 heure
```

#### TTL et expiration

```typescript
// Cache pour 5 minutes
await set('session:abc', sessionData, 300)

// Cache permanent
await set('config', configData, 0)

// Helper forever
import { forever } from '@lockness/cache'
await forever('permanent', data)
```

#### Tags pour groupement

```typescript
import { forgetByTag, set } from '@lockness/cache'

// Taguer les entrées
await set('post:1', post1, undefined, ['posts', 'recent'])
await set('post:2', post2, undefined, ['posts'])
await set('user:1', user1, undefined, ['users'])

// Invalider tous les posts
await forgetByTag('posts')
```

#### API fluente

```typescript
import { cache } from '@lockness/cache'

const postsCache = cache('posts')

// Toutes les opérations sont automatiquement taguées
await postsCache.set('featured', featuredPosts)
await postsCache.remember('recent', async () => {
    return await db.query.posts.findMany({ limit: 10 })
}, 600)

// Invalider tout le cache posts
await postsCache.flush()
```

#### Compteurs

```typescript
import { decrement, increment } from '@lockness/cache'

// Compteur de vues
await increment('page:123:views')
await increment('page:123:views', 5) // Incrémenter de 5

// Rate limiting
const requests = await increment(`api:user:${userId}:requests`)
if (requests > 100) {
    throw new Error('Rate limit exceeded')
}
```

#### Batch operations

```typescript
import { many, putMany } from '@lockness/cache'

// Récupérer plusieurs clés
const values = await many(['user:1', 'user:2', 'user:3'])

// Définir plusieurs clés
await putMany({
    'setting:theme': 'dark',
    'setting:lang': 'en',
    'setting:notifications': true,
}, 3600)
```

### Résultats des tests

```bash
deno test lockness/cache/cache.test.ts
ok | 1 passed (26 steps) ✅

Tests:
✅ Configuration et setup
✅ get/set/has/forget/flush
✅ remember avec callbacks sync/async
✅ TTL et expiration automatique
✅ Helpers: put, forever, pull, add
✅ Batch: many, putMany
✅ Compteurs: increment, decrement
✅ Tags: forgetByTag, flushByTag
✅ API fluente avec CacheStore
✅ Objets complexes
✅ Préfixes de clés
```

### Intégration avec @lockness/core

```typescript
// Import depuis core (re-exporte cache)
import { cache, get, remember, set } from '@lockness/core'

await set('test', 'value')
console.log(await get('test')) // "value"

const result = await remember('expensive', () => 'computed')
console.log(result) // "computed"
```

Vérifié : ✅ Fonctionne

### Drivers

#### Memory Driver (défaut)

```typescript
import { configureCache } from '@lockness/cache'

configureCache({ driver: 'memory' })
```

**Avantages:**

- 🚀 Très rapide
- 🎯 Aucune dépendance externe
- ✅ Parfait pour dev/test

**Inconvénients:**

- ❌ Perdu au redémarrage
- ❌ Limité par la RAM
- ❌ Single process

#### Deno KV Driver

```typescript
configureCache({
    driver: 'deno-kv',
    kvPath: './data/cache.db',
})
```

**Avantages:**

- 💾 Persistant
- 🔒 Opérations atomiques
- 🎯 Intégré à Deno

**Inconvénients:**

- 🐌 Légèrement plus lent
- 📁 Nécessite accès fichiers

### Cas d'usage

**1. Cache de requêtes DB**

```typescript
const users = await remember('users:all', async () => {
    return await db.query.users.findMany()
}, 3600)
```

**2. Rate limiting**

```typescript
const key = `rate:${userId}:${endpoint}`
const count = await increment(key)
if (count === 1) await set(key, count, 60) // Reset après 1 min
if (count > 100) throw new Error('Too many requests')
```

**3. Session cache**

```typescript
await set(`session:${sessionId}`, sessionData, 1800) // 30 min
```

**4. Invalidation par tags**

```typescript
// Tous les posts taguées
await set('post:1', post1, undefined, ['posts'])
await set('post:2', post2, undefined, ['posts'])

// Invalider tous les posts d'un coup
await forgetByTag('posts')
```

**5. Configuration app**

```typescript
const config = await rememberForever('app:config', () => {
    return JSON.parse(Deno.readTextFileSync('config.json'))
})
```

### Architecture

```typescript
CacheDriver (interface)
├── MemoryCacheDriver
│   └── Map<string, CacheItem>
└── DenoKvCacheDriver
    └── Deno.Kv

CacheItem {
  value: T
  expiresAt: number | null
  tags?: string[]
}

Cache API (fonctions)
├── get, set, has, forget, flush
├── remember, rememberForever
├── many, putMany
├── increment, decrement
├── add, pull, put, forever
└── forgetByTag, flushByTag

CacheStore (classe fluente)
└── tag(...tags).set().get().remember().flush()
```

### Compatibilité

Tous les imports fonctionnent :

```typescript
// ✅ Import direct
import { cache } from '@lockness/cache'

// ✅ Import depuis core
import { cache } from '@lockness/core'

// ✅ Import depuis lockness
import { cache } from 'lockness'
```

### Prochaines étapes (Phase 3)

**Options pour Phase 3** :

1. `@lockness/storage` - Stockage de fichiers (Local, S3, etc.)
2. `@lockness/validator` - Validateurs custom avancés
3. Amélioration des libs existantes

### Statistiques totales

**Libs créées** : 4 nouvelles libs

- 📧 @lockness/mail (548 lignes, 7 tests)
- 🔄 @lockness/queue (510 lignes, 6 tests)
- 🔐 @lockness/socialite (453 lignes, 15 tests)
- 💾 @lockness/cache (650 lignes, 26 tests)

**Tests** : 54 tests au total ✅

**Architecture finale** :

```
@lockness/core       → Framework core
@lockness/cache      → ✨ Caching system
@lockness/mail       → Email system  
@lockness/queue      → Job queue
@lockness/socialite  → OAuth2
@lockness/ace        → CLI
@lockness/drizzle    → Database
@lockness/init       → Project init
```

Toutes les libs sont :

- ✅ Indépendantes et réutilisables
- ✅ Avec tests complets
- ✅ Avec documentation (README)
- ✅ Re-exportées depuis @lockness/core
- ✅ Backward compatible
