# Plan: Run Lockness on Bun and Node as well as Deno

**Branch**: `274-multi-runtime` | **Date**: 2026-10-16 | **Backlog item**:
[#584 — Run Lockness on Bun and Node as well as Deno](https://github.com/locknessland/lockness-monorepo/issues/584)

**This is the feature's one planning document.** It is an epic: one plan, one decision table, one
stop, for every sub-issue it will be split into (`phases/epic-loop.md`). The design was discovered
in a brainstorm with the maintainer on 2026-10-16. Engineering choices were decided by
`architect-expert` dispositions on the same date — **A** (runtime layer and packages), **B**
(toolchain and distribution), **C** (where the npm bytes are built, from security finding S1), **D** (how JSR-only test dependencies reach the Bun and Node lanes, from the C08 lane), **E** (npm build/check scope and rule #2 staging, before C09) —
measured on Deno 2.9.6, Bun 1.3.3 and Node 24.22, then amended by the two plan audits (§10, §11).

---

## 1. Why this exists

On 2026-10-09 the Deno team joined Cloudflare ([Deno](https://deno.com/blog/cloudflare),
[Cloudflare](https://blog.cloudflare.com/deno-joins-cloudflare/)). The Deno runtime gets one more
year of fix-only releases and then its original team stops developing it, around October 2027. Deno
Deploy closes six months after the announcement, around April 2027. No foundation or successor
maintainer is named for the runtime, and JSR's future governance is not addressed.

Lockness runs on Deno only. An application built on it today is tied to a runtime with a stated end
of development, and the framework is invisible to the much larger Bun and Node audiences (State of
JS 2025 backend runtimes: Node 90%, Bun 21%, Deno ~11%; npm weekly downloads of `bun` 3.99M vs
`deno` 0.29M, 2026-10-06..12).

Measured starting point (2026-10-16):

- 37 packages, ~123k LOC of source, **359 `Deno.*` call sites in 135 files**, no runtime-abstraction
  layer. 13 packages are already runtime-agnostic, 17 lightly coupled, 7 heavily coupled (cli, core,
  init, redis, upgrade, vite, drizzle's tooling).
- Tests: **3,697 `Deno.test` in 472 package test files** plus 389 in 32 `scripts/` files; 423
  `t.step`; 9 files on `@std/testing/bdd`; 1,545 further `Deno.*` calls in package test fixtures.
- The framework's packages **already load on Bun and Node** through JSR's npm endpoint, which serves
  them as JS with decorators lowered (checked on `@jsr/lockness__core@0.4.1`). What blocks them is
  the `Deno.*` calls, not the language.

## 2. User scenarios

### US1 — Start a new app on the runtime I already use (P1)

**Given** a developer with only Bun (or only Node, or only Deno) installed
**When** they run the scaffold command for that runtime and start the dev server
**Then** the starter kit's home page answers, without any other runtime installed

### US2 — Run an existing Lockness app on another runtime (P1)

**Given** an app written for Lockness, its source unchanged
**When** it is started with Deno, with Bun, or with Node (Node through the transform hook)
**Then** it boots and serves the same routes, sessions, cache and queue behaviour on each

### US3 — Install Lockness from the registry my ecosystem uses (P2)

**Given** a Bun or Node project
**When** the developer adds `@lockness/core` from npm with npm or bun
**Then** it installs from npmjs.com with no `@jsr/*` package in the dependency tree, and imports work

### US4 — Use Lockness features that were Deno-only (P2)

**Given** an app on Bun or Node
**When** it uses a persistent local store for cache, queue, sessions or the scheduler lock, or builds
a single-file binary
**Then** a SQLite driver serves the store on all three runtimes, and a binary is produced on Deno
and on Bun

### US5 — Upgrade an existing Deno app across the break (P3)

**Given** a Deno app on the last Deno-only release
**When** the developer follows the upgrade notes and runs `@lockness/upgrade`
**Then** the app runs on the new release, still on Deno, and every manual step is named in the notes

### Edge cases

- An app configured with the `deno-kv` driver started on Bun or Node: boot fails with an error that
  names the `sqlite` driver.
- A multi-instance app with cookie-session revocation on the SQLite store: boot logs a production
  warning naming the single-host scope; redis is the multi-host backend.
- A project that contains both `deno.json` and `package.json`: the manifest selection rule decides,
  and the CLI names the file it chose.
- Node asked for a single-file binary: refused with a clear error naming the follow-up item.
- A package whose `engines` declares a runtime but zero of its tests ran on that runtime's lane: the
  lane fails.
- Bun's dev server with `--hot` and TC39 decorators (oven-sh/bun#44463): the dev command uses
  `--watch`, not `--hot`.
- An optional module missing on Bun: the error is a `ResolveMessage`, not an `Error`; the classifier
  still recognises it.
- Deno run without `--allow-env`: env reads keep today's no-throw, no-prompt behaviour.
- A static-file request with an encoded traversal (`..%2f`, `%5c`, double encoding, a symlink out of
  the root): refused identically on all three runtimes.

## 3. Requirements

- **FR-001**: **Every** package's source under `packages/*/` (tests and stubs excluded) contains no
  `Deno` identifier and imports no `hono/deno` or `@lockness/hono/{deno,bun,node}`, except in the
  files the lint rule exempts by name (incl. the kept Deno KV drivers). Enumerated by the `lockness-runtime/no-deno` lint over every
  package whose `engines` names bun or node, which ends equal to all packages.
- **FR-002**: Runtime detection happens in exactly one function; no other framework code branches on
  the runtime by its own test, and no package uses conditional exports keyed on a runtime.
- **FR-003**: HTTP serving, static files, connection info and WebSocket upgrade work on Deno, Bun and
  Node through one runtime-selected implementation; a busy port surfaces as one error type; static
  files are contained by one framework check on every runtime; WebSocket origin checks and
  payload/body limits are explicit and equal on every runtime.
- **FR-004**: A SQLite driver backs cache, queue, sessions, the session revocation store and the
  scheduler lock on all three runtimes; the revocation backend is configurable, with a redis adapter
  for multi-host deployments.
- **FR-005**: The `deno-kv` drivers stay as optional, Deno-only drivers beside SQLite (Q1): they are
  loaded lazily so Bun and Node never load them, and selecting `deno-kv` on Bun or Node fails at boot
  with an error that names `sqlite`.
- **FR-006**: The redis client keeps its hand-written RESP implementation and its invariants (one
  dial, TLS validation always on, bounded line/bulk/reply sizes, per-reply deadline) on all three
  runtimes.
- **FR-007**: JSX uses one mode, automatic `react-jsx`, on every runtime and in every config and kit
  stub (the #472 reproduction passes under `react-jsx`, F9).
- **FR-008**: **Every** framework test runs through `node:test`; each package's tests pass on every
  runtime its `engines` declares, in CI.
- **FR-009**: Each package's `package.json` is its one hand-edited manifest; `deno.json` and
  `tsconfig.json` are generated from it and checked by the gate.
- **FR-010**: Every published package is on npm as JS + `.d.ts` built by `tsc`, with no `@jsr/*` in
  its published dependency closure, from the same GitHub Release, behind the same single consent act
  as JSR, and the same version is on both registries afterwards. Enumerated by `npm:build` and `npm:check` over every non-private package whose `engines` names bun or node, which ends equal to every published package; no npm release publishes a subset (T039).
- **FR-011**: A Node app runs its TypeScript (decorators and `.tsx`) through `@lockness/transform` in
  dev and test (`transpileForLoad`), and through `lockness build` in production (`transpileForBuild`:
  the same private emit and the same semantic options from the app's `tsconfig.json`, resolved per
  file as the hook does; only the placement options differ, and the build never reads the transform
  cache).
- **FR-012**: The scaffold command creates a working app for Deno, Bun or Node, and the `./nessy`
  launcher it writes runs every lifecycle command on that runtime.
- **FR-013**: The CLI reads and writes app manifests through one component; framework packages and
  their CLI commands are registered statically in the app's `config/packages.ts` through one typed
  port.
- **FR-014**: Single-file binaries are produced on Deno and on Bun; Node refuses with a clear error
  naming the Node SEA follow-up item (Q3).
- **FR-015**: Generated files (route registry, UI examples registry) are byte-identical whichever
  runtime generates them, and no generator spawns a formatter.
- **FR-016**: The monorepo's own tooling stays launched by Deno until the B4 trigger; scripts written
  or rewritten by this epic are on the runtime-neutral script list and pass the same lint.

## 4. Success criteria

- **SC-001**: A developer with only one of Deno, Bun or Node installed goes from the scaffold command
  to a running starter kit in under 5 minutes, on each of the three runtimes.
- **SC-002**: 100% of the framework's packages pass their whole test suite on Deno, Bun and Node in
  CI, with identical test counts per runtime.
- **SC-003**: An app's source runs unchanged on all three runtimes: the three starter kits boot and
  answer their smoke requests on each runtime from freshly published packages.
- **SC-004**: Installing `@lockness/core` from npmjs.com with npm or bun pulls no package from a
  JSR-only namespace.
- **SC-005**: An existing Deno app upgrades to the first multi-runtime release by following the
  release notes, with no undocumented step.

## 5. 🔒 Decision table

Binding on the implementer. A decision may not leave its home without this table being amended
first. "Asks" names a caller that consults the decision without making it.

### Runtime layer

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Which runtime is running (Deno → Bun → Node, else `UnsupportedRuntimeError`; lazy, memoised; refuses Bun below the supported floor, since Bun < 1.3.10 silently ignores TC39 decorators — C02) | `packages/runtime/runtime.ts` | Hono's `getRuntimeKey()` in framework code; `'Deno' in globalThis` / `globalThis.Bun` anywhere else; runtime-keyed conditional exports |
| Per-runtime HTTP serve, static files, conninfo, WebSocket upgrade, `PortInUseError` | `packages/runtime/http.ts` | `realtime/websocket.ts` or `devtools/gate.ts` importing an adapter; `core/http/static.ts` choosing one |
| Static-file containment (decode once; reject `..`, backslash, NUL, encoded separators; `realpath` inside root) wrapping every adapter | `packages/runtime/http.ts` | a containment check in `core/http/static.ts` or per adapter |
| WebSocket `maxPayload` and request-body limits, equal on all runtimes | `packages/runtime/http.ts` (asked by `realtime/websocket.ts`, whose CSWSH origin guard stays the single origin decision) | runtime defaults left implicit; a second origin check |
| Re-export of Hono's per-runtime adapters | `packages/hono/{deno,bun,node}.ts` | `@hono/node-server` imported outside `packages/hono`; `denoServeStatic` / `getConnInfo` in the root barrel |
| JSX runtime surface (`jsx`, `jsxs`, `Fragment`, `jsxDEV`; automatic mode only) | `packages/hono/jsx_runtime.ts`, `packages/hono/jsx_dev_runtime.ts` (core re-exports the subpaths) | `export *` of the hono barrel in `core/view/jsx_runtime.ts`; any `"jsx": "precompile"` in a config or stub |
| Invocation for runtime R (default: current): script, npm bin, watch, permission flags, Node transform hook; no shell; npm bins run as their JS entry under `process.execPath`; `execArgv` carried through an allowlist (`--import` transform, `--conditions`, `--enable-source-maps`), `--inspect*` stripped | `packages/runtime/process.ts` | argv spelled in core, drizzle, cli, the Toolchain or the nessy stubs; `shell: true`; launching `.cmd` shims; the transform flag outside `process.ts` |
| Shutdown-signal subscription (portable primitive) | `packages/runtime/signals.ts` (asked by `core/kernel/signals.ts`, which keeps shutdown policy, and by queue's worker command) | `process.on('SIGINT')` elsewhere (extended `exit_contract` lint) |
| Process exit | existing owners `packages/core/kernel/signals.ts`, `packages/core/http/server.ts`, `packages/cli/report.ts` | `process.exit` / `process.exitCode` elsewhere |
| Binary compiler per runtime (Deno, Bun; Node refuses) | `packages/core/cli/compilers/{deno,bun,node}.ts`, reached only through core's registered `compile` command | a second `deno compile` / `bun build --compile`; any `@lockness/core` import from `packages/cli` |
| `--force` port release reaches the server as config, not argv | `ServerListenerConfig.forceReleasePort` in `packages/core/http/server.ts` | `process.argv.includes('--force')` in a library class |
| Safe env read (no throw, no permission prompt; asks the detector, then Deno's permission query before reading) | `packages/contract/environment_read.ts` | `cli/raw_errors.ts:79` `readEnvWithoutPrompt` (absorbed); try/catch around `process.env`; a runtime test inside contract |
| "Optional module is missing" classifier — duck-typed on `code === 'ERR_MODULE_NOT_FOUND'` and the specifier in `message`, never `instanceof` | new internal module in `packages/contract/` | `core/kernel/bootstrap/optional_packages.ts:144`, `mail/optional.ts:54`, `notification/optional.ts:110`, `realtime/events_bridge.ts:76` (all four replaced) |
| Sorted recursive file listing | `packages/contract/fs/list_files.ts` | hand-written `readdir` recursion in core, devtools or ui; any unsorted walk |
| Published runtime code uses no `@std/*` (`@std/path` → `node:path` + `node:url` for `fromFileUrl`/`toFileUrl`; `globToRegExp` reimplemented in `list_files.ts`; `@std/jsonc` → one parser in `packages/cli/manifest/`; `@std/cli` → `node:util` `parseArgs`; `@std/crypto`/`@std/encoding` → `node:crypto` / web standards); `lockness.jsr` lists exactly the runtime JSR imports this row has not yet removed, and the change that empties it workspace-wide deletes the field from `scripts/manifests.ts`. Checked on every non-private package whose `engines` names bun or node (row 201), each with an empty `lockness.jsr`; packages outside it keep only the imports their `lockness.jsr` lists and add none (hard rule #2, transition paragraph). | `scripts/npm_check.ts` (closure rule) | an `@std/fs` ban in the lint as well; per-package exceptions (a package in that set exempted by name, or a list of packages excused from the check) |
| Generated files need no formatter at run time | `packages/contract/routing/generator.ts`, `packages/ui/registry_generator.ts` (+ repo test asserting `deno fmt --check` on their output) | a `deno fmt` / prettier subprocess in a generator |

### Storage

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| SQLite binding (`node:sqlite` on all three runtimes — Bun ≥ 1.4 implements it fully, C02; a `bun:sqlite` branch only if the first Bun lane disproves it) and connection policy (WAL, short `busy_timeout`, one handle per path; file and `-wal`/`-shm` created 0600; default path under the project's storage directory) | `packages/sqlite/binding.ts`, `packages/sqlite/connection.ts` | `node:sqlite` / `bun:sqlite` imported in any driver; a temp-directory default |
| TTL'd key-value semantics: expiry checked on every read; `get`, `set(ttl)`, `delete`, `setIfAbsent(ttl)`, `deleteIfOwner`, `deletePrefix` | `packages/sqlite/kv_store.ts` | expiry or compare-and-set SQL inside the cache, session, revocation or lock drivers |
| Tuple-key encoding: injective, order-preserving, length-prefixed binary; every key bound as a parameter; prefix scans as range queries (`key >= p AND key < p_next`), never `LIKE` | `packages/sqlite/kv_store.ts` | string-joined keys (`tag:user:1`); `LIKE ?||'%'`; key text interpolated into SQL |
| Queue job claim (`UPDATE … RETURNING`) | `packages/queue/drivers/sqlite.ts` | job tables or claim SQL in `packages/sqlite` |
| Store-driver names (`sqlite`, `memory`, `redis`, …) as types | `packages/contract/` (one type module, referenced by the six lists: `core/kernel/kernel_decorators.ts:77,122,455-470`, `cache/types.ts:25`, `session/types.ts:76`, `queue/types.ts:60`) | any union literal of driver names outside contract |
| Revocation backend is configured, not implied (`sqlite` single-host with a production boot warning; `redis` multi-host) | `packages/session/drivers/registry.ts` | revocation backend inferred from the session driver; a second warning site |
| Redis socket port and its single dial over `node:net`/`node:tls`: `rejectUnauthorized: true`, `servername` and `host` explicit, `checkServerIdentity` never overridden; line/bulk/reply bounds enforced before append, socket paused over the limit | `packages/redis/resp.ts` (port + bounds), `packages/redis/connection.ts` `#dial` + `packages/redis/socket.ts` | a `net.connect` / `tls.connect` in `subscriber.ts` or `client.ts`; a per-runtime transport |
| Lexical containment of a scaffolded path (no symlink resolution; NOT for static files, which use runtime/http.ts realpath) | `packages/contract/fs/contained.ts` on `./fs/internal` (becomes an `fs/internal.ts` barrel re-exporting `listFiles` when it lands) | a copy in a package; `isContained` reused for static-file serving |
| `deno-kv` is Deno-only: driver modules loaded lazily by each package's driver factory; the "`deno-kv` needs Deno, use `sqlite`" refusal decided once | `packages/contract/` (the refusal, next to the driver-name types; asked by the cache, session, queue and scheduler-lock factories) | the refusal message spelled in each factory; a static import of a `deno_kv` driver from a barrel |

### Toolchain, manifests and CLI

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Test API | `node:test` in test files (one-shot `scripts/codemods/node_test.ts`) | a runtime test shim; `Deno.test`; `@std/testing/bdd` |
| How tests run on runtime R | `scripts/test_runtime.ts` | per-package `test` tasks × 3; commands typed into workflow YAML |
| Package facts (deps, optional peers = a package's soft edges, engines, exports, files allowlist, JSR filters, JSX options) | `packages/<pkg>/package.json` (optional peers: `peerDependencies` + `peerDependenciesMeta.optional`) | hand-edited `deno.json` imports; a soft edge copied into `deps.policy.jsonc` or an equality check holding two copies |
| Where a JSR-only package is declared, by audience: test-only as a `devDependencies` entry `"<name>": "jsr:<range>"`; a published package's runtime one in `lockness.jsr` (owed to the A15 row; never `dependencies`, which npm reads and cannot resolve `jsr:` in); a `private` package's runtime one in `dependencies` as `jsr:<range>`. Each becomes a `jsr:` import in `deno.json` (Deno stays on JSR); the `package.json` ones are linked into `node_modules` by `deno install --frozen` from JSR's npm endpoint (F13), which is how Bun and Node reach them. Refused: `jsr:` in a published package's `dependencies`, the aliased `jsr:@scope/name@range`, one name in two places | `packages/<pkg>/package.json` (declaration); `scripts/manifests.ts` (mapping, refusals) | a Node loader or Bun plugin resolving `deno.json` imports; an import map handed to a lane; a test-only package in `lockness.jsr`; JSR packages declared once in the root `package.json`; `node:assert` rewrites to avoid the dependency |
| Generated JSR/Deno manifest and tsc graph | `packages/<pkg>/deno.json`, `packages/<pkg>/tsconfig.json`, generated by `scripts/manifests.ts` | hand edits to either |
| A package's own version at run time | a module generated from `package.json` by `scripts/manifests.ts` | `import … './deno.json'` (`core/app.ts:54`, `ui/mod.ts:36`) |
| Workspace membership | root `package.json` `workspaces` | `deno.jsonc` `workspace` array |
| One lockfile, with no `npm:@lockness/*` entry (every `@lockness/*` resolves to a workspace member) | `deno.lock`, checked by `scripts/manifests.ts --check` | `package-lock.json`, `bun.lock`; a registry-resolved `@lockness/*` |
| "Proven on runtime R" — also the set the runtime-neutral lint, npm:build and npm:check scope on: one predicate, namesBunOrNode in scripts/manifests.ts (the npm consumers drop private packages) | packages/<pkg>/package.json engines | CI package lists; a separate migrated-package file; a policy key; an npm-readiness marker; a ratchet of packages excused from the npm build |
| Engines monotonic over static, soft **and test** dependency edges | `scripts/manifests.ts --check` | ad-hoc checks in workflows |
| Dependency edges (permission) | `deps.policy.jsonc`: `allow` for static edges, `soft` for optional peers; `deps:analyze` checks observed ⊆ `allow` and `package.json` optional peers ⊆ `soft` (deltas in the sub-table below, one `chore(deps)` commit each) | an edge used before its policy commit; an edge check in `manifests.ts` |
| Runtime-neutral scripts (FR-016) | `scripts/lint/runtime_neutral_scripts.ts` (ratchet list, read by the lint) | a script list in the gate or YAML |
| **Semantic** TS compiler options for user code — what the code means: `target` (decorator lowering), class fields, `jsx*`, `verbatimModuleSyntax`, … | the app's `tsconfig.json`, the nearest to each file and never above the nearest `package.json`/`deno.json` (`transform.ts` reads it; `lockness build` resolves it per file the same way and calls `transform.ts`'s build entry) | options spelled in `transform.ts`, the build command or a kit stub; a separate `tsconfig.build.json` |
| **Placement** TS compiler options — where the emit and its map go, how specifiers are written: one table, two entry points over one private emit. `transpileForLoad` (hook): `./a.ts` kept, inline map. `transpileForBuild` (build): `rewriteRelativeImportExtensions`, external `.map` whose `sourceRoot` resolves. Both force `module: ESNext`, drop `moduleResolution` and the layout options. Option diagnostics fail closed (unknown option, invalid value), except value diagnostics on `lib`/`types`, mapped to their option through the source-file API (#619 disposition) | `packages/transform/transform.ts` (`PLACEMENT`) | build-side post-processing of specifiers; a `consumer` flag on one `transpile`; a `.js` → `.ts` resolve hook; a full-program `tsc` emit for `lockness build` (user apps); `ts.transpileOptionValueCompilerOptions` |
| Node transform of user TypeScript; cache under `node_modules/.cache/lockness-transform` (0700, refused — never narrowed — with any group/other bit), key = SHA-256(transformer version, compiler options, file name, source bytes); every access walks the path from the app root (no symlink, owned by the uid, not other-writable unless sticky; group write allowed, since the trust rests on the source tree; a failing parent disables the cache with one warning, never fatal) and verifies each entry on its `O_NOFOLLOW` descriptor (regular file, owned by the uid, no group/other bit; else a miss, #618); a failed cache write warns once per app and keeps the emit; the key hashes the placed load options; `module: ESNext` forced; only `.ts`/`.tsx` files outside `node_modules` (`.mts`/`.cts` unsupported); the governing `tsconfig.json` and every file of its `extends` chain are read through a descriptor that must be owned by the uid and not other-writable; refuses to run when `APP_ENV=production`; never read by `lockness build` | `packages/transform/transform.ts` (+ `cache.ts`, `hook.ts`, `register.ts`) | an esbuild/swc hook; a Vite transform; a cache in a shared temp dir; a cache read by the build |
| Package-manager commands per runtime (install, add, run bin) — maps lifecycle steps to `runtime/process.ts` invocations and decides nothing else | `packages/cli/toolchain/toolchain.ts` (a table) | shell case tables in launcher stubs; argv spelled here |
| Reading and writing an app manifest, and which manifest a project uses (Deno: `deno.json(c)` if present else `package.json`; Bun/Node: `package.json`) | `packages/cli/manifest/{project_manifest,deno_json,package_json}.ts` | manifest parsing in `package_loader.ts`, `setupContext` (`cli/package_install.ts`), `upgrader.ts`, `drizzle/install.ts`, `deprecation-contracts/install.ts:88`, `openapi/install.ts:81`, `ui/mod.ts:197-212`, `init/kits.ts` |
| Kit manifests generated from one per-kit dependency list (folds #531) | `packages/cli/manifest/` + one dependency list per kit in `packages/create` | `deno.json.stub` / `package.json.stub` files per kit and runtime |
| Package and command registration for an app | app `config/packages.ts`, listing each package's typed `commands` entry | `lockness.packages` + dynamic import; `register*Commands` name-prefix discovery in `cli/package_loader.ts:66-72` |
| Command contribution port (`CommandRegistry`) and package setup port (`SetupContext`, a named typed export, never `default`) | `packages/contract/` | the five local `interface Cli` copies (`features`, `i18n`, `mail`, `notification`, `search` `cli_commands.ts`); `registerCoreCommands(cli: any)` (#576); per-package `install.ts` importing cli |
| Queue CLI commands live in queue, against the contract port | `packages/queue/commands.ts` | `packages/cli/commands/queue_commands.ts`; a queue → cli edge |
| Scaffold runtime choice (`--runtime` → user agent parsed to `RuntimeId`, unknown → prompt → running runtime) | `packages/create/runtime_choice.ts` | the choice spelled in kit templates or the launcher; raw user-agent text in a template |
| Launcher `./nessy` (and `nessy.cmd`): one generated line per runtime, no logic | generated by `packages/cli/manifest/` from `runtime/process.ts` invocations | a case table in either stub |
| Kit container image per runtime: Node `--permission` with fs-read on the app and fs-write on the SQLite directory only; Deno adds `--allow-write=<sqlite dir>` only; Bun documented as unsandboxed (read-only root fs, non-root user) | `packages/create` Dockerfile stubs, one per runtime | `-A` in an image; a shared stub with runtime conditionals |

### Distribution and CI

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| npm artifact build: `tsc -b` over the project list generated from row 201's scope; TypeScript 6.0.3 pinned exactly, one version in the workspace (root `devDependencies` for the build, transform's `dependencies` for the transform; `manifests --check` refuses a second) | `tsc -b`, TypeScript 6.0.3 pinned exactly in `deno.lock` (npm `latest` is 7.0.2, which has no JS API) | dnt, a bundler config, re-published JSR tarballs; the build borrowing transform's runtime dependency |
| npm bytes built **inside** the npm holder from `github.sha`; nothing handed in | `publish.yml` → `publish-npm` steps (checkout `github.sha` without credentials; setup-deno `.dvmrc`; setup-node `.node-version` only, bundled npm ≥ 11.5.1; `deno install --frozen` with `allowScripts` empty; `deno task npm:build`; `scripts/npm_publish.ts`) | upload/download-artifact, a cache or a job output reaching a holder |
| Build command and its sandbox: `tsc -b` (TypeScript pinned **exactly** to 6.0.3, from the local `node_modules` after `deno install`) under `--no-prompt --deny-import --cached-only --allow-env=<the 15 TSC_*/NODE_*/VSCODE_* names tsc reads> --deny-net --deny-run --deny-ffi --allow-read=. --allow-write=<dist list>`; no `ACTIONS_ID_TOKEN_*` readable. `--deny-import` because `--deny-net` alone leaves Deno's default remote-import allowlist open; `--cached-only` because on Deno 2.9.6 the bare `--deny-import` holds only together with it (measured at C09). The staging step, which loads `scripts/manifests.ts`'s JSR imports, runs `--allow-import=jsr.io:443 --cached-only` with `--allow-read=. --allow-write=<staging root>`. The project list and the dist list are generated together from row 201's scope; `engines` monotonic over static edges (row 202) closes the list under `references`, and a reference outside it fails closed on `--allow-write`. | root `deno.jsonc` task `npm:build` (env and dist lists generated by `scripts/manifests.ts`) | tsc flags in workflow YAML; a second build command in `npm-kits`; tsc run unsandboxed |
| Framework build compiler options: target ES2022, module/moduleResolution nodenext, rewriteRelativeImportExtensions (emitted JS carries .js specifiers; .d.ts is tsc's output unchanged, relative .ts specifiers included: the compiler resolves a .ts specifier in a declaration file to the .d.ts beside it and exempts declaration files from allowImportingTsExtensions, and npm:check's consumer type-check on the pinned TypeScript is the proof), composite declarations, types ["node"] (@types/node in root devDependencies, the .node-version major); siblings resolve through their default export to dist/*.d.ts, never lockness-source | root tsconfig.base.json, extended by every generated packages/<pkg>/tsconfig.json; per-package JSX options from the lockness key | options in tsconfigFor, the npm:build task or a package; customConditions ["lockness-source"] in a build config; transform.ts's placement options (row 205 is user code); a post-emit rewrite of tsc output (regex in staging, or a custom declaration transformer in a TS-API build driver) |
| Published npm manifest and the directory npm pack reads: an allowlist of package.json fields (name, version, description, license, type, exports without lockness-source, files, engines, dependencies, peerDependencies, peerDependenciesMeta, bin, repository), staged under one gitignored root by npm:build's second step with the files entries plus README and LICENSE (npm pack always includes them; the root LICENSE when the package has none); staging drops *.tsbuildinfo and rewrites no file content | publishedManifest() in scripts/manifests.ts (mapping); npm:build (staging); read by scripts/npm_check.ts and, in P5, scripts/npm_publish.ts | npm pack of the source directory; a prepack script; a field denylist; npm_check or npm_publish assembling its own; staging that rewrites a file's content |
| What to publish, skip-if-present, registry URL (`npm publish --ignore-scripts --access public --provenance`) | `scripts/npm_publish.ts` (imports only `node:` built-ins) | a shell loop in YAML; `npm publish --workspaces` |
| Both holders' step lists; the `npm` environment; no tracked `.npmrc`, no `publishConfig`, no `scripts` in published manifests | `scripts/ci_id_token_test.ts` | a second id-token test |
| Pre-publish npm proof (double build with equal pack integrity, `npm:check`, kits from tarballs on Node and Bun); both holders `needs: [gate, kits, npm-kits]` | `publish.yml` → `npm-kits` (no id-token) | checks inside a holder |
| npm accepts only the npm holder | npm trusted publisher bound to this repo + `publish.yml` + environment `npm` (`v*` tags, no secrets, no reviewers); the JSR holder keeps no environment | a long-lived npm token; a reviewer on the environment (a second consent) |
| First npm publish | the maintainer's bootstrap (F2: a package must exist before a trusted publisher can be set), completed within 48 h of configuring it: `0.0.0` placeholders (`package.json` only) from an empty temp dir outside the repo, granular `@lockness` token with shortest expiry, trusted publishers configured, "require 2FA and disallow tokens", token revoked | a token in CI or in any repo file |
| Tarball content: `files` allowlist present; `npm pack --dry-run` lists no `tests/`, fixtures, `.env*`, `*.key`, `.npmrc`; no published `preinstall`/`install`/`postinstall`/`prepare` | `scripts/npm_check.ts` | per-package checks |
| Same version on JSR and npm for every package after a release | `scripts/registry_parity.ts`, run by `/ship` step 5 (overlaps #565) | a manual check |
| Gate step list | `scripts/gate.ts` | steps in workflow YAML |
| Lockstep bump | `scripts/bump.ts` | `bump-native.ts`, the legacy bump |
| id-token holders and their pinned step lists | `.github/workflows/publish.yml` + `scripts/ci_id_token_test.ts` | id-token in any other job |
| Runtime version pins | `.dvmrc`, `.bun-version`, `.node-version` | inline versions in YAML |
| Release consent (fires JSR and npm) | the GitHub Release promoted by `/ship` step 3(e) | a second consent or a manual `npm publish` |
| Pre-P5 installs reach no registry: npm_check installs each staged tarball into a temp root, linking only the third-party packages it declares from the frozen node_modules; kit smokes (kits:smoke --runtime, C20) consume the same tarballs | scripts/npm_check.ts (install); kits:smoke --runtime (kits) | a lane or check resolving @lockness/* or a third-party package from a registry before P5; npm install --offline against a cache the gate must fill |

### Policy deltas (`deps.policy.jsonc`)

| Package | Change | Why |
| :--- | :--- | :--- |
| `runtime` (new) | `allow: [hono]`; must never import `contract` | divergences; acyclicity with contract's edge |
| `sqlite` (new) | `allow: [runtime]` | connection policy; binding fallback if needed |
| `transform` (new) | `allow: []` | loads before anything else |
| `create` (renamed from `init`) | `allow: [cli, runtime]` | — |
| `contract` | `+ runtime` (**value** edge, detector subpath only) — recorded exception to "type-only imports"; contract's brief amended in the same change | safe env read |
| `cache`, `session`, `queue` | `+ sqlite` | SQLite drivers |
| `queue` | `+ runtime` (signals) | worker shutdown |
| `core` | `+ runtime`; `soft + sqlite` (permission only — the `@lockness/sqlite` optional peer lands in `packages/core/package.json` with the loader, after this commit) | serve, signals; scheduler lock |
| `realtime`, `devtools` | `+ runtime` (replaces `hono/deno`) | WebSocket upgrade, conninfo |
| `cli`, `drizzle` | `+ runtime`; `cli − queue` | invocations; edge cut |
| `deprecation-contracts` | `− cli`, `+ contract` | setup port replaces `install.ts`; `SetupContext` is a contract type |
| `features`, `search`, `i18n` | `+ contract` | the `CommandRegistry` port replaces each local `interface Cli`, and the shared `isContained` (#579) lives on `@lockness/contract/fs/internal` (added in C06) |
| `runtimeImports` | `@lockness/<pkg>/setup` for `package:install` | dynamic import |

**Reconciled between A and B, corrected by audit A1/A6.** argv lives in `runtime/process.ts`
because `runtime` is the one package core, drizzle and cli may all import (core and cli share no
edge either way). Compilers live in `core/cli/compilers/`, reached only through core's registered
`compile` command: the cli Toolchain does not know `compile`, so no cli → core edge appears.

## 6. Technical context

**Language/Version**: TypeScript, TC39 stage-3 decorators (no `Symbol.metadata`), ES2022 output.
**Runtimes**: Deno ≥ 2.2 (`node:sqlite`), Bun ≥ 1.4.0 (TC39 decorators since 1.3.10; `node:test`
subtests and mock timers since 1.4.0, PR oven-sh/bun#32631; `node:sqlite` fully implemented), Node 24
and 26 (npm ≥ 11.5.1 for trusted publishing).
**Primary dependencies**: Hono (pinned, through `@lockness/hono`), `@hono/node-server` and
`@hono/node-ws` (npm, allowed by rule #2 as reworded), TypeScript 6.0.3 pinned exactly (build and Node
transform; TS 7 has no JS API — #612).
**Storage**: SQLite through `node:sqlite` on all three runtimes; redis; PostgreSQL/MySQL through drizzle
(unchanged).
**Testing**: `node:test` + `@std/assert` + `@std/testing` (FakeTime, mock) in tests only, each declared by the package whose tests import it as a `devDependencies` entry `"<name>": "jsr:<range>"`: Deno resolves it from JSR through the generated `deno.json`, Bun and Node from the `node_modules` that `deno install --frozen` links from JSR's npm endpoint (F13, disposition D); per-runtime lanes; mutation batteries and coverage stay on Deno.
**Target platform**: Linux and macOS servers; Windows unchanged (out of the CI matrix; the `.cmd`
launcher is generated like the POSIX one).
**Project type**: framework library monorepo + CLI + scaffolder.
**Constraints**: lockstep versions across 37+ packages and two registries; JSR keeps working for
Deno users; the publish trust invariants (#476, #480, #481, #541) hold.
**Scale/scope**: 359 source call sites, ~5,600 test-side references, 3 new packages (`runtime`,
`sqlite`, `transform`) and `init` renamed `create`, 3 runtimes × CI lanes.

### Phases and milestones

| Phase | Content | Milestone |
| :--- | :--- | :--- |
| P0 | **Blocking, maintainer: reserve the `@lockness` npm org and the unscoped `create-lockness` and `lockness` names** before any doc prints an npm command. Spike: tsc under the `npm:build` deny flags; npm's environment check and trusted publisher before a first version; JSR's trust binding (repo only?); Bun 1.4 `node:test`; `bun create @scope`; TS 7 decorator emit; `deno install` layout on the full repo; Bun/Node lanes installing from `deno.lock` alone; `deno publish`/`check` with a dynamic `bun:` import; #472 reproduction under `react-jsx`; `node:sqlite` on Bun ≥ 1.4; Bun `node:tls` honouring `rejectUnauthorized` | facts recorded here |
| P1 | Runner codemod; manifests (`package.json` source, generated `deno.json`/`tsconfig.json`, own-version module); policy deltas; edge cuts (cli → queue via `CommandRegistry`, deprecation-contracts → cli via `SetupContext`, bare `hono` alias); `@lockness/transform`; CI lanes; npm build + `npm:check` (scope from `engines`; `@lockness/transform` alone at C09); lint with an `engines`-derived scope; `exit_contract`/`env_signal` extended to `process.*` | — |
| P2 | **cli's test-harness surface first** (`Cli.dispatch`, `runEntry`, command-failure) — ten packages' tests import it; then foundation and agnostic/light packages bottom-up, core's closure first: runtime, hono, contract, container, crypto, events, scheduler, deprecation-contracts, then the rest | — |
| P3 | Core boot path; redis transport; `@lockness/sqlite` and the SQLite drivers incl. redis revocation adapter; cache, queue, session, realtime, devtools | **M1**: the slim kit boots from workspace source on Bun and Node |
| P4 | cli Toolchain + ProjectManifest + launcher; static registration; scaffolder + per-runtime kits and images; upgrade (incl. a `lockness.packages` → `config/packages.ts` codemod); drizzle; vite (Deno resolver only on Deno); compile + `lockness build` | scaffolding works on all three runtimes |
| P5 | npm publishing (`npm-kits` + `publish-npm` per disposition C, JSR holder `needs:` pin updated, `publish.yml` header rewritten for two holders, trusted publishers, `/ship` step 5 on npm + registry parity); per-runtime docs; release notes (KV data and queue draining, sandbox loss on Bun/Node, multi-instance revocation) | first multi-runtime release |

### P0 facts (C02, measured 2026-10-16 on Deno 2.9.6, Bun 1.3.3, Node 24.22; docs where marked)

| # | Fact | Source |
| :--- | :--- | :--- |
| F1 | `tsc` 6.0.3 under Deno fails with `--deny-env` (reads `TSC_WATCH*`, `NODE_ENV`, inspector variables); it builds TC39 decorators + `.tsx` with those 15 names allowed, and needs TS libs in a local `node_modules` (`deno install`) inside `--allow-read=.` | measured |
| F2 | npm trusted publishing needs the package to **exist first** (npm/cli#8544 open); an unvalidated trusted-publisher config expires after 48 h; npm ≥ 11.5.1, Node ≥ 22.14; an `environment` name can be set, but whether npm enforces it at publish is not documented | docs.npmjs.com/trusted-publishers, `npm trust`, GitHub changelog 2026-10-02 |
| F3 | JSR's GitHub OIDC trust checks `repository_id` only — not workflow, environment or ref | jsr-io/jsr `api/src/external/github.rs`, `iam.rs` @ dfd7fe8b |
| F4 | Bun `node:test`: suites and hooks since 1.2.6; subtests, Node-style hooks and `mock.timers` since **1.4.0**; Bun 1.3.3 throws on `t.test` | measured 1.3.3; bun.com compat docs; PR #32631 |
| F5 | `bun create @lockness` runs `@lockness/create`; `bun create lockness` runs `create-lockness` | measured; bun `bunx_command.rs` |
| F6 | TypeScript 7.0.2 is npm `latest`; it has no programmatic API (tsc is a native binary, so it cannot run under `--deny-run`); TC39 decorators are lowered correctly | measured; TS 7.0 announcement |
| F7 | One `deno install` on a `package.json` workspace yields a `node_modules` that Node and Bun run TS sources from (2-package case; full repo re-measured in C05) | measured |
| F8 | `deno check` / `deno publish --dry-run` accept a dynamic `import('bun:sqlite')` but type it `any`; `tsc` rejects it without a declaration | measured |
| F9 | #472 does **not** occur under `jsx: react-jsx`: Deno honours the JSR `.tsx` pragma's runtime (precompile fails with `Unsupported scheme "jsr"`) — T031 unblocked | measured (local JSR-protocol server) |
| F10 | `node:sqlite`: absent on Bun 1.3.3; "fully implemented" on Bun 1.4 (18/18 Node tests) — to be confirmed on the first Bun lane (C08) | measured 1.3.3; bun 1.4 notes |
| F11 | Bun `node:tls` with `rejectUnauthorized: true` refuses self-signed and wrong-name certificates, like Node | measured 1.3.3 |
| F12 | Bun 1.3.3 silently ignores a TC39 method decorator (no error, original method runs) | measured |
| F13 | A `"<name>": "jsr:<range>"` entry in a `package.json` dependency field is installed by `deno install` as `npm:@jsr/<scope>__<name>` from npm.jsr.io and linked, hoisted, at `node_modules/<name>`; Node and Bun import it by its JSR name, subpaths included. `deno.lock` then holds two pinned resolutions (`jsr:` for Deno's import map, `npm:@jsr/…` for `node_modules`) and `--frozen` accepts it. Without a `jsr:` import-map entry Deno resolves the declaration to the npm build, not JSR. `@std/assert`, `FakeTime` and `@std/testing/mock` under `node:test` pass on Deno 2.9.6, Node 24.22, Bun 1.3.3; `@lockness/transform`'s 35 tests pass on Node 24.22 | measured 2026-10-16 (disposition D) |

Consequences folded above: `npm:build` env allowlist and exact TS pin (F1, F6); first npm publish
always needs the placeholder bootstrap, published within 48 h of configuring the trusted publisher
(F2); the JSR direction is closed only by the build sandbox (F3); `node:sqlite` everywhere, no
`bun:` import (F8, F10); runtime detector refuses Bun below the floor (F12); FR-007 / T031 proceed
(F9). JSR test dependencies are `jsr:` devDependencies, materialised for Bun and Node by the same frozen install (F13, disposition D).

Children folded into the epic: #582 (generator `deno fmt` subprocess, resolved by FR-015), #531
(kit manifest stubs), #576 and #579 (command entry contract). #583 (POSIX wrapper case arms exit 0)
is fixed on its own before P4, since the launcher rewrite is far away. #586 (forgeable `@Throttle`
key) and #585 (lockness.land off Deno Deploy) stay separate items; #586 uses `runtime/http.ts`
`getConnInfo` if it lands after P3.

### Domain model

- **Bounded context**: runtime portability — infrastructure under every Lockness package; no
  business domain.
- **Vocabulary**: *runtime* (`deno` / `bun` / `node`); *divergence* (a capability with no common
  API across runtimes); *lane* (one runtime's CI test job); *proven runtime* (a runtime listed in a
  package's `engines`); *invocation* (the argv that runs a script or bin on a runtime); *toolchain*
  (per-runtime package-manager commands); *project manifest* (`deno.json` or `package.json` of an
  app); *command contribution* (a package's typed `commands` entry).
- **Entities**: *Package* — identified by its name; owns its manifest, its `engines` and its version
  (lockstep). *App project* — identified by its root directory; owns one selected manifest.
- **Value objects**: `RuntimeId`, `Invocation`, `EnginesSet`, `KvKey` (encoded tuple), `KvEntry`
  (key, value, expiry).
- **Invariants**:
  - Exactly one runtime detector.
  - A package's `engines` ⊆ the intersection of its static, soft and test dependencies' `engines`.
  - A package whose `engines` names bun or node has no `Deno` identifier outside exempt files.
  - A package version is identical on JSR and npm and across all packages.
  - Every `@lockness/*` in development resolves to a workspace member.
  - A KV read never returns an expired entry; KV key encoding is injective.
  - id-token permission exists only in the publish jobs.
- **Out of scope**: Cloudflare Workers as a target; Windows CI; Node single-file binaries (Q3,
  follow-up item); moving the monorepo toolchain off Deno before the B4 trigger.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| #1 No direct `hono` import | pass | Only `packages/hono` imports Hono, including the new Bun/Node adapters and the JSX runtimes. |
| #2 JSR-only dependencies | **amended** | Reworded (Q2, 2026-10-16) so npm-resolvable published dependencies are allowed; see complexity tracking. |
| #3 No `any` in exported APIs | pass | Removes `registerCoreCommands(cli: any)`; Bun APIs typed structurally. |
| #4 Tailwind v4 syntax | pass | No styling change. |
| #5 Pre-completion gate | pass | The gate grows `manifests --check` and `npm:check`. |
| #6 `deno.lock` generated | pass | Still the one lockfile, generated by `deno install`. |
| #7 JSDoc on public APIs | pass | Required for every export of the new packages. |
| #8 MVC layering | pass | No controller/service change. |
| #9 One category per commit, linear history | pass | Policy deltas land as `chore(deps)` commits of their own. |
| #10 Public repo, no maintainer environment | pass | A first-publish token, if any, never enters the repo. |
| #11 Design → architect-expert, product → user | pass | Three dispositions; product questions in §12. |
| #12 Act, don't recommend | pass | — |
| TDD | pass | Each sub-issue test-first; the codemod's acceptance is identical counts and names. |
| DDD / Domain Model gate | pass | §6. |
| No silent catches | pass | Removes two (`deno fmt` failures ignored in two generators). |
| `contract` imports other packages type-only | **violation** | `contract → runtime` value edge (audit A2). See complexity tracking. |
| Testing section names `Deno.test` | **amend** | Constitution Testing section and `docs/testing.md` change to `node:test` in P1. |
| Sessions / Queues / Deployment lines name Deno KV and Deno Deploy | **amend** | Updated when the SQLite drivers ship and in #585. |

### Complexity tracking

- **Hard rule #2.** The settled decision to publish on npm cannot coexist with "JSR-only
  dependencies". Rewording accepted by the maintainer on 2026-10-16 (Q2): *published runtime code
  depends only on sibling packages, `node:` built-ins and npm packages, declared per package in
  `package.json`; JSR-only packages (`@std/*`) are allowed only in tests and tooling;
  `publish:check` and `npm:check` enforce it.* Declaring every dependency per package survives. Staged by disposition E: the sentence lands verbatim with a transition paragraph tied to `lockness.jsr`. That stages the scope and timing of enforcement, not the meaning. C03 lands with C09.
- **`contract` → `runtime` value edge.** A safe env read on Deno must query the permission before
  reading, so it must know the runtime, and the one detector lives in `runtime`. Accepted because the
  alternative is a second detector. Bounded: detector subpath only; `runtime` never imports
  `contract`; contract's brief amended in the same change.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/core` public API | yes | `denoServeStatic` removed; `serveStatic`, `getConnInfo`, `upgradeWebSocket` runtime-selected; JSX runtimes re-exported from `@lockness/hono` subpaths; `registerCoreCommands(cli: any)` replaced by the command port |
| `@lockness/hono` | yes | `./bun`, `./node`, `./jsx-runtime`, `./jsx-dev-runtime`; per-runtime helpers leave the root barrel |
| App configuration | yes | new driver `sqlite` (with `path`), the kit default on every runtime; `deno-kv` kept, Deno-only; revocation backend option; `config/packages.ts` replaces `lockness.packages` |
| App manifest | yes | Bun/Node apps use `package.json` + `tsconfig.json`; `#` subpath imports |
| CLI / `./nessy` | yes | one-line launcher per runtime; logic in cli commands; queue commands move to `@lockness/queue` |
| Scaffolder | yes | `@lockness/init` renamed `@lockness/create` (Q4); per-runtime kits and images |
| Registries | yes | npm next to JSR; the `@lockness` npm org owned by the maintainer |
| New packages | yes | `@lockness/runtime`, `@lockness/sqlite`, `@lockness/transform`, `@lockness/create` (renamed from `init`) |
| Repo manifests | yes | `package.json` per package becomes source; `deno.json` / `tsconfig.json` generated |
| CI | yes | Bun and Node lanes, npm pack check, npm publish job |
| Docs | yes | per-runtime getting started, deployment, testing, every Deno KV / Deno Deploy mention |
| Texts made wrong | yes | `packages/realtime/AGENTS.md:13`, `packages/redis/AGENTS.md` intro, `packages/contract/AGENTS.md` invariants, `packages/hono/mod.ts:92-99, 300-327` JSDoc, `optional_packages.ts:132` comment, `deps.policy.jsonc` `jsx` rationale (only once the #472 reproduction passes), `docs/architecture.md` Deno examples, constitution Testing/Sessions/Queues/Deployment lines; the `deps.policy.jsonc` header and the `scripts/core_soft_policy_test.ts` docblock (soft = permission, fact in `package.json` — fixed in C05); the `scripts/manifests.ts` header row `jsr`, its lines 21-24 and the line-342 comment, `docs/releasing.md:69`, the `tests/manifests.test.ts:84` case, the "How" paragraph of `scripts/test_runtime.ts` (fixed in C08, disposition D) |
| Rendered UI | no | Components render the same; only the JSX transform mode changes |

### Documentation (this feature)

```text
.specnaut/specs/274-multi-runtime/
├── plan.md    # This file — the whole plan
└── tasks.md   # derived from THIS file once approved
```

### Visual Prototyping with Claude Artifacts

Nothing to prototype: the feature changes no screen and no rendered state. The only UI-adjacent
change is the JSX transform mode, verified by the existing `ui` render tests on each lane.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A third party claims the `@lockness` npm scope or `create-lockness` (announced publicly in #584) | P0 blocking reservation by the maintainer; lockfile check that no `@lockness/*` resolves from a registry; pre-P5 smokes on local tarballs. |
| Three decorator implementations (Deno, Bun, TS-lowered on Node) differ at the edges | Every package's suite runs on all three lanes before it declares the runtime in `engines`. |
| Bun regressions (open: `Symbol.metadata` #29724, HMR #44463) | No `Symbol.metadata` use; dev uses `--watch`; `.bun-version` pinned plus a `latest` lane. |
| Bun throws non-`Error` values (`ResolveMessage`) | Classifier duck-typed; the 31 `instanceof Error` checks in 24 source files reviewed on the error-rendering paths in P2/P3. |
| npm has no atomic multi-package publish; a half-published release | Idempotent publish job; `registry_parity.ts` after every release. |
| The test codemod changes what is tested | Acceptance: identical pass/step counts and byte-identical test names, so mutation `killedBy` rows still attribute; the 10 explicit sanitizer options listed and handled by hand. |
| Redis mutation batteries are anchored on exact source text | Re-anchored in the same change and proven live. |
| Losing JSX precompile slows Deno rendering | Measured in P3 on the web kit; accepted for one code path. FR-007 waits on the #472 reproduction. |
| Synchronous SQLite blocks the event loop under write contention | Short `busy_timeout`; one file per concern; redis remains the multi-host store. |
| SQLite lock and revocation only coordinate one host | Revocation backend configurable with a redis adapter and a production warning; redis lock for multi-host. |
| Existing Deno KV data (incl. pending queue jobs) is not migrated to SQLite | Deno KV drivers are kept (Q1), so Deno apps need not switch; release notes say to drain queues before switching. |
| Deno's permission sandbox disappears on Bun and Node | Node images use `--permission`; Bun images documented unsandboxed with mitigations; release notes say so. |
| The epic is long and Deno's runtime ends ~2027-10 | M1 (boot on Bun and Node) lands in P3; Deno keeps working throughout. |
| Directory listing order differs on Bun | `listFiles` sorts; generated-file byte-identity test (FR-015). |
| `@lockness/markdown` imports `@libs/markdown` at run time: JSR-only, outside the A15 row's `@std` list, and SC-004 forbids it in the npm closure | Its own `architect-expert` disposition before markdown declares bun or node or is packed for npm; until then it stays in `lockness.jsr`. |

## 10. Architecture audit

_`architect-expert` against this document, 2026-10-16. Verdict **fail**: 6 HIGH, 13 MEDIUM, 4 LOW.
All accepted and folded in; none rejected._

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | HIGH — Toolchain asking `core/cli/compilers/` adds a cli → core edge (pulls core into ui, upgrade, init, drizzle, openapi) | Plan changed: `compile` removed from the Toolchain; reached only through core's registered command; reconciliation paragraph corrected. |
| A2 | HIGH — safe env read in contract needs a runtime value import, against contract's type-only invariant | Plan changed: `contract → runtime` value edge recorded as an exception (complexity tracking, policy deltas), detector subpath only, `runtime` never imports `contract`. |
| A3 | HIGH — driver-union home needs an illegal cache → core edge and misses four of six lists | Plan changed: driver-name types homed in contract; all six lists named. |
| A4 | HIGH — FR-013 has no command-entry port; moving queue commands would create queue → cli (confirms #576, #579) | Plan changed: `CommandRegistry` + `SetupContext` in contract; typed `commands` entries in `config/packages.ts`; #576/#579 folded. |
| A5 | HIGH — cli in P4 blocks ten packages' lanes (their tests import cli) | Plan changed: cli's test-harness surface moves to the start of P2; engines invariant covers test edges. |
| A6 | HIGH — `process.ts` knew only the current runtime, so the Node transform argv would be spelled twice | Plan changed: Invocation for runtime R; Toolchain reduced to a package-manager table. |
| A7 | MEDIUM — no policy deltas | Plan changed: §5 policy-delta sub-table. |
| A8 | MEDIUM — no raising home for the deno-kv deprecation | Superseded by Q1 (keep, no deprecation); the analogous single-home question — where "`deno-kv` needs Deno" is refused — has its row in contract. |
| A9 | MEDIUM — FR-016 uncheckable | Plan changed: ratchet list `runtime_neutral_scripts.ts` read by the lint. |
| A10 | MEDIUM — user-TS compiler options had three spellings | Plan changed: app `tsconfig.json` is the home; build reuses `transform.ts`. |
| A11 | MEDIUM — KV store must own compare-and-set; `bun:` import mechanism undecided | Plan changed: `setIfAbsent`/`deleteIfOwner`; lazy dynamic import + `runtimeImports`; P0 item. |
| A12 | MEDIUM — signals home in core unreachable from queue | Plan changed: portable primitive in `runtime/signals.ts`; core keeps policy. |
| A13 | MEDIUM — JSX runtime home should be `@lockness/hono` (116 `.tsx` in packages that cannot import core) | Plan changed: home moved to `packages/hono/jsx_*runtime.ts`. |
| A14 | MEDIUM — migrated list and `engines` were two lists of one fact | Plan changed: lint scope derived from `engines`; separate list deleted; soft edges in the invariant. |
| A15 | MEDIUM — runtime `@std` use beyond path/fs, path row understated | Plan changed: "no `@std/*` in published runtime code" with replacements; one enforcement home (`npm_check`). Correction: `@lockness/testing` (`testing/db_assertions.ts`) is deliberately unpublished, so its `@std/assert` stays. |
| A16 | MEDIUM — ProjectManifest duplicate list incomplete; kit stubs; self-version from a generated file | Plan changed: duplicates widened; generated kit manifests (folds #531); own-version module row. |
| A17 | MEDIUM — JSR conditional exports would be a second detector | Plan changed: rejected outright (FR-002); removed from P0. |
| A18 | MEDIUM — `react-jsx` not proven to fix #472 (confirms #471, #472) | Plan changed: P0 reproduction; FR-007 and the `jsx` key retirement wait on it. |
| A19 | MEDIUM — Bun's missing-module error is not an `Error` | Plan changed: classifier duck-typed, per-lane test; risk row. |
| A20 | LOW — launcher row ignored `nessy.cmd`; #583 timing | Plan changed: `.cmd` generated too; #583 fixed on its own before P4. |
| A21 | LOW — fold #582, #575 | Plan changed: #582 folded; `SetupContext` a named typed export; `package:install`'s dynamic import recorded with `runtimeImports`. |
| A22 | LOW — codemod counts wrong | Plan changed: §1 and §6 corrected. |
| A23 | LOW — JSR/npm version parity unverified | Plan changed: `registry_parity.ts` in `/ship` step 5. |

**Verdict and coverage.** The seat covered the §5 table against FR-001..016 and the §6 invariants,
the A/B reconciliation, contract's suitability, the policy legality of every row, backlog overlap
(#472, #471, #583, #581, #582, #575, #576, #579, #531, #515, #565) and a counted blast radius. Not
checked: Bun/Node installing from `deno.lock` alone (now a P0 item), `@lockness/transform`
internals, redis battery re-anchoring, non-Node `engines` keys, the constitution and
`docs/testing.md` texts.

**Disposition D — JSR test dependencies on the Bun and Node lanes (`architect-expert`, 2026-10-16, from the C08 lane).** The Node lane failed every `@lockness/transform` test on `ERR_MODULE_NOT_FOUND: @std/assert`: `lockness.jsr` reaches Deno's import map only, and C07 declared `engines.node` before any lane could prove it (§9: a package declares a runtime only once its suite passes on that lane). Decided: JSR-only packages are declared by audience (§5 row); C08 lands it as one sweep (test-only entries across the workspace, plus `@lockness/testing`'s runtime `@std/assert` into its `dependencies`, allowed because it is private), so transform keeps `engines.node`, proven by the lane in the same merge. Rejected: `node:assert/strict` (re-amends the constitution Testing section, a second semantic codemod over 3,697 tests, and FakeTime/mock still need the mechanism); a Node loader plus Bun plugin over `deno.json` (two resolvers, a path no consumer runs, breaks F7); all JSR declarations in standard npm fields now (`jsr:` in npm's consumer field for 17 packages; loses the A15 debt list); one root `devDependencies` (breaks per-package declaration, kept by Q2); withdrawing `engines.node` (retracts a provable claim, defers the mechanism to P2). Residue: `@libs/markdown` (§9); a test can import a JSR package only a sibling declared, on every runtime (hoisting, root import map); the two resolutions of one package can drift in `deno.lock`; Bun at the 1.4.3 pin unmeasured; npm.jsr.io becomes a fetch origin of every `deno install`, the npm holder's included, for security-expert at C09.

**Disposition E — npm build/check scope before P2–P4 and hard rule #2's staging (`architect-expert`, 2026-10-16, before C09).** `npm:build`/`npm:check` run over row 201's scope, the predicate of the lanes and the lint; `@lockness/transform` alone at C09. Engines monotonicity closes the scope under `references`; the generated `--allow-write` list fails a stray reference closed. Rule #2 lands with C09 as the Q2 sentence verbatim plus a transition paragraph naming `lockness.jsr` as the only tolerated runtime JSR imports, deleted with the field: enforcement scope and timing are staged, the meaning is not. C09 also gains a home for the framework compiler options, a published-manifest allowlist with staging, a registry-free linked install, a `.d.ts` consumer type-check and a gitignored `dist/`. Rejected: an npm-readiness marker (second copy of row 201, own monotonicity check, untested npm artifacts); all packages with a ratchet (the exception list row 172 forbids); deferring C09/C03 to P3 (an unexercised pipeline, unproven migrations, C03 further past Q2: C07's `typescript` already landed under the old exception); scoping the rule itself (a meaning change, the maintainer's call); the verbatim text alone (a rule the tree breaks). Cost: joining bun/node now also requires a tsc build and `npm:check`. Residue: the sibling-reference path first runs at C12; npm's resolver only in P5; outside the scope, a new use of an already-listed specifier is caught by review alone; Node/npm (and Bun once a package names it) become gate prerequisites; `deno_kv` files type `Deno` structurally (T030); npm.jsr.io stays owed to security-expert.

Amended 2026-10-16 at C09 (`architect-expert`): tsc 6.0.3 leaves `.ts` specifiers in `.d.ts` by design and they resolve for TypeScript consumers, so declarations ship as tsc emits them. The staging rewrite and the `.d.ts` half of `npm:check`'s `.ts` rule are removed. The guarantee is the consumer type-check on the pinned TypeScript; a `.d.ts` tool with its own resolver, or a TypeScript older than the tested one, is not supported.

## 11. Security audit

_`security-expert` against this document, 2026-10-16. Verdict **fail**: 2 HIGH, 7 MEDIUM, 3 LOW.
All accepted and folded in; none rejected._

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | HIGH — npm bytes must be built by tsc, which collides with "the id-token holder never takes other jobs' bytes" (confirms #476/#541, corrects #541's scope) | Routed to `architect-expert`. **Disposition C**: build inside the npm holder from `github.sha`, tsc confined by Deno's sandbox (no env, no net, writes only to `dist`), nothing handed in; `npm-kits` proves the build deterministic first. Rejected: artifact handoff (a compromised build job decides the published bytes — easier than minting a token); rebuild-and-compare (all the holder risk plus foreign bytes); unsandboxed build (tsc could read the token variables — the #476 failure). Residue: JSR binds trust to the repo only, so only the sandbox keeps a token minted in `publish-npm` from being usable on JSR (P0 confirms); tsc is trusted for what it emits; deno/node pinned by version, not integrity. Rows in §5 "Distribution and CI". |
| S2 | HIGH — `@lockness`, `create-lockness`, `lockness` unclaimed on npm while #584 announces them; unfixable later | Plan changed: blocking P0 maintainer reservation; lockfile check; local-tarball smokes. Flagged to the maintainer 2026-10-16. |
| S3 | MEDIUM — two holders could each mint tokens the other registry accepts; first-publish token unbounded (confirms #480) | Plan changed (disposition C): npm trusted publisher bound to environment `npm` used only by `publish-npm`; placeholder bootstrap for the first publish; the reverse direction (JSR) closed by the build sandbox. |
| S4 | MEDIUM — `@Throttle` keys on forgeable forwarding headers (pre-existing; code comment's claim disproven) | Filed as #586 (P1, Bug, `security`); uses `runtime/http.ts` `getConnInfo` once available. |
| S5 | MEDIUM — cookie revocation moves to per-host SQLite with no redis adapter | Plan changed: configurable revocation backend, redis adapter, production warning, upgrade note. |
| S6 | MEDIUM — Deno's sandbox is the image's only restriction; gone on Bun/Node | Plan changed: per-runtime image row (Node `--permission`, Deno narrow write, Bun documented); release note. |
| S7 | MEDIUM — KV key encoding, prefix scan and file mode unspecified and persisted | Plan changed: injective length-prefixed encoding, bound keys, range scans, 0600 files, project-local default path. |
| S8 | MEDIUM — static containment would depend on three adapters | Plan changed: one framework containment check in `runtime/http.ts`; cross-runtime contract test incl. CSWSH and equal limits. |
| S9 | MEDIUM — transform cache undesigned | Plan changed: project-local 0700 cache, full SHA-256 key, outside `node_modules` only, refuses production. |
| S10 | LOW — redis `node:tls` mechanism unstated | Plan changed: explicit TLS options, bounds before append, live tests on every lane for self-signed and wrong-name certificates. |
| S11 | LOW — tarball content and lifecycle scripts ungated | Plan changed: `npm_check.ts` content rules. |
| S12 | LOW — `process.ts` argv construction | Plan changed: no shell, JS entry under `execPath`, `execArgv` allowlist. |

Checked and not a finding: the scaffolder's user-agent signal (user's own environment; parsed to
`RuntimeId`, never interpolated); `@hono/node-server` conninfo (socket address); session and
revocation lookups (exact keys); source maps and `.d.ts` (public source).

**Q4 — what an authenticated stranger can do to someone else's account.** Through the new storage
layer, nothing, given S7's encoding rules. Before this plan's changes: survive a victim's logout on
other instances (S5, now fixed in plan) and brute-force past `@Throttle` (S4, #586).

**Verdict and coverage.** Covers the whole plan and every cited code site. Not checked: Hono
serve-static advisories on Bun/Node; npm trusted publishing before a first version (P0); Bun
`node:tls` and `rejectUnauthorized` (P0); permissions `node:sqlite` needs on Deno; ownership of the
`@jsr` scope on npmjs.org; CVE triage of the new npm dependencies (dependency-expert at review).

## 12. Open questions

| # | Question | Answer | Date |
| :--- | :--- | :--- | :--- |
| Q1 | Deno KV drivers after SQLite ships: deprecate then delete in the next minor (disposition A), or keep them as optional Deno-only drivers beside SQLite? | **Keep them** as optional Deno-only drivers beside SQLite; no deprecation. | 2026-10-16 |
| Q2 | Hard rule #2 rewording (§7 complexity tracking): accept the proposed text? | **Accepted** as written; AGENTS.md and the constitution mirror change in P1, before the first npm dependency lands. | 2026-10-16 |
| Q3 | Node single-file binaries: refuse in this epic and track Node SEA as a gated follow-up, or bring experimental Node SEA into the epic? | **Out of the epic**: Node refuses with a clear error; Node SEA is a follow-up item gated on SEA's stability. | 2026-10-16 |
| Q4 | Rename `@lockness/init` to `@lockness/create`, so apps start with `npm create @lockness` / `bun create @lockness` / `deno run -A jsr:@lockness/create`? | **Yes**, `@lockness/create`. | 2026-10-16 |

### Already settled by the maintainer (2026-10-16)

- Runtimes: Deno, Bun and Node. Distribution: JSR and npm. The public API may break freely pre-1.0.
- Approach: TypeScript common base (web standards + `node:`) with a minimal `@lockness/runtime`;
  a Rust or Go core rejected.
- Deno stays supported as long as it works. Deno-only features get an equivalent everywhere.
- Reference runtime: not decided. Until it is, the scaffolder prompts when it has no signal.

### Decided without asking

- Breaking changes listed in §8 are accepted under "break freely pre-1.0"; each is named in the
  release notes and, where mechanical, done by `@lockness/upgrade`.
- The `--force` port-release flag is kept (removing it would be a product change); only its plumbing
  changes.
- The monorepo toolchain stays on Deno until the B4 trigger; the standing rule of no upstream Deno
  issues applies to the trigger's "defect with no fix in one release".
- Reserving the `@lockness` npm names is a maintainer action, now blocking in P0 (S2).
- #585 (lockness.land off Deno Deploy) and #586 (`@Throttle` key) stay separate items.
- Kits default to `isProduction ? 'sqlite' : 'memory'` on every runtime, Deno included, so one
  config works everywhere; `deno-kv` stays selectable on Deno (Q1).
