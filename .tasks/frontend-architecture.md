# ⚛️ Frontend Architecture

**Note**: Après exploration (déc. 2024), les approches Islands/SPA/Inertia
nécessitent:

- Des outils de bundling lourds (Vite, esbuild) → contre la philosophie "full
  Deno"
- `deno bundle` qui reste expérimental et instable
- Complexité de transpilation TypeScript → JavaScript pour le client

**Décision**: Lockness reste sur du **SSR classique avec Hono JSX** pour le
moment. C'est simple, performant, et 100% Deno natif.

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

**Alternative actuelle**: Pour une SPA moderne, monter un frontend séparé
(Next.js, Remix, SvelteKit) qui consomme une API Lockness REST/GraphQL.
