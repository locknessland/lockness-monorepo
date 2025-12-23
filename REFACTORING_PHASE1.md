# Phase 1 : Extraction des Libs Mail, Queue et Socialite

## ✅ Complétée le 23 décembre 2025

### Structure créée

```
lockness/
├── core/           # Framework essentials
│   ├── app.ts
│   ├── auth.ts
│   ├── session.ts
│   ├── container.ts
│   ├── decorators.ts
│   ├── validation.ts
│   └── core.ts (re-exporte mail, queue, socialite)
│
├── mail/          # ✨ NOUVELLE LIB
│   ├── mail.ts
│   ├── mail.test.ts
│   ├── deno.json
│   └── README.md
│
├── queue/         # ✨ NOUVELLE LIB
│   ├── queue.ts
│   ├── queue.test.ts
│   ├── deno.json
│   └── README.md
│
├── socialite/     # ✨ NOUVELLE LIB
│   ├── socialite.ts
│   ├── socialite.test.ts
│   ├── deno.json
│   └── README.md
│
├── ace/           # CLI déjà séparé
├── drizzle/       # DB déjà séparé
└── init/          # Init déjà séparé
```

### Modifications effectuées

#### 1. Création des nouvelles libs

**@lockness/mail** (~548 lignes)

- Drivers: SMTP, Resend, Console, Memory
- API fluente pour construire et envoyer des emails
- Tests unitaires complets (7 tests ✅)

**@lockness/queue** (~510 lignes)

- Drivers: Memory, Deno KV
- Système de jobs avec retry automatique
- Worker pour traitement en background
- Tests unitaires complets (6 tests ✅)

**@lockness/socialite** (~453 lignes)

- Providers: Google, GitHub, Discord
- OAuth2/OIDC avec CSRF protection
- Extensible pour providers custom
- Tests unitaires complets (15 tests ✅)

#### 2. Configuration workspace

**deno.json** (racine)

```json
{
    "workspace": [
        "./lockness/core",
        "./lockness/mail", // ✨ Nouveau
        "./lockness/queue", // ✨ Nouveau
        "./lockness/socialite", // ✨ Nouveau
        "./lockness/ace",
        "./lockness/drizzle",
        "./lockness/init"
    ],
    "imports": {
        "@lockness/mail": "./lockness/mail/mail.ts",
        "@lockness/queue": "./lockness/queue/queue.ts",
        "@lockness/socialite": "./lockness/socialite/socialite.ts"
    }
}
```

#### 3. Mise à jour de @lockness/core

**lockness/core/core.ts**

```typescript
// Re-exports depuis les libs séparées
export * from '@lockness/mail'
export * from '@lockness/queue'
export * from '@lockness/socialite'
```

Fichiers supprimés de core :

- ~~lockness/core/mail.ts~~
- ~~lockness/core/queue.ts~~
- ~~lockness/core/socialite.ts~~

Tests déplacés :

- ~~lockness/core/tests/mail.test.ts~~ → `lockness/mail/mail.test.ts`
- ~~lockness/core/tests/queue.test.ts~~ → `lockness/queue/queue.test.ts`
- ~~lockness/core/tests/socialite.test.ts~~ →
  `lockness/socialite/socialite.test.ts`

### Résultats

#### ✅ Tests passants

```bash
# Mail
deno test lockness/mail/mail.test.ts
ok | 1 passed (7 steps) ✅

# Queue  
deno test lockness/queue/queue.test.ts
ok | 1 passed (6 steps) ✅

# Socialite
deno test lockness/socialite/socialite.test.ts
ok | 5 passed (15 steps) ✅

# Core (sans mail/queue/socialite)
deno test lockness/core/
ok | 4 passed (23 steps) ✅
```

#### 📦 Compatibilité backward

Les imports existants continuent de fonctionner :

```typescript
// ✅ Ancien style (toujours fonctionnel)
import { mail } from 'lockness'
import { dispatch } from '@lockness/core'
import { socialite } from 'lockness'

// ✅ Nouveau style (direct)
import { mail } from '@lockness/mail'
import { dispatch } from '@lockness/queue'
import { socialite } from '@lockness/socialite'
```

### Avantages obtenus

1. **Réutilisabilité** : Les 3 libs peuvent être utilisées indépendamment de
   Lockness
2. **Versioning indépendant** : mail v2.0 sans toucher core v1.0
3. **Tests isolés** : Chaque lib a ses propres tests
4. **Documentation focalisée** : README.md dédié par lib
5. **Bundle size optimal** : Import sélectif possible
6. **Zéro breaking change** : Tous les imports existants fonctionnent

### Utilisation

#### Développement normal

```typescript
// Importer depuis @lockness/core (re-exporte tout)
import { Controller, dispatch, mail, socialite } from '@lockness/core'
```

#### Utilisation standalone

```typescript
// Utiliser une lib seule dans un autre projet
import { mail, configureMail } from '@lockness/mail'

configureMail({ driver: 'smtp', ... })

await mail()
  .to('user@example.com')
  .subject('Hello')
  .html('<h1>Hi!</h1>')
  .send()
```

### Prochaines étapes potentielles

**Phase 2** (optionnelle, si besoin futur) :

- `@lockness/cache` : Système de cache avec drivers (Memory, Redis, Deno KV)
- `@lockness/storage` : Stockage de fichiers (Local, S3, etc.)
- `@lockness/validator` : Validateurs custom au-delà de Zod

**Note** : validation.ts reste dans core car trop petit (~100 lignes) et trop
couplé aux decorators.
