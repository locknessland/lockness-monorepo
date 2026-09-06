# Tasks — #292 `safeForLog` does not encode Unicode format characters

Derived from the approved `plan.md`. Ordered by dependency: a task never precedes the thing it
asserts. **T001 is a failing-test task and must be red before T004 exists.**

## Phase 0 — the shape of the cap

**T000 — settle FR-008's derived output bound.** *(no code; recorded here so T005 has one reading)*

FR-008 charges `MAX_LENGTH` against **consumed input code points**, not emitted characters. That is
what removes the eviction primitive — an attacker's character costs them exactly one unit of budget
no matter how wide its escape — but it means the emitted line is no longer bounded at 512.

The bound does not disappear; it becomes **derived and deterministic**:

| | Worst-case emitted width | Bound on a 512-code-point input |
| :--- | :--- | :--- |
| `\\` (FR-004b) | 2 | |
| `\xXX` (`<= 0xFF`) | 4 | |
| `\u{10FFFF}` (widest) | 10 | **5120 characters** |

5120 is large for a log line and it is *reached only by an input that is 512 astral format
characters*, which is a fact worth seeing in a log rather than hiding. The number is fixed by the
code, not chosen by the attacker — which is the whole property. It is asserted by **SC-008b** so it
cannot drift silently.

The consequence that matters: `renderError` caps its message at 200 **before** calling `safeForLog`,
and 200 < 512, so **a rendered error is never truncated by `safeForLog` again**. The diagnostic
tail — including `***:***`, the evidence redaction fired — always survives. That is S2 closed at the
root rather than patched at the symptom.

## Phase 1 — failing tests (TDD, red first)

- [ ] **T001** `packages/contract/tests/log_sanitize.test.ts` — the bidi guard.
      SC-001: each of U+200B-200F, U+202A-202E, U+2066-2069 asserted **per range**, plus U+061C,
      U+FEFF, U+2060 and U+E0001 named individually. SC-003: the issue's probe string is no longer
      returned unchanged.
- [ ] **T002** Same file — the property assertion behind SC-001. Sweep all 170 `\p{Cf}` codepoints:
      every one outside the FR-001b carve-out encodes, every one of the eleven does not. **Both
      directions**, or the carve-out is asserted only by the code that implements it.
- [ ] **T003** Same file — SC-002, SC-004, SC-007, SC-008, SC-008b.
      - SC-002: Arabic + Hebrew letters and an RTL word byte-identical; Persian `می‌رود` and a ZWJ
        emoji family assert their **exact** rendered string, letters intact.
      - SC-004: below the cap only — `\x2028`-as-text vs a real U+2028, and `\u{202e}`-as-text vs a
        real U+202E.
      - SC-007: `U+1F600` survives byte-identical. *(Fails the moment the loop becomes `charCodeAt`.)*
      - SC-008: 200 bidi code points + a diagnostic tail — the tail is present.
      - SC-008b: a 512-code-point all-`U+E0001` input emits ≤ 5120 characters and is not truncated;
        513 is truncated. Pins the cap to input, not output.

**Gate**: T001-T003 must FAIL against unmodified `sanitize.ts`, each for the reason it names. A test
that passes here is asserting something already true and proves nothing.

## Phase 2 — the fix

- [ ] **T004** `packages/contract/logging/sanitize.ts` — FR-001, FR-001b, FR-002, FR-004, FR-004b.
      Rename `isControl` → `mustEscape` (A7). Add the `\p{Cf}` test and the carve-out. Widen the
      above-`0xFF` escape to `\u{…}`, keep `\xXX` at or below. Escape `\\`.
      **Not** an `EncodedLogValue` class (A7).
- [ ] **T005** Same file — FR-008. Charge the cap against consumed code points; per T000, state the
      derived 5120 bound and the `renderError` consequence in the code, at the cap.
- [ ] **T006** Same file — FR-006. `@remarks` names the Cf criterion and *why the eleven are exempt*;
      the escape-width rule recorded at the encoder. FR-005 is a no-op by construction — assert it in
      the test (SC-005), do not edit `renderError`.

## Phase 3 — the existing suite

- [ ] **T007** SC-006. Exactly two expectations change: `log_sanitize.test.ts:48` and `:51`.
      **If a third needs editing, stop** — that is a behaviour change the plan did not predict, not a
      spelling churn, and it gets understood before it gets edited.

## Phase 4 — proof

- [ ] **T008** `packages/contract/tests/mutations/bidi_292.ts` — the mutation battery, same contract
      as `prefix_288.ts` and `subscribe_hardening_248.ts`: anchor matched **exactly once**, file
      re-read to prove it changed, non-compiling mutant reported DEAD, uncaught module error read as
      a kill **before** the summary, restore on SIGINT/SIGTERM, exit code = unexpected survivors.
      Rows: drop the Cf test · drop the carve-out · invert the carve-out · `charCodeAt` for
      `codePointAt` · drop the `\\` escape · `\x` for `\u{` · charge emitted length instead of
      consumed · off-by-one at the cap.
- [ ] **T009** Full gate: `deno fmt && deno lint && deno check && deno task test`.

## Not in this branch

| | Why |
| :--- | :--- |
| The U+FEFF DSN redaction leak | Pre-existing; redaction runs before encoding so nothing here reaches it. Filed separately (plan §6, S6). |
| `renderError`'s 200-char cap | Untouched, and T000 shows why it no longer needs to change. |
| Unicode normalisation, homoglyph detection | Out of scope in the issue and in the plan. |
