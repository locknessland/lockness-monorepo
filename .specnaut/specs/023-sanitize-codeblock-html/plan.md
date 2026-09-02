# Plan: Sanitize CodeBlockNode.html raw-HTML sink in @lockness/markdown

- **Issue**: #159
- **Branch**: `023-sanitize-codeblock-html`
- **Status**: planned
- **Origin**: residual **S4** from the #80 blog plan, deferred by #148 (which
  scoped its guarantee to `href`/`src` only). See
  `.specnaut/specs/022-markdown-uri-allowlist/plan.md` §11.

---

## 1. Why this exists

`packages/markdown/parser.ts` (`tryParseCodeBlock`) captures the inner HTML of a
`<pre><code>…</code></pre>` block verbatim (`match[2]`) and stores it on
`CodeBlockNode.html`. The plain default renderer ignores that field and renders
escaped text — safe. But the styled `@lockness/ui/markdown` map forwards `html`
to `HighlightedCodeBlock`, which pipes it into `dangerouslySetInnerHTML`
(`packages/ui/components/CodeBlock/mod.tsx:512`). This is the one markdown trust
boundary #148 explicitly left open.

**Measured, not assumed** (probe of `@libs/markdown@^2.1.0` + `gfm` +
`highlighting`, run 2026-09-03): the engine escapes **every** author `<` to the
`&#x3C;` entity before the parser sees it — for a recognised language, an unknown
language, no language, `html`-tagged fences and indented code blocks alike. So
`<script>` becomes `&#x3C;script>` and an `onerror=…>` fragment is left inert
because no real tag element is ever formed. **There is no live exploit today.**

The problem this closes is the *dependency* of that safety:

- The guarantee lives entirely in an **external** package pinned with a **caret
  range** (`jsr:@libs/markdown@^2.1.0`) — a minor upgrade can change escaping.
- It is an **undocumented** behaviour, not a security contract.
- `parseHtmlToAst` stores whatever `match[2]` holds with **zero verification**;
  the styled map trusts it blindly.

S4 asks that the highlighted-code path can no longer emit unescaped
author-controlled HTML *without relying on that external behaviour* — the same
defense-in-depth posture #148 took for `sanitizeUrl`.

## 2. User scenarios

### US1 — a code fence containing markup cannot inject an element (P1)

- **Given** Markdown authored (now or by a future untrusted-input write-UI)
  containing a fenced code block whose body is `<script>alert(1)</script>` or
  `<img src=x onerror=alert(1)>`,
- **When** it is rendered through the styled `@lockness/ui/markdown` map,
- **Then** the code text is displayed literally and **no** `<script>` /
  `<img>` element exists in the rendered DOM — regardless of what the upstream
  engine did or did not escape.

### US2 — syntax highlighting is preserved (P1)

- **Given** a fenced code block in a recognised language,
- **When** it is rendered through the styled map,
- **Then** the highlighter's own structural markup (`<span class="hljs-…">`)
  survives intact and the block is highlighted exactly as before this change.

### US3 — the guarantee holds independently of the parse entry point (P2)

- **Given** a hand-built HTML string passed to the public `parseHtmlToAst`,
  or a caller that constructs the AST directly,
- **When** a `<pre><code>` block carries a disallowed tag in its body,
- **Then** the resulting `CodeBlockNode.html` contains only allowlisted
  highlighter markup; disallowed markup is neutralised at the parser.

### Edge cases

- Multi-token hljs classes (`class="hljs-title function_"`) — must pass.
- Nested hljs spans (`<span class="hljs-tag">&#x3C;<span class="hljs-name">…`)
  — must pass, preserving nesting.
- A crafted `<span class="hljs-x" onclick="…">` (extra attribute) — must be
  neutralised: only a single `class` with an hljs value, `>` immediately after
  the quote, is allowed.
- A crafted `<span/onload=…>` (`/`-separated pseudo-attribute) — neutralised.
- An uppercase/case-variant `<SPAN>` — neutralised.
- A **bare or unterminated `<`** (`<span class="hljs-x` with no `>`, or a lone
  `<`) — escaped, forms no element (Security Finding 1).
- A crafted non-span tag `<a href="javascript:…">` inside code — neutralised.
- Already-escaped entities (`&#x3C;`, `&amp;`) in the body — must **not** be
  double-escaped.
- An empty / whitespace-only code block — unchanged.

## 3. Requirements

