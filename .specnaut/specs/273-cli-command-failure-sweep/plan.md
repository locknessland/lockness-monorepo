# Plan: every failed command exits non-zero

**Branch**: `273-cli-command-failure-sweep` | **Date**: 2026-10-05 | **Backlog item**:
[#436 — cli: migrate remaining command failures to CommandFailedError (❌ + exit 0 across packages) and replace Deno.exit(1) inside handlers](https://github.com/locknessland/lockness-monorepo/issues/436)

**This is the feature's one planning document.** Ground truth measured on `main` at 88b6a813.

---

## 1. Why this exists

[#428 — drizzle: db:* commands exit 0 when they fail, so scripts and CI read a failure as success](https://github.com/locknessland/lockness-monorepo/issues/428)
gave `@lockness/cli` an exit contract: a handler throws, `Cli.dispatch()` prints `❌ <message>`
once and returns a non-zero status. Only `db:*` uses it. Everywhere else a failed command prints
`❌` and **exits 0**, so `./nessy make:controller && git add .`, a CI step, or
`RUN deno task cli compile` in a Dockerfile goes green on failure. That last case already cost a
design option: #503 rejected a compile-in-image Dockerfile because a failed `compile` would not
fail the build.

Measured at 88b6a813: **79 `❌` command-failure sites in 13 packages, plus one warn-and-continue
path in `compile`**. Of those, **68 still exit 0** (67 `❌` sites plus `compile:115`); the other 12
already exit 1 through a paired `Deno.exit(1)`, so only their mechanism changes (A7). Eight more
command-path lines print `⚠️`/`✗` and carry on (A4, §6). **13 `Deno.exit(1)`** calls sit in command code. They skip
`finally` blocks and can cut off output that is still buffered. `docs/nessy.md:239` already
promises "a command that fails … exits non-zero". Today that holds for `db:*` only.

## 2. User scenarios

### US1 — A failed generator fails the script (P1)

**Given** an app with `app/controller/user_controller.ts` already present
**When** `./nessy make:controller` runs with no name, or the file write throws
**Then** stderr shows exactly one `❌ <reason>` line and the exit status is non-zero.

### US2 — A failed compile fails the build (P1)

**Given** a `@Kernel` app whose pre-compile script exits 1, or a broken controller that breaks
route generation, or a `deno compile` error
**When** `deno task cli compile` runs
**Then** the status is non-zero and no "✅ Compilation successful" line is printed.

### US3 — Standalone tools fail honestly (P2)

**Given** `deno run jsr:@lockness/upgrade`, `jsr:@lockness/ui add Nope`, `jsr:@lockness/init`
with a bad `--kit`, or `jsr:@lockness/<pkg>/install` outside a project
**When** the tool fails
**Then** it prints one `❌` line and exits non-zero, without calling `Deno.exit()`.

### US4 — Third-party-safe packages meet the contract (P2)

**Given** a package whose dependency policy forbids importing `@lockness/cli` (for example
`make:mail`)
**When** its command rejects input
**Then** the CLI exits non-zero through that package's one local failure class, matched by shape,
with no new dependency edge (D1).

### Edge cases

- A command that does several things and one of them fails (`auth:install`, `make:model -a`,
  `make:crud`, openapi install's `addPackage`, compile's route generation). See product
  question P1.
- A handler that both prints `❌` and throws would print twice. The dispatcher is the only
  printer.
- A usage hint printed under the error (`make:action`, `nessy:install`) moves into the error
  message, as `db:seed` already does ("Run `deno task cli make:seeder Database` first."), on the
  same line: a failure message is one line (D4).
- `init` run standalone calls its handler through a hand-rolled `cliMock`
  (`packages/init/mod.ts:445-460`), not `Cli.dispatch`. It is deleted; `runInit` runs through
  `runEntry` (D2).
- `upgrade`'s `main()` (`packages/upgrade/mod.ts:193`) and `drizzle/install.ts:428` are not
  awaited; both become `await runEntry(…)` (D2).
- An escaped throw from a standalone entry exits 1 but Deno prints the message, source line,
  stack and whole `Caused by:` chain unredacted — measured; awaiting `main()` does not help (S2).

## 3. Requirements

**The set** is enumerated by search, never by example. Run it over non-test `.ts`/`.tsx` under
`packages/`:

```bash
grep -rn "❌" packages --include='*.ts' --include='*.tsx' | grep -v "/tests/\|\.test\.\|_test\."
grep -rn "Deno\.exit(" packages --include='*.ts' --include='*.tsx' | grep -v "/tests/\|\.test\.\|_test\.\|/stubs/"
```

At 88b6a813 this gives 109 `❌` lines and 24 `Deno.exit(` lines. Section 6 classifies every hit.
The glyph search alone misses failures that print `⚠️` or `✗` and carry on (A4), so a third
search over command paths lists those, and §6 classifies them too:

```bash
grep -rn "⚠️\|✗" packages --include='*.ts' --include='*.tsx' | grep -v "/tests/\|\.test\.\|_test\."
```

The sites below are a snapshot to check against. The searches are the definition.

- **FR-001**: Every command handler outside `db:*` that reports a failure throws. Either it throws
  a failure-shaped error with a one-line message it wrote, carrying the caught error as `cause`
  when one caused the failure; or, for a catch-all that only restates the command, it deletes the
  catch and lets the error reach the dispatcher's redacted catch-all. No caught error's text is
  interpolated into a failure message. This covers the in-scope `❌` sites in §6.
- **FR-002**: No command handler and no standalone tool entry function calls `Deno.exit()`. This
  covers the 13 `Deno.exit(1)` sites. `init/mod.ts:411,441` and `upgrade/mod.ts:162` become
  `return`s inside the function given to `runEntry`. The only `Deno.exit(` left in `packages/` is
  `core/http/server.ts:165` and `core/kernel/signals.ts:99,109,117`. Enforced by
  `lockness-exit/process-exit` (D5).
- **FR-003**: `compile` exits non-zero on all five paths in `packages/core/cli/compile_command.ts`:
  `:84` no kernel; `:115` route generation fails (warning today; a failure with `cause`); `:144`
  pre-compile script and `:219` `deno compile` fail — the child's output passes through as it is
  written, and the failure names the step and exit code (`<step> failed (<program> exited
  <code>)`, the #445 `kitFailure` wording); `:226` the catch is deleted, so anything thrown reaches
  the dispatcher's catch-all.
- **FR-004**: A failed command prints its failure exactly once. Nothing in a handler prints `❌`
  for a failure it also throws.
- **FR-005**: All six standalone entries (`ui/mod.ts`, `upgrade/mod.ts`, `init/mod.ts`, and the
  `install.ts` of openapi, drizzle and deprecation-contracts) run their work through `runEntry`
  from `@lockness/cli/entry`. It applies `Cli.dispatch`'s two printing branches to **any** throw,
  not only failures, and sets `Deno.exitCode`. The `import.meta.main` block contains only
  `await runEntry(…)`. An installer's work is its module's default-exported async function, which
  throws and never touches process state (#575).
- **FR-006**: The `❌` lines that are not command failures stay as they are, and the PR body lists
  them: the 30 "left" rows in section 6.
- **FR-007**: Each migrated package has at least one test that pins its change. For a registered
  command it goes through `Cli.dispatch`. For a standalone entry it runs as a subprocess
  (`ui/tests/cli.test.ts:260` is the precedent) and asserts a non-zero exit, exactly one `❌` line,
  and no `error: Uncaught`. A fake credential, built at run time and placed in both message and
  cause, is asserted absent once per printing path in cli: the `Cli.dispatch` failure branch and
  `runEntry`. One table-driven test registers every package's commands on a `Cli`, dispatches each
  `make:*` with no name in a temp directory, and asserts a non-zero status and exactly one
  `console.error` (A3).
- **FR-008**: Each doc that describes a migrated command's failure output or exit behaviour is
  updated. Find them with
  `grep -rln "❌\|exit" packages/*/README.md packages/*/docs docs`. Known today:
  `docs/nessy.md:232-243` becomes true and is checked; `docs/compilation.md` gains the exit
  behaviour; `packages/openapi/README.md:120` is checked; `packages/cli/INSTALL_SCRIPTS.md` (the
  installer shape); `packages/cli/README.md:86-88`; `packages/cli/docs/DOCS.md:205-240,300-310`
  and `:316-317` (the "still exit 0" sentence is deleted); `packages/cli/AGENTS.md:26-28` (the
  package list becomes core, mail, notification, features, search, i18n — scheduler removed);
  `packages/contract/AGENTS.md` (`renderMessage`).
- **FR-010**: When one step of a multi-step scaffolder fails (`auth:install`, `make:model -a`,
  `make:crud`, `make:controller --view`, the openapi and drizzle installers, `jsr:@lockness/init`'s
  remote scaffold), it finishes the remaining steps, then exits non-zero naming the failed steps
  (P1). `compile` instead stops before `deno compile` when route generation fails or a declared
  asset is missing: no binary is built (P1).
- **FR-011**: The `./nessy` wrappers exit non-zero when `install` or `bump` is run with no argument
  (`cli/stubs/nessy/nessy.stub:96,107`, `nessy.cmd.stub:99`), matching `docs/nessy.md` (P2). The
  shell stubs stay outside the lint rules; a stub test pins the status.
- **FR-009**: The printer renders a failure's message with contract's `renderMessage` (credential
  URLs and pairs redacted, control and format characters encoded, one line, bounded) and its
  `cause` with `renderError`. A failure message is one line.

## 4. Success criteria

- **SC-001**: Every command failure covered by FR-001/FR-003 ends the process with a non-zero
  status. Each migrated package has a test proving it.
- **SC-002**: `deno lint` passes with `lockness-exit/process-exit` (owners:
  `core/http/server.ts` and `core/kernel/signals.ts` for `Deno.exit`, `cli/report.ts` for
  `Deno.exitCode`) and `lockness-exit/printed-failure` (exactly 4 inline ignores). The §3
  searches stay as the tool that lists the work.
- **SC-003**: A failed command shows the user one `❌` line, never two.
- **SC-004**: `RUN deno task cli compile` fails a container build when compilation fails. This
  lifts the reason #503 gave for deferring that option.

## 5. 🔒 Decision table

Settled by the architect-expert disposition of 2026-10-05 (D1–D5, §12). One principle drives D1
and D2: **a shape can be matched locally; behaviour has to be imported.** The failure protocol is a
shape any package produces without an edge; printing, redaction and status mapping are behaviour.

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| A thrown error is printed once and mapped to a status, for a command or a standalone entry | `packages/cli/report.ts` (internal): `reportThrown` (both branches, never throws) and `applyExitStatus` (the one `Deno.exitCode` write), called by `Cli.dispatch`, `Cli.run` and `runEntry` | `❌` then `return`/fall-through in a handler; a handler that prints then throws; `Deno.exitCode =` or `Deno.exit(` outside it; a try/catch in a standalone entry |
| What counts as a failure, and the 1–255 clamp | `packages/cli/exit_status.ts` (unchanged, cli-only) | `instanceof CommandFailedError`; a second `Number.isInteger(…exitCode)`; a local clamp |
| How a package that may import cli builds a failure: cli, init, openapi, drizzle, ui, upgrade, deprecation-contracts | `@lockness/cli/command-failure` | a barrel import in a commands module; a local subclass in any of these seven |
| How a package that may not import cli builds a failure: core, mail, notification, features, search, i18n | One local class per package (`readonly exitCode = 1`, `Error`'s own `(message, options)`), beside the structural `Cli` interface, unreachable from `exports`, pinned by a test through the real `Cli.dispatch` | a second or exported class; `Object.assign(new Error(), { exitCode })`; a local clamp or recogniser |
| How a standalone entry runs its work | `runEntry(label, main)` in `packages/cli/entry.ts` (`@lockness/cli/entry`, imports `report.ts`, never the barrel) | a try/catch in the block; `cliMock`; an unawaited `main()`; a `Cli` built to run one function |
| The installer contract | `export default async function install()` per `<pkg>/install.ts`, documented in `INSTALL_SCRIPTS.md` (#575 reuses it) | work inside `main()` behind `import.meta.main`; a second shape in a README |
| How a caught error reaches the output | `report.ts`: the failure's `cause`, rendered with `renderError` after the message | a caught error's text (`.message`, `getErrorMessage`, `renderError(e)`, `String(e)`, the error as a `console.*` argument) in a failure message or handler output |
| How a failure message is rendered | `renderMessage` in `contract/logging/sanitize.ts` (one shared private redaction chain with `renderOne`/`renderFrame`; bounded by `safeForLog`'s 512 code points), exported on `@lockness/contract/logging/internal` only | a second redaction chain; the raw message at the printer |
| How a failed child process is reported | One step runner in `core/cli/compile_command.ts`: output inherited, failure `<step> failed (<program> exited <code>)` | child stderr decoded into a message or a `console.error` |
| Finish the steps, then fail (P1) | `runSteps(steps)` in `packages/cli/command_failure.ts`: runs every step, then throws one `CommandFailedError` naming the failed steps (`2 of 4 steps failed: repository, seeder`), first failure as `cause`. Packages that may not import cli (none of the multi-step commands today) would not use it | a collect-then-throw loop in any of the five multi-step commands |
| The public `handleMake*` helpers | Throw the package's local class, return `Promise<string>`, removed from the five `mod.ts` barrels (#564) | a helper that returns `undefined` on failure; a closure that re-derives the reason |
| Which process-exit sites are legitimate | `scripts/lint/exit_contract.ts`, rule `process-exit`, owner list in the rule file | the list restated in a test, prose or site comments |
| Which `❌` prints in command code are not failures | rule `printed-failure`: path scope plus 4 inline ignores, each with its reason | the list restated in a test or prose |
| Compile does not produce a binary from stale routes | `packages/core/cli/compile_command.ts` | a second check in a pre-compile script or in `generateRoutesFile` |

### Rules for code that throws (D4)

1. An expected failure you can explain: a one-line message you wrote, no cause.
2. An expected failure caused by a caught error: the message names the step, file or next action;
   `cause: error`. Examples: `router_commands.ts:131`, `compile_command.ts:115`.
3. A catch-all that only restates the command: delete the catch (S4, applied everywhere).
4. A helper that validates user input throws the failure itself (init's `resolveKit`). Boundary
   translation is only for code that must not depend on the CLI (drizzle `assertNotProduction`).
5. Child processes: rule in the row above; one runner serves `compile_command.ts:144` and `:219`.

### Dependency reachability (A1)

| Package | Builds a failure with | Prints and maps the status | Renders a caught error |
| :--- | :--- | :--- | :--- |
| cli | `./command_failure.ts` | `report.ts` | `report.ts` |
| init, openapi, drizzle | `@lockness/cli/command-failure` (edge exists) | `runEntry` (edge exists) | the printer |
| ui, upgrade, deprecation-contracts | `@lockness/cli/command-failure` (**new edge**) | `runEntry` (**new edge**) | the printer |
| core, mail, notification, features, search, i18n | one local class (no edge) | `Cli.dispatch` | the printer |

The widening is one `chore(deps)` commit that lands first: `ui` → `["cli","hono","markdown"]`,
`upgrade` → `["cli"]`, `deprecation-contracts` → `["cli"]`, each declaring `@lockness/cli` pinned.
No cycle (cli reaches contract, events, queue, redis, hono). The stale cycle comment at
`deprecation-contracts/install.ts:16-17` and the "zero-dependency" note in the policy are corrected.

## 6. Technical context

**Language/Version**: Deno 2, TypeScript, TC39 decorators. **Primary dependencies**:
`@lockness/cli` and `@lockness/contract` (`renderError`). **Storage**: N/A. **Testing**:
`Deno.test`, `cli.dispatch()` with captured `console.error`, subprocess runs for standalone
entries. **Project type**: framework packages (CLI surface). **Constraints**: `deps.policy.jsonc`
is binding (`deno task deps:analyze`). Internal helpers live in modules not listed in `exports`
(#564/#440). The `command-failure` export imports only `exit_status.ts`. **Scale**: 79 + 1
failure sites, 13 `Deno.exit(1)`, 13 packages.

### Inventory at 88b6a813 (classifies every search hit)

**In scope: `❌` sites become throws.**

| Package | Sites (file:line) | Count |
| :--- | :--- | ---: |
| cli | `commands/make/` action 26,42,150,208,214 · command 24,51 · component 24,51 · controller 24,102 · crud 26,155 · error_pages 88 · event 25,63 · job 25,56 · listener 25,61 · middleware 24,50 · policy 24,50 · resource 30,54 · schedule 25,68 · service 24,48 · view 24,44 | 32 |
| cli | `core_commands.ts` 47,61,102,115 · `commands/auth_commands.ts` 95 · `commands/router_commands.ts` 131,271 · `commands/queue_commands.ts` 343 · `commands/nessy_commands.ts` 56,126 | 10 |
| drizzle | `generators/factory_generator.ts` 24,38 · `generators/model_generator.ts` 192,233,259,282,310 · `generators/seeder_generator.ts` 31,54 (`make:*`; `db:*` is done) | 9 |
| core | `cli/compile_command.ts` 84,144,219,226 (+ the `⚠️` at 115) | 4+1 |
| ui | `mod.ts` 267,279,381,390 | 4 |
| init | `mod.ts` 282,291,395 | 3 |
| openapi | `install.ts` 61,84 · `cli_commands.ts` 41 | 3 |
| i18n | `cli_commands.ts` 72,77,86 | 3 |
| deprecation-contracts | `install.ts` 45,168 | 2 |
| mail · features · search | `cli_commands.ts` 59,68 · 60,69 · 59,68 | 6 |
| notification | `cli_commands.ts` 100,109 | 2 |
| upgrade | `mod.ts` 179 | 1 |

**In scope: `Deno.exit(1)` becomes a throw (13).** `cli/core_commands.ts:103` ·
`init/mod.ts:283,292,400` · `ui/mod.ts:269,281,383,391` · `upgrade/mod.ts:180` ·
`openapi/install.ts:74` · `deprecation-contracts/install.ts:143,169` · `drizzle/install.ts:408`.
The issue's line numbers for `core_commands` (100) and `drizzle/install` (349) have drifted.

**Left as is (30 `❌`), listed in the PR.**
- The contract itself: `cli/mod.ts` ×7, `cli/command_failure.ts` ×2.
- The REPL degrades and keeps going: `cli/commands/tinker_command.ts:109,141,271`.
- The worker starts without one broken job file: `cli/commands/queue_commands.ts:216`.
- Boot-time package loading, before dispatch: `cli/package_loader.ts:95`.
- Server runtime and process level in core: `exceptions/formatter.ts:56,92`,
  `exceptions/handler.ts:84`, `routing/discovery.ts:90,186`, `http/resolver.ts:77`,
  `http/server.ts:226`, `kernel/boot_runner.ts:108`, `kernel/shutdown_registry.ts:287`,
  `kernel/signals.ts:115`.
- The `Database` library log: `drizzle/mod.ts:112,285,638`.
- A level icon: `logger/formatters.ts:57`.
- Worker job logs: `queue/worker.ts:157,174`.

**How the in-scope sites change (D4).**
- *Catch-alls deleted (rule 3), 23 sites*: cli `make/` action 214, command 51, component 51,
  error_pages 88, event 63, job 56, listener 61, middleware 50, policy 50, resource 54, schedule 68,
  service 48, view 44 · `router_commands.ts` 271 · `nessy_commands.ts` 126 · `core_commands.ts` 102
  · `compile_command.ts` 226 · drizzle `factory_generator.ts` 38, `seeder_generator.ts` 54 ·
  `ui/mod.ts` 390 · `init/mod.ts` 395 · `deprecation-contracts/install.ts` 168 ·
  `upgrade/upgrader.ts:193` (stops stringifying; `Upgrader.upgrade()` lets unexpected errors throw —
  a public behaviour change).
- *Multi-step, through `runSteps` (P1 = finish, then fail)*: controller 102, crud 155,
  `auth_commands.ts` 95, `model_generator.ts` 233, 259, 282, 310, `openapi/install.ts` 84.
- *Failure with a cause (rule 2)*: `router_commands.ts:131`, `compile_command.ts:115`.
- *Thrown at the source (rule 4)*: `init/mod.ts:282` (`resolveKit`), `:291` (`resolveVersion`, for
  input it rejects; a fetch failure propagates).
- *Every other in-scope site*: rule 1.
- *Also changed outside the 79*: the 15 cause-carrying `CommandFailedError` sites in
  `drizzle/cli_commands.ts` drop the cause text from their message (or the cause, at `:385`, `:679`,
  `:719`); the multi-line message at `:936` becomes one line. drizzle's `ProjectStructureError`
  becomes a `CommandFailedError` subclass (same public name) and `checkProjectStructure` stops
  printing its `✗` line.

**Warn-and-continue failures outside the glyph search (A4), 8 lines.**
- *Partial scaffold — becomes a `runSteps` step (P1)*: `cli/stubs.ts:220,238` (remote `Stub.scaffoldFrom` skips a file
  that fails to fetch; `jsr:@lockness/init` always takes this branch) · `init/mod.ts:337` (binary
  copy) and `:386` (`.env.production.local`) · `drizzle/install.ts:169` (`✗ Failed to create dir`)
  · `make/controller.ts:62` (`--view` falls back to the plain stub).
- *Binary built without a declared asset — a failure before `deno compile` (P1)*: `compile_command.ts:196`.
- *Swallowed, in scope (rule 2)*: `deprecation-contracts/install.ts:129` — `addPackage` turns its own
  failure into a warning, so the `❌` at `:168` ("Failed to add package") never fires for it and
  catches only `updateEnvFile` under the wrong message. `addPackage` throws; `:168` is deleted.

**Dependency reality.** Before this feature only `init`, `openapi` and `drizzle` may import
`@lockness/cli`; nine packages with failing commands may not (the issue named five). After D2,
seven may — ui, upgrade and deprecation-contracts through three new edges. Six may not and use a
local class: core, mail, notification, features, search, i18n. `renderError` is called only in
cli's `report.ts`. `scheduler` has no failing command.

### Domain model

- **Bounded context**: cli exit contract, applied to command handlers and standalone tool
  entries across packages.
- **Vocabulary**:
  - *command failure*: a handler path that did not do its job.
  - *failure-shaped error*: an `Error` with an integer `exitCode`.
  - *standalone entry*: an `import.meta.main` tool run with `deno run jsr:…`, not through `Cli`.
  - *process-level exit*: server boot or signal shutdown. This is not a command.
- **Entities**: command handlers registered on `Cli`, identified by command name.
- **Value objects**: exit status (0 or 1–255).
- **Invariants**: a failed command never exits 0. No handler or entry function calls
  `Deno.exit()`. A failure is printed once. Recognition is by shape, never by class. A failure
  message is one line, and a caught error travels in `cause`, never in the message.
- **Out of scope**: `db:*` (#428), the contract itself, process-level exits, repo tooling under
  `scripts/`, and raw error prints off the command path (#490).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1 No direct `hono` | pass | Not touched |
| 2 JSR-only, declared per package | pass | D2 adds ui → cli, upgrade → cli, deprecation-contracts → cli, each declared pinned; one `chore(deps)` commit that lands first. Local-class conformance tests declare `@lockness/cli` for tests only (realtime → notification precedent) |
| 3 No `any` in exported APIs | pass | D3 removes `handleMake*` from the barrels. The existing `registerCoreCommands(cli: any)` is #576, not this feature |
| 4 Tailwind syntax | pass | N/A |
| 5 Gate | pass | `deno fmt` + `deno task gate` per commit |
| 6 `deno.lock` | pass | Regenerated by `deno task` for the D2 edges |
| 7 JSDoc | pass | `@throws` on changed handlers; JSDoc on `runEntry`, `renderMessage`, `runSteps` and the three installer default exports |
| 8 MVC layering | pass | N/A (CLI) |
| 9 Commit discipline | pass | One `fix(<pkg>)` per package plus `test`/`docs` splits |
| 10 Public repo | pass | No environment detail |
| 11 Design to architect | pass | D1–D5 routed to architect-expert |
| 12 Act, don't recommend | pass | Follow-ups go to product-owner |
| TDD | pass | A failing test first, per package, pinning what actually changes: "→ non-zero" for the 68 status flips; for the 12 that already exit 1 (ui, init, upgrade, deprecation-contracts, openapi installer) the entry runs in-process, prints one `❌` line, and its `finally` runs (A7) |
| No silent catches | pass | Removes swallowing catches (`compile:226`, `make:*`) |
| Domain Model gate | pass | Above |

### Complexity tracking

None.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `./nessy` / `deno task cli` commands, and the `./nessy` shell stubs (FR-011) | yes | Exit status on failure. Message text is mostly unchanged; usage hints fold into the message |
| Standalone tools (`jsr:@lockness/init`, `/ui`, `/upgrade`, `/<pkg>/install`) | yes | Non-zero via `runEntry` instead of `Deno.exit`; one redacted line instead of a raw stack |
| Public API `handleMake{Mail,Lang,Notification,Flag,Searchable}` | yes (breaking) | Removed from the five `mod.ts` barrels; internally they throw and return `Promise<string>` |
| New public subpath `@lockness/cli/entry` | yes | `runEntry(label, main): Promise<number>` |
| `@lockness/contract/logging/internal` | yes | Becomes a small barrel; gains `renderMessage`. Contract's `mod.ts` re-exports sanitize's three public names explicitly, so it cannot leak through core |
| `CommandFailedErrorOptions.cause` | yes (never released) | Now printed after the message, rendered |
| `Upgrader.upgrade()` | yes (breaking) | Rethrows unexpected errors instead of stringifying them |
| The three `install.ts` | yes | Gain a default-exported `install()` |
| drizzle `db:*` output | yes | The cause is rendered once, after the message; `:936` is one line |
| `deps.policy.jsonc` | yes | Three edges (D2) |
| Web runtime, HTTP, UI components | no | None |

Not a front-end feature.

### Documentation (this feature)

`plan.md` (this file) and `tasks.md`.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Scripts that relied on exit 0 after a "harmless" `❌` now fail | That reliance is the bug. The release note scopes it to the 68 status flips, plus the breaking `handleMake*` removal and `Upgrader.upgrade()` rethrow |
| Double print (handler prints, then throws) | FR-004. Tests assert one `console.error` per failure (`cli_dispatch.test.ts` pattern) |
| `init`'s `cliMock` and `upgrade`'s unawaited `main()` turn a throw into an unhandled rejection with a raw, unredacted stack | FR-005 / D2. Each standalone entry has a subprocess test for its failure path |
| Failure messages print raw text, so a caught error's message could leak a credential into CI logs | FR-009 / D4 |
| Existing tests assert `handleMake*` returns `undefined` (mail, i18n, features, search, notification) | Updated with D3, in the same commit as the signature change |
| Overlap with [#490 — security: route the remaining raw console.error/warn error prints through renderError (cli installers, sse, events, devtools, ui, core)](https://github.com/locknessland/lockness-monorepo/issues/490) at `core_commands.ts:102`, `openapi/install.ts:84` and `deprecation-contracts/install.ts:168` | Commented on #490. Record "resolved by #436" for a site only once #490's own fake-credential test passes through the new printer (S4) |
| [#575 — cli: package:install never runs a package's installer (no install.ts has a default export) yet exits 0](https://github.com/locknessland/lockness-monorepo/issues/575) | D2 fixes the installer side (default-exported `install()`); #575 needs only the command side |
| Mutation-battery anchors on lines this feature rewrites: `drizzle/tests/mutations/lifecycle_427.ts`, `contract/tests/mutations/dsn_redaction_301_303.ts:182,193`, `contract/tests/mutations/query_credentials_478.ts:728,739` | The checks still exist, so the anchors are repaired, not deleted (`docs/testing.md`); each row re-proven live |
| File overlap with #487 (`router_commands.ts:131`, `openapi/cli_commands.ts:41`) | Ordering only; whichever lands second rebases |
| The PR grows unreviewable across 13 packages | Commit per package. The issue allows splitting by package |

## 10. Architecture audit

architect-expert, 2026-10-05, on the plan before the D1–D5 disposition. Backlog read first (#436,
#490, #489, #487, #477, #568, #575).

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | HIGH (new). Three homes were unreachable for most packages: `exit_status.ts` 1/13, `@lockness/cli/command-failure` 4/13, `renderError` 6/13. D2 and D4 are coupled; #490's first criterion cannot be met at `ui/docs_renderer.tsx:35` or `deprecation-contracts/install.ts:168` under the current policy | Constraint given to the D1–D5 disposition; reachability matrix in §5; three edges added (D2); #490 commented |
| A2 | HIGH (confirms #575). D2 shapes the installer seam #575 must reuse | D2 adopts #575's "one installer contract": default-exported `install()` that throws; `INSTALL_SCRIPTS.md` in FR-008; §9 points at #575 |
| A3 | MEDIUM. The `❌` allowlist had no home or guard; FR-007 pinned 1 of cli's 42 sites | D5 `printed-failure` rule; FR-007 table-driven `make:*` test |
| A4 | MEDIUM. The glyph search missed 8 warn-and-continue failures, including init's remote scaffold | Third search in §3; all 8 classified in §6; the partial-scaffold cases folded into P1 |
| A5 | MEDIUM. No row for partial failure in multi-step commands | `runSteps` row, conditional on P1 |
| A6 | MEDIUM. Two child-process sites, FR-003 specified one; compile has 0 tests | One step runner, output inherited (with S3); compile tests use an injected runner in that module |
| A7 | MEDIUM. Counts mixed status flips with mechanism changes: 68 flip, 12 already exit 1 | §1 restated; TDD row per package; `drizzle/install.ts:428` edge case added; release note scoped |
| A8 | MEDIUM. FR-008 missed the published "local subclass" passages, a sentence that becomes false, and `INSTALL_SCRIPTS.md` | Added to FR-008 by line; D1 keeps the pattern and corrects the AGENTS.md list |
| A9 | LOW. D3 had no row | Row added; nothing derives the reason twice |
| A10 | LOW. `init/mod.ts:411,441` contradicted the domain model | Restructured as returns inside `runEntry`'s function; allowlist is core only |
| A11 | LOW (relates to #487). File overlap | §9 ordering note |
| — | Observed, not this plan's: `core/mod.ts:253` `registerCoreCommands(cli: any)`; no gate enforces hard rule #3 | Filed #576 and #577 |

**Blast radius (counted).** 81 distinct failure sites in 36 files; 68 status flips; 14 `Deno.exit`
mechanism changes; 5 exported `handleMake*` and 9 `undefined` assertions in 5 test files; 24
`make:*` commands (22 with a missing-name path); 5 of 6 standalone entries with no catch; 0
existing tests on `CompileCommand.handle`; `kit_smoke`'s `router:list` step gets stricter, not broken.

**Verdict**: fail as written (2 HIGH); both folded in via the D1–D5 disposition. No open HIGH.

## 11. Security audit

security-expert, 2026-10-05, separate from the architecture audit. 25 open security items read,
#490 in full.

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | MEDIUM (new, related to #490). `cli/mod.ts:427-429` prints `❌ ${error.message}` raw while the catch-all uses `renderError`; ~20 sites quote caught text. Shape recognition is not a trust signal | Accepted: `renderMessage` at the one printer; caught errors go in `cause`; one-line messages; dispatcher fake-credential test (FR-007, FR-009). Brand symbol rejected (residue below) |
| S2 | MEDIUM (new). An escaped throw from a standalone entry prints message, source line, stack and cause chain raw (measured); awaiting `main()` does not help; FR-005 covered only failures | Accepted: `runEntry` catches any throw through the dispatcher's branches. Tests: credential absence pinned once per printing path in cli; each tool asserts non-zero, one `❌`, no `error: Uncaught` (partial — six fault-injection hooks rejected as cost) |
| S3 | LOW (new). Child stderr inside the failure message is either raw or mangled | Accepted: output inherited; message names step and exit code |
| S4 | LOW (confirms #490). "Resolved by #436" on #490 could be wrong | Accepted and widened: every restating catch-all is deleted (rule 3); the #490 note waits for its test |

Exit-status semantics checked, no finding: a failure cannot exit 0 (clamp, catch-all → 1), and the
nessy stubs and `cli.ts.stub` pass the status through.

**Verdict**: needs follow-up as written (0 CRITICAL, 0 HIGH); all four folded in.

### What the decisions do not solve (named residue)

- Six identical local failure classes (core, mail, notification, features, search, i18n): accepted
  duplication; each is pinned through `Cli.dispatch`, so a drifted copy fails its test. Nothing
  mechanical stops a second or exported class — review only.
- A promise `main` starts without awaiting still escapes `runEntry`.
- Nothing pins that `entry.ts` and the runtime modules of ui / deprecation-contracts stay off the
  cli barrel — review only.
- An outside error carrying an integer `exitCode` (execa-style) takes the failure branch: redacted,
  but no frames.
- `renderMessage` catches only what `renderError` catches; JSON `"token":"…"`, `Authorization:
  Bearer` and bare tokens in our own text still pass. A usage hint like `--password=<pwd>` prints
  as `--password=***`.
- Rule 3 makes environmental failures (EACCES writing a controller) print frames and a hint.
- Inner errors that copy their cause into their own message show the text twice in the chain
  (`drizzle/migration_settings.ts:345-349`, `drizzle/migration_status.ts:211-214`,
  `openapi/discovery.ts:80-84`) — product-owner follow-up.
- Other leaked helpers stay public (`isContained` ×4, i18n `handleExtract`, notification
  `processStub`/`createFile`/`notificationNaming`) — product-owner follow-up.
- deprecation-contracts' local `addPackage` copy (`install.ts:97`) could now be the real one —
  product-owner follow-up.
- The lint rules miss aliases (`const { exit } = Deno`), glyph-less failure prints, command
  modules outside the listed paths, the shell stubs (P2) and `app/`.
- `runSteps` names second and later failures by label only (`renderError` does not render
  `AggregateError` members).

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **D1** (design → architect-expert) How do the packages that may not import cli raise a failure? | One local failure class each for core, mail, notification, features, search, i18n; ui, upgrade and deprecation-contracts throw the real class through D2's edges. Rejected: widening all nine (subpath edges are checked per package, so a later barrel import would load ~260 modules into web processes, green gate); a class in contract (still needs widening, moves the constructor away from the protocol's owner); a new package; inline `Object.assign`; an injected `ctx.fail()` | 2026-10-05 |
| **D2** (design → architect-expert) Who maps a throw to a status for the six standalone entries? | `runEntry` on `@lockness/cli/entry`, sharing `report.ts` with `Cli.dispatch`; the installer is a default-exported function that throws. Rejected: a try/catch per entry (three can't reach `renderError`; six copies of a branch that changed twice); a real `Cli` + `run()` (3 of 6, wrong no-arg semantics for upgrade); the printer in contract (same widenings, moves the exit contract away from its owner) | 2026-10-05 |
| **D3** (design → architect-expert) Do the public `handleMake*` helpers throw? | Throw, `Promise<string>`, removed from the barrels (breaking, release-noted). Rejected: keep `undefined` (an error code; the closure can't know the reason without two printers); throw and stay public (contradicts #564) | 2026-10-05 |
| **D4** (design → architect-expert) Catch-alls and quoted foreign text? | The cause is never in the message; the printer renders the message with `renderMessage` and the cause with `renderError`; restating catch-alls are deleted; messages are one line. Rejected: `renderError(e)` per site (seven can't reach it; drizzle already drifted); rethrow everything (expected failures print frames); wrap every catch-all (bugs lose frames); line-by-line rendering (log forging); a brand symbol | 2026-10-05 |
| **D5** (design → architect-expert) Guard `Deno.exit`? | One lint plugin `scripts/lint/exit_contract.ts`, two rules: `process-exit` (owners in the rule file) and `printed-failure` (command-code path scope, 4 inline ignores: `tinker_command.ts:109,141,271`, `queue_commands.ts:216`). Rejected: a test (counts comments, drifts with lines); no guard (79 + 24 accumulated); `printed-failure` across all of `packages/` (~14 exemptions) | 2026-10-05 |
| **P1** (product) When one step of a multi-step command fails: does `compile` stop before building (no binary from stale routes or a missing declared asset)? Do multi-step scaffolders — `auth:install`, `make:model -a`, `make:crud`, `make:controller --view`, the openapi and drizzle installers, and `jsr:@lockness/init`'s remote scaffold — finish the remaining steps then exit non-zero naming what failed, or stop at the first failure? | `compile` stops, no binary. Scaffolders finish, then fail naming the failed steps (FR-010) | 2026-10-05 |
| **P2** (product) Does this feature also fix the `./nessy` shell wrapper, which exits 0 on `./nessy install` or `./nessy bump` with no argument (`cli/stubs/nessy/nessy.stub:96,107`, `nessy.cmd.stub:99`)? | Yes, in this feature (FR-011) | 2026-10-05 |

### Decided without asking

- The exit status is `1` for every failure, usage errors included. That matches dispatch's
  unknown-command `1` and the `CommandFailedError` default.
- `queue:retry <id>` with an unknown id is a failure, so it exits non-zero.
- The tinker REPL, the queue worker's job-file loading and boot-time `package_loader` degrade and
  keep running, so they are not command failures and stay as they are.
- `ui add` keeps succeeding when only the `deno.json` update fails. It prints manual
  instructions, a documented fallback.
- The drizzle installer's "✗ Database connection failed" stays a warning: the install itself
  succeeded.
- `init/mod.ts:411,441` and `upgrade/mod.ts:162` become returns inside the function given to
  `runEntry` (A10).
- Usage hints fold into the failure message, following the `db:seed` precedent.
- `ssg:build` already throws a plain `Error` and exits 1, so it is out of scope.
