# Plan: Cover debug:event-dispatcher import-failure & missing-events branches

- **Feature branch**: `024-debug-dispatcher-coverage`
- **Linked issue**: #150 (`debug:event-dispatcher — cover import-failure and missing-@lockness/events paths`)
- **Package**: `@lockness/cli` (`packages/cli/commands/debug_commands.ts`)

## 1. Why this exists

The #90 review shipped `debug:event-dispatcher` but left two branches of
`collectListeners` (`packages/cli/commands/debug_commands.ts`) with no test:

1. the **per-file import-failure** path (a listener file that throws on
   `import()` is warned about and skipped, and the other listeners are still
   listed); and
2. the **missing-`@lockness/events`** path (the events package is absent, so the
   command logs an info line and returns no rows instead of throwing).

Both are the command's own resilience guarantees, and both are currently unproven
— a regression that turned either warning into a throw would ship green. A third,
smaller nit: the one genuinely silent `catch` (the best-effort instantiation at
lines 116–120) carries a comment that explains *why we construct*, not that the
**empty catch body is a deliberate, sanctioned exception** to the constitution's
"no silent catches" rule — so a future reader or review agent can legitimately
flag it.

Measurement: today `collectListeners` has 0 tests exercising lines 58–63 and
99–106; this feature raises that to 2 executable behaviours (subject to Q1).

## 2. User scenarios

The "user" is a framework maintainer running the suite / reading the code.

### US1 — a broken listener file does not hide the good ones (P1)

- **Given** an `app/listener` dir with one valid listener and one file that fails
  to import,
- **When** `collectListeners` walks it,
- **Then** it emits a `⚠️  Could not import <file>` warning **and** the valid
  listener is still returned.

### US2 — the events package being absent degrades gracefully (P2)

- **Given** `@lockness/events` cannot be imported,
- **When** `collectListeners` runs,
- **Then** it logs `ℹ️  @lockness/events is not available …` and returns `[]`
  without throwing.

### US3 — the deliberate swallow is legible (P3)

- **Given** a maintainer reads the instantiation `catch` at the construction
  site,
- **When** they check it against the no-silent-catch rule,
- **Then** the comment states the swallow is intentional and sanctioned, so no
  review flags it.

### Edge cases

- The broken-import fixture must live in a **dedicated** fixture dir, so it does
  not pollute the shared `fixtures/listeners` suite with warnings or extra rows.
- The import-failure warning goes to `console.warn`, not `console.log` — the test
  capture must hook the right stream.

## 3. Requirements

- **FR-001** — A test proves that when one file in the scanned dir fails to
  import, `collectListeners` warns (on `console.warn`) and still returns the
  remaining valid listeners.
- **FR-002** — The missing-`@lockness/events` branch (lines 58–63) is covered:
  either by an executable test that forces the dynamic import to reject, or (AC
  fallback) by an asserted one-line note. **Decided at Q1.**
- **FR-003** — The instantiation `catch` (lines 116–120) carries a one-line
  comment stating the empty body is a deliberate, sanctioned exception to the
  no-silent-catch rule.
- **FR-004** — No behavioural change to `debug:event-dispatcher` and no new
  command surface (issue "Out of scope"). Any new parameter is optional with a
  behaviour-preserving default, and the CLI registration path is unchanged.

## 4. Success criteria

- **SC-001** — The two named branches each have an executable, negative-tested
  assertion (FR-002 may downgrade to a note per Q1), and the full `@lockness/cli`
  suite stays green.
- **SC-002** — The command's observable behaviour is byte-identical before and
  after: same output for the same `app/listener`, same exit path.
- **SC-003** — A reader of the instantiation `catch` can tell in one line that
  the swallow is intentional.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| A listener file that fails to import warns and is skipped; the rest are still listed | the per-file `try { import } catch { warn; continue }` in `collectListeners.walk` — `packages/cli/commands/debug_commands.ts` | a second import-error handler in `runDebugEventDispatcher`, or re-checking file validity before calling `collectListeners` |
| `@lockness/events` absent → log info line, return `[]`, never throw | the top-level `try { import('@lockness/events') } catch` in `collectListeners` — `packages/cli/commands/debug_commands.ts` | a second availability probe in `registerDebugCommands` or `runDebugEventDispatcher`; a `try/import` in a test that re-implements the message |
| The instantiation `catch` is a deliberate, sanctioned silent swallow | the comment at the instantiation `catch` in `collectListeners` — `packages/cli/commands/debug_commands.ts` | a second explanation in a test comment or a constitution exemption list that can drift from the code |

All three homes are the **one** file `packages/cli/commands/debug_commands.ts`.
The tests assert against these homes; they do not become a second home for any
rule — and to keep that true, tests assert **stable substrings**
(`assertStringIncludes`, as the existing suite does), never a whole message line,
so a test never becomes the home of rule 2's info-line string (arch audit LOW-2).