- **FR-001** — `CodeBlockNode.html`, when present, MUST contain only
  allowlisted highlighter markup: the tags `<span class="…">` and `</span>`. The
  allowed opening tag MUST match **exactly** `<span class="VALUE">` where `VALUE`
  is one or more space-separated `[\w-]+` tokens, the first prefixed `hljs-`, and
  the `>` comes **immediately** after the closing quote — no trailing text, no
  second attribute, no `/`-separated attribute. Anything looser (a case variant,
  `<span/onload=…>`, `<span class="hljs-x" onclick=…>`, a smuggled quote) does
  NOT match and is neutralised. Every other `<`/`>` in the field MUST be an
  escaped entity. (Security Finding 2.)
- **FR-002** — Neutralisation is **allowlist-directional, not denylist**: escape
  **every** `<` and `>` in the code body first, then re-admit only the exact
  allowlisted tokens of FR-001. This means a **bare or unterminated `<`** (e.g.
  `<span class="hljs-x` with no `>`, or a lone `<`) is escaped like any other —
  the browser's lenient parser can never reconstruct a tag from it. Markup that
  is not re-admitted is shown as literal text and forms no element; the visible
  characters are preserved, nothing is silently dropped. (Security Finding 1 —
  MEDIUM: do NOT implement this as an "escape the recognised bad tags" pass,
  which would never see a token for an unterminated `<` and would reopen the
  hole this plan closes.)
