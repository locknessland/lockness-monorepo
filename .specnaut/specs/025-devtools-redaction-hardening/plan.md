# Plan: Devtools redaction hardening — depth + collector header/body/query + panel test gaps

**Linked issue**: #149 (labels: `security`, `tech-debt`, `domain:devtools`)
**Feature dir**: `.specnaut/specs/025-devtools-redaction-hardening/`
**Origin**: non-blocking MED/LOW findings from the #27 review (merged range
`bf70be6..d109889`). No behavioural change to what the devtools panels _show_;
this closes redaction holes in what reaches the collector.

> **Scope note (post-audit).** Both pre-code audits found the collector also
> captures the **query string** unredacted — the same leak class as headers/body,
> and a violation of this plan's own §6 invariant. It is **not** named in #149's
> written ACs. The plan folds it in (D6); the user vetoes at STOP 1 if #149 must
> stay strictly to its ACs.

---

## 1. Why this exists

The devtools Events/Sessions panels shipped (#27) with fail-closed activation
and session redaction **at capture**. The review left residual leaks and two
test gaps out of the landing PR:

1. **Shallow redaction.** `redactSecrets` (`packages/devtools/redact.ts`) copies
   one level deep and masks by key. A secret nested inside an object value
   (`{ profile: { apiToken: '…' } }`) passes through in the clear, and a
   camelCase key token like `sessionKey` / `signingKey` is missed because the
   secret-key regex only recognises a `key` segment delimited by `_ . -` or the
   string ends, not a camelCase word boundary.
2. **Unredacted request capture.** The pre-existing collector
   (`packages/devtools/middleware.ts`) records **every** request header —
   including `Cookie` and `Authorization` — the **query string**, and the parsed
   JSON request body, with no redaction. All three land in the in-memory
   collector and are re-served verbatim by the **unauthenticated**
   `/_devtools/api/data` (`mod.ts:202`). Dev-only today (the collector fails
   closed unless devtools is active), but the raw capture is a standing leak
   vector the moment the bar is exposed.
3. **Two weak tests.** The events-capture test asserts only
   `typeof listenerCount === 'number'`, never the value; and the session test
   titled "…none => nothing" never exercises the no-session branch.

**Measure.** Today: a request with `Authorization: Bearer …`, `?token=abc` in the
URL, and a JSON body `{ password: 'x', profile: { apiToken: 'y' } }` is captured
with **all four** values in the clear, and served by `/_devtools/api/data`.
Target: all four read `[redacted]`, with surrounding non-secret fields intact,
and a pathological (deep/cyclic) input never throws or hangs the server.

## 2. User scenarios

The "user" here is a **framework developer** running with devtools active.

**US1 — request secrets never reach the collector (P1).** Auth headers, query
secrets, and secret body fields.

- **Given** devtools is active and a request arrives with `Cookie` +
  `Authorization` headers, `?token=` in the URL, and a JSON body containing a
  `password` field, **When** the middleware captures the request, **Then** those
  header values, the query value, and that body field read `[redacted]` in the
  collector, and non-secret headers/params/fields are unchanged.

**US2 — nested and camelCase secrets are masked, safely (P2).** Deep traversal +
the camelCase `*Key` gap, bounded so it cannot be weaponised.

- **Given** a value `{ profile: { apiToken: 't' }, sessionKey: 'k', theme: 'dark' }`,
  **When** it is redacted, **Then** `profile.apiToken` and `sessionKey` read
  `[redacted]` and `theme` is unchanged.
- **Given** an adversarially deep JSON body, or a **cyclic** in-memory session
  value, **When** it is redacted, **Then** redaction terminates without throwing
  and without exhausting the stack (the over-limit subtree is masked, not
  captured raw).

**US3 — the test suite pins the refinements (P3).**

- The events-capture test asserts the exact `listenerCount` value (0 for the
  probe event, which has no registered listener), not merely its type.
- An explicit test asserts the no-session-present branch records nothing.

**Edge cases (decided, see §12):**

- **Arrays of objects** (`{ items: [{ token: 't' }] }`, or a **top-level** array
  body `[{ token: 't' }]`) → traversed; secrets inside elements masked.
- **Non-object leaves** (string, number, null) → returned unchanged.
- **`null` / non-record / array body** → handled without throwing (see FR-002a).
- **Deeply nested / cyclic input** → bounded by a depth cap + a visited-set
  (FR-012); no longer dismissed (was wrongly "out of scope" pre-audit).

## 3. Requirements

- **FR-001** The deep masker recurses into nested plain objects, masking a
  secret-keyed value at any depth.
- **FR-002** The deep masker recurses into arrays, redacting object elements —
  **including a top-level array**.
- **FR-002a** A non-record, non-array leaf (scalar / `null`) is returned
  unchanged; a `null` or otherwise non-JSON-object body is captured without a
  throw.
- **FR-003** The secret-key matcher recognises a `key` token at a **camelCase**
  boundary (`sessionKey`, `signingKey`, `privateKey`) in addition to the
  existing separator / apikey / password / token / secret / authorization / csrf
  cases. It must **not** over-match benign words that merely contain the
  substring (`monkey`, `donkey`).
- **FR-004** The secret-key matcher recognises `cookie`.
- **FR-004a** The secret-key matcher recognises `code` and `state` as
  **standalone tokens only** — whole-word or separator-delimited (`?code=`,
  `oauth_state`, `state`), **never** as substrings and **not** at camelCase
  boundaries — so OAuth callback params are masked while benign compound names
  (`statusCode`, `zipcode`, `stateName`, `candidate`) stay visible. (Folded per
  the STOP-1 answer "broaden vocab", 2026-09-03; the token-only form is how the
  known false-positive risk is bounded — see D6/D10.)
- **FR-005** The collector redacts request **headers** at capture, so `Cookie`
  and `Authorization` never enter the collector.
- **FR-006** The collector redacts secret-looking request **body** fields at
  capture (deep, per FR-001/002).
- **FR-007** The collector redacts request **query** parameters at capture,
  reusing the single decider (folded from both audits; see §12 D6).
- **FR-008** The events-capture test asserts the exact `listenerCount` value.
- **FR-009** An explicit test asserts the no-session-present branch records
  nothing.
- **FR-010** No change to panel rendering, to the `/_devtools` route surface, or
  to the collector's public shape. Redaction stays **at capture** — never
  per-panel (preserves the #27 S3 invariant).
- **FR-011** The deep masker is a single internal traversal in `redact.ts`
  accepting `unknown` (`redactValue`); the record convenience wrapper
  `redactSecrets` and every asker (headers, query, body, session) route through
  it. No second masking implementation in any asker.
- **FR-012** The traversal is **bounded**: a depth cap (masking an over-deep
  subtree as `[redacted]`) **and** a visited-set (`WeakSet`) so a cyclic value
  terminates. It never throws out of the middleware; if traversal is aborted, it
  logs at WARN (no silent catch) and captures the masked/partial value.

## 4. Success criteria

- **SC-001** A request with `Cookie`, `Authorization`, `?token=`, and a body
  `{ password, profile: { apiToken }, theme }` yields a captured record where the
  four secrets read `[redacted]` and `theme` / non-secret headers/params survive.
- **SC-002** The masker masks a secret two levels deep, a camelCase `*Key` key,
  and standalone `code`/`state`, while leaving `theme`, `monkey`, `statusCode`
  and `stateName` visible; a test pins all of it.
- **SC-003** With no session set, `collector.getSessions()` gains no entry for
  the request; a test pins it.
- **SC-004** The events-capture test fails if `listenerCount` changes from its
  expected value (not just its type).
- **SC-005** A deeply nested body and a cyclic session value each capture without
  a throw or a stack overflow; a test pins both.
- **SC-006** `deno fmt && deno lint && deno check <touched> && deno task test`
  is green; the existing devtools suite still passes unchanged in intent.

## 5. 🔒 The decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **What name counts as a secret** (`password`, `token`, `secret`, `authorization`, `csrf`, `cookie`, `apikey`, a `key` token at any separator **or camelCase** boundary, and `code` / `state` as **standalone tokens only**) | `SECRET_KEY` regex in `packages/devtools/redact.ts` | a second list of header/param names in `middleware.ts`; a per-panel key check in a `ui/panels/*.tsx`; a hard-coded `['cookie','authorization']` array anywhere; a query-only secret list separate from the general one |
| **How a value is masked** (deep: nested objects + arrays incl. top-level; **depth-bounded + cycle-safe**; leaves untouched) | `redactValue(unknown)` traversal in `packages/devtools/redact.ts` (`redactSecrets` is the record wrapper over it) | any inline `Array.isArray(x) ? x.map(...) : redactSecrets(x)` dispatch in `middleware.ts`; any other shallow re-mask |
| **Request headers redacted at capture** (asker) | the `headers:` value in the `RequestInfo` **object literal** in `middleware.ts` (headers is `readonly` — redact at construction, not by reassignment) | redacting headers again in a panel or in `collector.addRequest` |
| **Request query redacted at capture** (asker) | the `query:` value in the same `RequestInfo` object literal in `middleware.ts` | a second query redaction downstream |
| **Request body redacted at capture** (asker) | the body-assignment in `middleware.ts` (`requestInfo.body = redactValue(...)`) | redacting the body again downstream |

**One decider, many askers.** What is secret and how it is masked lives once in
`redact.ts`. `middleware.ts` (headers, query, body) and the existing session
capture are **askers** — they call the traversal, they do not re-decide. A review
finding a second secret-name list, or a second masking implementation (including
an inline array/record dispatch in an asker), is a **plan violation**, not a
style note.

## 6. Technical context

- **Language/runtime**: Deno, TypeScript, TC39 decorators. JSR specifiers.
- **Package**: `@lockness/devtools` (dev-only; view/tooling layer). Consumes
  `@lockness/session` (type only) and `@lockness/events`.
- **Testing**: `Deno.test` in `packages/devtools/tests/`. Existing suite:
  `debug_panels.test.ts` (the #27 panels), `collector.test.ts`,
  `helpers.test.ts`, `toolbar.test.ts`.
- **Constraints**: redaction is at capture, once; no `any` in exported APIs;
  JSDoc on the changed function; the collector's public shape is frozen.
- **Scale**: in-memory collector, bounded buffers (maxEvents 500 etc.).

### Domain Model

- **Bounded context**: devtools (dev-only observability).
- **Vocabulary**: _capture_ (recording request/session/event data into the
  collector), _redaction_ (masking secret-keyed values with `[redacted]` before
  capture), _secret key_ (a field/header/param name matching `SECRET_KEY`).
- **Value objects**: `RequestInfo` (`headers`, `query`, `body`, …),
  `SessionInfo`, `EventInfo` — immutable snapshots held by the collector.
- **Invariant**: **no secret value is ever written into the collector** —
  redaction happens strictly before `collector.addRequest` / `updateSession`.
  This feature extends the invariant from sessions to request headers, **query**,
  and body — and makes the masker termination-safe so the invariant cannot be
  defeated by a pathological input.
- **Out of scope**: the DI-container panel (#128); any change to what a panel
  displays or to the activation gate; authenticating `/_devtools/api/data` (a
  separate concern that raises the stakes but is not this issue — see §12).

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No direct `hono` import | **Deferred, tracked separately.** `middleware.ts:18` (also `mod.ts:45`, `dashboard.tsx:9`) import Hono _types_ from `'hono'`. `deno.json` already aliases the bare `'hono'` specifier → the pinned zero-dep `@lockness/hono`, and the imports are type-only (erased), so the hard-rule-1 runtime hazard is already neutralised — what remains is spelling. Fixing it here would be a partial, cross-category (`refactor`) change to a `security` issue. Filed as a follow-up (§12): rewrite all three to `from '@lockness/hono'` (**not** `@lockness/core` — that adds a devtools→core edge and risks a cycle, since core optionally loads devtools at boot). Not "N/A". |
| JSR-only specifiers | PASS — no new deps. |
| No `any` in exported APIs | PASS — traversal is `unknown`-typed; the header/query cast (`Record<string,unknown>`→`Record<string,string>`) is a sound one-line narrowing, documented, no `any`. |
| Tailwind v4 syntax | N/A — no CSS/markup change. |
| Pre-completion gate | PASS — SC-006. |
| No manual `deno.lock` edit | PASS. |
| JSDoc on public APIs | PASS — masker JSDoc updated (deep, bounded, cycle-safe, **name-based limitation stated**, `@example` for nested). |
| MVC layering | N/A — devtools tooling layer. |
| No silent catches | PASS — FR-012's abort path logs at WARN, never swallows silently. The one pre-existing body-parse catch keeps its behaviour. |
| TDD | PASS — every FR gets a RED-first test, negative-tested. |

No violations → no Complexity Tracking entry.

## 8. Surface impact

- **Package-internal API**: `redactSecrets` is **not re-exported** from `mod.ts`
  — it is package-private with **zero external consumers**. So widening the
  masker to an `unknown`-accepting `redactValue` (adding a bounded traversal) is
  a zero-blast-radius internal change; there is no frozen public contract here.
  `REDACTED` unchanged.
- **Collector contract**: `RequestInfo.headers` / `query` / `body` shapes
  unchanged; only their _values_ are now redacted. `/_devtools/api/data`
  response shape unchanged.
- **CLI / route surface**: none.
- **Front-end / UX-UI**: no user-facing FE surface added or changed. The devtools
  panels are dev-only diagnostic views rendering the same fields; no
  `Visual Prototyping` subsection applies (no new FE surface per the
  accessibility-gate signals).

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Deep traversal changes an existing redaction result and breaks a #27 test | Run `debug_panels.test.ts` unchanged; SC-006. Existing single-level cases stay identical. |
| Over-broad camelCase rule masks a benign field (`monkey`, `donkey`) | Match a `key` **word** boundary, not the substring; FR-003 + a negative test (`monkey` stays visible). |
| **Unbounded recursion — deep body (DoS) or cyclic session value (hang)** | FR-012: depth cap + `WeakSet`. The body is JSON-derived (acyclic but can be adversarially **deep**); `session.all()` returns arbitrary in-memory objects that **can** be cyclic — the cap covers the first, the visited-set the second. The redaction call is guarded so an abort degrades to a masked value + WARN, never a throw escaping the middleware (which today runs **before** `try { await next() }`). |
| `redactValue` return (`unknown`) vs `RequestInfo.headers/query: Record<string,string>` | Redact inside the object literal at construction; document the one-line narrowing; no `any`. |
| Query redaction is beyond #149's written ACs | Folded per both audits (§10/§11) because it breaks the §6 invariant; recorded as D6 for the user's STOP-1 veto. |
| Name-based redaction still misses secrets under non-secret names (`?code=`, `?state=`, `{ note: 'Bearer …' }`) | Inherent to key-matching; stated in `redact.ts` JSDoc + D9 so it is a known boundary, not a silent gap. Optional vocabulary expansion is the STOP-1 question. |

## 10. Architecture audit

Dispatched to `architect-expert` on this plan, before any code. Backlog read
first (only #149 open for `domain:devtools`). **Verdict: FAIL** (1 HIGH, 3
MEDIUM, 3 LOW) — all resolved by plan edits below.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| A1 | HIGH | **Query string captured unredacted** — no FR, no row; breaks the §6 "no secret in the collector" invariant (OAuth `?code=/?state=`, `?token=`, `?api_key=`). | **Plan changed.** Added **FR-007** + a query asker row (§5); §6 invariant now names query. Folded as **D6** (user veto at STOP 1). |
| A2 | MED | §8 froze `redactSecrets` at `Record→Record`, which pressures an inline array/record dispatch in `middleware.ts` — the second masker Row B forbids. `redactSecrets` is package-private (zero external consumers). | **Plan changed.** §8 reworded (no frozen public contract); **FR-011** makes `redactValue(unknown)` the single home; Row B updated. |
| A3 | MED | **Top-level non-record (array) body leaks** despite FR-002 — FR-002 vs old FR-007 contradiction. | **Plan changed.** FR-002 now says "including a top-level array"; FR-002a scopes the leaf case; the `unknown` traversal handles both. |
| A4 | MED | **Deep recursion hangs on a cyclic *session* value** — `session.all()` is not JSON-derived; the old cycle-out-of-scope premise was false for the session asker. | **Plan changed.** **FR-012** (depth cap + `WeakSet`); §9 rewritten to name depth **and** cycles, session path called out. |
| A5 | LOW | `RequestInfo.headers` is `readonly` — redact in the object literal, not by reassignment (the §5 illustration was wrong). | **Plan changed.** §5 header/query rows now say "in the object literal at construction". |
| A6 | LOW | Hard-rule-1 hono import correctly deferred, but §7 mislabelled it "N/A"; fix is `@lockness/hono` across 3 files, not `@lockness/core`. | **Plan changed.** §7 reworded to "deferred, tracked separately"; follow-up recorded (§12). |
| A7 | LOW | Key-based redaction boundary undocumented. | **Plan changed.** FR-003/§9/D9 + a JSDoc line requirement. |

## 11. Security audit

Dispatched to `security-expert` on this plan, before any code. Backlog read
first. **Verdict: needs_followup** (0 critical/high, 2 MEDIUM, 2 LOW, 1 INFO) —
kept separate from §10; it asks a different question (is the home _reachable_ by
someone who should not reach it), and its findings converge with the architect's
on the two that matter.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| S1 | MED | **Query is the un-redacted third capture surface** the plan silently omitted; served by the **unauthenticated** `/_devtools/api/data` when devtools is active. | **Plan changed** — same fold as A1 (FR-007, D6). |
| S2 | MED | **Deepened traversal is unbounded** → attacker-tunes a body that parses but overflows the redactor; the throw escapes because body capture runs **before** `try { await next() }`. | **Plan changed** — same fix as A4 (FR-012, guarded call, WARN). |
| S3 | LOW | Redaction is **name-based**; secrets under non-matching names survive (`?code=`, `?state=`, `X-Session-Id`). | **Accepted + documented** (D9, JSDoc, §9). Optional vocabulary expansion is the STOP-1 question. |
| S4 | LOW | Top-level JSON **array** body ambiguity (FR-002 vs FR-007). | **Plan changed** — same as A3 (FR-002/002a). |
| S5 | INFO | `/_devtools/api/data` serves the full collector **unauthenticated** when active — out of #149 scope, but it is _why_ redaction is load-bearing, not merely a second layer. | **Tracked separately** (§12 follow-up); no change here. Gate + at-capture redaction invariant preserved. |

**Affirmed clean (both seats):** the fail-closed gate is preserved (untouched);
redaction-at-capture is the correct boundary; the single-decider design is sound;
response bodies are never stored and non-JSON bodies are never captured (safe by
omission); `Authorization`/`Cookie` are correctly covered.

## 12. Open questions & decisions

**Decisions taken (one line each — veto any at STOP 1):**

- **D1** Header/query/body redaction **reuses the one masker** rather than a new
  one — single home (§5, FR-011).
- **D2** `cookie` is added to `SECRET_KEY` (not a separate header allowlist).
- **D3** camelCase detection via a word-boundary rule (normalise camelCase→snake
  before the regex, or an added camelCase alternative) — implementer's choice
  **within** the `redact.ts` home; semantics fixed by FR-003; `monkey` stays
  visible.
- **D4** AC's deterministic count: `listenerCount === 0` for the probe event; the
  implementer may instead register a known listener and assert its count.
- **D5** Arrays (incl. top-level) are traversed (FR-002); the masker is
  **bounded** (depth cap + `WeakSet`, FR-012) — cyclic inputs are handled, not
  dismissed.
- **D6** **Query-string redaction is folded into #149** (FR-007), and the secret
  vocabulary is **broadened** to OAuth `code`/`state` (FR-004a). _Resolved at
  STOP 1, 2026-09-03: user chose "fold query + broaden vocab."_ Both audits found
  the query leak breaks the §6 invariant; it is the same leak class as
  headers/body and one line at the same decider.
- **D10** `code`/`state` are matched as **standalone tokens only** (not
  substrings, not camelCase), so `?code=`/`?state=` mask while `statusCode`,
  `zipcode`, `stateName` stay visible. This is how the option's stated
  false-positive risk is held to the minimum while still catching the OAuth
  callback params S3/A7 named. One decider (`SECRET_KEY`) — no query-only list.
- **D7** Depth cap masks the over-deep subtree as `[redacted]` (not drop); the
  `WeakSet` short-circuits a revisit to `[redacted]`. Cap value is the
  implementer's within the home (target ~64).
- **D8** The masker is widened to `redactValue(unknown)`; `redactSecrets` becomes
  its record wrapper. Package-private, zero external consumers.
- **D9** Redaction is **name-based** and enumerated; secrets under non-matching
  names (notably OAuth `code`/`state`, or a secret embedded in a value under a
  benign key) are **not** caught. Stated in `redact.ts` JSDoc.

**Follow-up items to file (not this issue):**

- **F1** Rewrite the three type-only `from 'hono'` imports in devtools
  (`middleware.ts`, `mod.ts`, `dashboard.tsx`) to `from '@lockness/hono'`
  (hard-rule-1 spelling; `refactor`, devtools-scoped).
- **F2** Authenticate/gate `/_devtools/api/data` even when devtools is active
  (S5; `security`, devtools-scoped) — redaction is defence-in-depth, but the
  endpoint being open is why it is load-bearing.

**Open question — RESOLVED at STOP 1 (2026-09-03):**

> Q: Fold query redaction into #149, and how wide a secret vocabulary?
> **A (user): "Fold query + broaden vocab."** → FR-007 (query redacted at
> capture) + FR-004a (`code`/`state` added). Implemented as standalone-token
> matches (D10) to bound the false-positive cost the user accepted.
