# Tasks: Devtools redaction hardening — depth + header/query/body + panel test gaps

**Input**: `.specnaut/specs/025-devtools-redaction-hardening/plan.md` (the only design doc)
**Linked issue**: #149
**Tests**: MANDATORY (TDD — constitution). Every behavioural test is written RED
first and negative-tested (must fail before the branch/behaviour it pins exists).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different file, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (from plan §2)

## 🔒 Decision-table homes carried forward (plan §5)

- **Secret vocabulary** (`password|token|secret|authorization|csrf|cookie|apikey`,
  a `key` token at separator **or camelCase** boundary, `code`/`state` as
  **standalone tokens only**) → `SECRET_KEY` regex in
  `packages/devtools/redact.ts`. **Only home.** No second list, no query-only list.
- **Deep masking** (nested objects + arrays incl. top-level; depth-capped +
  cycle-safe; leaves untouched) → `redactValue(unknown)` traversal in
  `packages/devtools/redact.ts`. `redactSecrets` is its record wrapper. **Only
  home.** No inline `Array.isArray(x) ? … : …` dispatch in any asker.
- **Askers** (call, never re-decide): headers + query in the `RequestInfo` object
  **literal** (headers/query are `readonly` — redact at construction), body via
  `requestInfo.body = redactValue(...)`, all in `packages/devtools/middleware.ts`;
  plus the two existing session-capture calls.

Tests assert **substrings / individual keys only**, never a whole message line,
so no test becomes a second home for a rule's string.

---

## Phase 1: Setup

_No new files, deps, or fixtures — this feature edits three existing files
(`redact.ts`, `middleware.ts`, `tests/debug_panels.test.ts`). No setup phase._

---

## Phase 2: Foundational — the single masker (blocks every US)

The deep, bounded, cycle-safe `redactValue` and the widened `SECRET_KEY` are the
shared decider both US1 (capture) and US2 (traversal) depend on. Build the decider
test-first here so the askers in US1 have something correct to call.

- [X] T001 [P] RED — extend `redactSecrets`/`redactValue` tests in
  `packages/devtools/tests/debug_panels.test.ts` (the `redactSecrets - masks
  secret-looking keys` block): assert a **nested** secret (`{ profile: { apiToken }}`
  → `profile.apiToken === REDACTED`), a **camelCase** `sessionKey === REDACTED`,
  a **top-level array** `[{ password }]` element redacted, standalone
  `code`/`state` redacted, and negatives `theme`/`monkey`/`statusCode`/`stateName`
  **unchanged**. Confirm RED against the current shallow impl (nested + camelCase +
  code/state fail today). (plan FR-001/002/003/004a, SC-002)
- [X] T002 GREEN — in `packages/devtools/redact.ts`: (a) extend `SECRET_KEY` to
  add `cookie` and standalone `code`/`state` (whole-word/separator only — NOT
  substring, NOT camelCase) and a camelCase `key` boundary; (b) add
  `redactValue(value: unknown): unknown` — recurse into plain objects and arrays
  (incl. top-level), mask a `SECRET_KEY`-named value, return scalar/`null` leaves
  unchanged; (c) make `redactSecrets(record)` a thin wrapper over `redactValue`.
  No `any`. Full JSDoc incl. the **name-based limitation** line (D9). Run T001 green.
- [X] T003 RED — add a boundedness test in the same file: a body nested far
  beyond the cap and a **cyclic** object (`o.self = o`) each pass through
  `redactValue` **without throwing and without stack overflow**; the over-limit
  subtree reads `REDACTED`. Confirm RED (an unbounded recursive impl overflows /
  hangs). (plan FR-012, SC-005)
- [X] T004 GREEN — add the bound to `redactValue` in `packages/devtools/redact.ts`:
  a depth cap (mask the over-deep subtree as `REDACTED`, target ~64) **and** a
  `WeakSet` visited-set (a revisit → `REDACTED`). Never throw; if traversal is
  aborted it is a masked value, not an exception. Run T003 green.

---

## Phase 3: US1 — request secrets never reach the collector (P1)

