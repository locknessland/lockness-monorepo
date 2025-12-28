# 📝 Lockness JS - Roadmap & TODO

## � Framework Core

- [ ] **Preserve Comments in `deno.jsonc`**
  - [ ] **Issue**: The current `scripts/bump.ts` uses `JSON.stringify`, which strips all comments from `deno.jsonc` when updating versions.
  - [ ] **Goal**: Implement a mechanism to update versions in `deno.jsonc` while preserving structure and comments.
  - [ ] **Possible Solutions**:
    - Use a dedicated CST/AST parser for JSONC (e.g., `jsonc-parser` or `deno_jsonc` if available with edit support).
    - Use a regex-based replacement strategy for specific keys (`version`, `imports`) to avoid full re-serialization.

## 🎯 Developer Experience (DX)

- [ ] **Smart Stub Generation**
  - [ ] Auto-import common dependencies in generated files (Container, Context, decorators).
  - [ ] Detect related files and suggest imports (e.g., model for repository).

## ⚛️ Frontend Architecture

**Note**: Après exploration (déc. 2024), les approches Islands/SPA/Inertia nécessitent:

- Des outils de bundling lourds (Vite, esbuild) → contre la philosophie "full Deno"
- `deno bundle` qui reste expérimental et instable
- Complexité de transpilation TypeScript → JavaScript pour le client

**Décision**: Lockness reste sur du **SSR classique avec Hono JSX** pour le moment. C'est simple, performant, et 100% Deno natif.

### Futures options possibles (quand la stack Deno sera plus mature):

- [ ] **Option 1: Islands Architecture** (quand `deno bundle` stable)
  - Revisiter quand `deno bundle` sort de l'expérimental
  - SSR + hydration partielle côté client
- [ ] **Option 2: HTMX Integration** (léger, SSR-first)
  - Helper `htmx()` pour activer HTMX sur les routes
  - Pas de bundling nécessaire, juste un CDN script
  - Parfait pour interactivité légère
- [ ] **Option 3: Alpine.js helpers** (petites interactions)
  - Composants JSX avec attributs Alpine
  - Pas de build step, juste du HTML enrichi

**Alternative actuelle**: Pour une SPA moderne, monter un frontend séparé (Next.js, Remix, SvelteKit) qui consomme une API Lockness REST/GraphQL.

## 🎁 Starter Kits

- [ ] **Official Starter Kits** (like AdonisJS)
  - [ ] `web` - Full-stack with SSR views, sessions, auth.
  - [ ] `api` - REST API with JWT auth, CORS, rate limiting.
  - [ ] `slim` - Minimal setup, no auth, no views.
  - [ ] Init command integration: `cli init --kit=api`.

---

_Last updated: 2025-12-29_
