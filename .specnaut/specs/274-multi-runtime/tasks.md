# Tasks: run Lockness on Bun and Node as well as Deno

**Input**: `.specnaut/specs/274-multi-runtime/plan.md` (the only design document)
**Backlog item**: #584 (epic)

**This epic's breakdown is its child list, in dependency order.** Each `C<NN>` below is one board
sub-issue of #584. The `T<NNN>` entries are the work inside a child; several `T` may belong to one
child. The two counters are distinct: `T<NNN>` counts tasks across the whole epic, `C<NN>` counts
sub-issues (`phases/epic-loop.md`, "The two `T` counters are not the same counter").

**Tests**: required. The constitution mandates TDD: each child writes its failing test first. A
package joins a runtime lane only when its whole suite passes there (plan §5, "Proven on runtime R").

**Decision homes** (plan §5) are named in each task that touches one. No task may spell a rule
anywhere else. Every commit runs `deno fmt` then `deno task gate`; the gate is green at every commit.

**Delivery.** Each child is delivered and merged to `main` on its own, through the board (Ready →
`/orchestrate`, or `/specnaut implement` for an L/XL child), with this plan as its binding design.
This departs from `phases/epic-loop.md`'s single branch: the plan is built to land incrementally
(lanes grow per package through `engines`; the lint scope ratchets), and one branch holding the
codemod of 4,086 tests and 359 call-site changes for months would conflict with every other change
on `main`. Precedent: the realtime epic shipped as specs 240–272, one feature each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 start an app · US2 run an existing app elsewhere · US3 install from npm ·
  US4 Deno-only features everywhere · US5 upgrade a Deno app

---

## P0 — Facts and names

### C01 · Maintainer: reserve the npm names (blocking for any npm instruction and for P5)

