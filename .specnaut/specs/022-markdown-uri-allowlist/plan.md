# Plan: Allowlist link/image URI schemes in @lockness/markdown

**Branch**: `022-markdown-uri-allowlist` | **Date**: 2026-09-02 | **Backlog item**: [#148 — Allowlist link/image URI schemes in @lockness/markdown](https://github.com/locknessland/lockness-monorepo/issues/148)

**This is the feature's one planning document.** Read whole by whoever implements it.

---

## 1. Why this exists

The shared Markdown renderer (`packages/markdown`) parses HTML from `@libs/markdown` into an
AST and forwards link `href` and image `src` **verbatim**. Measured directly against the real
engine on 2026-09-02:

```
"[click](javascript:alert(1))"  => <a href="javascript:alert(1)">click</a>
"[e](JavaScript:alert(1))"      => <a href="JavaScript:alert(1)">e</a>      (case preserved)
"![x](data:text/html,foo)"      => <img src="data:text/html,foo" alt="x">
"[ok](https://example.com)"     => <a href="https://example.com">ok</a>     (clean)
"[rel](/path)"                  => <a href="/path">rel</a>                  (clean)
```

A `javascript:` link renders clickable; a `data:` image src passes through. This is **safe under
today's trusted-author model** — blog/docs content is authored by trusted maintainers and there is
no write-UI accepting untrusted Markdown. But the renderer is **shared and reusable**, and its own
`renderer.tsx` default `Link` already carries the standing decision in a code comment:
*"URI-scheme allowlisting is a parser/engine concern (see #148), never a per-map decision."* This is
deferred security item **S2** from the #80 Blog plan (`.specnaut/specs/012-blog-page/plan.md`, Q18),
filed so a future write-UI feature **must not** assume scheme sanitisation happens elsewhere.

## 2. User scenarios

### US1 — A dangerous scheme is neutralised (P1)

**Given** Markdown containing `[click](javascript:alert(1))`
**When** it is rendered through `@lockness/markdown`
**Then** the produced `<a>` has no usable `javascript:` href — the scheme is dropped, the visible
link text is preserved, and clicking does nothing.

### US2 — A safe link is untouched (P1)

**Given** Markdown containing `[ok](https://example.com)`, `[m](mailto:a@b.com)`, `[rel](/path)`,
`[frag](#anchor)`
**When** it is rendered
**Then** every href is forwarded exactly as before — this feature changes nothing for allowed URLs.

### US3 — A dangerous image src is neutralised (P1)

**Given** Markdown containing `![x](data:text/html,<script>…)`
**When** it is rendered
**Then** the produced `<img>` has no `data:` src — the source is dropped and the `alt` is preserved.

### Edge cases

- **Case variation** — `JavaScript:`, `JAVASCRIPT:`, `jAvAsCrIpT:` must all be rejected (the engine
  preserves case; the check must be case-insensitive).
- **Control-character / whitespace obfuscation** — `java\tscript:`, `java\nscript:`,
  `\x01javascript:`, leading spaces. Browsers strip C0 control chars and whitespace from the scheme
  before parsing, so the sanitiser must strip them **before** testing (`ATTR_WHITESPACE` set).
- **HTML-entity obfuscation** — `&#106;avascript:` / `&#x6a;avascript:` (entity-encoded *letter*),
  and the sharper **entity-encoded colon** `javascript&#58;alert(1)` / `&#x3a;` / `&colon;` (which,
  under a positive allowlist, would look *schemeless* if left undecoded — the vector that flips
  reject→allow). Measured 2026-09-02: `@libs/markdown` already decodes both to a literal `:` before
  the parser sees them, so today's pipeline is safe; the sanitiser decodes defensively regardless.
- **Protocol-relative** — `//example.com` has no scheme → allowed (inherits the page scheme).
- **Bare relative / fragment / query** — `foo.html`, `./a`, `#top`, `?q=1` → allowed (no scheme).
- **Unknown but harmless schemes** — `ftp:`, `tel:` → **rejected** by a strict allowlist (not in
  scope to enable; a later ticket can widen the list if a real need appears).

## 3. Requirements

- **FR-001**: Link `href` is constrained to a scheme allowlist of exactly `http`, `https`, `mailto`,
  and schemeless (relative / fragment / query / protocol-relative) URIs. Any other scheme is
  neutralised.
- **FR-002**: Image `src` is constrained to the **same** allowlist by the **same** decider — not a
  second copy of the rule.
- **FR-003**: Neutralisation = the URL becomes an empty string (`href=""` / `src=""`). The node is
  still emitted; the link's child text and the image's `alt`/`title` are preserved. (The rendered
  `<a href="">` points at the current document and is inert; `<img src="">` loads nothing.)
- **FR-004**: The scheme test is **case-insensitive** and is applied **after** a single
  normalisation routine, in order: (a) decode HTML entities — numeric (`&#106;`, `&#x6a;`, incl. the
  entity colon `&#58;`/`&#x3a;`/`&colon;`) and named — via a decoder **dedicated to `sanitizeUrl`**,
  NOT the text-node `decodeHtmlEntities` (which intentionally decodes only a fixed set and must not
  over-decode text); then (b) strip control characters and Unicode whitespace from the value, using
  the **explicit** set `[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]` — **not** a
  `\s`-based strip, because JS `\s` does not match C0 codes `0x01–0x08`/`0x0e–0x1f` (so `\x01javascript:`
  would survive). There is exactly **one** such normalisation routine, homed inside `sanitizeUrl`
  (decision-table row 3). This is **defence-in-depth**: measured on 2026-09-02, `@libs/markdown`
  already decodes entity colons (`&#58;`→`:`) and percent-encodes control chars (`&Tab;`→`%09`) before
  the href reaches the parser, so a plain scheme test already catches them today; the dedicated
  decode+strip is insurance against an engine change or a non-engine caller, at a cost of a few lines.
- **FR-005**: **Single home, single asker-shape.** The allowlist and the decision live in exactly one
  function in `packages/markdown/parser.ts` (`sanitizeUrl`). Rather than leave the **four** current
  href/src construction sites (`parseInlineContent` link/image, `tryParseLink`, `tryParseImage`) each
  calling `sanitizeUrl` and guarded only by a grep, the extraction is pulled into **two** node
  builders — `buildLinkNode(rawHref, …)` and `buildImageNode(rawSrc, …)` — that call `sanitizeUrl`
  internally. Every parse path constructs link/image nodes **only** through those builders, so
  skipping the sanitiser is impossible-by-construction, not caught-by-convention. Verification remains
  a SEARCH: `grep -nE 'href:|src:' packages/markdown/parser.ts` must show `href`/`src` assigned only
  inside the two builders.
- **FR-006**: The renderer (`renderer.tsx`) and the styled `@lockness/ui/markdown` map do **not**
  re-decide schemes — they keep forwarding whatever the AST holds. The existing comment stays true.
- **FR-007**: `packages/markdown/docs/DOCS.md` and `README.md` document the scheme-allowlist
  behaviour: which schemes are allowed, that others are dropped, and that `parseHtmlToAst` guarantees
  **only** `LinkNode.href` / `ImageNode.src` are scheme-safe — the trust boundary is scoped to those
  two fields. The docs must state explicitly that **`CodeBlockNode.html` remains raw and unsanitised**
  (the `dangerouslySetInnerHTML` sink in the styled `@lockness/ui/markdown` map — deferred item S4,
  still open) and that a hand-built AST or a future write-UI must not assume that field is safe.

## 4. Success criteria

- **SC-001**: A `javascript:` link authored in Markdown is not clickable as `javascript:` in the
  rendered output.
- **SC-002**: A `data:` (or `vbscript:`, `file:`) image or link is not present as that scheme in the
  rendered output.
- **SC-003**: Every previously-working safe link/image (http, https, mailto, relative, fragment)
  renders byte-identically to before this change (no regression) — verified by the existing
  `plain_defaults_test.ts` steps continuing to pass unchanged.
- **SC-004**: The obfuscated variants are all neutralised — each covered by a test that fails against
  the unsanitised parser: mixed case (`JavaScript:`), embedded tab/newline (`java\tscript:`), a
  **leading C0 control char** (`\x01javascript:` — the case a `\s`-strip would miss), the
  **entity-encoded colon** (`javascript&#58;`, `&#x3a;`, `&colon;` — the reject→allow flipper), and
  the entity-encoded letter (`&#106;avascript:`). Tests assert on both the AST `href`/`src` and the
  final rendered DOM, so a regression in either the sanitiser or the renderer is caught.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Which URI schemes an author-supplied link/image may use (`http`/`https`/`mailto`/schemeless allowed; all else neutralised) | `packages/markdown/parser.ts` — one `sanitizeUrl()` function holding the sole `ALLOWED_SCHEMES` allowlist | A scheme/allowlist check spelled inside `renderer.tsx`'s default `Link`/`Image`; a second copy in `@lockness/ui/markdown`'s styled map; the check inlined separately at any of the four parser extraction sites instead of calling the one function; a second `ALLOWED_SCHEMES` constant anywhere |
| How a rejected URL is neutralised (→ empty string, node still emitted) | `packages/markdown/parser.ts` — the return value of `sanitizeUrl()` | A renderer that maps `href===''` to something else (e.g. drops the `<a>`, or substitutes `#`); a per-map decision about what "neutralised" looks like |
| How an author URL is normalised before the scheme test (decode entities → strip control/whitespace → lowercase) | `packages/markdown/parser.ts` — one decode+strip routine **inside** `sanitizeUrl` | Reusing the text-node `decodeHtmlEntities` (which decodes a different, deliberately narrower set) as the URL decoder; a second entity-decoder or strip pass anywhere; the normalisation inlined at a call site instead of inside `sanitizeUrl` |

**Binding on the implementer.** The decision may not move out of `parser.ts` without amending this
plan first. A review finding of a second scheme check anywhere (renderer, styled map, a fifth
extraction site) is a **plan violation, not a style opinion**. Two askers (the four sites) is fine;
two deciders is the defect.

## 6. Technical context

- **Language / runtime**: Deno + TypeScript, Hono JSX. Package `@lockness/markdown` (v0.2.0).
- **Storage / scale**: none — this is a pure string transformation on the render path.
- **Testing**: `Deno.test` steps in `packages/markdown/tests/` (existing file
  `plain_defaults_test.ts`; a new `uri_allowlist_test.ts` for the security behaviour).
- **Constraints**: no `@lockness/ui` import (one-way `ui → markdown`, #127 invariant); JSR-only bare
  specifiers; no `any` in exported APIs; `sanitizeUrl` is internal (not added to the public surface).

### Domain Model

- **Bounded context**: content rendering (`domain:content`).
- **Vocabulary**: *safe URL* — a URL that is either schemeless or carries an allowlisted scheme.
- **Value object**: the sanitised URL string returned by `sanitizeUrl` (no identity).
- **Invariant**: every `LinkNode.href` and `ImageNode.src` emitted by `parseHtmlToAst` is a safe URL.
- **Out of scope**: any write-UI or untrusted-input feature; tag/attribute allowlisting (already
  done); the `dangerouslySetInnerHTML` CodeBlock sink (S4, a separate residual item).

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No direct `hono` import | ✅ unchanged (uses `hono` via the pinned re-export already declared) |
| JSR-only specifiers | ✅ no new dependency |
| No `any` in exported APIs | ✅ `sanitizeUrl` is internal; signature `(string) => string` |
| Tailwind v4 syntax | ✅ n/a (no styling) |
| Pre-completion gate | ✅ will run `deno fmt && deno lint && deno check && deno task test` + `deno task deps:analyze` + `deno task agents:brief` |
| No manual `deno.lock` edit | ✅ n/a |
| JSDoc on public APIs | ✅ internal helper still gets JSDoc; no public-surface change |
| MVC layering | ✅ n/a (library transform) |
| TDD | ✅ failing security tests first, each negative-tested against the unsanitised parser |
| No silent catches | ✅ entity-decode/sanitise are total functions; no swallowed errors |

No violations → no Complexity Tracking entries.

## 8. Surface impact

- **Client surfaces touched**: none directly. The behavioural change is internal to
  `@lockness/markdown`; every consumer (`@lockness/ui/markdown`, docs pages, the blog #80) inherits
  the safer output with **no API change**.
- **Interface contracts**: `parseHtmlToAst`, `MarkdownContent`, `renderMarkdown` signatures unchanged.
  `sanitizeUrl` is **internal** — not exported, not added to the public surface table.
- **Front-end / UX-UI**: the package emits JSX but has **no interactive front-end surface** of its
  own (no forms, routes, or client islands) — no visual prototyping subsection applies.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A bypass vector is missed (case / control char / entity), giving false confidence | Adopt the well-tested `ATTR_WHITESPACE` strip + entity-decode + strict scheme regex approach; cover each vector with a test that is negative-tested against the unsanitised parser |
| A future contributor adds a fifth href/src site and forgets the sanitiser | **Resolved structurally** (arch #2): the two node builders (`buildLinkNode`/`buildImageNode`) are the only way to construct link/image nodes, so a new parse path routes through the sanitiser by construction; the grep is now a confirmation, not the guard |
| A live doc/blog link uses a now-rejected scheme and silently renders inert (SC-003 regression) | **Pre-implement check** (arch #3): `grep -rnE '\]\((tel:|ftp:|file:|data:|javascript:)' app/ docs/ packages/*/docs/` — record the count (expected 0) before implementing; if any legitimate scheme is in real use, revisit the allowlist |
| Over-strict allowlist breaks a legitimate `tel:`/`ftp:` doc link | Accepted for v1 — none exist in current docs; widening the list is a cheap follow-up ticket, and silently allowing them is the worse default |
| Neutralising to `href=""` surprises a consumer expecting the URL dropped entirely | Documented in FR-003/DOCS; empty string is inert and preserves the AST shape and visible content |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Kept
separate from §11.* **VERDICT: pass** (needs_followup — 2 MEDIUM + 1 LOW hardening, no blocker).
Backlog overlap: `confirms #148` only (no competing `domain:content` item).

| # | Sev | Finding | What was done |
| :--- | :--- | :--- | :--- |
| A1 | MEDIUM | FR-004's normalisation pipeline (decode entities → strip control/whitespace → lowercase) is a **third decision** with no §5 row, and the existing `decodeHtmlEntities` (`parser.ts:411`) decodes only a fixed set — NOT arbitrary numeric entities — so `sanitizeUrl` needs its own decoder, risking two entity-decoders that drift. | **Plan changed.** Added §5 row 3 homing the normalisation routine inside `sanitizeUrl`; FR-004 amended to mandate a **dedicated** URL decoder (numeric + named) distinct from the text-node decoder, and to fix the order. |
| A2 | MEDIUM | The "four askers" are two byte-identical duplicated extraction pairs (`parseInlineContent` 324/340, `tryParseLink`/`tryParseImage` 441/457) — both live. FR-005 guarded the *decider* but left extraction scattered behind a grep convention; the codebase has already grown the second copy once. | **Plan changed.** FR-005 now mandates two node builders `buildLinkNode`/`buildImageNode` that call `sanitizeUrl` internally — two askers, not four; skipping the sanitiser becomes impossible-by-construction. §9 risk updated. |
| A3 | LOW | SC-003 "byte-identical / no regression" and Risk-3 "no `tel:`/`ftp:` in current docs" rest on an unverified corpus claim; 2 live render sites (docs + blog). | **Plan changed.** Added a pre-implement grep of `app/`+docs for rejected schemes (expected count 0) to §9; converts the assertion to evidence before code. |

**Blast radius (counted, not estimated):** `parseHtmlToAst` has **0 external importers** (package-internal only) — the AST trust boundary is airtight for the shipped surface. Downstream: `@lockness/ui/markdown` and `ui/docs_renderer.tsx` consume `renderMarkdown`/`MarkdownContent`; **2 live app render sites** (`app/controller/docs_controller.tsx`, `app/view/pages/blog/render.tsx`). `@lockness/ui/markdown` is a **pure forwarder** — no href/src re-extraction (`markdown.tsx:86/130` are JSX prop forwards), so FR-006 holds and the one-way `ui → markdown` edge (#127) is unaffected. The decision changes in exactly one file; everything else inherits it with no API change.

**Affirmed sound:** correct single home (AST is the trust boundary, not the renderer); resists over-generalisation (no speculative shared module — there is no second consumer); `href=""` neutralisation is inert and AST-shape-preserving.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, before any code existed. Kept
separate from §10.* **VERDICT: fail → resolved.** The design (single `sanitizeUrl`, positive
allowlist, parser choke point) was affirmed sound; four plan-text gaps were raised (1 HIGH, 3
MEDIUM), **all defence-in-depth** (trusted-author v1, no untrusted input today). Backlog overlap:
none beyond #148. **One severity is corrected by measurement** (see the note under S1).

| # | Sev (audit → adjusted) | Finding | What was done |
| :--- | :--- | :--- | :--- |
| S1 | HIGH → **LOW (measured)** | FR-004 requires decoding numeric+named entities, but the existing `decodeHtmlEntities` is a fixed 11-entry map that cannot decode `&#58;`/`&#x3a;`/`&colon;`; reusing it would leave the entity-colon `javascript&#58;alert(1)` looking *schemeless → allowed → live*. | **Corrected by evidence + plan changed.** Measured 2026-09-02 end-to-end: `@libs/markdown` **already decodes** `&#58;`→`:` (and percent-encodes `&Tab;`→`%09`) before the href reaches the parser, so the value arrives with a literal colon a plain scheme test catches — the bypass does **not** survive the shipped engine. Severity is therefore LOW, not HIGH. The fix is kept regardless: FR-004 mandates a **dedicated** decoder (numeric/hex/named incl. colon), explicitly NOT the narrow text-node helper, as insurance against an engine change or non-engine caller. |
| S2 | MEDIUM | The entity-colon vector (the reject→allow flipper under a positive allowlist) was absent from the §2/SC-004 test matrix — only the entity-*letter* was covered. | **Plan changed.** §2 and SC-004 now list `javascript&#58;`, `&#x3a;`, `&colon;` explicitly; each is negative-tested against the unsanitised parser. |
| S3 | MEDIUM | FR-004's "strip control chars & whitespace" was under-specified; JS `\s` does not match C0 `0x01–0x08`/`0x0e–0x1f`, so a `\s`-based strip would miss the plan's own `\x01javascript:` edge case. | **Plan changed.** FR-004 now pins the explicit set `[ -   ᠎ -  　]` and forbids a `\s`-only strip; SC-004 covers `\x01javascript:`. |
| S4 | MEDIUM | FR-007's "the AST is the trust boundary" over-scoped: `CodeBlockNode.html` (`parser.ts:159`) is stored raw and is the S4 `dangerouslySetInnerHTML` sink in the styled map — out of scope here; a future write-UI could misread the guarantee. | **Plan changed.** FR-007 now scopes the guarantee to `href`/`src` only and requires DOCS to state that `CodeBlockNode.html` stays raw/unsanitised (S4, still open). |

**Affirmed safe (checked):** the parser is the correct choke point (AST is the only carrier to the
renderer, which forwards verbatim by design); exactly four href/src sites, fail-**closed** on
unrecognised quoting (single-quoted/unquoted `<a>` never matches → dropped); the positive allowlist
auto-covers `data:`/`vbscript:`/`file:`/`ftp:`/`tel:`; decode→strip→test order matches the browser;
`title`/`alt` are Hono-escaped non-URL contexts; protocol-relative `//host` is not a script vector;
empty-string neutralisation is inert.

## 12. Open questions

*Answers recorded here as settled decisions, with dates.*

| Q | Question | Decision | Date |
| :-- | :-- | :-- | :-- |
| Q1 | How is a rejected link/image neutralised in the output? | **Empty `href`/`src`** (`href=""` / `src=""`) — the element stays, is inert, and the link text / image `alt` stay visible. Confirms FR-003. | 2026-09-02 |

### Decided without asking
- **Allowlist membership** — exactly `http`, `https`, `mailto`, and schemeless (relative / fragment /
  query / protocol-relative). `tel:` / `ftp:` are rejected; widening is a cheap follow-up ticket, and
  silently allowing unknown schemes is the worse default.
- **`sanitizeUrl` is internal** — not added to the public surface; no consumer needs to call it.
- **Trusted-author v1 trust model kept** — this feature is defence-in-depth for the future write-UI
  named in #148, not a response to a live untrusted-input path.
- **Entity/control-char normalisation is defensive** — measured 2026-09-02, `@libs/markdown` already
  neutralises entity colons and control chars before the parser; the sanitiser normalises anyway as
  insurance against an engine change or a non-engine caller of `parseHtmlToAst`.
