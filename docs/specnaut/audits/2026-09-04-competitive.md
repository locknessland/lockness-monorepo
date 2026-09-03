# Competitive gap analysis — 2026-09-04

## Verdict

**Yes — Lockness already rivals modern fullstack frameworks across the HTTP
core, and it is ahead of most on developer experience.** On routing,
controllers, DI, middleware, sessions, caching, queues, events, validation,
OAuth, SSR/JSX, OpenAPI generation and CLI scaffolding it is at or near parity
with Laravel / AdonisJS / NestJS / Rails / Django. It is genuinely _ahead_ on a
few axes competitors leave to the community: a first-party Inertia adapter, a
shipped UI component library, a dev debug bar, auto-generated OpenAPI, and
`deno compile` to a standalone binary.

Where it is not yet at parity is the **"application patterns" layer** that turns
an HTTP framework into an application framework — the things a Laravel/Rails
developer reaches for on day two: **authorization (policies/gates), query
pagination, API resources/serializers, translation-level i18n, multi-channel
notifications, and real-time broadcasting** — plus **production hardening**
(observability/tracing, health checks, multi-replica scheduling, durable queues,
multi-database ORM). None of these is a foundational rewrite; they are additive
packages or depth work on packages that already exist. Closing the top six would
move Lockness from "rivals them on the core" to "rivals them end-to-end".

---

## On par / ahead

| Capability                               | Lockness status                                                                                           | Reference bar                              |
| :--------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :----------------------------------------- |
| Routing + class controllers + decorators | On par (`@Controller`, `@Get`, named routes, multi-mount, constrained params)                             | Nest, Adonis, Symfony                      |
| Dependency injection                     | On par / ahead — `@Service`/`@Inject`, lazy resolution, cycle detection                                   | Nest, Adonis, Symfony                      |
| Middleware                               | On par — class-based, `@ComposeMiddleware`, named registry, global stack                                  | Laravel, Adonis                            |
| Rate limiting / throttling               | **On par** — `@Throttle` + presets (`ThrottleApi/Login/Sensitive/Heavy`) + pluggable store                | Laravel, Rails rack-attack                 |
| Sessions                                 | On par / ahead — cookie/memory/Deno-KV/Redis, AES-sealed, secure-by-default (refuses empty secret)        | Laravel, Rails, Django                     |
| Cache                                    | On par — multi-driver (memory/KV/Redis), **tagging**, `remember`, `@Cached`/`@CacheInvalidate` decorators | Laravel                                    |
| Events                                   | On par — class events, dispatcher, `@Listener` discovery, async queue, `fake()` test double               | Laravel, Rails, Nest                       |
| Validation                               | On par — rules, async validators, sanitisers, `@Validate`, Zod bridge                                     | Laravel FormRequest, Adonis VineJS         |
| OAuth social auth                        | On par — Socialite-style (Google/GitHub/Discord), PKCE + state                                            | Laravel Socialite                          |
| Scheduler                                | On par (single-node) — `@Schedule`, cron, presets, retries, overlap policy                                | Laravel, Rails whenever                    |
| File storage                             | On par — local/S3/R2 + **signed URLs** (S3/R2)                                                            | Laravel, Rails ActiveStorage               |
| Mail                                     | On par (baseline) — console/SMTP/Resend drivers, fluent builder                                           | Laravel, Rails ActionMailer                |
| SSR / view layer                         | On par — native JSX, SSG, components                                                                      | Rails/Laravel + community                  |
| OpenAPI generation                       | **Ahead** — auto-generated from route metadata (first-party)                                              | Nest (on par); Laravel/Rails need packages |
| Inertia adapter                          | **Ahead** — first-party SPA adapter                                                                       | Laravel/Rails community-maintained         |
| SSE                                      | **Ahead** — first-class channels/manager                                                                  | Most need a package                        |
| UI component library                     | **Ahead** — shipped, shadcn-style, Tailwind v4                                                            | None ship one                              |
| CLI scaffolding                          | On par — `make:crud/action/controller/model/job/…`, `tinker` REPL, seeders/migrations                     | artisan, ace, rails g                      |
| Binary compilation                       | **Ahead / unique** — `deno compile` standalone binary                                                     | —                                          |
| Deprecation contracts + devtools         | **Ahead** (DX)                                                                                            | —                                          |

---

## Gaps

Effort key: **S** ≤ 2 days · **M** ~ 1 week · **L** ~ 2–4 weeks · **XL** > 1
month.

