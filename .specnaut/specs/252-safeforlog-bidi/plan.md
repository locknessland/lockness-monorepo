# Plan: Encode bidi formatting characters, and disambiguate the escape width

**Branch**: `252-safeforlog-bidi` | **Date**: 2026-09-06 | **Backlog item**:
[#292 — Contract: safeForLog does not encode Unicode bidi formatting characters](https://github.com/locknessland/lockness-monorepo/issues/292)

---

## 1. Why this exists

`safeForLog` promises *"a single-line, control-free string"* and is the framework's single home for
how a request-derived value is encoded before it reaches a log sink. Its `isControl` predicate
(`packages/contract/logging/sanitize.ts:57-59`) covers C0, DEL, the C1 range and U+2028/U+2029. It
does not cover the Unicode **bidirectional formatting** characters, which are display-control
characters.

Verified against the current implementation, not restated from the issue:

```
probe: '/admin' + U+202E + 'gnp.txt' + U+202C + U+200B + U+2066 + 'x'
output identical to input: true
Arabic text preserved:     true
Hebrew text preserved:     true
```

Those last two lines are the constraint, not a bonus: the fix must catch **formatting** characters
and leave RTL **script** alone, or it mangles legitimate non-Latin input.

The vector is the one the function already exists for. Hono's `getPath` runs `tryDecodeURI`, and
`decodeURI` does not reserve these codepoints — so `%e2%80%ae` becomes a real U+202E in
`c.req.path`, exactly as `%0a` becomes a real newline. What an attacker gets is **display spoofing,
not injection**: U+202E reverses the visual order of everything after it in any bidi-aware renderer,
so a logged path can read as something other than what was requested. No line is forged, which is
why this is hardening rather than a live hole.

### A second defect, found while verifying the first

The encoder is `` `\\x${code.toString(16).padStart(2, '0')}` ``. For a codepoint above `0xFF` that
emits **four** hex digits behind a prefix also used for two — so the escape is variable-width behind
a fixed marker, and a reader cannot tell where one ends:

```
ESC (U+001B) followed by the literal text "5b"  ->  "\x1b5b"
U+2028                                          ->  "\x2028"
```

`\x1b5b` is ESC-then-text, and reads identically to a single four-digit escape. This is **already
true** for U+2028/U+2029; adding fifteen more codepoints above `0xFF` multiplies it. An encoder whose
output cannot be read back unambiguously is not doing the job the module's `@fileoverview` claims.

## 2. User scenarios

### US1 — A bidi override cannot reorder a log line (P1)

**Given** a request path containing `%e2%80%ae`
**When** it is logged through `safeForLog`
**Then** the codepoint is replaced by a visible escape, and the line renders in the order it was
requested in.

### US2 — Right-to-left text is untouched (P1)

**Given** a value containing Arabic or Hebrew **letters**
**When** it is logged
**Then** it is unchanged. A fix that encodes RTL script rather than RTL formatting has broken more
than it fixed.

### US3 — An escape can be read back unambiguously (P2)

**Given** any encoded output
**When** an operator reads it
**Then** each escape has one parse. `\x1b5b` may not mean two different things.

### Edge cases

- **The loop is per *code point*, not per code unit.** `sanitize.ts` iterates `for (const char of
  value)` and reads `codePointAt(0)`, so an astral character arrives whole and a lone surrogate only
  appears when the input actually holds one. An earlier draft of this plan said `charCodeAt`; a
  developer aligning the code to that wording would have split every astral character. SC-007 pins
  the iteration mode against exactly that edit.
- **The backslash is not currently escaped**, so a real U+2028 and the six literal characters
  `\x2028` already produce byte-identical output. Widening the escape widens that collision rather
  than creating it. FR-004b closes it.
- **The replacement must stay a replacement, not a strip** — `sanitize.ts:53-54` records why: the log
  still shows that something was there.
- **`MAX_LENGTH` is in scope, because this change is what puts it there.** A wider escape consumes
  more budget per hostile character, and the budget is spent on *emitted* output. Measured: 64 ×
  U+202E followed by a diagnostic tail renders at 134 characters today with the tail intact, and at
  582 under the new encoder — over the 512 cap, so the tail is discarded *including the evidence
  that redaction fired*. That is a log-eviction primitive handed to the attacker by this change.
  FR-008 budgets against consumed input instead.

## 3. Requirements

- **FR-001**: `isControl` additionally rejects **every codepoint in Unicode `General_Category=Cf`**
  (`/\p{Cf}/u`), except the eleven Arabic/Syriac prefix marks carved out by FR-001b. This is a
  **criterion, not an enumeration** — the reason is FR-003: measured, `\p{Cf}` is 170 codepoints and
  **none of them is a letter or a digit**, so "formatting characters are unsafe, script is not" holds
  by construction rather than by a range table someone has to keep true. It subsumes the three ranges
  the issue lists and additionally covers U+061C (a Bidi_Control in the Trojan Source set, reachable
  as `%d8%9c`), U+FEFF, U+2060-2064, U+00AD, and the astral tag block U+E0000-E007F — the current
  vehicle for invisible text aimed at automated log readers.
- **FR-001b**: `U+0600-0605`, `U+06DD`, `U+070F`, `U+0890-0891` and `U+08E2` are **exempt**. They are
  Cf by category but they are ordinary content in Arabic and Syriac text, not formatting controls;
  escaping them would mangle legitimate messages to no security benefit. None is a Bidi_Control and
  none can reorder a line. The carve-out is by explicit list because it is an exception to a
  criterion, which is the one place a list is the honest shape.
- **FR-002**: They are **replaced**, not stripped, matching the decision already recorded at
  `sanitize.ts:53-54`.
- **FR-003**: RTL **script** is untouched — including a word carrying ZWNJ (Persian `می‌رود`) and a
  ZWJ emoji sequence, both of which FR-001 *does* escape. See §12: that is a decided cost, not an
  oversight, and SC-002 asserts the rendered shape rather than pretending it is unchanged.
- **FR-004**: A codepoint above `0xFF` is emitted as `\u{<1..6 hex digits>}`, not `\xXXXX`. Two-digit
  `\xXX` is kept for `<= 0xFF` — it is what the existing tests and every operator's eye expect, and
  widening it would be churn with no reader benefit.
- **FR-004b**: The backslash itself is escaped as `\\`. Without it FR-004's "exactly one parse" is
  false and stays false after the change, since the literal text `\u{202e}` and a real U+202E still
  render identically. The visible cost is that a Windows path renders `C:\\Users\\…`; that is the
  standard convention in every language that escapes, and it is the price of the claim US3 makes.
- **FR-005**: `renderError` inherits all of it with no change of its own, since it delegates.
  Confirmed sound by the security audit: `redactDsnCredentials` runs **before** truncation and
  encoding, so a widened escape cannot outrun redaction.
- **FR-006**: The `@remarks` block names the Cf criterion and its carve-out alongside the `%0A` /
  `%1B` cases it already explains, and the escape-width rule is recorded at the encoder.
- **FR-007**: Every guard is mutation-verified, each mutant proved to have compiled and executed.
- **FR-008**: The `MAX_LENGTH` budget is charged against **consumed input**, not emitted output, so a
  hostile string cannot buy eviction of the diagnostic tail at 8 characters of budget per 1 character
  of attack. The cap's purpose — bound the line — is unchanged; what changes is that an attacker can
  no longer inflate their own share of it.

## 4. Success criteria

- **SC-001**: Each of the three ranges the issue names is encoded — asserted per range, not by one
  representative — **plus** U+061C, U+FEFF, U+2060 and an astral tag codepoint, each named
  individually. A property assertion over the whole Cf class backs them: every Cf codepoint outside
  the FR-001b carve-out encodes, and every carved-out one does not.
- **SC-002**: Arabic and Hebrew letters and a right-to-left *word* survive byte-identical; a
  ZWNJ-bearing Persian word and a ZWJ emoji sequence render with their joiners escaped and **their
  letters intact**, asserted on the exact expected string.
- **SC-003**: The issue's own probe string is no longer returned unchanged.
- **SC-004**: Injectivity is asserted **below the truncation cap** — the pair that demonstrates
  today's ambiguity, plus a real U+202E against the literal text of its own escape. Above the cap it
  is unachievable by construction and the criterion says so rather than claiming otherwise.
- **SC-005**: `renderError` encodes a bidi character in a message it renders, with no change to
  `renderError` itself.
- **SC-006**: The existing suite passes with no expectation edited except where an escape's spelling
  legitimately changed. Counted ahead of the work: 12 escape-spelling assertions exist, of which
  exactly **2** change (`packages/contract/tests/log_sanitize.test.ts:48` and `:51`), and **0**
  in-repo consumers decode an escape.

  **Met as predicted for the escape spellings, then deliberately exceeded.** The two named
  assertions were the only escape-spelling edits, exactly as counted. A **third** class of edit
  arrived from the review cycle: security FINDING 2 changed the truncation marker to carry the
  input's size, which moved three marker assertions. T007's stop condition fired and was answered
  rather than waved through — that is a behaviour change adopted on a review finding, not spelling
  churn, and it is recorded here instead of being absorbed silently.
- **SC-007**: An astral codepoint outside Cf (e.g. `U+1F600`) survives byte-identical — which is only
  true while the loop iterates code points, so this criterion pins the iteration mode.
- **SC-008**: A message of 200 bidi code points followed by a diagnostic tail still shows the tail.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Which codepoints are unsafe in a log line | `packages/contract/logging/sanitize.ts` — `isControl` | A second predicate at any call site. The module's `@fileoverview` says this exists to prevent exactly that. |
| How an unsafe codepoint is rendered | the same file — the escape expression | Two widths behind one prefix, which is the ambiguity FR-004 removes. |
| That a formatting character is unsafe and a letter is not | the `\p{Cf}` criterion itself | Any hand-maintained include-list. The criterion cannot drift from the property, because it *is* the property — measured, no Cf codepoint is a letter or a digit. |
| Which Cf codepoints are content rather than control | the FR-001b carve-out list | A second exemption at a call site, or a "well, Arabic is fine" comment with no code behind it. |
| How much of the budget one input character may consume | the `MAX_LENGTH` charge in the same file | Charging emitted length in one place and consumed length in another — which is the log-eviction primitive FR-008 removes. |

## 6. Technical context

**Language/Version**: TypeScript on Deno
**Testing**: `deno test`, `packages/contract/tests/`
**Constraints**: `safeForLog` is consumed framework-wide; every caller inherits this. Counted: 33
production `safeForLog` call sites, 22 `renderError`. Out of scope: the DSN redaction, `renderError`'s
200-char cap, Unicode normalisation and homoglyph detection. **`MAX_LENGTH` moved *into* scope** — see
the §2 edge case: this change is what makes the cap exploitable, so it does not get to stay out.
**Scale/Scope**: 1 production file, 1 test file

**A pre-existing redaction limit, recorded and not fixed here.** `redactDsnCredentials` matches the
userinfo with a character class that excludes `\s`, and JS `\s` contains U+FEFF — so
`postgres://user:pass<U+FEFF>@host/db` **leaks the password** where the same DSN without it is
redacted (measured: `clean -> redacted`, `U+FEFF -> LEAKS`). Escaping U+FEFF does not fix this,
because redaction runs *before* encoding. It is older than this change and orthogonal to it; it is
filed separately rather than smuggled into a `fix` commit whose subject says something else.

### Domain model

No entities. One value object gains a rule: an **encoded log value** — invariant, *every escape in it
has exactly one parse*, which FR-004 establishes and the current variable-width form violates.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1–4, 6, 8 | pass | No hono, no dependency, no `any`, no UI, no lockfile, foundation package. |
| 5. Pre-completion gate | pass | Plus every consumer of `@lockness/contract`, which is all of them. |
| 7. JSDoc on public APIs | pass | `safeForLog`'s `@remarks` changes (FR-006). |
| 9. One category per commit | pass | `fix` + `test`. |
| TDD | pass | SC-001 and SC-004 are failing tests first. |
| No silent catches | pass | No catch. |

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `safeForLog` signature | no | Same input, same output type. |
| `safeForLog` output | **yes** | Bidi characters now escaped; codepoints above `0xFF` change spelling from `\xXXXX` to `\u{XXXX}`. |
| `renderError` | no | Inherits both. |
| Every consumer | no API change | A log line that contained a bidi character now shows an escape. |

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| The fix catches RTL script and mangles legitimate input | FR-003 and SC-002 — the constraint the issue names first. |
| A range is added and one is missed | SC-001 asserts each range separately. |
| Changing the escape spelling breaks an existing expectation | SC-006 requires each such edit to be listed, so a churn cannot hide a behaviour change. |
| A wider escape eats more of `MAX_LENGTH` | **This was the risk I mis-sized.** The security audit measured it as a log-eviction primitive, not a rounding error — the "rare in practice" reasoning was about accidental occurrence, inside a function that exists for the adversarial case. FR-008 and SC-008. |
| The `\p{Cf}` criterion escapes something that is legitimate content | FR-001b carves out the eleven Arabic/Syriac prefix marks, and SC-001's property assertion asserts the carve-out in both directions. |
| A developer "aligns the code to the plan" and switches the loop to `charCodeAt` | SC-007 fails the moment they do. |

## 10. Architecture audit

**Verdict**: 🔴 `fail` — 3 HIGH, 3 MEDIUM, 1 LOW. Every HIGH reproduced by execution before being
accepted.

| # | Sev | Finding | What was done |
| :--- | :--- | :--- | :--- |
| A1 | HIGH | The backslash is not escaped, so a real U+2028 and the literal text `\x2028` are byte-identical (`COLLIDE -> true`). FR-004's "exactly one parse" was false as written and stayed false after the change. | **FR-004b** added. The alternative offered was to weaken US3/SC-004; keeping the strong wording with the weak change was not on the table. |
| A2 | HIGH | The plan said the loop is `charCodeAt` per code unit. It is `for...of` + `codePointAt` — per code **point**. A developer aligning code to plan would have split every astral character. | §2 corrected, and **SC-007** added so the iteration mode is pinned by a test rather than by a sentence. |
| A3 | HIGH | U+061C ARABIC LETTER MARK unescaped (`escaped? -> false`) — a Bidi_Control in the Trojan Source set, reachable as `%d8%9c`, omitted against the plan's own stated rule. | Subsumed by **FR-001**'s criterion; named individually in SC-001 so it cannot silently drop out. |
| A4 | MED | Membership was an enumeration where it needed a criterion — included U+200B-200D (not bidi controls), excluded U+061C/U+FEFF/U+2060 (same class). | **FR-001** is now `\p{Cf}`. |
| A5 | MED | Including U+200C/U+200D mangles Persian ZWNJ and ZWJ emoji; SC-002's letters-only assertion passed straight over it. | Moved to §12 as a **decided cost with its consequences named**; SC-002 extended to both cases. |
| A6 | MED | SC-004's injectivity is unachievable under truncation — a 512-cut inside `\u{` creates a second parse. | SC-004 now scopes the claim below the cap and says so. |
| A7 | LOW | Rename `isControl`; do **not** build an `EncodedLogValue` class. | Accepted both ways: rename yes, class no. |

Also supplied and used: 33 production `safeForLog` sites / 22 `renderError`; 12 escape-spelling
assertions of which exactly 2 change; 0 in-repo consumers decode an escape. Those numbers are now
§6 and SC-006 rather than an estimate.

## 11. Security audit

**Verdict**: 🟠 `needs_followup` — 4 MEDIUM, 3 LOW. S2 verified by execution.

| # | Sev | Finding | What was done |
| :--- | :--- | :--- | :--- |
| S1 | MED | Same backslash injectivity gap as A1; cheapest to fix now, since SC-006 already budgets escape-spelling edits. | **FR-004b**. |
| S2 | MED | **New class of finding.** The wider escape is a **log-eviction primitive**: 64 × U+202E plus a diagnostic tail renders at 134 chars today and **582** under the new encoder, tripping the 512 cap and discarding the tail *including the evidence that redaction fired*. `MAX_LENGTH` stops being out of scope **because of this change**. | **FR-008** + **SC-008**; §6 scope line and the §9 risk row both rewritten. |
| S3 | MED | U+061C omitted against the plan's own stated rule. | FR-001 criterion. |
| S4 | MED | U+200B in, U+FEFF/U+2060 out — one class split down the middle. | FR-001 criterion. |
| S5 | LOW | Truncation splits an escape. | SC-004 scoped; the split escape is a rendering artefact at the cut, not an ambiguity an attacker steers. |
| S6 | LOW | **Pre-existing, not introduced here.** U+FEFF inside DSN userinfo evades `redactDsnCredentials`, because JS `\s` contains U+FEFF but not U+200B/U+061C/U+202E. Verified: `U+FEFF -> LEAKS`. | Recorded in §6, **filed as its own issue**, not fixed in this branch — redaction runs before encoding, so nothing here touches it. |
| S7 | LOW | The surrogate bullet misread the loop; astral Cf block U+E0000-E007F uncovered — the current vehicle for invisible text aimed at automated log readers. | Covered by FR-001; named in SC-001. |

**Both seats converged independently on `\p{Cf}`**, and on the same reason: it matches all three
ranges plus U+061C, U+FEFF, U+2060, U+00AD and the astral tags, and matches no letter or digit —
making FR-003/SC-002 hold by construction. The security seat also confirmed FR-005 is sound:
`redactDsnCredentials` runs before truncation and encoding, so `renderError` inherits safely.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| The eleven Arabic/Syriac prefix marks are `Cf` but appear in legitimate text. Carve them out, or escape everything `Cf`? | **Carve them out** — FR-001b stands as written. 159 codepoints escaped, 11 exempt. The security property is unaffected: none of the eleven is a Bidi_Control and none can reorder a line, so the exemption costs nothing and buys legible Arabic and Syriac logs. | 2026-09-06 |

### Decided without asking

- **`\p{Cf}` as a criterion rather than an enumerated range list.** Both audits reached it
  independently, it is less code than the three ranges it replaces, and it makes FR-003 a property
  instead of a promise. Not a scope increase — a smaller predicate that happens to be correct.
- **The backslash is escaped (FR-004b).** One line. Without it the plan's own injectivity claim is
  false, and the alternative was to delete the claim — which would leave `\u{202e}`-in-text
  indistinguishable from the character it names, in the one function whose job is to make hostile
  input legible. Visible cost: `C:\\Users\\…` in Windows paths.
- **`MAX_LENGTH` is now in scope (FR-008).** It was listed out of scope on the reasoning that bidi
  characters are rare; the security audit showed that reasoning is about *accidental* occurrence in a
  function that exists for the *adversarial* case. Measured at 582 vs a 512 cap.
- **`\u{XXXX}` above `0xFF`, `\xXX` at or below.** The narrow form is what the existing tests and an
  operator's eye expect; widening everything would be churn with no reader benefit.
- **U+200E/U+200F are included.** They are marks rather than embeddings, and they set direction; the
  issue's own table lists them.
- **U+200C/U+200D (ZWNJ/ZWJ) are included, and the cost is real.** They are not bidi controls, so
  A5's objection stands on the merits — but they are invisible, they are `Cf`, and carving them out
  would reintroduce exactly the enumeration FR-001 exists to remove. The consequence: Persian
  `می‌رود` renders with an escape between its letters, and a ZWJ emoji family renders as its
  components. SC-002 asserts that shape explicitly rather than letting a letters-only assertion pass
  over it. This is the trade the criterion buys, stated rather than discovered.
- **S6 is filed, not fixed.** It predates this change, redaction runs before encoding so nothing here
  reaches it, and folding a credential-leak fix into a `fix(contract): escape bidi` commit would bury
  it. Hard rule 9.

## 13. Review cycle — what the three seats returned

| Seat | Verdict | Findings | Outcome |
| :--- | :--- | :--- | :--- |
| code-reviewer | 🔴 `fail` | 1 CRITICAL, 4 MED, 1 LOW | all fixed |
| test-reviewer | 🔴 `fail` | 2 HIGH, 4 MED, 4 LOW | all fixed |
| security-expert | 🟠 `needs_followup` | 2 LOW + 3 INFO | both LOW fixed, all INFO folded in |

Only CRITICAL and HIGH buy a fix cycle; the MEDIUMs and LOWs were taken anyway because every one of
them was either a false statement I had written or a test that did not test what its name claimed.

**The four findings worth carrying forward, because each is a repeat of something already named in
this branch's own history:**

1. **The battery's restore handler swallowed a failed write** and then printed a line claiming the
   restore had succeeded (`bidi_292.ts`, CRITICAL). An instrument reporting a result it did not
   measure — inside the instrument built to find exactly that, whose own docstring calls this the
   hazard it exists to prevent.
2. **Two mutants survived all 23 tests**: a `g` flag on the criterion (the second of two *adjacent*
   Cf codepoints leaks, and every test fed them isolated between ASCII) and the `code <= 0xff`
   boundary (asserted at its only lower edge by nothing, because five rows asserted absence rather
   than rendering). Neither had a battery row. 9/9 was a true count of the wrong question.
3. **A test passed under the exact mutant its own comment named.** 60 hostile characters emit 480,
   the evidence lands at 500, and the cap fires at 512 — four characters short of doing its job.
4. **`renderError`'s own cap still charged UTF-16 units** while the encoder below it had just been
   changed to charge code points: the same defect, one function up, in code the diff had not
   touched. Fixing the layer you were sent to fix is not the same as fixing the defect.

Three of my own prose claims were measured false and corrected rather than softened: the 5120 bound
(real: 4608, or 4620 truncating), the "582 characters rendered" (582 was produced, 524 returned),
and the carve-out as "ordinary text" (U+070F is `Bidi_Class=AL`).

Battery: **14 rows, 14 killed, 0 survivors.** Gate: **2033 passed, 0 failed.**
