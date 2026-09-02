# Tasks: Cover debug:event-dispatcher import-failure & missing-events branches

**Input**: `.specnaut/specs/024-debug-dispatcher-coverage/plan.md` (the only design doc)
**Linked issue**: #150
**Tests**: MANDATORY (TDD — constitution). Every behavioural test is written
RED first and negative-tested (must fail before the behaviour it pins exists /
before the branch it covers is present).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different file, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (from plan §2)

## Decision-table homes carried forward (plan §5)

- Rule 1 (import-failure warn-and-skip) → `collectListeners.walk` per-file
  `try/catch`, `packages/cli/commands/debug_commands.ts`.
- Rule 2 (events-absent → info line + `[]`) → top-level `try/catch` in
  `collectListeners`, same file.
- Rule 3 (instantiation catch is a sanctioned silent swallow) → the comment at
  the instantiation catch, same file.
  Tests assert **substrings only**, never a whole message line, so no test
  becomes a second home for a rule's string.

---

## Phase 1: Setup

- [X] T001 [P] Create a dedicated broken-import fixture dir
  `packages/cli/tests/fixtures/broken-import/` containing (a) one valid listener
  (`ok_listener.ts`, `@Listener`-decorated, mirroring the shape of
  `fixtures/listeners/alpha_listener.ts`) and (b) one module that is **valid
  TypeScript but throws at top level** (`throws_on_import.ts`, e.g. a bare
  `throw new Error('boom')`) so it passes `deno check`/`deno lint` and rejects
  only at `import()` (plan §9, arch MEDIUM-2). Kept out of `fixtures/listeners/`
  so the existing suite is unaffected.

---

## Phase 2: Foundational (blocking prerequisite for US1 & US2 tests)

- [X] T002 Replace `captureLog` in `packages/cli/tests/debug_commands.test.ts`
  with a single combined `capture(fn)` helper that patches **both**
  `console.log` and `console.warn` and returns `{ log: string; warn: string }`;
  migrate the 4 existing `captureLog` call sites (test lines ~149/157/164/171) to
  read `.log`. One helper, no near-duplicate `captureWarn` (arch LOW-4). Run the
  existing suite green after migration.

---

## Phase 3: US1 — a broken listener file does not hide the good ones (P1)

**Independent test**: with `fixtures/broken-import/`, `collectListeners` warns on
`console.warn` and still returns the valid listener.

- [X] T003 [US1] RED — add a test in `debug_commands.test.ts`:
  `collectListeners(<broken-import fixture dir>)` via `capture()` asserts (a)
  `warn` contains substring `Could not import` and the throwing file's name, and
  (b) the returned rows include the valid listener's class. Confirm it is a real
  exercise of rule 1's home: negative-test by momentarily removing the
  `warn; continue` branch and seeing the assertion fail, then restore.

---

## Phase 4: US2 — the events package being absent degrades gracefully (P2)

**Independent test**: a rejecting `loadEvents` makes `collectListeners` log the
info line and return `[]` without throwing.

- [X] T004 [US2] RED — add a test in `debug_commands.test.ts`:
  `collectListeners(<any dir>, () => Promise.reject(new Error('absent')))` via
  `capture()` asserts `log` contains substring `@lockness/events is not
  available` and the result is `[]`. This fails to compile/run first because the
  second param does not exist yet (the RED).
- [X] T005 [US2] GREEN — add the optional typed param to `collectListeners` in
  `packages/cli/commands/debug_commands.ts`:
  `loadEvents: () => Promise<typeof import('@lockness/events')> = () =>
  import('@lockness/events')` (no `any`; default = the literal import, security
  INFO-1). Route the existing top-level `try` through `await loadEvents()`
  instead of the inline `import(...)`. Full JSDoc `@param loadEvents` noting the
  behaviour-preserving default. Run T004 green; the single production caller
  (`runDebugEventDispatcher`, line ~224) is unchanged (FR-004, blast radius 0).

---

## Phase 5: US3 — the deliberate swallow is legible (P3)

- [X] T006 [US3] Strengthen the comment at the instantiation `catch`
  (`packages/cli/commands/debug_commands.ts`, lines ~116–120) to state the empty
  body is a **deliberate, sanctioned exception** to the constitution's no-silent-
  catch rule: the `@Listener` initializer has already fired and metadata is read
  outside the catch, so a construction failure is safe to swallow (FR-003). One
  clarifying line; no behavioural change.

---

## Phase 6: Polish & pre-completion gate

- [X] T007 Run the full gate:
  `deno fmt && deno lint && deno check packages/cli/commands/debug_commands.ts
  packages/cli/tests/debug_commands.test.ts && deno task test`. Fix any red;
  do not declare done with red checks (hard rule #5). Confirm SC-002 (command
  output byte-identical for the shared `fixtures/listeners`).

---

## Dependencies & order

- T001, T002 have no interdependency (**[P]** eligible), but both precede the
  story tests that use them.
- US1 (T003) needs T001 + T002. US2 (T004→T005) needs T002. US3 (T006) is
  independent. T007 is last.
- Story order: US1 → US2 → US3 (priority), but US1 and US3 are independent of
  each other; US2's test (T004) must precede its code (T005), strictly (TDD).

## MVP

US1 alone (T001–T003) is a shippable increment: it closes the highest-value
untested branch. US2 and US3 complete the issue's acceptance criteria.

## Task count

7 tasks — Setup 1, Foundational 1, US1 1, US2 2, US3 1, Polish 1.