- **FR-003** — The sanitiser MUST NOT double-escape existing HTML entities.
- **FR-004** — The sanitiser MUST be applied at the single point where
  `CodeBlockNode.html` is written (`tryParseCodeBlock`), so no parse path — via
  `renderMarkdown`, the `Markdown` component, or the public `parseHtmlToAst` —
  can store an unsanitised value. (Mirrors #148 FR-005.)
- **FR-005** — Highlighter output for every language the project supports MUST
  round-trip through the sanitiser unchanged (no fidelity loss).
- **FR-006** — The renderers (plain default and styled map) MUST remain pure
  forwarders of `CodeBlockNode.html`; no scheme/markup logic may live in a
  component map. (Mirrors #148 FR-006.)

## 4. Success criteria

- **SC-001** — A fenced code block whose body is `<script>…</script>` or
  `<img … onerror=…>`, rendered through the styled map, produces a DOM with no
  such element and the text shown verbatim.
- **SC-002** — For every supported highlight language, the highlighter's own
  `<span class="hljs-…">`/`</span>` structure survives the sanitiser **intact
  (byte-for-byte on the span tokens)** and the rendered output is visually
  identical. Note: because neutralisation escapes both `<` and `>` (FR-002), a
  literal `>` sitting in a *text* position of the highlighter output becomes
  `&gt;` — a no-op for the reader (both display `>`) and not a fidelity loss;
  the coloured token structure is what must be preserved, and is.
- **SC-003** — The guarantee holds when the upstream escaping is bypassed:
  feeding `parseHtmlToAst` a hand-crafted `<pre><code>` string yields a
  `CodeBlockNode.html` with the disallowed markup neutralised (defense-in-depth,
  independent of `@libs/markdown`). The negative matrix MUST include: a raw
  `<script>`, `<img … onerror=…>`, `<a href="javascript:…">`, a case variant
  `<SPAN>`, an over-attributed `<span class="hljs-x" onclick=…>`, a
  `/`-separated `<span/onload=…>`, and a **bare/unterminated `<`** — each must be
  absent as a live element and present only as escaped text.
- **SC-004** — `grep` confirms `CodeBlockNode.html` is assigned in exactly one
  place, and that assignment routes through the sanitiser.
- **SC-005** — `docs/DOCS.md` states S4 is closed and describes the allowlist.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Which markup inside a code block is trusted (hljs structural spans + `</span>` only) | `sanitizeCodeHtml` in `packages/markdown/parser.ts` | a second allowlist in `@lockness/ui`'s `CodeBlock`; a per-component-map check; a regex in `renderer.tsx` |
| How disallowed markup is neutralised (escape `<`/`>` to entities, preserve content) | `sanitizeCodeHtml` in `packages/markdown/parser.ts` | escaping re-implemented in the `HighlightedCodeBlock` sink |
| Where the sanitiser runs (once, at the sole `html` writer) | `tryParseCodeBlock` in `packages/markdown/parser.ts` | any other constructor of `CodeBlockNode` that sets `html` |
| Whether existing entities are re-escaped (no) | `sanitizeCodeHtml` in `packages/markdown/parser.ts` | an escape helper elsewhere that lacks the entity guard |

**Binding on the implementer.** A decision may not move out of its home without
this plan being amended first. A review finding a second home is a plan
violation, not a style opinion.

## 6. Technical context

- **Language / runtime**: Deno, TypeScript, Hono JSX (`@lockness/hono`).
- **Package**: `@lockness/markdown` (`parser.ts`, `types.ts`, `renderer.tsx`).
  The fix is entirely within the parser; `@lockness/ui`'s `CodeBlock` is **not**
  modified — it stays a pure forwarder, which is the whole point of fixing it at
  the choke point.
- **Testing**: `Deno.test` in `packages/markdown/tests/`, TDD (RED first),
  asserting on both the AST (`parseHtmlToAst`) and the rendered DOM of the
  styled map.
- **Dependency boundary**: no new dependency; the one-way `ui → markdown` edge
  (#127) is unchanged. No `@lockness/core`/`hono` import added to the parser.
- **Constraint**: the sanitiser is a **string** transform over highlighter HTML
  — no DOM parser is available/desired at parse time; a small, auditable
  tokeniser (allowlist by regex over `<…>` tokens) is the mechanism, matching
  the style of the existing `sanitizeUrl`.

### Domain model

- **Bounded context**: content rendering (`domain:content`).
- **Value object**: *sanitised code HTML* — a string whose only markup is
  allowlisted highlighter structure. Invariant: every `<` is either the start of
  an allowlisted tag or an escaped entity.
- **Trust boundary**: `parseHtmlToAst` → `CodeBlockNode`. Upstream
  (`@libs/markdown`) is **untrusted** for the purpose of this guarantee.
- **Out of scope**: the `href`/`src` allowlist (#148, shipped); building a
  write-UI or any untrusted-input path; sanitising inline `<code>` (escaped text
  only, no `html` field). **Also explicitly out of scope (architecture LOW-1):**
  the *direct-prop* path — passing untrusted HTML straight to the exported
  `HighlightedCodeBlock html={…}` component, bypassing the parser entirely. This
  feature closes the markdown highlighted-code **parse** path; the direct-prop
  sink stays guarded by the trust-invariant JSDoc, a residual to revisit only if
  a caller starts feeding it untrusted input.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No direct `hono` import | ✅ parser imports no hono; unchanged |
| JSR-only specifiers | ✅ no new dependency |
| No `any` in exported APIs | ✅ `sanitizeCodeHtml(raw: string): string`, internal |
| Tailwind v4 syntax | ✅ n/a (no CSS change) |
| Pre-completion gate | ✅ enforced before done |
| No manual `deno.lock` edits | ✅ no dependency change |
| JSDoc on public APIs | ✅ `sanitizeCodeHtml` documented; `CodeBlockNode.html` JSDoc + the trust-invariant on `ComponentOverrides.CodeBlock` updated to "enforced at parser" |
| MVC layering | ✅ parser-layer concern, no controller/service involvement |
| No silent catches | ✅ sanitiser has no I/O and no catch; pure transform |
| TDD | ✅ RED-first, each behavioural test negative-tested |

### Complexity tracking

None. The change is additive and local to the parser, mirroring an
already-shipped pattern (`sanitizeUrl`).

## 8. Surface impact

- **`@lockness/markdown`** — the only package changed: `parser.ts` (new
  `sanitizeCodeHtml`, wired into `tryParseCodeBlock`), `types.ts` +
  `renderer.tsx` JSDoc (trust invariant now says "enforced at parser"), tests,
  `docs/DOCS.md`, `README.md`, `AGENTS.md` (regenerated brief).
- **`@lockness/ui`** — **no code change**. `HighlightedCodeBlock` stays a
  forwarder; its safety is now guaranteed upstream rather than assumed. One
  **doc-only** touch: `ui/markdown.tsx:57-60`'s JSDoc note (which frames the
  invariant as *assumed*) is updated to point at the parser-enforced guarantee
  for the parse path (architecture LOW-3).
- **Interface contract**: `CodeBlockNode.html` gains a documented invariant
  (allowlisted markup only). No signature change.

### Documentation (this feature)

- `packages/markdown/docs/DOCS.md` — rewrite the "Scope of the guarantee" note:
  S4 is **closed**; describe the code-HTML allowlist beside the URI allowlist.
  Add a line (security Finding 3) noting `CodeBlockNode.value` / the copy
  `data-plain` field needs no allowlist because it is JSX-escaped text, never a
  raw sink — so a future reader neither mirrors the treatment onto it nor
  assumes it is protected the same way.
- `packages/markdown/README.md` — extend the Security section.
- `packages/markdown/types.ts` — update the `CodeBlock` trust-invariant JSDoc to
  state the invariant is now enforced at the parser.

No front-end route surface is introduced; **no Claude Artifacts prototype
applies** (this is a parser-layer security transform, not a UI build).

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Over-strict allowlist strips legitimate highlighter markup → fidelity loss | SC-002 asserts byte-identity across every supported language; the allowlist is derived from measured hljs output (`hljs-*` first token, multi-token classes, nested spans) |
| Double-escaping existing entities corrupts displayed code | FR-003 + a dedicated test; the tokeniser only touches `<`/`>`, never re-encodes `&…;` |
| A new hljs class shape in a future engine version fails the allowlist | class value allows any `hljs-[\w-]+` first token + trailing `[\w-]+` tokens; if a genuinely new shape appears it degrades safely (escaped, shown as text) rather than opening a hole — and SC-002 across languages catches fidelity regressions at gate time |
| The tokeniser mis-parses malformed/nested tags | tests cover nesting, malformed tags, and attribute-injection; RED-first |

## 10. Architecture audit

**Verdict: PASS-WITH-NOTES** (0 CRITICAL / 0 HIGH / 4 LOW). The single-home
choke-point design is architecturally correct: right layer (parser is the
innermost on the trust path), right boundary, blast radius genuinely **1 source
file**, `@lockness/ui` genuinely untouched, faithfully mirroring the shipped
#148 `sanitizeUrl`. Covered: §3↔§5 completeness, placement vs layer/boundary
rules, a counted blast radius across all six locations that read
`CodeBlockNode.html`, and forward residuals. Not covered: sanitiser-regex
correctness (no code yet — security seat + RED tests own it) and hljs
round-trip fidelity (SC-002 at gate time).

- **Table completeness** — complete for *decisions*. FR-005 (fidelity) has no
  row **by design**: it is an acceptance criterion (SC-002 owns it), not a
  decision with a home. FR-006 (pure forwarders) is the table's negative space —
  the whole third column. No requirement is silently unhomed. **Accepted, no
  change.**
- **Blast radius — counted at 6 read sites, 1 write site.** Confirmed sole
  writer at `parser.ts:293` (nothing else assigns `.html`); the other five
  (`renderer.tsx:127`/`:54`, `ui/markdown.tsx:78`, `CodeBlock/mod.tsx:454`/
  `:512`) only read the field. The two *other* sinks in `CodeBlock/mod.tsx`
  (`:308`, `:405`) are fed by the component's own `highlightedHtml` from
  `children`, a different path, correctly out of scope. `ui` needs no change for
  US1/US2/US3. **Confirmed.**
- **LOW-1 (residual-of-a-residual)** — `HighlightedCodeBlock` is an *exported*
  component; a caller can pass `html={untrusted}` **directly**, bypassing the
  parser. SC-003 defends against bypassing the upstream *engine*, not against
  bypassing the *parser*. That direct-call sink stays guarded only by the
  trust-invariant JSDoc — the same shape S4 was to #148. **Accepted as an
  explicit scope boundary**: this feature closes the *markdown highlighted-code
  parse path*; the direct-prop path is named here so the next cycle inherits it
  rather than rediscovers it. Added to §12 out-of-scope.
- **LOW-2 (grep-enforced, not type-enforced invariant)** — "sanitised code
  HTML" ships as a bare `string`, so the invariant rests on single-writer
  convention + SC-004 grep + JSDoc, not a branded type. A branded type would
  ripple into `ui`'s prop type (real blast-radius cost). **Accepted trade** — a
  primitive *at a boundary* is legitimate; SC-004 + FR-004 hold the line.
- **LOW-3 (stale sibling doc)** — `ui/markdown.tsx:57-60` frames the invariant
  as *assumed*; under "ui unchanged" that comment goes half-stale. **Plan
  amended**: §8 now lists `ui/markdown.tsx` JSDoc as a doc-only touch (comment,
  not code).
- **LOW-4 (allowlist fidelity ↔ test corpus)** — a future hljs class shape
  degrades safely to escaped text (fidelity loss, not a hole), caught by SC-002
  only for corpus languages. Already owned by Risk-table row 3. **No action
  beyond keeping the corpus honest.**

## 11. Security audit

**Verdict: PASS** (0 CRITICAL / 0 HIGH / 1 MEDIUM / 1 LOW / 1 INFO). The design
is sound: single choke point (re-verified — `html:` written once at
`parser.ts:293`, forwarded once at `renderer.tsx:127`, raw sink reached only via
the styled map; the default map drops `html` **structurally**), `@libs/markdown`
correctly treated as untrusted, and a positive allowlist that — as stated —
makes no element other than an hljs `<span>` constructible, independent of the
caret-ranged engine escaping. No live exploit today, none introduced. The three
items are plan-text precision so an implementer cannot reopen the hole while
building the layer that closes it; all folded in.

- **MEDIUM (Finding 1) — FR-002 must be allowlist-directional, not denylist.**
  A literal "escape the recognised bad tags" pass would never produce a token
  for a bare/unterminated `<`, and the browser's lenient parser could
  reconstruct a tag — reopening exactly this hole. **Resolved**: FR-002 rewritten
  to "escape **every** `<`/`>` first, then re-admit only exact allowlisted
  tokens"; bare/unterminated `<` added to edge cases and the SC-003 matrix.
- **LOW (Finding 2) — opening-span regex must be exact-anchored.**
  `<span class="hljs-x" onclick=…>` / `<span/onload=…>` must not slip through a
  loose `[^>]*>`. **Resolved**: FR-001 now binds the allowed opening tag to
  `<span class="VALUE">` with `>` immediately after the closing quote — no
  trailing text, no second attribute, no `/`-separated attribute — raised from a
  test note to a binding requirement.
- **INFO (Finding 3) — `value` / `data-plain` is a non-sink, correctly out of
  scope.** The copy field is Hono-JSX-escaped in both the `{children}` and
  `data-plain` positions; only `html` is a raw sink. **Resolved**: §8 DOCS task
  now records this so a future reader neither mirrors nor mis-assumes it.

**Confirmed by the seat**: inline `<code>` is correctly out (no `html` field,
escaped text only); the #148 `href`/`src` guarantee is untouched (`sanitizeUrl`,
`buildLinkNode`, `buildImageNode` unmodified). After sanitisation the only
reachable DOM bytes are escaped text + hljs `<span class="[\w-]+">` wrappers —
`class` is the sole surviving attribute and carries no handler, `style`, or URL
sink. What a future untrusted-input write-UI gains: **nothing exploitable**
(checked: no injectable element forms; surviving span carries only a `[\w-]+`
class; `<` is escaped so no partial tag reconstructs).

**Covered**: the tokeniser's bounding of `match[2]`, attribute/quote/nesting/
malformed-tag defeat attempts, reachable DOM bytes through the ui sink, the
future-write-UI threat, and the inline-`<code>` / #148 scoping. **Not covered**:
the actual regex implementation (no code yet — RED tests own it).

## 12. Open questions

- **Q1 — Sanitise at the parser, or remove the `html` sink?**
  **Answered 2026-09-03: sanitise at the parser** (the recommended option). A
  new `sanitizeCodeHtml` positive allowlist at the choke point, `@lockness/ui`
  unchanged, SSR highlighting preserved — mirroring the shipped #148 pattern.
  "Remove the sink" was rejected (loses SSR highlight fidelity and changes ui
  code for a sink that is already defended). This binds §1/§5/§6.

### Decided without asking

- **Fix at the parser, not the ui sink** — the sink is one consumer of many
  possible maps; fixing at `parseHtmlToAst` protects every current and future
  map and matches the #148 `sanitizeUrl` precedent. (A per-map fix would
  duplicate the rule — the exact defect the decision table exists to prevent.)
- **String tokeniser, not a DOM sanitiser** — no HTML parser is available at
  parse time and pulling one in would enlarge the dependency surface of a
  foundation package; the input is narrow (highlighter output), so a small
  auditable allowlist tokeniser is sufficient and matches `sanitizeUrl`'s style.
- **`@libs/markdown` treated as untrusted** for this guarantee — the caret range
  and undocumented escaping make relying on it exactly the fragility S4 names.
