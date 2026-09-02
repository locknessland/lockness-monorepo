# Tasks: Sanitize CodeBlockNode.html raw-HTML sink in @lockness/markdown

**Input**: `.specnaut/specs/023-sanitize-codeblock-html/plan.md`
**Issue**: #159 · **Branch**: `023-sanitize-codeblock-html`

**Tests**: MANDATORY — the constitution requires TDD (RED first, each
behavioural test negative-tested: it must fail before the fix exists).

**Organization**: grouped by the plan's user stories (US1 dangerous-markup
neutralised, US2 highlighting preserved, US3 guarantee holds at any parse entry).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable (different file, no dependency on an incomplete task).
- Decision-table homes are named in the task where a rule is touched
  (plan §5): all sanitisation logic lives in `sanitizeCodeHtml` inside
  `packages/markdown/parser.ts`, invoked once from `tryParseCodeBlock`.

---

## Phase 1 — Setup

- [X] T001 Confirm the branch `023-sanitize-codeblock-html` is checked out and `deno task test` is green at HEAD (baseline), from repo root.
- [X] T002 Record the current highlighted-DOM output for a small language corpus (js, ts, html, bash, json, plus one unknown-language and one no-language fence) as a fidelity baseline for SC-002, in a scratch note under the feature dir (not committed) or inline in the test file's expectations.

## Phase 2 — Foundational (blocking prerequisite)