| #  | Capability                                                                                                                                                                                               | Reference ecosystems                                                                             | Why it matters                                                                                              | Effort | Priority |
| :- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :----: | :------: |
| 1  | **Authorization (policies / gates / RBAC)** — `auth` does authN only; there is no `authorize()`, no policy classes, no roles/permissions                                                                 | Laravel Gates+Policies, NestJS Guards+CASL, Rails Pundit/CanCanCan, Django perms, Symfony Voters | Every non-trivial app needs "can this user do this to this record"; today each app hand-rolls it            |   L    |  **H**   |
| 2  | **Query pagination** — a `Pagination` _UI_ component exists, but no data-layer paginator (offset/cursor + meta + links)                                                                                  | Laravel `paginate()`, Rails Kaminari, Django Paginator, Adonis                                   | Listing endpoints are universal; without a paginator every app reinvents limit/offset + total + links       |   M    |  **H**   |
| 3  | **API resources / serializers / transformers** — controllers hand-shape JSON; no resource layer                                                                                                          | Laravel API Resources, Rails AMS/jbuilder, Django REST serializers, Nest class-transformer       | Consistent, versionable API output shaping; hides model internals; pairs with OpenAPI                       |   M    |  **H**   |
| 4  | **i18n translation** — `config/i18n.ts` is locale _validation + routing_ only; no message catalogs, `t()`, or pluralization                                                                              | Laravel, Rails, Symfony, Django (all first-class)                                                | Real localization needs catalogs + interpolation + plural rules + per-request locale, not just URL prefixes |   L    |  **H**   |
| 5  | **Notifications (multi-channel)** — only `@lockness/mail`; no notification abstraction                                                                                                                   | Laravel Notifications, Rails Noticed, Adonis                                                     | One notification → mail + database + SMS + broadcast from a single class is table-stakes for SaaS           |   M    |  **H**   |
| 6  | **WebSockets + broadcasting** — SSE only; Hono WS _types_ re-exported but no handler/channel/broadcast layer                                                                                             | Laravel Reverb/Echo, Rails ActionCable, Django Channels, Adonis Transmit                         | Real-time (chat, presence, live dashboards) needs channels with auth + presence, not just server→client SSE |   L    |  **H**   |
| 7  | **HTTP testing harness** — only raw Hono `testClient`; no fluent assertions, `actingAs`, or DB assertions                                                                                                | Laravel HTTP tests, Rails integration tests, Nest+supertest, Adonis Japa                         | Ergonomic feature tests (`get().assertStatus().assertJson()`, `actingAs(user)`) drive adoption and quality  |   M    |  **M**   |
| 8  | **Multi-database ORM + model factories** — Drizzle is **PostgreSQL-only**; no faker-backed factories (`make:factory`)                                                                                    | Laravel Eloquent factories, Rails+FactoryBot, Django                                             | MySQL/SQLite support widens reach; factories are the backbone of fast, realistic tests                      |   M    |  **M**   |
| 9  | **Durable / distributed queue** — drivers are Memory + Deno-KV only; retry+delay+`onFailure` exist but no Redis driver, no persistent dead-letter store, no backoff strategy or failed-job retry command | Laravel Horizon, Rails Sidekiq, BullMQ                                                           | Production job processing needs durability, a real DLQ, and operability across replicas                     |   M    |  **M**   |
| 10 | **Distributed scheduler lock** — scheduler is in-process only; the `lock` port is declared but unimplemented, so every replica fires every task                                                          | Laravel `onOneServer`, Rails, Sidekiq-cron                                                       | Horizontal scaling silently double-runs cron jobs today                                                     |  S–M   |  **M**   |
| 11 | **Health checks / readiness / liveness** — only a stub `health_controller` in the API init kit; no check registry pinging db/cache/queue                                                                 | Laravel Pulse/health, Spring Actuator, Nest Terminus, Django                                     | K8s/Deploy platforms need `/health` + `/ready` that actually verify dependencies                            |   S    |  **M**   |
| 12 | **Observability — metrics + tracing** — structured logger + dev-only devtools exist, but no OpenTelemetry, production request tracing, or metrics export                                                 | OTel everywhere, Laravel Telescope/Pulse, Rails, Django                                          | Production debugging and SLOs need traces + metrics, not just a dev debug bar                               |   L    |  **M**   |
| 13 | **Encryption / hashing facade** — password hashing exists; session seals internally; no general `Crypt.encrypt/decrypt` or `Hash` abstraction for app data                                               | Laravel Crypt/Hash, Rails MessageEncryptor, Django signing                                       | Apps routinely need to encrypt arbitrary data / sign payloads without touching WebCrypto directly           |   S    |  **L**   |
| 14 | **Signed / temporary route URLs** — S3 signed URLs exist, but no signed _route_ URLs (tamper-proof links)                                                                                                | Laravel signed routes, Rails signed Global IDs                                                   | Email verification, unsubscribe, share links need signed URLs with expiry                                   |   S    |  **L**   |
| 15 | **Feature flags** — none                                                                                                                                                                                 | Laravel Pennant, Unleash, Flipper                                                                | Progressive rollout / A-B is increasingly expected                                                          |   M    |  **L**   |
| 16 | **Full-text search abstraction** — none                                                                                                                                                                  | Laravel Scout, Rails Searchkick                                                                  | Common but often deferred to a dedicated service                                                            |   L    |  **L**   |
| 17 | **Mail depth** — no markdown/templated mailables, queued-mail integration, or dev mail preview (Mailpit-style)                                                                                           | Laravel Mailables, Rails, Symfony Mailer                                                         | Raises mail from "baseline" to "delightful"; low urgency                                                    |  S–M   |  **L**   |

