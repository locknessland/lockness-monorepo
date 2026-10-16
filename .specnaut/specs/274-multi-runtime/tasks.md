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

- [X] T003 `docs`: replace hard rule #2 in `AGENTS.md` with the text of plan §7 complexity tracking (the Q2 sentence verbatim plus disposition E's transition paragraph) and mirror it in `.specnaut/memory/constitution.md` "Hard rules". `CLAUDE.md` is a symlink: edit once. **Lands in the same change as C09's closure check**: only then is the text true of the tree — `npm:check` passes on its `engines` scope, and every remaining runtime JSR import is one of the 31 `lockness.jsr` entries the transition paragraph names. In its own commit, the live "hard-rule-2 exception" comments (22 files under `packages/`, `scripts/`, root config; generated `deno.json` copies follow `manifests`) keep their technical reason and lose the exception label. _Done 2026-10-16 with C09: rule #2 and its constitution mirror replaced; the intro line, `docs/agentic-ownership.md`, `docs/ai-assistants.md`, `docs/contribution.md`, `docs/releasing.md` and the `package-expert` brief realigned. 20 labels dropped. Left: `packages/transform/transform.ts` (rewritten by #618/#619), and the Specnaut-locked `architect-expert` and `code-reviewer` briefs, which still restate "JSR-only specifiers"._

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

- [X] T007 `build`: add `packages/<pkg>/package.json` for every package (deps, optional peers from
  `deps.policy.jsonc` `soft`, `engines` = deno only for now, exports with the `lockness-source`
  condition, `files` allowlist, `lockness` key for JSR filters and JSX options). Home: plan §5
  "Package facts".
- [X] T008 `build`: `scripts/manifests.ts` generates `packages/<pkg>/deno.json`,
  `packages/<pkg>/tsconfig.json` and the own-version module; `--check` asserts generated files are
  current, engines monotonic over static/soft/test edges, and no `npm:@lockness/*` in `deno.lock`.
  Add `manifests --check` to `scripts/gate.ts`.
- [X] T009 `build`: root `package.json` `workspaces` replaces the `deno.jsonc` `workspace` array;
  `scripts/bump.ts` (over `package.json`, then regenerate, then `deno install`) replaces
  `bump-native.ts` and the legacy bump; `core/app.ts:54` and `ui/mod.ts:36` read the own-version
  module.

### C06 · Contract ports, policy deltas and edge cuts

- [x] T010 `chore(deps)`: the policy deltas of plan §5 that P1 needs (each its own commit) and
  contract's brief. The `contract → runtime` exception moved to T021: `@lockness/runtime` does not
  exist before C12.
- [x] T011 `feat(contract)`: `CommandRegistry` and `SetupContext` (named typed exports) and the
  store-driver-name types plus the "`deno-kv` needs Deno" refusal in `packages/contract/`. Replace
  the five local `interface Cli` copies and `registerCoreCommands(cli: any)`. Closes #576, #579.
- [x] T012 `refactor`: queue commands move to `packages/queue/commands.ts` against the port (cli −
  queue); `deprecation-contracts/install.ts` → `@lockness/deprecation-contracts/setup`
  (deprecation-contracts − cli); the six driver-name lists reference the contract type.
- [x] T013 `refactor`: remove the bare `hono` alias (48 import lines in 41 files, 11 manifests) in
  favour of `@lockness/hono`.

### C07 · `@lockness/transform`

- [x] T014 [US2] `feat(transform)`: `packages/transform/transform.ts` (TS 6 `transpileModule`,
  options read from the app's `tsconfig.json`) and `register.ts` (`module.registerHooks` load hook
  for `.ts`/`.tsx` outside `node_modules`; cache `node_modules/.cache/lockness-transform`, 0700, key
  SHA-256(transformer version, options, file name, source); refuses when `APP_ENV=production`). Home:
  plan §5 "Node transform". Amended by #618 (path walk, per-entry `fstat` verification, bounded and
  owner-checked `tsconfig.json` search) and #619 (`transpileForLoad` / `transpileForBuild` over one
  private emit with the placement table, fail-closed option diagnostics, `engines.node >=24`).