- [X] T003 Create the test file `packages/markdown/tests/codeblock_html_allowlist_test.ts` with `@fileoverview`/`@module` header (issue #159, plan 023) and shared helpers: `render(md)` (styled `@lockness/ui/markdown` map → HTML string), `firstCodeBlockHtml(nodes)` (walk AST, return the first `CodeBlockNode.html`), and `renderStyled(nodes)` (render AST through the styled map to a DOM string). Mirror the structure of `tests/uri_allowlist_test.ts`. No assertions yet.

## Phase 3 — US1: dangerous markup in a code fence forms no element (P1)

**Goal**: `<script>`/`<img onerror>`/`<a href="javascript:">` and obfuscation
variants in a code body are neutralised at the parser; no such element reaches
the styled DOM. **Independent test**: run this phase's tests against the
finished `sanitizeCodeHtml` — all green; against HEAD — all RED.

- [X] T004 [P] [US1] RED — in the test file, add a group asserting `firstCodeBlockHtml(parseHtmlToAst(...))` neutralises each vector to escaped text (no live tag): raw `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<a href="javascript:alert(1)">x</a>`, a case-variant `<SPAN>`, an over-attributed `<span class="hljs-x" onclick=alert(1)>`, a `/`-separated `<span/onload=alert(1)>`, and a **bare/unterminated** `<span class="hljs-x` and a lone `<`. (Plan SC-003 negative matrix, FR-001/FR-002.) Verify every assertion FAILS at HEAD.
- [X] T005 [P] [US1] RED — add an end-to-end group asserting the styled-map DOM (`render`) for a fence containing `<script>alert(1)</script>` and one containing `<img src=x onerror=alert(1)>` contains no `<script`/`<img` live element and shows the text escaped. (Plan SC-001.) Verify it FAILS at HEAD.
- [X] T006 [US1] GREEN — implement `sanitizeCodeHtml(raw: string): string` in `packages/markdown/parser.ts` (plan §5 single home): escape **every** `<` and `>` first (allowlist-directional, FR-002), then re-admit only exact-anchored `</span>` and `<span class="VALUE">` where `VALUE` is space-separated `[\w-]+` tokens with the first prefixed `hljs-` and `>` immediately after the closing quote (FR-001). Do NOT re-escape existing entities (FR-003 — touch only `<`/`>`). Full JSDoc (`@param`/`@returns`/`@example`). Do not wire it yet.
- [X] T007 [US1] GREEN — wire `sanitizeCodeHtml` into `tryParseCodeBlock` (`parser.ts`): `html: sanitizeCodeHtml(rawHtml)`. This is the sole writer (plan §5, FR-004). Re-run T004/T005 → green.

## Phase 4 — US2: syntax highlighting is preserved (P1)

**Goal**: hljs structural markup round-trips unchanged; no fidelity loss.

- [X] T008 [P] [US2] RED-then-GREEN — add a group feeding real highlighter output shapes (measured from the engine: `<span class="hljs-title function_">`, nested `<span class="hljs-tag">&#x3C;<span class="hljs-name">…</span>…`, `hljs-number`, `hljs-keyword`) through `sanitizeCodeHtml` and asserting the output is **identical** to the input (allowlisted markup survives byte-for-byte). Confirm this passes only after T006.
- [X] T009 [US2] GREEN — add an end-to-end fidelity check: for the T002 corpus, assert the styled-map DOM after the fix equals the pre-fix baseline (SC-002). Run the full package test suite to confirm no existing `plain_defaults_test.ts` / `uri_allowlist_test.ts` regressions.

## Phase 5 — US3: guarantee holds at any parse entry point (P2)

**Goal**: the public `parseHtmlToAst` and direct AST construction are covered by
the same single home.

- [X] T010 [P] [US3] RED-then-GREEN — assert that a hand-crafted `<pre><code class="language-js">…RAW DISALLOWED…</code></pre>` fed directly to the public `parseHtmlToAst` (bypassing `@libs/markdown`) yields a `CodeBlockNode.html` with the disallowed markup neutralised (SC-003, defense-in-depth independent of the engine). Verify RED at HEAD, green after T007.
- [X] T011 [US3] Verify SC-004 by grep: `grep -nE 'html:\s' packages/markdown/parser.ts` shows the assignment only inside `tryParseCodeBlock`, routed through `sanitizeCodeHtml`; record the command + output in the PR/commit body.

## Phase 6 — Polish & docs

- [X] T012 [P] Update `packages/markdown/types.ts`: the `ComponentOverrides.CodeBlock` trust-invariant JSDoc and `CodeBlockNode.html` doc now state the invariant is **enforced at the parser** (`sanitizeCodeHtml`), not merely assumed. (Plan §8, architecture LOW-2 — pre-answer why it stays a `string`.)
- [X] T013 [P] Update `packages/ui/markdown.tsx:57-60` JSDoc (doc-only, no code change) to point at the parser-enforced guarantee for the parse path (architecture LOW-3).
- [X] T014 [P] Update `packages/markdown/docs/DOCS.md`: rewrite the "Scope of the guarantee" note — S4 is **closed**; describe the code-HTML allowlist beside the URI allowlist; add the line that `value`/`data-plain` is JSX-escaped text and needs no allowlist (security Finding 3). Use a ```text fence for any aligned example (deno fmt safety, per prior lesson).
- [X] T015 [P] Extend `packages/markdown/README.md` Security section to mention the code-block allowlist alongside the URI allowlist.
- [X] T016 Regenerate `packages/markdown/AGENTS.md` via `deno task agents:brief` (test count changed).
- [X] T017 Run the full pre-completion gate from repo root: `deno fmt && deno lint && deno check packages/markdown/parser.ts packages/markdown/tests/codeblock_html_allowlist_test.ts && deno task test`. All green before declaring done. Then invoke `review`.

---

## Dependencies

- T003 blocks all test tasks (T004, T005, T008, T009, T010).
- T004/T005 (RED) precede T006/T007 (GREEN) — TDD ordering.
- T006 precedes T007 (implement the function, then wire it).
- T008/T009 (fidelity) depend on T006.
- T010 depends on T007. T011 depends on T007.
- Phase 6 docs (T012–T015) depend on the behaviour being final (after T009/T010) but are mutually parallel `[P]`.
- T016 after docs; T017 last.

## Parallel opportunities

- T004, T005 can be written together (same file, but independent groups — author in one pass).
- T012, T013, T014, T015 are different files → fully parallel.

## MVP

Phase 3 (US1) alone closes the security hole. Phases 4–5 prove fidelity and
entry-point coverage; Phase 6 documents the closure. The full path is the ship.

## Decision-table guard (plan §5)

Every task that touches sanitisation names `sanitizeCodeHtml` in
`packages/markdown/parser.ts` as the home. Any task introducing a second
spelling (a check in `renderer.tsx`, a per-map guard in `@lockness/ui`) is a
plan violation, not a style choice.