---

## Proposed backlog

Nine epics, priority-ordered. Sub-tasks use imperative titles with a one-line
rationale and a size.

### Epic 1 — Authorization layer (policies, gates, RBAC) · **H**

> Give apps a declarative way to answer "can this user do this?".

- **Add a Gate registry** with `define`, `allows`/`denies`, and `before` hooks —
  the primitive everything else builds on. _(M)_
- **Add Policy classes + auto-discovery + `make:policy`** — per-model
  authorization co-located with the model. _(M)_
- **Add `@Authorize`/`@Can` controller decorators and an `authorize()` helper**
  — enforce at the route boundary, fail closed. _(S)_
- **Add optional role/permission model + `@lockness/auth` integration** — RBAC
  on top of gates for apps that want it. _(M)_
- **Document + test the authorization flow end-to-end.** _(S)_

### Epic 2 — Data presentation: pagination + API resources · **H**

> Standardise how lists and models leave the app.

- **Add an offset + cursor paginator** returning `{ data, meta, links }`. _(M)_
- **Add a Drizzle `.paginate()` query helper** and bind it to the existing UI
  `Pagination` component. _(S)_
- **Add an API Resource / transformer base + collection wrapper +
  `make:resource`** — consistent, versionable output that feeds OpenAPI. _(M)_
- **Document resources + pagination with examples.** _(S)_

### Epic 3 — i18n / localization · **H**

> Move i18n from locale-routing to real translation.

- **Add `@lockness/i18n`: catalog loader + `t()`/`trans()` + ICU
  pluralization/interpolation.** _(L)_
- **Add a per-request locale resolver** (header/cookie/route) that bridges the
  existing locale-routing config. _(S)_
- **Add `make:lang` + a translation-key extraction command.** _(S)_

### Epic 4 — Notifications · **H**

> One notification, many channels.

- **Add `@lockness/notification`: `Notifiable` + `Notification` base + channel
  manager.** _(M)_
- **Ship mail (reuse `@lockness/mail`), database, log and broadcast channels;
  stub SMS/Slack drivers.** _(M)_
- **Add `make:notification` + queued-notification support** (reuse
  `@lockness/queue`). _(S)_

### Epic 5 — Real-time: WebSockets + broadcasting · **H**

> Bidirectional real-time, not just SSE.

- **Add a WebSocket handler abstraction over Hono `upgradeWebSocket`.** _(M)_
- **Add broadcasting channels (public/private/presence) with auth callbacks and
  a driver (memory/Redis).** _(L)_
- **Define the client wire protocol + optional client helper; wire broadcasting
  into `@lockness/events`.** _(L)_

### Epic 6 — HTTP testing harness · **M**

> Make feature tests ergonomic.

- **Add a fluent request builder + response assertions** (`assertStatus`,
  `assertJson`, `assertRedirect`) over `testClient`. _(M)_
- **Add `actingAs()` + session/cookie test helpers.** _(S)_
- **Add DB assertions (`assertDatabaseHas`) + per-test transaction rollback.**
  _(M)_

### Epic 7 — Data-layer hardening · **M**

> Widen reach and speed up tests.

- **Add MySQL + SQLite Drizzle drivers behind the `Database` service.** _(M)_
- **Add faker-backed model factories + `make:factory` + factory-aware seeders.**
  _(M)_

### Epic 8 — Production readiness · **M**

> Survive multiple replicas and expose health.

- **Add a health-check subsystem: check registry (db/cache/queue/redis) +
  `/health` and `/ready`.** _(S)_
- **Add a distributed scheduler lock driver (Redis/KV)** so cron is
  multi-replica safe — implements the existing unwired `lock` port. _(M)_
- **Add a durable queue driver (Redis) + persistent dead-letter store + backoff
  strategies + a failed-job retry command.** _(L)_

### Epic 9 — Observability + crypto helpers · **M / L**

> Debug production; encrypt/sign without WebCrypto boilerplate.

- **Add OpenTelemetry tracing + metrics export with request/response spans.**
  _(L)_
- **Add a `Crypt` encrypt/decrypt facade + a `Hash` abstraction** for arbitrary
  app data. _(S)_
- **Add signed/temporary route URLs** (generator + verify middleware) for
  verification/share links. _(S)_

### Backlog (lower priority, not epics yet)

- Feature flags package (Pennant-style). _(M)_
- Full-text search abstraction (Scout-style). _(L)_
- Mail depth: markdown mailables, queued mail, dev mail preview. _(S–M)_

---

_Method: inventory drawn from top-level `AGENTS.md` and every
`packages/*/AGENTS.md` brief (roles + public surface), depth verified by
targeted source greps (`packages/*/mod.ts`, `config/`, stubs, and CLI command
registrations). Reference bar: Laravel, AdonisJS, NestJS, Symfony, Rails,
Django, Go (gin/echo/buffalo)._
