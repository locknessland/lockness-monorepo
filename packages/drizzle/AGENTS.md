# `@lockness/drizzle` — agent brief

Drizzle ORM integration for PostgreSQL: the `Database` service, the `db:*` and
`make:*` commands, and the stubs they emit. Thin by design — three source files;
the ORM does the work.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Invariants

- **`install.ts` imports `@lockness/cli` at runtime, and the manifest must keep
  declaring it.** Inside the workspace a bare specifier resolves by workspace
  member _name_, so dropping the declaration still works locally and ships a
  package a JSR consumer cannot resolve —
  `TS2307: Import "@lockness/cli" not a dependency and not in import map`.
  `deno task publish:check` is what catches it.

## Dependency contract

<!-- generated:deps -->

| Direction                                 | Packages                                                                                    |
| :---------------------------------------- | :------------------------------------------------------------------------------------------ |
| Imports (static)                          | `cli`, `container`, `contract`                                                              |
| Imports (soft, loaded at runtime by name) | —                                                                                           |
| Imported by                               | `core`, `notification`                                                                      |
| **Must never import**                     | `core`, `notification` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                 |
| :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `Database`, `Factory`, `MalformedCursorError`                                                                                                                                                                                                                                                                           |
| function  | `assertNotProduction`, `decodeCursor`, `encodeCursor`, `paginate`, `registerDrizzleCommands`, `resolveDialect`                                                                                                                                                                                                          |
| interface | `CommandResult`, `CommandSpec`, `ConnectionOptions`, `ConnectionResult`, `CursorPaginateOptions`, `DbConnection`, `DecodedCursor`, `DriverHandle`, `DriverOptions`, `DrizzleCommandDeps`, `FactoryCreateOptions`, `MigrateOptions`, `MigrationSettings`, `NoticeReporter`, `OffsetPaginateOptions`, `SchemaMaintenance` |
| typeAlias | `CommandRunner`, `DatabaseSchema`, `Dialect`, `DialectDatabase`, `DriverFactory`, `KitDialect`, `MaintenanceOpener`, `MaintenanceSession`, `MigrationConfigLoader`, `SeederLoader`                                                                                                                                      |
| variable  | `ALLOW_PRODUCTION_FLAG`, `CLIENT_PACKAGE`                                                                                                                                                                                                                                                                               |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                                                     | Path                    |
| ----------------------------------------------------------- | ----------------------- |
| Service and public API                                      | `mod.ts`                |
| DSN check run before any driver factory (#425)              | `dsn.ts`                |
| What a withheld failure may show: the vetted error name     | `error_name.ts`         |
| Dialects, default driver factories, `loadClient`            | `drivers.ts`            |
| `db:*` command wiring, seams and the production guard       | `cli_commands.ts`       |
| Command-runner port and its default `Deno.Command` runner   | `command_runner.ts`     |
| Seeder-loader port and its default `importAppFile` loader   | `seeder_loader.ts`      |
| Verdict on a drizzle-kit run: exit code plus stderr (#445)  | `kit_outcome.ts`        |
| `db:fresh` reset policy: scope, planners, refusals (#435)   | `reset.ts`              |
| `db:migrate` / `db:fresh` settings from `drizzle.config.ts` | `migration_settings.ts` |
| The shared refusal (`RefusedError`), framed per command     | `refusal.ts`            |
| `make:model` / `make:seeder` / `make:factory` generators    | `generators/`           |
| Project bootstrap                                           | `install.ts`            |
| Generated file templates                                    | `stubs/`                |

## Pitfalls

- The `db:*` commands are tested hermetically through the seams of
  `registerDrizzleCommands` (command runner, connection, seeder loader, and for
  `db:migrate` and `db:fresh` the config loader and maintenance opener) — no
  real database or `drizzle-kit` process. A new command gets a seam, not a
  spawned process, in its test.
- A `db:*` failure is a thrown `CommandFailedError`, never a printed `❌` and a
  return — that exits 0 and CI reads it as success (#428). Import the class from
  `@lockness/cli/command-failure`, not the barrel: `mod.ts` re-exports these
  commands and core loads this package at boot.
- `db:migrate` and `db:fresh` never shell out to `drizzle-kit`: they run
  drizzle-orm's migrator in-process through `DriverHandle.maintenance`, from one
  settings loader (#435, #442). Do not give `db:migrate` the production guard:
  it is the deploy step. `drizzle-kit drop` deletes a migration file — never
  call it. The `drizzle-kit` the other commands run is pinned exactly at
  `DRIZZLE_KIT_SPECIFIER` (#437); the init kits and the root `deno.jsonc` must
  map the same one, and a test checks it.
- `drizzle-kit check` (behind `db:status`) validates the migrations folder only;
  it never reads the schema or the database. Do not word `db:status` as a drift
  or pending-migrations check.
- A `Database` configures once per open (#427): a second `connect()` throws
  until `close()`, and `db` throws before `connect()` and after `close()`. Tests
  that touch the container singleton (`createApp` with `database`, the default
  `db:*` connection port, `Factory.create`) reset it — `close()` then
  `container.delete(Database)` — and stub the client with `setDriverFactory()`,
  never by assigning `db`. `probe()` and `maintenance` capture the handle and
  its held DSN together before any await; reading `held` back from `this` later
  lets a racing `close()` strip the redaction (pinned by
  `tests/mutations/lifecycle_427.ts`, M12).
- A symbol reachable through an `exports` entry is public; `@internal` does not
  hide it. A helper meant to be internal goes in a module `exports` does not
  list — `command_runner.ts`, `seeder_loader.ts`, `migration_settings.ts`,
  `kit_outcome.ts` — and its tests import it by relative path (#564). A port
  type a public signature names is re-exported; its default implementation is
  not.
- It imports `@lockness/cli` at runtime (`install.ts`, `cli_commands.ts`), so it
  must not be imported from `cli` in return — that would close a cycle.
- Issue #26 proposes a Kysely sibling; it must not deprecate or reshape this
  one.

## Tests

<!-- generated:tests -->

23 test files for 23 source files:

- `packages/drizzle/tests/app_file.test.ts`
- `packages/drizzle/tests/cli_commands.test.ts`
- `packages/drizzle/tests/database.test.ts`
- `packages/drizzle/tests/dsn.test.ts`
- `packages/drizzle/tests/factory.test.ts`
- `packages/drizzle/tests/fresh_libsql.test.ts`
- `packages/drizzle/tests/fresh_mysql_live.test.ts`
- `packages/drizzle/tests/fresh_postgres_live.test.ts`
- `packages/drizzle/tests/install.test.ts`
- `packages/drizzle/tests/lifecycle.test.ts`
- `packages/drizzle/tests/maintenance.test.ts`
- `packages/drizzle/tests/make_factory.test.ts`
- `packages/drizzle/tests/make_model_dialect.test.ts`
- `packages/drizzle/tests/migrate_libsql.test.ts`
- `packages/drizzle/tests/migration_settings.test.ts`
- `packages/drizzle/tests/multi_db.test.ts`
- `packages/drizzle/tests/no_default_target.test.ts`
- `packages/drizzle/tests/notice.test.ts`
- `packages/drizzle/tests/notice_wiring.test.ts`
- `packages/drizzle/tests/paginate.test.ts`
- `packages/drizzle/tests/production_guard.test.ts`
- `packages/drizzle/tests/query_credentials.test.ts`
- `packages/drizzle/tests/reset.test.ts`

1 mutation battery — **`deno test` does not run these.** Each is an executable
that mutates a source file and re-runs the suites that should notice. Run them
with `deno task mutate` (all of them, one at a time) or
`deno task mutate <name>` (one); nightly CI runs the full sweep. See
[testing.md](../../docs/testing.md#mutation-batteries).

- `packages/drizzle/tests/mutations/lifecycle_427.ts`

<!-- /generated:tests -->

### The live-postgres harness (`tests/live_postgres.ts`)

**Not counted above as a test, and not internal.** It decides, once, whether a
suite that needs a real Postgres runs at all and which server it may touch —
every such suite is destructive. The precedent is `@lockness/redis`'s
`tests/live_broker.ts`.

| Export           | What it decides                                                                                                                 |
| :--------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| `LIVE_POSTGRES`  | Whether a gated suite runs. The **only** reader of `LOCKNESS_POSTGRES_INTEGRATION`; the root `test:postgres` task sets it.      |
| `assertLoopback` | Refuses a url unless every host postgres.js would try is a loopback host — read from postgres.js's own parse, not the url text. |
| `liveUrl()`      | `LOCKNESS_POSTGRES_URL`, passed through `assertLoopback`.                                                                       |

**Consumers outside the package** import it by relative path, so a change here
changes them too: `scripts/kit_migrations_live_test.ts`,
`scripts/kit_token_flow_live_test.ts`, `scripts/kit_push_live_test.ts` (#445)
and `scripts/remember_me_live_test.ts` (#450). Inside the package:
`tests/fresh_postgres_live.test.ts`.

### The live-mysql harness (`tests/live_mysql.ts`)

The same two decisions for a real MySQL (#446), read by
`tests/fresh_mysql_live.test.ts` only.

| Export                | What it decides                                                                                                    |
| :-------------------- | :----------------------------------------------------------------------------------------------------------------- |
| `LIVE_MYSQL`          | Whether the suite runs. The **only** reader of `LOCKNESS_MYSQL_INTEGRATION`; the root `test:mysql` task sets it.   |
| `assertMysqlLoopback` | Refuses a url unless mysql2's own parse names a loopback host and no socket path — the query string feeds options. |
| `liveMysqlUrl()`      | `LOCKNESS_MYSQL_URL`, passed through `assertMysqlLoopback`.                                                        |

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno task gate             # the full gate, as the pre-push hook runs it
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 23 test files directly —

```bash
deno test -A packages/drizzle/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