**FR-004 has no row on purpose.** It is a *boundary constraint* — "no second
command surface; any new param is optional with a behaviour-preserving default" —
not a decision that needs a home. It is what the whole "What would duplicate it"
column enforces, so it is deliberately kept off the table rather than omitted
(arch audit LOW-1).

## 6. Technical context

- **Language / runtime**: Deno + TypeScript, `@lockness/cli` package.
- **Testing**: `Deno.test`, `@std/assert`, fixture dirs under
  `packages/cli/tests/fixtures/`. Existing pattern: `captureLog` hooks
  `console.log`; this feature replaces it with **one combined capture** that
  patches `console.log` **and** `console.warn` and returns both, rather than a
  second near-identical `captureWarn` helper (arch audit LOW-4).
- **Q1 seam (if chosen)**: an optional, intent-named param (`loadEvents`) on
  `collectListeners`, typed as `() => Promise<{ getListenerMetadata: … }>`, with
  a behaviour-preserving default of `() => import('@lockness/events')`. No `any`;
  full JSDoc noting the default. The default stays the **literal** import — no
  caller can flow a request- or arg-derived specifier into it (security INFO-1).
- **Constraints**: JSR-only bare specifiers; no `any` in exported APIs (the file
  already has a scoped `deno-lint-ignore-file no-explicit-any` for the dynamic
  constructor cast — no new `any`); JSDoc on any changed exported signature.
- **Scale**: one file changed, one or two test/fixture files added.

### Domain model

No domain entities — this is CLI tooling over the filesystem. Vocabulary:
*listener file* (a `.ts`/`.tsx` under `app/listener`), *listener row* (the
`ListenerRow` display record), *collect* (walk + import + read metadata). The
only invariant in play: `collectListeners` never throws for a bad file or a
missing events package — it warns/logs and continues.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No direct `hono` import | ✅ N/A — CLI command, no hono |
| JSR-only specifiers | ✅ fixtures import `@lockness/events` bare; tests import `@std/*` bare |
| No `any` in exported APIs | ✅ no new `any`; Q1 seam (if chosen) is typed |
| Tailwind v4 syntax | ✅ N/A — no UI |
| Pre-completion gate | ✅ will run `deno fmt && deno lint && deno check && deno task test` |
| Never hand-edit `deno.lock` | ✅ no dependency change |
| JSDoc on public APIs | ✅ any changed signature (Q1 seam) gets full JSDoc |
| MVC layering | ✅ N/A — CLI command |
| Commit discipline | ✅ `test(150)` + `refactor(150)`/`docs(150)` split by category |
| TDD (developer) | ✅ RED verified before GREEN on each behavioural test |
| No silent catches | ✅ **this feature documents the one sanctioned exception** rather than adding a new one |

### Complexity tracking

None. No principle is violated; the single silent catch is pre-existing and is
being *documented as sanctioned*, not introduced.

## 8. Surface impact

- **Client surfaces touched**: none. `debug:event-dispatcher` output is
  unchanged (SC-002). The CLI registration (`registerDebugCommands`) is untouched.