**Independent test**: a request with `Cookie`/`Authorization` headers, `?token=`,
and a `password` body field is captured with all four `[redacted]`, non-secrets
intact.

- [X] T005 [US1] RED — add a middleware test in
  `packages/devtools/tests/debug_panels.test.ts`: with `LOCKNESS_DEVTOOLS=1`,
  drive a request (via `app.request`) carrying `Cookie`/`Authorization` headers,
  `?token=abc&theme=dark`, and a JSON `POST` body `{ password:'x',
  profile:{ apiToken:'y' }, keep:'z' }`; assert the captured `RequestInfo`
  (`collector.getRequests()`) has redacted `cookie`/`authorization` headers,
  redacted `token` query, redacted `password` + `profile.apiToken` body, and
  intact `theme`/`keep`. Confirm RED (headers/query/body captured raw today).
  (plan FR-005/006/007, SC-001)
- [X] T006 [US1] GREEN — in `packages/devtools/middleware.ts`: redact at capture
  in the `RequestInfo` **object literal** — `headers: redactValue(...) as
  Record<string,string>`, `query: redactValue(...) as Record<string,string>`
  (documented one-line narrowing, no `any`) — and set `requestInfo.body =
  redactValue(body)` in the body block. Callers only; no re-decision, no inline
  array/record dispatch (§5). Run T005 green. Confirm the existing session
  redaction calls still route through the same masker.

---

## Phase 4: US2 — nested / camelCase / bounded traversal (P2)

_Behaviour delivered by Phase 2 (T001–T004); US2's acceptance is those tests._
No further code — this phase is the assertion that SC-002 + SC-005 are pinned by
T001/T003 and stay green after the US1 wiring. If any US2 scenario is unpinned
after Phase 2/3, add the missing assertion here.

- [X] T007 [US2] Verify SC-002 + SC-005 are covered by T001/T003 and green after
  T006; add any missing nested/bounded assertion in
  `packages/devtools/tests/debug_panels.test.ts`. No production change expected.

---

## Phase 5: US3 — the test gaps (P3)

- [X] T008 [P] [US3] Fix the events-capture assertion in
  `packages/devtools/tests/debug_panels.test.ts` (`events - captured via onAny`):
  replace `assert(typeof probes[0].listenerCount === 'number')` with an exact
  value assertion — `assertEquals(probes[0].listenerCount, 0)` for the probe event
  (no `@Listener` registered). Negative-test: a wrong expected value fails.
  (plan FR-008, SC-004)
- [X] T009 [P] [US3] Add the missing no-session branch test in the same file
  (the `sessions - …none => nothing` block currently never exercises it): drive a
  request with **no** `session` set on the context, assert
  `collector.getSessions()` gains no entry for it and nothing throws. Negative-test
  by asserting the guard's false branch. (plan FR-009, SC-003)

---

## Phase 6: Polish & pre-completion gate

- [X] T010 Confirm FR-010 held: no panel/route/collector-shape change (git diff
  touches only `redact.ts`, `middleware.ts`, `tests/debug_panels.test.ts`); the 6
  untouched #27 test blocks still green.
- [X] T011 Run the full gate: `deno fmt && deno lint && deno check
  packages/devtools/redact.ts packages/devtools/middleware.ts
  packages/devtools/tests/debug_panels.test.ts && deno task test`. Fix any red; do
  not declare done with red checks (hard rule #5).

---

## Dependencies & order

- Phase 2 (T001–T004, the decider) blocks US1 (T006 calls `redactValue`) and is
  US2's deliverable.
- US1: T005 (RED) → T006 (GREEN).
- US2: T007 verifies Phase-2 tests; independent of US1 code.
- US3: T008, T009 are **[P]** (independent test edits) — after Phase 2 exists so
  the file compiles.
- T010, T011 last.
- Strict TDD: T001<T002, T003<T004, T005<T006.

## MVP

Phase 2 + US1 (T001–T006) is the shippable core: it closes the highest-value
leaks (headers, query, body) at capture with a safe masker. US2 (T007) and US3
(T008–T009) complete the issue's acceptance criteria and the folded audit scope.

## Task count

11 tasks — Foundational 4, US1 2, US2 1, US3 2, Polish 2.
