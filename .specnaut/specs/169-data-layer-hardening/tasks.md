# Tasks: Data-layer hardening — multi-DB drivers + model factories (epic #214)

**Plan**: [plan.md](./plan.md) | **Branch**: `169-data-layer-hardening` | **Epic**: #214

**Epic loop unit = one child = one commit.** Two children in dependency order; their commit scope
position carries `T01`/`T02`. The `T00N` IDs inside each child are the internal TDD decomposition and
produce **one** commit per child (see `phases/epic-loop.md`). A trailing `docs(...)` commit (no
T-ordinal, like the chore commits) carries the multi-DB + factories doc, since the epic has no docs
child.

TDD mandatory. Each child ends on the fast gate; full gate + review at the end of `implement`.
Decision-table homes (plan §5) are binding. **MVP boundary (Q3): runtime connection only — no
per-dialect schema authoring.** Local-first: nothing pushed to origin.

---

## Child T01 — #215 MySQL + SQLite drivers behind the Database service

**Goal**: `Database` connects on `postgres` (default, unchanged), `mysql`, `sqlite`, selected by one
resolver, drivers loaded on demand, errors redacted. PostgreSQL byte-for-byte unchanged (SC-001).
**Independent test**: each dialect branch exercised via the FR-011 driver-factory seam (fake importer,
no live DB); SC-001 default, SC-005 no-resolve, SC-006 redaction.

- [ ] T001 [US1] Write failing tests in `packages/drizzle/tests/multi_db.test.ts`: the dialect resolver (explicit `driver` > URL scheme > postgres) picks the right dialect for `postgres://`/`mysql://`/`file:`/explicit override; `connect()` on each dialect calls the matching (faked) driver factory; an unknown dialect and a missing-client both throw the actionable FR-004 message; SC-006 — a credentialled DSN failure returns a `renderError`-redacted message (no `user:password@host`); SC-001 — default (no driver) still constructs the postgres path.
- [ ] T002 [US1] Add `driver?: 'postgres' | 'mysql' | 'sqlite'` to `DatabaseConfig` in `packages/core/kernel/kernel_decorators.ts` (optional, JSDoc, backward-compatible; absent = postgres). Regenerate core reexport baseline if the surface changes.
- [ ] T003 [US1] In `packages/drizzle/mod.ts`: `Dialect` type + `DialectDatabase<D>` conditional type; make `Database<D extends Dialect = 'postgres'>` with `db: DialectDatabase<D>`; a `resolveDialect(config?, url)` resolver (single home, precedence per FR-002); an injectable per-dialect driver-factory seam (default = real dynamic imports with **fixed-literal** specifiers `import('drizzle-orm/postgres-js')`/`import('drizzle-orm/mysql2')`+`import('mysql2')`/`import('drizzle-orm/libsql')`+`import('@libsql/client')`); `connect()` branches by dialect; the catch renders via `renderError()` from `@lockness/contract`; a specific missing-client error (FR-004).
- [ ] T004 [US1] Add `mysql2` + `@libsql/client` to `packages/drizzle/deno.json` imports (pinned). No deps.policy change (npm, not a workspace edge). `deno cache` to update the lockfile (never hand-edit).
- [ ] T005 [US1] Update `packages/core/kernel/bootstrap/steps/database.ts` to pass `config.driver` into `connect` (FR-002a); confirm the CLI `initDatabase` path resolves via URL inference.
- [ ] T006 [US1] Fast gate; commit `feat(T01): MySQL + SQLite drivers behind the Database service (#215)` + `Epic: #214`.

## Child T02 — #216 faker model factories + make:factory + factory-aware seeders

**Goal**: a faker-agnostic `Factory<TModel>` base, a `make:factory` generator (own module, not growing
the god file), a `factory.stub` importing `npm:@faker-js/faker@^10` (justified), and factory-aware
seeding.
**Independent test**: `make()` pure (no DB, no connection); `create()`/`count()` insert via a faked
`Database`; `make:factory` scaffolds + registers; the stub names explicit attributes and imports faker.

- [ ] T007 [US2] Write failing tests in `packages/drizzle/tests/factory.test.ts`: `Factory.define(cb)` + `make(overrides?)` returns one attribute object with **no I/O / no connection**; `count(n).make()` returns n; `create(overrides?)` inserts via a faked `Database` and returns the row; `count(n).create()` bulk-inserts. The `Factory` base imports **no** faker (assert by construction — the definition callback supplies values).
- [ ] T008 [US2] Create `packages/drizzle/factory.ts`: faker-agnostic `Factory<TModel>` (`define`, `make`, `create`, `count`); `create` resolves `Database` from the container and inserts. Export from `mod.ts`. No `any`; JSDoc.
- [ ] T009 [US3] Write failing test in `packages/drizzle/tests/make_factory.test.ts`: `make:factory User` renders a factory to `./database/factories/user_factory.ts`; the command is registered; the stub imports faker and names explicit attributes (no `{...model}`).
- [ ] T010 [US3] Create `packages/drizzle/generators/factory_generator.ts` (`handleMakeFactory`, its OWN module to avoid growing the 805-LOC `cli_commands.ts` — architecture A-F5) + `packages/drizzle/stubs/factory.stub` (imports `npm:@faker-js/faker@^10` with a hard-rule-#2 justification comment; explicit attribute object). Register `make:factory` from `cli_commands.ts`.
- [ ] T011 [US4] Factory-aware seeding: update `packages/drizzle/stubs/seeder.stub` to show a factory-backed `create()` example (commented, opt-in); confirm the `DatabaseSeeder`/`db:seed` shape is unchanged. Document factories/seeding as **dev-test tooling** (security S4 disposition).
- [ ] T012 [US2] Fast gate; commit `feat(T02): faker model factories + make:factory + factory-aware seeders (#216)` + `Epic: #214`.

## Trailing docs (non-child)

- [ ] T013 Write `docs/multi-db-and-factories.md` (or extend an existing drizzle doc): configuring `driver`, per-dialect connection, the `deno compile` libsql caveat (Q2), factories + `make:factory`, factory-aware seeders, and the dev-test-tooling note (S4). Add to the doc index. Commit `docs(#214): document multi-DB drivers + model factories` + `Epic: #214` (no T-ordinal — not a child).

---

## Dependencies

```
T01 (#215 drivers) ──▶ T02 (#216 factories) ──▶ docs
```

- T01 first: the `Database<D>` generic + resolver land before factories build on `Database`.
- T02 depends on T01 only for a stable `Database` surface; factories themselves are dialect-agnostic (insert via `db`).

## Implementation strategy

**MVP = T01** (multi-DB runtime connection, the #215 AC). T02 (factories) completes the epic. Both
children ship in this branch; children close at the epic merge. Per-dialect schema authoring (Q3),
the prod-seed guard (Q4), auth-provider multi-DB (A-F4), and the `make:*` generator extraction (A-F5)
are follow-up backlog items filed at merge — not this epic.