### C08 · CI runtime lanes

- [x] T015 `ci`: `scripts/test_runtime.ts --runtime=deno|bun|node [--package=x]`; Bun and Node lanes
  in `.github/workflows/test.yml` selecting packages from `engines`; `.bun-version` and
  `.node-version` pins; a lane fails when a declared package ran zero tests;
  `ci_deno_pin_test.ts` covers the new pins; JSR-only test packages declared as `jsr:` devDependencies and mapped by `scripts/manifests.ts` (plan §5, disposition D), so the lanes resolve them from the frozen install; `@lockness/transform` keeps `engines.node`, proven by the Node lane in the same merge.

### C09 · npm build and `npm:check`

- [X] T016 [US3] `build`: `npm:build` = `tsc -b` (TypeScript 6.0.3 exact plus `@types/node`, both in root `devDependencies`; `manifests --check` refuses a second `typescript` version) over the project list `scripts/manifests.ts` generates with the dist list from plan §5 row 201's scope, under row 223's sandbox. Then the staging step writes each published manifest (row "Published npm manifest") and its `files` entries under the gitignored staging root. Compiler options live in root `tsconfig.base.json`, extended by every generated tsconfig. `packages/*/dist/` and the staging root are gitignored. Scope at this change: `@lockness/transform`. Tests: the generated lists equal the scope; transform's JS and `.d.ts` carry `.js` specifiers; its published manifest has no `devDependencies`, no `lockness` key and no `lockness-source` condition. Record whether Deno 2.9 reads the generated `tsconfig.json`; if the gate's `check` changes, rename the graph file rather than split the options. _Done 2026-10-16. Deno 2.9.6 does **not** apply the generated `tsconfig.json` or the extended `tsconfig.base.json` to a member that has a `deno.json`: bogus `types`, `lib: ["ES5"]` and `noUnusedLocals` placed in either left `deno check` green, so the gate's `check` did not change and no rename was needed. Measured: tsc 6.0.3 builds transform under the sandbox, `--no-prompt` included, on a TTY too; it rewrites relative `.ts` specifiers in JS but, by design, **not** in `.d.ts`; after the C09 review `architect-expert` ratified shipping declarations as tsc emits them (disposition E amendment), so staging rewrites no content and `npm:check` refuses a `.ts` specifier in packed JavaScript only. Both `npm:build` steps close remote imports (`--deny-import --cached-only` for tsc; `--allow-import=jsr.io:443 --cached-only` for staging): on Deno 2.9.6 a bare `--deny-import` held only with `--cached-only`. `deno check` does not honour `.gitignore` (fmt and lint do), so `packages/*/dist/` and `_npm/` are also in the root `deno.jsonc` `exclude`._
- [X] T017 [US3] `build`: `scripts/npm_check.ts`, a gate step after `npm:build`, over row 201's scope minus `private` packages: `npm pack` each staged directory; install all tarballs into a temp root, linking only each package's declared third-party dependencies from the frozen install (no registry, row 236); import every export on each of bun and node its `engines` names; type-check a consumer file importing every export against the packed `.d.ts`; the closure has no `@jsr/*`, no `@std/*` and no `jsr:` specifier; each scoped package's `lockness.jsr` is empty; `files` allowlist present; no `tests/`, fixtures, `.env*`, `*.key` or `.npmrc` in the listing; no published lifecycle scripts; the packed `package.json` has no `jsr:` range in any field, no `devDependencies` and no `lockness` key. A runtime a scoped package names but the machine lacks fails the step, naming its pin file; never a skip. Takes over #619's built-`dist/register.js` criterion (importing `@lockness/transform/register` from the installed tarball on Node); #619 adds no build of its own. _Done 2026-10-16: `install --frozen`, `npm:build` and `npm:check` are gate steps after `publish:check`; both CI gate jobs set up Node from `.node-version`. Each rule has an end-to-end fixture test (real `npm pack`, `tar`, `node`, `tsc`); every rule was mutated and its test went red._