- [ ] T001 Maintainer action, outside the repo: create the `@lockness` npm organisation and reserve
  the unscoped `create-lockness` and `lockness` names (plan §6 P0, §11 S2). No token or account
  detail is written anywhere in the repo (hard rule #10).

### C02 · Spike: runtime and registry facts

- [X] T002 [P] Record in plan §6 the measured answers, each with version and date: tsc 6 under
  `--deny-env --deny-net --deny-run --deny-ffi --allow-read=. --allow-write=<dist>`; npm trusted
  publisher before a first version and the `environment` check; JSR's trust binding (repo only?);
  Bun ≥ 1.4 `node:test` (subtests, mock timers); `bun create @scope`; TS 7 decorator emit; `deno
  install` layout on the full repo and Bun/Node running from `deno.lock` alone; `deno publish` and
  `deno check` with a dynamic `bun:` import; #472 reproduction under `jsx: react-jsx`; `node:sqlite`
  on Bun ≥ 1.4; Bun `node:tls` honouring `rejectUnauthorized`. Probes live in the scratchpad, never
  in the repo.

---

## P1 — Foundations

### C03 · Hard rule #2 reworded

- [ ] T003 `docs`: replace hard rule #2 in `AGENTS.md` with the text accepted on 2026-10-16
  (plan §7, Q2) and mirror it in `.specnaut/memory/constitution.md` "Hard rules". `CLAUDE.md` is a
  symlink to `AGENTS.md`: edit once. **Lands in the same change as C09's closure check**, never
  before: the new text forbids `@std/*` in published runtime code, which 53 runtime files still
  import, so an earlier rewording would be a rule the tree already breaks.

### C04 · Test runner codemod: `Deno.test` → `node:test`

- [X] T004 `test`: write `scripts/codemods/node_test.ts` (AST, TS 6 API): `Deno.test` → `test`,
  `t.step` → `t.test`, `@std/testing/bdd` → `node:test`; runtime-specific tests split into
  `*.deno.test.ts` files. Home: plan §5 "Test API". _Done 2026-10-16: 507 files converted;
  no `permissions:` option was left in the tree; the escape-watcher rows stay on `Deno.test` in
  `packages/realtime/tests/{escape_watcher,apply_revocation_376}.deno.test.ts` (under `node:test`
  Deno fails the running test on any escaped rejection). The KV split moved to C18 (T030), when
  those packages join the Bun and Node lanes._
- [X] T005 Run it over `packages/*/tests/`, `tests/` and `scripts/`; hand-handle the 10 explicit
  sanitizer options. Acceptance: `deno task test` reports identical pass and step counts, test names
  byte-identical (mutation `killedBy` rows still attribute). Delete the codemod in the same commit.
- [X] T006 [P] `docs`: constitution "Testing" section and `docs/testing.md` examples → `node:test`.

### C05 · Manifests: `package.json` is the source

- [ ] T007 `build`: add `packages/<pkg>/package.json` for every package (deps, optional peers from
  `deps.policy.jsonc` `soft`, `engines` = deno only for now, exports with the `lockness-source`
  condition, `files` allowlist, `lockness` key for JSR filters and JSX options). Home: plan §5
  "Package facts".
- [ ] T008 `build`: `scripts/manifests.ts` generates `packages/<pkg>/deno.json`,
  `packages/<pkg>/tsconfig.json` and the own-version module; `--check` asserts generated files are
  current, engines monotonic over static/soft/test edges, and no `npm:@lockness/*` in `deno.lock`.
  Add `manifests --check` to `scripts/gate.ts`.
- [ ] T009 `build`: root `package.json` `workspaces` replaces the `deno.jsonc` `workspace` array;
  `scripts/bump.ts` (over `package.json`, then regenerate, then `deno install`) replaces
  `bump-native.ts` and the legacy bump; `core/app.ts:54` and `ui/mod.ts:36` read the own-version
  module.

### C06 · Contract ports, policy deltas and edge cuts

- [ ] T010 `chore(deps)`: the policy deltas of plan §5 that P1 needs (each its own commit), incl.
  the recorded `contract → runtime` exception and contract's brief.
- [ ] T011 `feat(contract)`: `CommandRegistry` and `SetupContext` (named typed exports) and the
  store-driver-name types plus the "`deno-kv` needs Deno" refusal in `packages/contract/`. Replace
  the five local `interface Cli` copies and `registerCoreCommands(cli: any)`. Closes #576, #579.
- [ ] T012 `refactor`: queue commands move to `packages/queue/commands.ts` against the port (cli −
  queue); `deprecation-contracts/install.ts` → `@lockness/deprecation-contracts/setup`
  (deprecation-contracts − cli); the six driver-name lists reference the contract type.
- [ ] T013 `refactor`: remove the bare `hono` alias (48 import lines in 41 files, 11 manifests) in
  favour of `@lockness/hono`.

### C07 · `@lockness/transform`

- [ ] T014 [US2] `feat(transform)`: `packages/transform/transform.ts` (TS 6 `transpileModule`,
  options read from the app's `tsconfig.json`) and `register.ts` (`module.registerHooks` load hook
  for `.ts`/`.tsx` outside `node_modules`; cache `node_modules/.cache/lockness-transform`, 0700, key
  SHA-256(transformer version, options, source); refuses when `APP_ENV=production`). Home: plan §5
  "Node transform".

### C08 · CI runtime lanes

- [ ] T015 `ci`: `scripts/test_runtime.ts --runtime=deno|bun|node [--package=x]`; Bun and Node lanes
  in `.github/workflows/test.yml` selecting packages from `engines`; `.bun-version` and
  `.node-version` pins; a lane fails when a declared package ran zero tests;
  `ci_deno_pin_test.ts` covers the new pins.

### C09 · npm build and `npm:check`

- [ ] T016 [US3] `build`: `tsc -b` with TypeScript 6.0.x pinned in `deno.lock`; root task
  `npm:build` with the sandbox flags (plan §5 "Build command and its sandbox").
- [ ] T017 [US3] `build`: `scripts/npm_check.ts` (gate step): pack, install offline, import every
  export on Node and Bun; closure has no `@jsr/*` and no `@std/*` in runtime code; `files` allowlist;
  no `tests/`, fixtures, `.env*`, `*.key`, `.npmrc` in the listing; no published lifecycle scripts.

### C10 · Runtime-neutral lint

- [ ] T018 `build`: `scripts/lint/runtime_neutral.ts` rule `lockness-runtime/no-deno` (`Deno`
  identifier; `hono/deno`; `@lockness/hono/{deno,bun,node}` outside `packages/runtime/`), scoped to
  packages whose `engines` names bun or node, with named exempt files; `scripts/lint/runtime_neutral_scripts.ts`
  ratchet for scripts.
- [ ] T019 `build`: extend `exit_contract` to `process.exit`/`process.exitCode` and `env_signal` to
  `process.env.APP_ENV`, in the same commit that first migrates an owner.

---

## P2 — Foundation and light packages join the lanes

### C11 · cli's test-harness surface on all runtimes

- [ ] T020 `refactor(cli)`: `Cli.dispatch`, `runEntry` and the command-failure path free of `Deno.*`
  so the ten packages whose tests import cli can join lanes; `cli/raw_errors.ts:79` absorbed into
  `contract/environment_read.ts`.

### C12 · `@lockness/runtime` and the Hono adapters

- [ ] T021 [US2] `feat(runtime)`: `packages/runtime/runtime.ts` (single detector),
  `process.ts` (Invocation for runtime R: no shell, JS entry under `process.execPath`, `execArgv`
  allowlist), `signals.ts`. Homes: plan §5 rows of the same names.
- [ ] T022 [US2] `feat(runtime)`: `packages/runtime/http.ts`: serve, static files with the framework
  containment check, conninfo, WebSocket upgrade, `PortInUseError`, equal `maxPayload`/body limits;
  cross-runtime contract test (traversal cases, cross-origin upgrade refused).
- [ ] T023 [P] `feat(hono)`: `packages/hono/{bun,node}.ts`, `jsx_runtime.ts`, `jsx_dev_runtime.ts`;
  `denoServeStatic`/`getConnInfo` leave the root barrel; npm-only Node adapters with the rule-#2
  justification.

### C13 · Foundation packages on all lanes

- [ ] T024 `refactor`: contract (`environment_read.ts`, missing-module classifier duck-typed,
  `fs/list_files.ts`, generator without `deno fmt` — closes #582), container, crypto, events,
  scheduler, deprecation-contracts: no `Deno.*`, no `@std/*` in runtime code; `engines` + bun + node.
  Generated-file byte-identity test (FR-015).

### C14 · Agnostic and light packages on all lanes

- [ ] T025 [P] auth, auth-provider, inertia, markdown (replace `@libs/markdown`'s JSR-only
  resolution), socialite, sse, telemetry, validator, logger, features, search, mail (SMTP over
  `node:net`), notification, storage, i18n, openapi, ui (installer; registry generator sorted, no
  `deno fmt`): no `Deno.*`, no `@std/*` in runtime code; four optional-module classifiers replaced;
  `engines` + bun + node.

---

## P3 — Heavy runtime packages (milestone M1)

### C15 · Core boot path

- [ ] T026 [US2] `refactor(core)`: `core/http/server.ts` on `runtime/http.ts` (async `listen`,
  `forceReleasePort` config), `core/kernel/signals.ts` on `runtime/signals.ts`, discovery on
  `listFiles`, static serving via runtime; JSX runtime re-exported from `@lockness/hono` subpaths.
  **M1**: the slim kit boots from workspace source on Bun and Node.

### C16 · Redis transport on `node:net` / `node:tls`

- [ ] T027 [P] `refactor(redis)`: `RespSocket` port in `resp.ts` (bounds before append, pause over
  limit), `socket.ts`, single `#dial` with `rejectUnauthorized: true`, `servername`, `host`;
  `.unref()` timers; mutation batteries re-anchored and proven live; live TLS tests (self-signed,
  wrong name) on every lane.

### C17 · `@lockness/sqlite` and the SQLite drivers

- [ ] T028 [US4] `feat(sqlite)`: `binding.ts` (`node:sqlite` on every runtime, per plan F10),
  `connection.ts` (WAL, short busy_timeout, 0600 files, project-local default path), `kv_store.ts`
  (expiry on read, `setIfAbsent`, `deleteIfOwner`, `deletePrefix`, injective length-prefixed key
  encoding, range scans, bound parameters).
- [ ] T029 [US4] `feat`: SQLite drivers for cache, session, the revocation store, the scheduler lock
  and queue (`queue/drivers/sqlite.ts`, `UPDATE … RETURNING`); configurable revocation backend with a
  redis adapter and a production single-host warning (`session/drivers/registry.ts`); `deno-kv`
  drivers kept, loaded lazily, refused off Deno via the contract refusal.

### C18 · cache, queue, session, realtime, devtools on all lanes; JSX switch

- [ ] T030 `refactor`: the five packages free of `Deno.*` (realtime and devtools on
  `runtime/http.ts`); `engines` + bun + node. Split the tests that exercise `deno_kv` drivers or
  stub `Deno.openKv` into `*.deno.test.ts` (`cache/tests/shutdown`, `core/tests/scheduler_locks`,
  `queue/tests/{dlq_retention,shutdown}`, `realtime/tests/authorize_result_357` — update its
  battery's path — and `session/tests/{driver_memo,drivers,regenerate_atomicity,regenerate_fixation,regenerate_ttl}`).
- [ ] T031 `refactor`: `jsx: react-jsx` in every config and kit stub, provided C02's #472
  reproduction passed; retire the `deps.policy.jsonc` `jsx` key only then. Measure the web kit's
  render cost on Deno before/after and record it in plan §9.

---

## P4 — Toolchain

### C19 · cli Toolchain, ProjectManifest, launcher, static registration

- [ ] T032 [US1] `feat(cli)`: `packages/cli/manifest/` (selection rule, `deno_json`, `package_json`,
  one JSONC parser), `packages/cli/toolchain/toolchain.ts` (package-manager table asking
  `runtime/process.ts`), generated one-line `./nessy` and `nessy.cmd`; `config/packages.ts` static
  registration replacing `lockness.packages` and name-prefix discovery; `package:install`'s one
  dynamic import recorded in `runtimeImports`.

### C20 · `@lockness/create` and per-runtime kits

- [ ] T033 [US1] `feat(create)`: rename `@lockness/init` → `@lockness/create`;
  `packages/create/runtime_choice.ts`; kit manifests generated from one dependency list per kit
  (closes #531); per-runtime Dockerfiles (Node `--permission`, Deno narrow write, Bun documented);
  `kits:smoke --runtime` on local tarballs; kits default to `isProduction ? 'sqlite' : 'memory'`.

### C21 · upgrade, drizzle, vite

- [ ] T034 [US5] `feat(upgrade)`: both manifests through ProjectManifest; codemod
  `lockness.packages` → `config/packages.ts`.
- [ ] T035 [P] `refactor(drizzle)`: drizzle-kit through `runtime/process.ts` npm-bin invocation, pin
  moved into the app manifest via ProjectManifest.
- [ ] T036 [P] `refactor(vite)`: the Deno resolver plugin is offered only on Deno; plugins spawn
  through `runtime/process.ts`.

### C22 · Binaries and the Node build

- [ ] T037 [US4] `feat(core)`: `packages/core/cli/compilers/{deno,bun,node}.ts` (Node refuses,
  naming the Node SEA follow-up), reached only through core's `compile` command.
- [ ] T038 [US2] `feat(cli)`: `lockness build` for Node reusing `transform.ts`'s emit into `dist/`.

---

## P5 — Distribution

### C23 · npm publishing

- [ ] T039 [US3] `ci`: `publish.yml` gains `npm-kits` (no id-token: double build, equal pack
  integrity, `npm:check`, kits from tarballs on Node and Bun) and `publish-npm` (environment `npm`,
  steps per plan §5); both holders `needs: [gate, kits, npm-kits]`; header rewritten for two
  holders; `scripts/npm_publish.ts`; `scripts/ci_id_token_test.ts` pins both holders.
- [ ] T040 [US3] `ci`: `scripts/registry_parity.ts`; `/ship` step 5 boots the api kit from real npm
  on Node and Bun and runs registry parity. Trusted publishers configured by the maintainer (C01,
  C02).

### C24 · Docs and release notes

- [ ] T041 [US5] `docs`: per-runtime getting started, deployment (no Deno Deploy), testing; every
  text plan §8 lists as made wrong; release notes: breaking changes, KV data and queue draining,
  sandbox loss on Bun/Node, multi-instance revocation on redis.

---

## Follow-ups (not children of this epic)

- Node single-file binaries (Node SEA), gated on SEA's stability (Q3).
- TypeScript 7 for the build and the transform, gated on a JS API and verified decorator emit.
- Monorepo tooling off Deno, at the B4 trigger (plan §5 disposition B4).

## Dependencies

```text
C01 ─────────────────────────────────────────────────────────────┐
C02 ──▶ C07, C09, C17, C18(T031), C23                            │
C05, C09 ─▶ C03 (same change as C09's closure check)             │
C04 ─▶ C08                                                       │
C05 ─▶ C06 ─▶ C08 ─▶ C09 ─▶ C10                                  │
C10 ─▶ C11 ─▶ C12 ─▶ C13 ─▶ C14                                  │
C13 ─▶ C15 (M1) ; C12 ─▶ C16 ; C12 ─▶ C17 ─▶ C18                 │
C15, C18 ─▶ C19 ─▶ C20 ─▶ C21, C22                               │
C20, C21, C22 ─▶ C23 ◀───────────────────────────────────────────┘
C23 ─▶ C24
```

Parallel opportunities: C01, C02, C04 and C05 start together; C16 runs beside C13–C15; within C14 each package is
independent; C21's three parts are independent.

## Implementation strategy

MVP is **M1** (C15): a Lockness app boots from source on Bun and Node. Everything before it is the
minimum that makes that boot provable on lanes; everything after makes it installable (P4) and
publishable (P5). Deno keeps working at every merge.
