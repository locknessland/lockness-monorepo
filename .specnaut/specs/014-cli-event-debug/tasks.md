---
description: "Task breakdown for the debug:event-dispatcher CLI command (#90)"
---

# Tasks: `debug:event-dispatcher` CLI command

**Input**: `plan.md` in this directory. **Tests**: included (TDD).

## Format: `[ID] [P?] [Story] Description`

- **[Story]** — US1 (list) / US2 (filter) / US3 (flag + graceful degradation).
- Each task names its decision-table home (plan §5).

## Homes carried forward (plan §5)

| Rule | Home |
| :--- | :--- |
| Read metadata from the public decorator API | `packages/cli/commands/debug_commands.ts` — `getListenerMetadata()` |
| Instantiate each class before reading (A1) | same — `new Exported()` in try/catch, once per class |
| Recursive walk of `app/listener` (A2) | same — local recursive walk (NOT core's `listener_discovery`) |
| Filter — substring, case-insensitive, event or class | same — one predicate |
| Graceful degradation / exit 0 / skip-with-warning | same — the handler |
| CLI-only, consume events, never core (FR-006) | `packages/cli/` |

---

## Phase 1: Setup / deps

- [ ] T001 Add pinned `@lockness/events` to `packages/cli/deno.json`; widen `cli.allow` in `deps.policy.jsonc` to include `events` (own `chore(deps)` commit); run `deno task deps:analyze` (regenerates `docs/dependencies.md`) and confirm no cycle.

---

## Phase 2: Foundational

- [ ] T002 Promote the introspection API (Q_internal/A3): remove the `@internal` JSDoc from `getListenerMetadata`/`ListenerMetadata` in `packages/events/listener_registry.ts` (no logic change); document them in `packages/events/docs/DOCS.md`.
- [ ] T003 Create `packages/cli/commands/debug_commands.ts` skeleton — `registerDebugCommands(cli)` registering `debug:event-dispatcher` with a description (mirror `router_commands.ts`). Pure helpers exported for unit test: `collectListeners(dir)` (recursive walk → import → `new` in try/catch → `getListenerMetadata` → rows), `filterRows(rows, term)` (substring, case-insensitive, event or class), `formatGrouped(rows)` (grouped table).
- [ ] T004 [P] Register in `packages/cli/core_commands.ts` — import + `registerDebugCommands(cli)` in the module-registration block.

---

## Phase 3: US1 — list events and listeners (P1)

- [ ] T005 [US1] Implement `collectListeners`: recursive `Deno.readDir` walk of `app/listener` (A2); per file dynamic-import; per exported class `new Exported()` in try/catch (A1 — skip-with-warning on throw); `getListenerMetadata(class)` → rows `{ eventName: meta.eventClass.name, listenerClass: cls.name, methodName: String(meta.methodName) (A6), priority: meta.options.priority ?? 0 }`.
- [ ] T006 [US1] Implement `formatGrouped`: group rows by `eventName`, header `Event: <name> (<n> listener[s])`, then `   - <listenerClass>@<methodName> (priority: <p>)` (matches the issue's desired output). Empty → friendly message.
- [ ] T007 [P] [US1] Unit tests: `collectListeners` over a fixture `app/listener` dir incl. a **nested** subdir listener (A2) and a **dependency-carrying `@Service`** listener (A1 — bare `new` still yields metadata or is skipped cleanly) and a **symbol-method** listener (A6); `formatGrouped` output shape + empty-state.

---

## Phase 4: US2 — filter (P1)

- [ ] T008 [US2] Implement `filterRows`: case-insensitive substring on `eventName` OR `listenerClass` (String.includes, never RegExp — S1). Wire the positional arg into the handler.
- [ ] T009 [P] [US2] Unit tests: filter matches by event and by class, case-insensitive; no-match returns empty (handler prints friendly message, exit 0).

---

## Phase 5: US3 — flag + graceful degradation (P1/P2)

- [ ] T010 [US3] Parse `--dispatcher=<name>` (parseFlag, default global; inert v1 — A5). Handler: missing `app/listener` / no listeners / missing `@lockness/events` → friendly message, `return` (exit 0); a hard failure → `Deno.exit(1)`.
- [ ] T011 [US3] Command-level test: run over an empty/absent listener dir → friendly message, no throw; `--dispatcher=foo` accepted without error.

---

## Phase 6: Polish

- [ ] T012 [P] Docs: `packages/cli/README.md` (command usage + filter + flag) and `docs/nessy.md` (command reference, A4).
- [ ] T013 Pre-completion gate — `deno fmt && deno lint && deno check <changed> && deno task test`; `deno task deps:analyze` clean.

---

## Dependencies & order

- Phase 1 (deps) + T002 (promote API) block the command. T003 skeleton → T005/T006/T008/T010 fill it. Tests `[P]` after their SUT.
- **MVP**: US1 + US2 (list + filter). US3 (flag + graceful) completes it.

## Suggested commit split

1. `chore(deps)` — cli→events edge + regenerated `dependencies.md`.
2. `feat(90)` — the command (+ core_commands registration) and the `@internal`-tag removal.
3. `test(90)` — the unit + command tests.
4. `docs(90)` — cli README, events DOCS, nessy.md.