### C10 · Runtime-neutral lint

- [X] T018 `build`: `scripts/lint/runtime_neutral.ts` rule `lockness-runtime/no-deno` (`Deno`
  identifier; `hono/deno`; `@lockness/hono/{deno,bun,node}` outside `packages/runtime/`), scoped to
  packages whose `engines` names bun or node, with named exempt files; `scripts/lint/deno_bound_scripts.ts` shrink-only baseline for scripts (every other non-test script under `scripts/` in scope, `lint.plugins` modules carved out) and a relative-import closure rule. _Done 2026-10-16: a Deno lint plugin registered in the root `deno.jsonc` beside its siblings, so it runs in the gate's existing `lint` step (a separate step would lint twice); `runtime_neutral_test.ts` pins the registration. Beyond the bare identifier it reports `globalThis`/`self.Deno`, the `'Deno' in` probe, and `hono/deno` under `npm:`/`jsr:` spellings; imports are matched in `import`, `export … from` and a static `import()`, type-only included. `EXEMPT_FILES` names files by exact path and is empty: `@lockness/transform`, the only package in scope, passes with no exemption. Deviation after the C10 review (`architect-expert` disposition): the first cut was an opt-in list of neutral scripts that only grew, holding `npm_check.ts`, `npm_stage.ts` and the list module. It missed `manifests.ts` (C05) and `test_runtime.ts` (C08), and its two script entries imported `manifests.ts`, whose `Deno.*` calls the per-file rule could not see. "Rewritten" in FR-016 was undefined: read broadly it took in `gate.ts`, `kit_smoke.ts` and the rest of the B4 move. Now every non-test script under `scripts/` is in scope by default, except a sorted, shrink-only baseline of the pre-epic scripts that still fail the rule (generated by running it, 31 entries) and the modules in `lint.plugins`, which are typed on `Deno.lint` and are rewritten at B4, not migrated. A test fails on a baseline entry that complies or no longer exists, so a migrated file must leave. Adding an entry is refused in review unless the script needs a Deno-only runtime API, named in the commit, as lowering `coverage-floors.json` is. Names, not counts: the target is an empty baseline. `lockness-runtime/neutral-imports` reports a relative static import, type-only included, from an in-scope script to one outside scope. `manifests.ts` moved to `node:fs/promises`, `node:path` and `node:process` (8 sites); `test_runtime.ts` needed no change (its `Deno` mentions are comments). `bump.ts` and `lockfile.ts` stay in the baseline: `lockfile.ts` runs `Deno.execPath()`, and its neutral spelling changes which `deno` refreshes the lockfile. The rules are proven on a fixture repository built per test run: 16 mutations of `no-deno`, then 9 of `neutral-imports` and the script scope and 3 of the baseline after the review, each killed._