- **Interface contracts exposed**: if Q1 chooses the seam, `collectListeners`
  gains an **optional** second parameter (default preserves today's behaviour) —
  the same testability convention the file already uses for `collectListeners(dir)`
  and `runDebugEventDispatcher(args, listenerDir)`. No FE surface → no artifacts
  prototyping section, no mobile-first contract.

### Documentation (this feature)

- The strengthened comment at the instantiation `catch` (FR-003).
- If Q1 = seam: JSDoc for the new optional param (`@param`, behaviour-preserving
  default noted). No user-facing docs change — the command surface is unchanged.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A broken fixture in the shared `fixtures/listeners` dir would add warnings/rows to every existing test | Put the import-failure fixture in a **dedicated** dir (e.g. `fixtures/broken-import/`) scanned only by the new test |
| The broken-import fixture could break the pre-completion gate (`deno check`/`deno lint`) if it fails via an unresolvable specifier | The fixture fails via a **top-level `throw` in a syntactically valid TS module** — passes `deno check`/`deno lint`, rejects only at `import()`, mirroring the existing `BadListener` fixture (arch audit MEDIUM-2) |
| The import-failure test asserts on the wrong stream (`console.log` vs `console.warn`) | The warning uses `console.warn`; the test captures `console.warn` explicitly |
| Q1 seam widens the exported signature and risks scope creep | Optional param, behaviour-preserving default, CLI path unchanged — bounded by FR-004; rejected if the audits object |
| The import-map makes `@lockness/events` always resolvable, so branch 2 can't be forced without a seam | That is exactly what Q1 resolves; the AC anticipated it by permitting an asserted note |

## 10. Architecture audit

Dispatched to `architect-expert` on this plan before any code was written.
**Verdict: PASS-WITH-NOTES** (no blockers). Backlog check: the only open
`domain:cli` item is #150 itself — no pre-existing finding to confirm or correct.
Call-site census confirmed FR-004: the Q1 seam touches **zero** existing call
sites (`collectListeners` has 1 production caller at `debug_commands.ts:224`;
`runDebugEventDispatcher` 1 at `:255`; `registerDebugCommands` 1 at
`core_commands.ts:126`). The seat also confirmed both `catch` sites are genuine
non-smells (metadata read outside the instantiation catch; events-absence is a
legitimate logged answer), so FR-003 documents a sanctioned exception, not a
hidden defect.

| # | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| M1 | MEDIUM | If Q1 picks the note fallback, branch 2 stays unexecuted; #150 can reopen three cycles out on a coverage run | **Folded into Q1** — recommend the seam so the branch actually runs; if the note is chosen anyway, §4/§12 must record that branch-2 coverage is *documentation, not execution* |
| M2 | MEDIUM | Broken-import fixture's failure mechanism unspecified; an unresolvable specifier can break `deno check`/`deno lint` | **Applied** — §9 now pins "top-level throw in a valid TS module," mirroring `BadListener` |
| L1 | LOW | FR-004 has no decision-table row | **Applied** — §5 now states FR-004 is a boundary constraint deliberately kept off the table |
| L2 | LOW | FR-002 note fallback could make a test a second home for the info-line string | **Applied** — §5 now requires substring assertions, never a full line |
| L3 | LOW | Q1 seam is a test-only exported param | **Folded into §6** — optional, typed (no `any`), JSDoc'd, intent-named `loadEvents`; consistent with the file's existing testability convention |
| L4 | LOW | Two near-identical capture helpers foreseeable | **Applied** — §6 now specifies one combined log+warn capture |

## 11. Security audit

Dispatched to `security-expert` on this plan before any code was written, in the
same message as §10. **Verdict: PASS** — no findings at any severity. Backlog
check: only #150 is open under `domain:cli`, and its "no behavioural change / no
new command surface" conclusion is confirmed correct.

Trust model established: local-dev, CLI-time. The sole actor is the maintainer
running `./nessy debug:event-dispatcher` against their own `app/listener`; there
is no route, network listener, session, auth, DB, or account model in scope. The
only dynamic sink — the pre-existing `import(file://${path})` — is fed by a
`Deno.readDir` walk, never by a CLI arg or request, so it is not
attacker-controlled (an actor who can drop a `.ts` under `app/listener` already
holds source-write access). The feature adds no input surface: the broken-import
fixture is a `Deno.test`-only asset, and the Q1 seam's default is the literal
import. Output is byte-identical (SC-002), so no new bytes become reachable.

| # | Sev | Note | Disposition |
| :--- | :--- | :--- | :--- |
| INFO-1 | INFO | The Q1 seam's default must stay the literal `import('@lockness/events')`; no caller may flow an input-derived specifier into it | **Applied** — §6 pins the default as the literal import |
| INFO-2 | INFO | FR-003 documenting the silent instantiation `catch` is correct and security-neutral (the swallowed error is a best-effort constructor failure; no auth/data path is hidden) | **No action** — proceed as planned |

## 12. Open questions

- **Q1 — Branch-2 (missing-`@lockness/events`) coverage: executable test via an
  injection seam, or an asserted one-line note?** The AC permits either. A real
  test needs a seam because the import map keeps `@lockness/events` resolvable in
  the suite. **Recommended: the seam** — the architecture audit (M1) warns the
  note fallback leaves the branch unexecuted, so a later coverage run can reopen
  #150 against a "done" feature; the seam matches the file's existing testability
  convention (`collectListeners(dir)`, `runDebugEventDispatcher(args, dir)`) and
  its blast radius is a counted zero. If the note is chosen anyway, §4 SC-001 is
  amended to record that branch-2 coverage is documentation, not execution.

### Answered (2026-09-03)

- **Q1 → the injection seam.** `collectListeners` gains an optional
  `loadEvents = () => import('@lockness/events')` param; a test passes a rejecting
  stub so branch 2 (lines 58–63) executes. Typed (no `any`), full JSDoc, default =
  literal import (security INFO-1). FR-002 is therefore an **executable** test,
  and SC-001's "2 executable behaviours" holds without amendment.

### Decided without asking

- **The import-failure fixture lives in a dedicated dir**, not the shared
  `fixtures/listeners` — otherwise every existing test inherits its warning/rows.
- **The clarifying comment strengthens the existing one** at lines 116–120 rather
  than adding a second comment — one home (decision-table row 3).
- **Commits split by category**: `test(150)` for the new test(s)/fixtures,
  `refactor(150)` or `docs(150)` for the comment (and the seam, if chosen).
