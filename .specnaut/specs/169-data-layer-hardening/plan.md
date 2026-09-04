# Plan: Data-layer hardening — multi-DB drivers + model factories

**Branch**: `169-data-layer-hardening` | **Date**: 2026-09-04 | **Backlog item**: [#214 — Data-layer hardening: multi-DB + model factories](https://github.com/locknessland/lockness-monorepo/issues/214) (epic; children [#215](https://github.com/locknessland/lockness-monorepo/issues/215), [#216](https://github.com/locknessland/lockness-monorepo/issues/216))

**This is the epic's one planning document** — one decision table, one stop, covering both children.

---

## 1. Why this exists

Competitive gap #8. `@lockness/drizzle`'s `Database` service is **hardcoded to postgres.js** (`import postgres from 'postgres'`, `db: PostgresJsDatabase`, `connect()` builds a postgres client and no other) — an app cannot run on MySQL or SQLite. And there are **no model factories**: seeders hand-write literal rows (`insert(users).values([{email:'…'}])`), so realistic, high-volume test/seed data is impossible to produce without writing every row by hand. Laravel (Eloquent factories + faker, multi-DB), Rails (FactoryBot), and Django all ship both. The cost today: Lockness is Postgres-only, and every test that needs data writes it literally.

## 2. User scenarios

### US1 — Run on MySQL or SQLite (P1)

**Given** an app configured with a MySQL or SQLite connection
**When** it boots and the `Database` service connects
**Then** the connection succeeds through the matching Drizzle driver, and PostgreSQL apps behave exactly as before — no config change, no behaviour change.

> **MVP boundary (ratify at the stop, per architecture A-F6):** this epic delivers the **runtime connection** on all three dialects. **Schema authoring stays Postgres-shaped** — `make:model` still emits `pgTable` and `drizzle.config.ts` stays `dialect: 'postgresql'` — because per-dialect schema/migration authoring is a distinct, larger surface, deferred to the Q3 follow-up. "Run on MySQL/SQLite" here means the `Database` service connects and queries; it does not yet mean `db:generate`/`make:model` emit MySQL/SQLite schemas.

### US2 — Define and use a model factory (P1)

**Given** a developer needs 50 realistic users for a test or seeder
**When** they define a factory with faker-backed attributes and call `.count(50).create()`
**Then** 50 rows are inserted through the `Database` service, with overridable attributes, no literal row-writing.

### US3 — Scaffold a factory (P2)

**Given** a developer starting a new factory
**When** they run `nessy make:factory User`
**Then** a factory class stub is written under `./database/factories`, following the same generator pattern as `make:seeder`/`make:model`.

### US4 — Seed from factories (P2)

**Given** a seeder that needs bulk data
**When** it calls a factory's `.create()`
**Then** the seeder produces realistic data without literal rows — factory-aware seeding.

### Edge cases

- An unknown/misspelled `driver` value → fail fast at connect with a clear error naming the supported set, not a cryptic import failure.
- A driver whose client package is not installed → a clear, actionable error (which package, which dialect), not a raw module-resolution stack.
- SQLite `file:` path from config → treated as a DSN, not interpolated into SQL; no path-traversal surface beyond what the app's own config already controls.
- Factory `.make()` (no DB write) must work with no connection open — attribute generation is pure.

## 3. Requirements

- **FR-001**: The `Database` service selects its Drizzle driver by an explicit **dialect** — `postgres` (default, unchanged), `mysql`, or `sqlite` — and connects through the matching adapter. PostgreSQL is the default and its current behaviour is byte-for-byte unchanged when no dialect is set.
- **FR-001a**: `Database` becomes generic — `Database<D extends Dialect = 'postgres'>` — and `db` is typed by a conditional `DialectDatabase<D>` (`'postgres'`→`PostgresJsDatabase`, `'mysql'`→`MySql2Database`, `'sqlite'`→`LibSQLDatabase`). The **default type parameter is `postgres`**, so `container.get(Database)` and every existing `db.select()/insert()` call site stays typed exactly as today (SC-001); a non-Postgres app annotates `Database<'mysql'>`/`Database<'sqlite'>` for a typed handle. The three dialect types share **no** assignable query-builder signature, so a bare discriminated union is rejected — it would break `.select()` at all 7 in-repo repository sites and every downstream app. *(the epic's central type decision, homed per architecture A-F1 — not left in Risks)*
- **FR-002**: The dialect is resolved by **one** function inside `Database.connect`, in a fixed precedence order: explicit `DatabaseConfig.driver` **wins**; else infer from the URL scheme (`postgres://`/`postgresql://`→postgres, `mysql://`→mysql, `file:`/`libsql://`→sqlite); else default `postgres`. URL inference is that resolver's documented fallback, not a second decider — it is what lets the CLI `initDatabase` path (which today holds only the URL, not the config) reach the right dialect. *(rewritten per architecture A-F2 — removes the "two mechanisms, no precedence" contradiction)*
- **FR-002a**: The bootstrap step (`packages/core/kernel/bootstrap/steps/database.ts`) passes `DatabaseConfig.driver` into `connect` so a configured dialect is honoured on the boot path; the CLI `initDatabase` path relies on the FR-002 URL-scheme fallback. Both reach the same resolver — there is no second dialect decision. *(architecture A-F2)*
- **FR-003**: MySQL connects via `drizzle-orm/mysql2` + `mysql2`; SQLite via `drizzle-orm/libsql` + `@libsql/client`. The driver adapter + its client are **loaded on demand** — each dialect branch uses a **fixed string-literal** dynamic-import specifier (`import('drizzle-orm/mysql2')`, `import('@libsql/client')`, …), **never** a specifier composed from the dialect value — so a Postgres-only app never resolves the MySQL/SQLite client packages, and config can never steer a module load. *(specifier invariant per security S2)*
- **FR-004**: An unknown dialect, or a selected driver whose client package cannot be resolved, fails at connect with an actionable message (the supported set / the missing package + dialect) — never a raw stack. The module-resolution failure is caught **specifically** (not by the existing catch-all) so the message names the package to install and the dialect that needs it.
- **FR-004a**: `Database.connect`'s error path renders the caught error through `renderError()` from `@lockness/contract` (already a `drizzle` dependency — no new edge) before it is logged or returned in `ConnectionResult.error`, so a driver failure cannot spill a DSN's `user:password@host` into logs. All three dialect branches share this one safe error path. *(security S1)*
- **FR-005**: A `Factory<TModel>` base supports `define(attributes)`, `make(overrides?)` (pure — one attribute object, no I/O, no connection needed), `create(overrides?)` (insert via the `Database` service, return the row), and `count(n)` for batches.
- **FR-006**: The `Factory` base is **faker-agnostic** — it orchestrates make/create/count; the concrete factory (app code, from the stub) imports the chosen faker and uses it in the `define` callback. So `@lockness/drizzle` gains no faker dependency.
- **FR-007**: `make:factory <Name>` scaffolds a factory under `./database/factories`, registered alongside `make:model`/`make:seeder` in `packages/drizzle/cli_commands.ts`, from a `factory.stub` whose body imports the chosen faker and returns an explicit attribute object.
- **FR-008**: Seeders are factory-aware — a seeder can call a factory's `.create()` to bulk-insert. The `DatabaseSeeder` orchestrator and `db:seed` command are unchanged in shape.
- **FR-009**: Any `npm:` specifier (mysql2, @libsql/client, and faker if the npm option is chosen) is justified inline per hard rule #2 (JSR-unavailable + why). Every new client is declared in `packages/drizzle/deno.json` (and faker in the app's `deno.json`, not the framework's).
- **FR-010**: Every new exported symbol carries JSDoc (#7); no `any` in exported signatures (#3); bare specifiers in source, pinned in `deno.json` (#2).
- **FR-011**: `Database` exposes an **injectable driver-factory seam** — a per-dialect importer defaulting to the real dynamic imports — so a unit test can substitute a fake driver and exercise each dialect branch of `connect()` **without a live database**. This is a new seam *inside* `Database`; the existing `registerDrizzleCommands(cli, overrides)` port fakes one layer up (the CLI `DbConnection`), and never reaches `connect()`'s driver construction. *(testability seam per architecture A-F3)*

## 4. Success criteria

- **SC-001**: A Postgres app upgraded to this version connects and behaves identically with no config change (regression-proof default).
- **SC-002**: A MySQL app and a SQLite app each connect through the `Database` service — proven by a unit test that exercises each driver-selection branch via the **new FR-011 driver-factory seam inside `Database`** (a fake per-dialect importer; no live server). This is a new seam, not the existing CLI-layer `DbConnection` port.
- **SC-003**: A developer produces N realistic rows with `Factory.count(N).create()` without writing a literal row; `make()` works with no DB connection.
- **SC-004**: The full gate is green (`deno fmt && deno lint && deno check && deno task test && deno task deps:analyze && deno task agents:brief --check && deno task publish:check`).
- **SC-005**: A Postgres-only app does not resolve the mysql2 or @libsql/client packages (the on-demand load is proven — the postgres branch imports neither).
- **SC-006**: A forced connection failure on any dialect yields an error whose text carries no `user:password@host` — proven by a test that feeds a DSN with credentials and asserts the rendered/returned error is redacted (renderError path, S1).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Which SQL dialect an app runs on (the declaration) | `DatabaseConfig.driver` in `packages/core/kernel/kernel_decorators.ts` (default `postgres`) | A second dialect flag in `Database`, in `config/database.ts` |
| How the dialect is **resolved** from config+URL, in one precedence order (explicit driver > URL scheme > postgres) | `packages/drizzle/mod.ts` — one resolver used by `Database.connect` | The CLI `initDatabase` and the boot step each deciding the dialect their own way; URL inference done in two places |
| The **static type** of `Database.db` under multi-dialect | `packages/drizzle/mod.ts` — `Database<D extends Dialect = 'postgres'>` with a conditional `DialectDatabase<D>` | A bare `PostgresJsDatabase \| MySql2Database \| LibSQLDatabase` union (breaks `.select()` everywhere); a per-call cast at each site |
| How `Database.connect` builds the client + Drizzle adapter for each dialect | `packages/drizzle/mod.ts` `Database.connect` (a per-dialect branch, each dynamic-importing its driver + client via a **fixed literal specifier**) | A second place constructing a DB client; a static top-level import of all three drivers; a composed `import(\`…${driver}\`)` specifier |
| The per-dialect driver-import seam (for testing without a live DB) | `packages/drizzle/mod.ts` — an injectable importer on `Database`, defaulting to the real dynamic imports | A test reaching into `connect()` internals; asserting driver selection at the CLI port layer only |
| The connect-error redaction (no DSN in logs) | `packages/drizzle/mod.ts` `Database.connect` catch → `renderError()` from `@lockness/contract` | Each dialect branch formatting its own error; a raw `error.message` logged/returned |
| The driver client packages available | `packages/drizzle/deno.json` `imports` (postgres, mysql2, @libsql/client) | A client imported by bare specifier not declared there |
| The unknown-dialect / missing-client error | `packages/drizzle/mod.ts` `Database.connect` (one guard) | A second validation in a caller |
| Factory orchestration (`make`/`create`/`count`) | `packages/drizzle/factory.ts` (`Factory` base) | A controller/seeder hand-rolling insert loops instead of using the base |
| Which faker a factory uses | the app's factory files (via `factory.stub`) — the framework base is faker-agnostic | The `Factory` base importing faker directly (would force faker on every drizzle consumer) |
| The `make:factory` scaffold | `packages/drizzle/cli_commands.ts` (`handleMakeFactory`) + `packages/drizzle/stubs/factory.stub` | A second factory template elsewhere; adding it to `cli/commands/make/` (where make:model/seeder are NOT — they live in drizzle) |

## 6. Technical context

**Language/Version**: Deno / TypeScript; drizzle-orm pinned `npm:drizzle-orm@^0.36.3` (unchanged — a drizzle major bump is **out of scope**, see risks).
**Primary Dependencies**: `drizzle-orm/postgres-js` + `postgres` (existing); **new** `drizzle-orm/mysql2` + `npm:mysql2@^3.24.3`, `drizzle-orm/libsql` + `npm:@libsql/client@^0.18.0`; `npm:@faker-js/faker@^10` (in the generated `factory.stub` / app deno.json only — never a framework dep; Q1 resolved).
**Storage**: PostgreSQL / MySQL / SQLite via Drizzle.
**Testing**: `Deno.test`; driver construction faked via the existing `registerDrizzleCommands(cli, overrides)` seam and a fake connection — no live DB (per docs/testing.md and the current `cli_commands.test.ts`).
**Target Platform**: Deno server; `deno compile` is a supported deploy path — native-binding drivers are a portability caveat (Q2).
**Project Type**: framework library (monorepo packages).
**Performance Goals**: none specific; factory batches use a single multi-row insert where the driver supports it.
**Constraints**: strict acyclic DAG; hard rules #1–#9. npm specifiers must be justified (#2).
**Scale/Scope**: two children; `@lockness/drizzle` + `@lockness/core` (DatabaseConfig) touched.

### Domain model

- **Bounded context**: Data layer — connecting to a SQL database through a chosen dialect, and generating model rows.
- **Vocabulary**: *dialect/driver* (`postgres`|`mysql`|`sqlite`), *client* (the underlying connection lib), *adapter* (the `drizzle-orm/<x>` wrapper), *factory* (a row generator), *definition* (the attribute callback), *make* (build attributes, no I/O), *create* (persist).
- **Entities**: none new (factories build the app's existing models).
- **Value objects**: `DatabaseConfig` (gains `driver`), a factory `definition` callback, generated attribute objects.
- **Invariants**: the default dialect is `postgres` and unchanged; `make()` performs no I/O; a Postgres app resolves no other client; the `Factory` base imports no faker; **a dynamic-import specifier is always a fixed string literal, never composed from the dialect value** (security S2); **the connection URL/DSN is never built from request-derived input** anywhere in the driver-selection path (security S3).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| #1 no direct hono import | pass (N/A) | Data layer, no Hono |
| #2 JSR-only, justified npm | pass | mysql2/@libsql JSR-unavailable → justified inline; faker source is Q1 (a JSR option exists) |
| #3 no `any` in exported APIs | pass | `db` becomes a discriminated union or generic; `Factory<T>` generic; `unknown` + guards elsewhere |
| #4 Tailwind v4 | pass (N/A) | No UI |
| #5 pre-completion gate | pass | Full gate per child |
| #6 never hand-edit deno.lock | pass | New npm deps cached via `deno cache`/task, not hand-edited |
| #7 JSDoc | pass | FR-010 |
| #8 MVC layering | pass | Factory/driver are data-layer; no DB in controllers |
| #9 commit discipline | pass | One commit per child + `chore(deps)` for any deps.policy/dep additions |
| DDD (pure domain) | pass | `make()` is pure; connection is the adapter boundary |
| Domain Model gate | pass | Section 6 |

### Complexity tracking

No accepted violations. The drizzle-major-bump temptation (for `node:sqlite`) is explicitly **rejected** and recorded in risks + Q3, not taken.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/core` `DatabaseConfig` | yes | New optional `driver?: 'postgres'\|'mysql'\|'sqlite'` field (backward-compatible; absent = postgres) |
| `@lockness/drizzle` `Database` | yes | `connect()` branches by dialect (dynamic import per driver); `db` field type widens to a union; new deps declared |
| `@lockness/drizzle` CLI | yes | New `make:factory` command + `factory.stub`; `Factory` base exported |
| `@lockness/drizzle` `deno.json` | yes | `mysql2`, `@libsql/client` added |
| `deps.policy.jsonc` | no | No new **cross-package** `@lockness/*` edge (the new deps are npm, not workspace packages) |
| `@lockness/auth-provider/drizzle` | no (bounded) | Its providers type `db: PostgresJsDatabase` independently (own `drizzle-orm/postgres-js` import) — unchanged by the widening, but they therefore **stay Postgres-only**: a `Database<'mysql'>`/`Database<'sqlite'>` handle is not assignable to them. Generalising auth persistence to non-Postgres is a **follow-up**, not this epic (architecture A-F4) |
| App template (`database/seeders`, `config/database.ts`) | maybe | A factory-aware seeder example; `config/database.ts` may show the `driver` field (docs) |
| Docs | yes | Multi-DB config + factories doc |

### Documentation (this feature)

```text
.specnaut/specs/169-data-layer-hardening/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Widening `Database.db` to a union breaks existing Postgres call sites (`db.select()...`) | The union's common surface (`select`/`insert`/`update`/`delete`) is shared; type the field so Postgres callers are unaffected, or keep a Postgres-typed getter. Counted at audit; SC-001 regression-proofs the default |
| A static import of all three drivers pulls mysql2 + @libsql (native binding) into every app | FR-003 mandates **on-demand** dynamic import per dialect; SC-005 proves the postgres branch resolves neither |
| `@libsql/client` local-file mode + `better-sqlite3` need native bindings → `deno compile` portability | Recommend libsql; document the compile caveat; `@libsql/client/web` is the portable remote path (Q2 records the accepted tradeoff) |
| Drizzle major bump (for `node:sqlite`) sneaks into scope | Explicitly out of scope — pinned at ^0.36.3; node:sqlite lands in drizzle 1.0 and is a separate, large migration (Q3) |
| faker forced onto every drizzle consumer | `Factory` base is faker-agnostic (FR-006); faker is the **app's** dep, imported only by generated factory files |
| npm specifier proliferation vs hard rule #2 | Each npm dep justified inline; faker source put to the user (Q1) because a JSR option exists |
| `make:model`/drizzle-kit config stay Postgres-shaped while drivers are multi-DB | Scoped: this epic delivers the runtime `Database` driver selection; per-dialect schema authoring (model stub, drizzle.config dialect) is Q3 — deferred by default |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Verdict: **fail** — 0 critical, 2 HIGH, 2 MEDIUM, 2 LOW. Both HIGH were unhomed decisions now homed in §5.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A-F1 | **HIGH** — the static type of `Database.db` under widening was unhomed (only in Risks); a bare union breaks `db.select()` at 7 in-repo sites + every app (the 3 dialect types share no assignable builder signature) | **Plan changed.** FR-001a + a §5 row home it as `Database<D extends Dialect = 'postgres'>` with conditional `DialectDatabase<D>`; the default type param keeps Postgres callers byte-identical (SC-001); the bare union is explicitly rejected |
| A-F2 | **HIGH** — the dialect never reaches `connect()` on 2/3 call sites (`initDatabase` sees only the URL); FR-002 contradicted itself (single home vs URL inference) | **Plan changed.** FR-002 rewritten as one resolver with a fixed precedence (explicit `driver` > URL scheme > postgres); FR-002a threads config on the boot path; a §5 row homes the resolver; URL inference is the documented fallback that serves the CLI path, not a second decider |
| A-F3 | MEDIUM — SC-002 rested on a seam that doesn't exist (the CLI `DbConnection` port never reaches `connect()`'s driver construction) | **Plan changed.** FR-011 adds an injectable driver-factory seam inside `Database`; SC-002 corrected to use it; a §5 row homes it |
| A-F4 | MEDIUM — `@lockness/auth-provider/drizzle` providers require `PostgresJsDatabase`, so a multi-DB `Database` handle can't feed them on non-Postgres | **Recorded** in §8 as a bounded surface: auth-provider drizzle stays Postgres-only; generalising it is a follow-up, not this epic |
| A-F5 | LOW — `make:factory` would grow the 805-LOC `cli_commands.ts` god file | **Accepted, mitigated.** The new `handleMakeFactory` goes in its own module registered from `cli_commands.ts`, not inline; the full extraction of the existing `make:*` generators is a backlog follow-up |
| A-F6 | LOW — US1 reads broader than the shipped MVP (migrations/model authoring stay Postgres) | **Plan changed.** US1 now states the MVP boundary explicitly (runtime connection only; schema authoring deferred to Q3), to be ratified at the stop |

**Verdict**: **fail** → resolved in-plan. Covered the decision-table completeness against FR-001–FR-011, each home's correctness (Factory in drizzle confirmed; `DatabaseConfig.driver` in core confirmed; dynamic-import soundness), and a counted blast radius (7 in-repo `Database.db` sites, 2 packages allowed to import drizzle, auth-provider Postgres-typed independently). Both HIGH findings were folded into §5 as decision rows before any code — the migration-vs-edit asymmetry the plan-time audit exists to catch.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel. Verdict: **needs_followup** — 0 critical, 0 high, 1 MEDIUM, 3 LOW. No per-request attacker surface (driver/URL are operator config, factories are dev tooling).*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | MEDIUM — `connect()` logs/returns raw `error.message`; a mysql2/libsql/pg driver error can carry the DSN's `user:password@host` into logs | **Plan changed.** FR-004a routes all three dialect branches' errors through `renderError()` from `@lockness/contract` (already a dep — no new edge); SC-006 asserts a credentialled DSN failure is redacted |
| S2 | LOW — dynamic-import specifier could become a config-steered module load | **Plan changed.** FR-003 + a §6 invariant require a fixed string-literal specifier per dialect branch, never composed from the dialect value |
| S3 | LOW — SQLite `file:` DSN path-handling | **Recorded** as a §6 invariant: the connection URL/DSN is never built from request-derived input; operator-config trust level identical to today's postgres URL — no behavioural change |
| S4 | LOW (suspicion) — no `APP_ENV=production` guard on `db:seed`/`factory.create()` (operator foot-gun: faker rows into prod) | **Deferred with disposition** (Q4): documented as dev/test tooling in this epic + a backlog follow-up for the env guard, because it changes existing `db:seed` behaviour (a boundary this epic only lightly touches) |

**Verdict**: **needs_followup** → S1 folded as FR-004a + SC-006; S2/S3 as invariants; S4 dispositioned to Q4. The plan introduces no attacker-reachable surface.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — faker source.** `npm:@faker-js/faker@^10` vs `jsr:@jackfiszr/faker@^1.1.6`. Deeper research (2026-09-04) established: **no official/maintained JSR-native faker exists** — `jsr:@faker-js/faker` is a reserved-but-empty placeholder (`versionCount: 0`, not installable), `@std` has no faker, `jsr:@jackfiszr/faker` is a pre-wipe fork frozen since Dec 2024, and `@functions/mock` transitively pulls npm faker anyway; falso/chance/casual are not on JSR. | **`npm:@faker-js/faker@^10`.** The only current, first-party, maintained faker; pure-JS, Deno-supported. Hard rule #2's `npm:`-exception applies and is **justified** (the JSR option is an empty placeholder — genuinely JSR-unavailable) with an inline comment in `factory.stub`. Crucially, **faker is never a `@lockness/drizzle` dependency** — the faker-agnostic `Factory` base (FR-006) means only the generated `factory.stub` (app code) imports it and the **app** declares it in its own `deno.json`. So the exception lives in generated app code, not the framework's published surface. | 2026-09-04 |
| **Q2 — SQLite portability.** Accept `@libsql/client` with the `deno compile` caveat documented? | **Accept.** `drizzle-orm/libsql` + `@libsql/client` (best-supported SQLite path on drizzle 0.36.x); local-file mode uses a native binding — documented as a `deno compile` caveat, `@libsql/client/web` is the portable remote path. | 2026-09-04 |
| **Q3 — schema-authoring scope.** Runtime driver selection only, defer dialect-aware `make:model`/`drizzle.config`? | **Runtime only (MVP).** #215 delivers the runtime `Database` connection on all three dialects; `make:model` stays `pgTable` and `drizzle.config.ts` stays `postgresql`. Per-dialect schema/migration authoring is a **follow-up backlog item** (filed at merge). | 2026-09-04 |
| **Q4 — prod-seed guard (security S4).** Guard now, or document + follow-up? | **Document + follow-up.** Factories/seeding are documented as dev-test tooling in this epic; the `APP_ENV=production` guard on `db:seed`/`create()` is a **follow-up backlog item** (it changes existing `db:seed` behaviour). | 2026-09-04 |

### Decided without asking

- **The `Factory` base lives in `@lockness/drizzle`** (`factory.ts`) — `create()` inserts through the `Database` service, so it is data-layer; and it keeps `make:factory` beside `make:model`/`make:seeder`, which already live in `packages/drizzle/cli_commands.ts` (not `cli/commands/make/`).
- **Drivers load on demand** — a per-dialect dynamic import in `connect()`, not static top-level imports, so a Postgres app pays for neither MySQL nor SQLite (and never loads libsql's native binding).
- **Default dialect is `postgres`** and the current path is untouched when `driver` is unset — the regression floor (SC-001).
- **No live DB in unit tests** — the existing `registerDrizzleCommands` override seam + a fake connection prove each dialect branch; a live-DB integration test is out of scope (matches the current suite).
- **`make:factory` follows the drizzle `cli_commands.ts` generator pattern** (like `make:model`/`make:seeder`), writing to `./database/factories`, not the `cli/commands/make/` MakeCommand pattern — but the new `handleMakeFactory` lands in **its own module** registered from `cli_commands.ts`, not inline, to avoid growing the 805-LOC god file (architecture A-F5). The full extraction of the existing `make:*` generators is a **backlog follow-up**, not this epic.
- **`Database.db` stays Postgres-typed by default** via the `Database<D = 'postgres'>` generic (architecture A-F1) — the 7 in-repo repository call sites and every Postgres app are untouched; a bare union was rejected because the three dialect DB types share no assignable `.select()` signature.
- **The dialect resolver lives in `connect()`** with precedence explicit-`driver` > URL-scheme > postgres (architecture A-F2); the CLI `initDatabase` path reaches the right dialect via URL inference, the boot path via `config.driver` — one resolver, no second decider.
- **Child dependency order**: #215 (multi-DB drivers) → #216 (factories + make:factory + factory-aware seeders).