- [X] T019 `build`: extend `exit_contract` to `process.exit`/`process.exitCode` and `env_signal` to
  `process.env.APP_ENV`, in the same commit that first migrates an owner. _Done 2026-10-16, with `packages/transform/hook.ts` as the first owner (it repeats the resolver's trim/lower-case rule because it may import nothing). `env-signal` reports a member read of `APP_ENV`/`DENO_ENV` on **any** object and either name destructured: `hook.ts` itself reads `env.APP_ENV` off a parameter, which a `process.env`-only match would miss. `process-exit` also reports `exit` imported from `node:process`; the owner lists cover both spellings. Transform calls neither `process.exit` nor `process.exitCode`. 11 mutations, each killed. After the C10 review a read-first assignment (`??=`, `||=`, `&&=`, `+=`, `++`) counts as a read (2 more mutations, killed), and the rule documents its accepted false positives (`parsed.APP_ENV` on a parsed `.env` map) and their `deno-lint-ignore` escape._

---

## P2 — Foundation and light packages join the lanes

### C11 · cli's test-harness surface on all runtimes

- [ ] T020 `refactor(cli)`: `Cli.dispatch`, `runEntry` and the command-failure path free of `Deno.*`
  so the ten packages whose tests import cli can join lanes; `cli/raw_errors.ts:79` absorbed into
  `contract/environment_read.ts`.

### C12 · `@lockness/runtime` and the Hono adapters

- [ ] T021 [US2] `feat(runtime)`: `packages/runtime/runtime.ts` (single detector),
  `process.ts` (Invocation for runtime R: no shell, JS entry under `process.execPath`, `execArgv`
  allowlist), `signals.ts`. Homes: plan §5 rows of the same names. Replace
  `packages/contract/store/deno_kv.ts`'s interim `runsOnDeno` probe with the runtime detector.
  Record the `contract → runtime` exception in `deps.policy.jsonc` (plan §5, audit A2; moved from
  T010).
- [ ] T022 [US2] `feat(runtime)`: `packages/runtime/http.ts`: serve, static files with the framework
  containment check, conninfo, WebSocket upgrade, `PortInUseError`, equal `maxPayload`/body limits;
  cross-runtime contract test (traversal cases, cross-origin upgrade refused).
- [ ] T023 [P] `feat(hono)`: `packages/hono/{bun,node}.ts`, `jsx_runtime.ts`, `jsx_dev_runtime.ts`;
  `denoServeStatic`/`getConnInfo` leave the root barrel; npm-only Node adapters (allowed by rule #2 as reworded in C03); the first sibling `references` edge in the npm scope (`runtime` → `hono`): `npm:build` builds through it and `npm:check` installs both tarballs.

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
  battery's path — and `session/tests/{driver_memo,drivers,regenerate_atomicity,regenerate_fixation,regenerate_ttl}`); the lint-exempt `deno_kv` driver files type `Deno` structurally, since `npm:build` compiles them without Deno's lib.
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
- [ ] T042 [P] `refactor`: drizzle and openapi move from `./install` to `./setup` with
  `SetupContext` (as deprecation-contracts did in C06), then the `install` branch of
  `package:install` is deleted (`InstallEntry` in `packages/cli/package_install.ts` names this
  task). Home: plan §5 "Command contribution port … and package setup port".
- [ ] T036 [P] `refactor(vite)`: the Deno resolver plugin is offered only on Deno; plugins spawn
  through `runtime/process.ts`.

### C22 · Binaries and the Node build

- [ ] T037 [US4] `feat(core)`: `packages/core/cli/compilers/{deno,bun,node}.ts` (Node refuses,
  naming the Node SEA follow-up), reached only through core's `compile` command.
- [ ] T038 [US2] `feat(cli)`: `lockness build` for Node through `transform.ts`'s `transpileForBuild`
  into `dist/` (`.ts` specifiers rewritten to `.js`, a `.map` beside each output), resolving options
  per file as the hook does and never reading the transform cache (plan §5 rows 204, 204b).

---

## P5 — Distribution

### C23 · npm publishing

- [ ] T039 [US3] `ci`: `publish.yml` gains `npm-kits` (no id-token: double build, equal pack
  integrity, `npm:check`, kits from tarballs on Node and Bun) and `publish-npm` (environment `npm`,
  steps per plan §5); both holders `needs: [gate, kits, npm-kits]`; header rewritten for two
  holders; `scripts/npm_publish.ts`; `scripts/ci_id_token_test.ts` pins both holders. `npm-kits` fails when a non-private package is outside plan §5 row 201's scope: no npm release publishes a subset, and hard rule #2's transition paragraph is gone before the first one.
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
- Monorepo tooling off Deno, at the B4 trigger (plan §5 disposition B4): empty `scripts/lint/deno_bound_scripts.ts` (31 entries at C10, `bump.ts` and `lockfile.ts` among them; `lockfile.ts` resolves `deno` from `PATH` once it is not launched by Deno); rewrite the `lint.plugins` modules for the lint that replaces Deno's; declare the scripts' bare imports (`@david/jsonc-morph`, `@std/*`) so Node resolves them.

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
