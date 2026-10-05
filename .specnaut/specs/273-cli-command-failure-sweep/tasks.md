# Tasks: every failed command exits non-zero

**Input**: `.specnaut/specs/273-cli-command-failure-sweep/plan.md` (the only design document)
**Backlog item**: #436

**Tests**: required. The constitution mandates TDD: each task writes its failing test first (plan
§7, TDD row: for the 68 status flips the test pins "→ non-zero"; for the 12 sites that already
exit 1, it pins one `❌` line, an in-process run, and `finally` running).

**Decision homes** (plan §5) are named in each task that touches one. No task may spell a rule
anywhere else. Every commit runs `deno fmt` then `deno task gate`, and the gate must be green at
every commit, which is why the lint plugin lands last.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 generators · US2 compile · US3 standalone tools · US4 packages that may not
  import cli

---

## Phase 1: Setup

- [X] T001 `chore(deps)`: widen `deps.policy.jsonc` — `ui` → `["cli","hono","markdown"]`,
  `upgrade` → `["cli"]`, `deprecation-contracts` → `["cli"]`; declare `"@lockness/cli":
  "jsr:@lockness/cli@^<current>"` pinned in `packages/{ui,upgrade,deprecation-contracts}/deno.json`;
  correct the stale cycle comment at `packages/deprecation-contracts/install.ts:16-17` and the
  "zero-dependency" note for deprecation-contracts in the policy. Run `deno task deps:analyze` and
  `deno task publish:check`. Its own commit, first.

---

## Phase 2: Foundational (blocks every story)

- [X] T002 `feat(contract)`: add `renderMessage(text): string` in
  `packages/contract/logging/sanitize.ts`. It runs DSN-userinfo redaction, then credential-pair
  redaction, then `safeForLog` (512 code points; `\n` → `\x0a`). Extract the two redactions into one
  private chain shared with `renderOne` and `renderFrame` (home: plan §5 "How a failure message is
  rendered"). Turn `@lockness/contract/logging/internal` into a small barrel
  `packages/contract/logging/internal.ts` re-exporting `credential_params.ts`'s two functions and
  `renderMessage`; update contract's `deno.json` `exports`. Replace `export * from
  './logging/sanitize.ts'` in `packages/contract/mod.ts` with its three public names, and check that
  core's re-export baseline is unchanged. Tests in `packages/contract/tests/`: credential URL,
  credential pair, control and format characters, newline, length bound. Repair the anchors in
  `packages/contract/tests/mutations/dsn_redaction_301_303.ts:182,193` and
  `query_credentials_478.ts:728,739`, then re-prove each row live.
- [X] T003 `feat(cli)`: add `packages/cli/report.ts` (internal, not in `exports`). `reportThrown(label,
  error): number` is `Cli.dispatch`'s catch block extracted: both branches plus the raw-errors switch.
  The failure branch prints `❌ ${renderMessage(message)}`, then ` caused by: ${renderError(cause)}`
  when a cause exists, with no frames. It never throws, even for a getter that throws on
  `message`/`cause`. `applyExitStatus(status)` is the only `Deno.exitCode` write. `Cli.dispatch`
  calls `reportThrown`; `Cli.run` calls `applyExitStatus`. The unknown-command name goes through
  `renderMessage`. Update the JSDoc of `CommandFailedErrorOptions.cause` in
  `packages/cli/command_failure.ts` to "printed after the message, rendered". Tests in
  `packages/cli/tests/`: a fake credential built at run time, in both message and cause, is absent
  from captured stderr; an escape character is encoded; exactly one `console.error` per failure; a
  throwing getter does not escape. (Home: plan §5 rows 1 and 7.)
- [X] T004 `feat(cli)`: add `packages/cli/entry.ts` with `runEntry(label: string, main: () => void |
  Promise<void>): Promise<number>`, exported as `./entry` in `packages/cli/deno.json`. It imports
  `report.ts` only, never the barrel, and catches **any** throw. Full JSDoc with `@example` `if
  (import.meta.main) await runEntry('tool', () => main(Deno.args))`. Tests: in-process (a failure
  gives status 1 and one `❌` line; a `TypeError` goes through the catch-all branch) plus a subprocess
  fixture under `packages/cli/tests/fixtures/` (non-zero exit, a fake credential in message and cause
  absent from stderr, no `error: Uncaught`). (Home: plan §5 "How a standalone entry runs its work".)
- [X] T005 [P] `feat(cli)`: add `runSteps(steps: readonly CommandStep[]): Promise<void>` and the
  `CommandStep` type to `packages/cli/command_failure.ts`, with no new imports. It runs every step,
  then throws one `CommandFailedError` (`<n> of <m> steps failed: <labels>`) with the first failure as
  `cause`; it resolves when all steps pass. JSDoc and tests. (Home: plan §5 "Finish the steps, then
  fail".)
- [X] T006 `fix(drizzle)`: following T003, the 15 cause-carrying `CommandFailedError` sites in
  `packages/drizzle/cli_commands.ts` drop the cause text from their message (`failureMessage`'s
  non-refusal branch becomes the prefix alone), or drop the cause where the message already says
  everything (`:385`, `:679`, `:719`). The message at `:936` becomes one line. Repair the
  `packages/drizzle/tests/mutations/lifecycle_427.ts` anchors and re-prove them live. Update the
  drizzle tests that assert message text.

**Checkpoint**: one printer and one runner exist, and the gate is green.

---

## Phase 3: US1: a failed generator fails the script (P1) 🎯 MVP

**Independent test**: `cli.dispatch(['make:controller'])` with no name returns non-zero, with one
`❌` line on stderr.

- [X] T007 [US1] `fix(cli)`: the `commands/make/` sites in `packages/cli/commands/make/` (action
  26,42,150,208 · command 24 · component 24 · controller 24 · crud 26 · event 25 · job 25 · listener
  25 · middleware 24 · policy 24 · resource 30 · schedule 25 · service 24 · view 24) throw a
  `CommandFailedError` from `./command_failure.ts` under D4 rule 1. Usage hints go on the same line.
  Delete the restating catch-alls (rule 3): action 214, command 51, component 51, error_pages 88,
  event 63, job 56, listener 61, middleware 50, policy 50, resource 54, schedule 68, service 48, view
  44. `controller.ts:62,102` (`--view`) and `crud.ts:155` go through `runSteps` (FR-010). Tests per
  file group.
- [X] T008 [US1] `fix(cli)`: the other cli commands. `core_commands.ts` 47, 61 and 115 use rule 1;
  102 has its catch deleted (rule 3) and its `Deno.exit(1)` at 103 removed. `router_commands.ts:131`
  is a failure with `cause` (rule 2); `:271` is deleted (rule 3). `queue_commands.ts:343` (an unknown
  id in `queue:retry` is a failure) and `nessy_commands.ts:56` use rule 1; `nessy_commands.ts:126` is
  deleted (rule 3). `auth_commands.ts:95` goes through `runSteps` (FR-010). Tests.
- [X] T009 [US1] `fix(drizzle)`: the `make:*` generators. `generators/factory_generator.ts:24` and
  `seeder_generator.ts:31` use rule 1; `factory_generator.ts:38` and `seeder_generator.ts:54` have
  their catches deleted (rule 3); `model_generator.ts:192` uses rule 1. `model_generator.ts`
  233, 259, 282 and 310 stop returning booleans and run as `runSteps` steps (`make:model -a`, FR-010).
  Tests.
- [X] T010 [P] [US1] `fix(openapi)`: `packages/openapi/cli_commands.ts:41` throws a failure from
  `@lockness/cli/command-failure`, never the barrel (`openapi/mod.ts:11` re-exports
  `cli_commands.ts`). Test through `Cli.dispatch`.
- [X] T011 [P] [US1] `fix(cli)`: the `./nessy` wrappers exit non-zero when `install` or `bump` is run
  with no argument (`packages/cli/stubs/nessy/nessy.stub:96,107`, `nessy.cmd.stub:99`) (FR-011). The
  stub test pins the status; regenerate any copy the stub sync tracks (`docs/STUBS.md`).

**Checkpoint**: every cli and drizzle generator fails non-zero.

---

## Phase 4: US2: a failed compile fails the build (P1)

**Independent test**: with an injected step runner that fails, `CompileCommand.handle` rejects with
a failure and prints no "✅ Compilation successful".

- [X] T012 [US2] `fix(core)`: add core's one local failure class (`readonly exitCode = 1`, its own
  `name`, `Error`'s `(message, options)`) in an internal module under `packages/core/cli/` that is not
  in `exports`, beside core's structural `Cli` interface (home: plan §5, the local-class row). Add a
  conformance test that goes through the real `Cli.dispatch` (`@lockness/cli` declared for tests
  only) and asserts status 1 and one `❌` line.
- [X] T013 [US2] `fix(core)`: `packages/core/cli/compile_command.ts`. Add one local step runner with
  inherited stdout and stderr; a non-zero exit becomes `<step> failed (<program> exited <code>)` with
  no cause, used at `:144` (pre-compile script) and `:219` (`deno compile`). `:84` uses rule 1.
  `:115`, where route generation fails, becomes a failure with `cause` that stops before `deno
  compile`. `:196`, a missing declared asset, becomes a failure before `deno compile` (P1). The catch
  at `:226` is deleted. The runner is injectable so tests need no real `deno compile`. Tests for all
  six paths. (Home: plan §5 "How a failed child process is reported" and "Compile does not produce a
  binary from stale routes".)

**Checkpoint**: `RUN deno task cli compile` fails a container build when compilation fails (SC-004).

---

## Phase 5: US3: standalone tools fail honestly (P2)

**Independent test**: each tool, run as a subprocess on its failure path, exits non-zero with
exactly one `❌` line and no `error: Uncaught`.

- [X] T014 [P] [US3] `fix(ui)`: `packages/ui/mod.ts`. The block becomes `if (import.meta.main) await
  runEntry('ui', () => main(Deno.args))`. Sites 267, 279 and 381 throw `CommandFailedError` from
  `@lockness/cli/command-failure`, and their `Deno.exit(1)` at 269, 281 and 383 is removed; the catch
  at 390 is deleted (rule 3), with 391 removed. `ui add` still succeeds when only the `deno.json`
  update fails. Update `packages/ui/tests/cli.test.ts:260` and add the subprocess assertions.
- [X] T015 [P] [US3] `fix(upgrade)`: `packages/upgrade/upgrader.ts:193` stops stringifying, so
  `Upgrader.upgrade()` lets unexpected errors throw (breaking). In `packages/upgrade/mod.ts`, `:162`
  becomes `return`, `:179` becomes rule 1 and its `Deno.exit` at `:180` is removed, and the block at
  `:193` becomes `await runEntry('upgrade', …)`. Tests: in-process and a subprocess.
- [X] T016 [US3] `fix(init)`: `packages/init/mod.ts`.
  - Delete `cliMock` (`:445-460`). One module-local `runInit(args)` is what `registerInitCommand`
    registers and what `runEntry('init', …)` runs. `--help` and `--version` (`:411`, `:441`) return
    inside it.
  - `resolveKit` (`:282`) throws the failure itself (rule 4). So does `resolveVersion` (`:291`) for
    input it rejects; a fetch failure propagates. Remove their `Deno.exit(1)` at `:283` and `:292`.
  - Delete the catch at `:395` (rule 3) and its exit at `:400`.
  - The partial-scaffold steps go through `runSteps` (FR-010): `:337` (binary copy) and `:386`
    (`.env.production.local`), plus `packages/cli/stubs.ts:220,238`, where the remote
    `Stub.scaffoldFrom` must report a file it failed to fetch to its caller instead of skipping it.
    That last change is in cli, so it is its own `fix(cli)` commit, first.
  - Tests: in-process and a subprocess (bad `--kit`).
- [X] T017 [US3] `fix(openapi)`: `packages/openapi/install.ts`.
  - Its work becomes `export default async function install(): Promise<void>`, which throws and never
    touches process state. The block is `await runEntry('openapi install', () => install())`.
  - `:61` uses rule 1 and its `Deno.exit` at `:74` is removed. `:84` (`addPackage` and the other
    steps) goes through `runSteps`.
  - Tests: in-process and a subprocess.
- [X] T018 [US3] `fix(drizzle)`: `packages/drizzle/install.ts`.
  - Its work becomes the default-exported `install()`. The block is `await runEntry('drizzle install',
    …)`, which also fixes the unawaited call at `:428`.
  - `ProjectStructureError` becomes a subclass of `CommandFailedError` with the same public name, and
    `checkProjectStructure` stops printing its `✗` line.
  - `:169` (failed to create a directory) becomes a `runSteps` step, and the `Deno.exit(1)` at `:408`
    is removed.
  - The "✗ Database connection failed" warning stays.
  - Tests.
- [X] T019 [US3] `fix(deprecation-contracts)`: `packages/deprecation-contracts/install.ts`.
  - Its work becomes the default-exported `install()`, run through `runEntry`.
  - `:45` uses rule 1 and its `Deno.exit` at `:143` is removed.
  - The local `addPackage` (`:97`, `:129`) throws instead of warning (rule 2). The catch at `:168` is
    deleted, with its exit at `:169`.
  - Tests: in-process and a subprocess.

**Checkpoint**: no `Deno.exit(` outside `core/http/server.ts` and `core/kernel/signals.ts`.

---

## Phase 6: US4: packages that may not import cli (P2)

**Independent test**: `cli.dispatch(['make:mail'])` with no name returns status 1 with one `❌`
line, and the package has no `@lockness/cli` runtime edge.

The same pattern applies to each package (plan §5, the local-class and `handleMake*` rows):
- one local class beside the package's structural `Cli` interface in `cli_commands.ts`, not exported;
- `handleMake*` throws it, returns `Promise<string>`, and is removed from `mod.ts`;
- the path-containment guards (`Refusing to write outside`) throw;
- the tests switch from `undefined` assertions to `assertRejects` plus `exitCode` 1;
- a conformance test goes through the real `Cli.dispatch`, with `@lockness/cli` declared for tests
  only.

- [X] T020 [P] [US4] `fix(mail)`: `packages/mail/cli_commands.ts:59,68` and `packages/mail/mod.ts`.
- [X] T021 [P] [US4] `fix(features)`: `packages/features/cli_commands.ts:60,69` and `mod.ts`.
- [X] T022 [P] [US4] `fix(search)`: `packages/search/cli_commands.ts:59,68` and `mod.ts`.
- [X] T023 [P] [US4] `fix(notification)`: `packages/notification/cli_commands.ts:100,109` and
  `mod.ts`.
- [X] T024 [P] [US4] `fix(i18n)`: `packages/i18n/cli_commands.ts:72,77,86` and `mod.ts`.

**Checkpoint**: all 79 in-scope `❌` sites are migrated.

---

## Phase 7: Polish and cross-cutting

- [X] T025 `test(cli)`: one table-driven test in `packages/cli/tests/`. It registers every package's
  commands on a `Cli`, dispatches each `make:*` with no name in a temporary directory, and asserts a
  non-zero status and exactly one `console.error` (FR-007, A3).
- [X] T026 `build(lint)`: add the `scripts/lint/exit_contract.ts` plugin, with
  `scripts/lint/exit_contract_test.ts`, registered in the root `deno.jsonc` (precedent:
  `scripts/lint/env_signal.ts`).
  - `lockness-exit/process-exit` reports `Deno.exit(` calls and `Deno.exitCode` writes under
    `packages/`, excluding tests and stubs. The owner list lives in the rule file: `Deno.exit` in
    `core/http/server.ts` and `core/kernel/signals.ts`; `Deno.exitCode` in `cli/report.ts`.
  - `lockness-exit/printed-failure` reports a `console.error/warn/log` whose first string or template
    starts with `❌`. It applies in command code: `packages/*/commands/`, `*/cli_commands.ts`,
    `*/install.ts`, `*/generators/`, `cli/core_commands.ts`, `core/cli/`, and the `mod.ts` of ui,
    upgrade and init.
  - Add the 4 inline ignores, each with its reason on the line above: `tinker_command.ts:109,141,271`
    and `queue_commands.ts:216`.
  - The gate must be green (SC-002).
- [X] T027 [P] `docs(cli)`: update these, following D1 and D2.
  - `packages/cli/INSTALL_SCRIPTS.md`: the installer becomes a default-exported `install()` run by
    `runEntry`.
  - `packages/cli/README.md:86-88` and `packages/cli/docs/DOCS.md:205-240,300-310`: the local class
    is not exported; `cause` is printed and rendered; messages are one line; document `runEntry` and
    `runSteps`.
  - `packages/cli/docs/DOCS.md:316-317`: delete the "still exit 0" sentence.
  - `packages/cli/AGENTS.md:26-28`: the package list becomes core, mail, notification, features,
    search, i18n.
- [X] T028 [P] `docs`: `docs/nessy.md:232-243` (check it and make it true, including the shell
  wrapper), `docs/compilation.md` (exit behaviour and "no binary on a failed step"),
  `packages/openapi/README.md:120`, and `packages/contract/AGENTS.md` (`renderMessage`). Sweep with
  `grep -rln "❌\|exit" packages/*/README.md packages/*/docs docs`.
- [X] T029 `docs`: write the v0.5.0 upgrade-guide entries in the `## Upgrading to v0.5.0` sections
  `release:notes` reads.
  - `packages/core/README.md` (or the cli docs, if a cli section is added): failed commands now exit
    non-zero, covering the 68 status flips.
  - The removal of `handleMake*` from the mail, features, search, notification and i18n barrels.
  - `Upgrader.upgrade()` now rethrows unexpected errors.
  - drizzle `db:*` prints the cause once, after the message.
  - Check with `deno task release:notes --check`.
- [X] T030 `chore`: run `deno task agents:brief` and `deno task docs:coverage`, and commit any
  regenerated briefs separately.
- [X] T031 Product-owner follow-ups, filed in this session:
  - inner errors that copy their cause into their own message (`drizzle/migration_settings.ts:345-349`,
    `drizzle/migration_status.ts:211-214`, `openapi/discovery.ts:80-84`);
  - leaked public helpers (`isContained` ×4, i18n `handleExtract`, notification
    `processStub`/`createFile`/`notificationNaming`);
  - deprecation-contracts' local `addPackage` copy.
  
  When this merges, narrow #490 (three sites) and record that the installer side of #575 is done.

---

## Dependencies and order

- T001 → everything (the edges must exist before ui, upgrade and deprecation-contracts import cli).
- T002 → T003 → {T004, T006}; T005 is independent of T003/T004.
- T003 + T005 → US1 (T007–T011). T004 + T005 → US3 (T014–T019). T003 → US2 (T012–T013) and US4
  (T020–T024).
- The `fix(cli)` commit for `stubs.ts` lands before the rest of T016.
- T026 (lint) lands after every story, because it fails until the sweep is complete.
- T025 needs US1 and US4. T027–T030 come last.

## Parallel opportunities

- T005 alongside T002–T004.
- Within US1, T010 and T011 alongside T007–T009.
- Within US3, T014 and T015 (different packages, both need only T004).
- US4: T020–T024 all in parallel; each touches one package.
- US2 alongside US3 and US4 once Phase 2 is done.

## Implementation strategy

- **MVP**: Phase 1, then Phase 2, then US1. Generators fail honestly, through the redacting printer.
- **Then**: US2 (compile, which unblocks the #503 Dockerfile option), US3, US4, then the lint guard
  and docs.
- **Commits**: one Conventional-Commits category per commit, per package. Repaired mutation anchors
  ride with the change that moved their line.
