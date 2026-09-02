# Plan — Break the `@lockness/ui` ↔ `@lockness/markdown` circular dependency

- **Feature dir**: `.specnaut/specs/017-break-ui-markdown-cycle/`
- **Branch**: `017-break-ui-markdown-cycle`
- **Linked issue**: #127
- **Category**: `refactor` (no behaviour change to rendered output or the public component API)

---

## 1. Why this exists

`@lockness/ui` and `@lockness/markdown` import each other — the **only** import
cycle in the 28-package workspace (`deno task deps:analyze` baseline:
`⏳ markdown → ui — see #127`, held open by a `knownCycles` allow-list entry in
`deps.policy.jsonc`).

- `packages/markdown/renderer.tsx:26` → `import { …components… } from '@lockness/ui/components'`
- `packages/ui/docs_renderer.tsx:11` → `import { renderMarkdown } from '@lockness/markdown'`

The cycle resolves at runtime because Deno tolerates it, but it makes the two
packages inseparable: neither can be published, versioned or reasoned about
alone, and **a consumer that only wants Markdown rendering pulls in the entire
90-file component library**. Measured cost: the `markdown` package declares
`ui` in `allow` and cannot drop it; the workspace guard carries a permanent
exception.

## 2. User scenarios

The "user" here is a **framework consumer** and a **framework maintainer**.

- **P1 — A consumer renders Markdown without the component library.**
  _Given_ an app that imports `@lockness/markdown` only,
  _When_ it renders Markdown to JSX,
  _Then_ the module graph contains **no** `@lockness/ui` node, and rendering
  still produces valid JSX (plain semantic HTML elements).

- **P2 — A consumer renders Markdown styled with the design system.**
  _Given_ an app that wants design-system output (the docs site, the blog),
  _When_ it renders Markdown,
  _Then_ the output is byte-for-byte the same `@lockness/ui` component tree it
  produces today (`Title`, `HighlightedCodeBlock`, `Alert`, `UITable`, …).

- **P3 — A maintainer runs the dependency guard.**
  _Given_ the workspace after this change,
  _When_ `deno task deps:analyze` runs,
  _Then_ it reports **zero** cycles and the `knownCycles` entry for #127 is
  gone (removing it is what closes the ticket).

- **Edge case** — the `renderTableContent` helper in the renderer references
  `TableHeader / TableBody / TableRow / TableHead / TableCell` **directly**, not
  through the `ComponentOverrides` map. These five are *hidden* coupling that
  the current override seam does not cover; severing the import means routing
  them through the seam too.

- **Edge case** — `createDocsSection` / `loadAndRenderDocs`
  (`packages/ui/docs_renderer.tsx`) is used by 34 `examples.tsx` files. Its
  behaviour must not change.

## 3. Requirements

- **FR-001** `@lockness/markdown` MUST NOT statically import any
  `@lockness/ui` module. **Acceptance check (source only)**:
  `git grep -n "from '@lockness/ui" -- 'packages/markdown/**/*.ts*'` returns
  nothing, **and** `deno task deps:analyze` reports no `markdown → ui` edge.
  _(The bare `grep -rn "@lockness/ui" packages/markdown` is NOT the gate — it
  will always match `deno.json`, `README.md`, `docs/DOCS.md` and the generated
  `AGENTS.md` "Must never import: ui" line, which FR-008 keeps. `deps:analyze`
  is the real, fail-hard guard — arch audit MEDIUM-1.)
- **FR-002** The rendering **engine** (`renderNode` / `renderChildren` /
  `renderTableContent`) stays in `@lockness/markdown`, fully parameterised over
  a component map — no ui component may be captured in its closure.
- **FR-003** `@lockness/markdown` MUST ship a **default component map made only
  of plain semantic HTML** (`<h1>…<h6>`, `<p>`, `<pre><code>`, `<code>`, `<a>`,
  `<blockquote>`, `<table><thead><tbody><tr><th><td>`, `<ul>/<ol>/<li>`, `<hr>`,
  `<img>`) so bare `renderMarkdown(content)` renders standalone.
- **FR-003a** _(from security audit, Finding 1)_ The plain-HTML default
  `CodeBlock` MUST render its **escaped `children` text only** and MUST NOT
  forward the `html` field through any raw-HTML mechanism (no
  `dangerouslySetInnerHTML`, no Hono `html` tag). The `dangerouslySetInnerHTML`
  sink stays exactly where it is today — inside `@lockness/ui`'s
  `HighlightedCodeBlock` — reachable only via the **ui** map, never the plain
  default. Consequence: `@lockness/markdown` introduces **no new**
  `dangerouslySetInnerHTML` sink (see SC-005).
- **FR-003b** _(from security audit, Finding 1)_ The plain-HTML default `Link`
  and `Image` inherit today's `href`/`src` behaviour **explicitly** — the
  parser forwards the URL verbatim and Hono escapes the value but does not strip
  the scheme, so `[x](javascript:…)` remains a live link exactly as it is on the
  styled path today. Scheme allowlisting is **not** added here (it would change
  rendered behaviour on the accepted styled path too, and belongs to a
  pipeline-level security review of `body_md`, out of this refactor's scope) —
  but the parity is recorded as a decision rather than left silent.
- **FR-004** The **`@lockness/ui`-styled component map** (today's
  `defaultComponents` in `renderer.tsx`) MUST live in `@lockness/ui` and be
  exported from it.
- **FR-005** The two in-repo styled callers —
  `app/controller/docs_controller.tsx` and `app/view/pages/blog/render.tsx` —
  MUST keep producing the exact same styled output (see §5 Q1 for how they
  reach it).
- **FR-006** `ComponentOverrides` MUST be **additively** extended to cover the
  five table structural primitives so the ui map can supply them; existing
  optional fields are unchanged (no breaking change — "changing the component
  API" in the issue's Out-of-scope means *breaking* it, not additive slots).
- **FR-007** The `knownCycles` entry for #127 MUST be removed from
  `deps.policy.jsonc`, `markdown`'s `allow` reduced to `["hono"]`, and the
  explanatory comment above `ui`'s entry updated to describe the one-way edge.
- **FR-007a** _(arch audit MEDIUM-2)_ The `@lockness/ui` entry MUST be removed
  from `packages/markdown/deno.json` `imports` (line ~29), in the **same commit**
  as the source-import removal. Leaving it is declaration drift — `deps:analyze`
  / `publish:check` flag a declared-but-unimported dependency, and a published
  `markdown` would still advertise a `ui` dependency to JSR consumers,
  undercutting P1. (The `clsx` / `tailwind-merge` npm entries there are also only
  needed by the ui components; remove any that become unimported — the FR-009
  gate confirms.)
- **FR-008** Both `packages/markdown/AGENTS.md` and `packages/ui/AGENTS.md`
  MUST record the resolved one-way direction: the generated `deps` tables via
  `deno task agents:brief`, and the **hand-written Pitfalls** prose rewritten to
  describe the resolved edge instead of the cycle.
- **FR-009** `deno fmt && deno lint && deno check && deno task test` all green;
  `deno task deps:analyze` reports zero cycles.

## 4. Success criteria

- **SC-001** A consumer importing `@lockness/markdown` alone gets a module graph
  with no `@lockness/ui` node (`deno info` on a markdown-only entry).
- **SC-002** The docs site and blog render identically before and after — no
  visible or DOM difference on the rendered pages.
- **SC-003** `deno task deps:analyze` prints "No cycles" with an **empty**
  `knownCycles` (the #127 exception is retired, not re-homed).
- **SC-004** The full pre-completion gate passes.
- **SC-005** _(from security audit)_ `@lockness/markdown` introduces **no new**
  `dangerouslySetInnerHTML` (or Hono raw-`html`) sink —
  `grep -rn "dangerouslySetInnerHTML\|html\`" packages/markdown` after the change
  shows no raw-HTML sink in the plain default map.

## 5. 🔒 The decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Which direction the ui/markdown edge runs (`ui → markdown`, one-way) | `deps.policy.jsonc` — `packages.markdown.allow` (no `ui`) + `packages.ui.allow` (has `markdown`) + empty `knownCycles` | A second "must never import" claim in either `AGENTS.md` **Pitfalls** written as a rule rather than a reflection of the policy; a re-added `knownCycles` entry to silence a regression |
| What a Markdown element renders to **by default, without ui** | `@lockness/markdown` — the plain-HTML default component map (one map object in the renderer module) | A second default map; per-element `<h1>`/`<p>` literals sprinkled through `renderNode` instead of via the map |
| What a Markdown element renders to **in the design system** | `@lockness/ui` — the exported ui component map (the relocated `defaultComponents`) | Re-declaring ui component JSX inside `@lockness/markdown`; app callers hand-rolling their own component map instead of importing the ui one |
| Where the styled `renderMarkdown` / `renderMarkdownWithoutTitle` entry point lives | **`@lockness/ui`** (Q1 → Option A, decided 2026-09-02) — ui exports both the styled map and the styled wrappers with the map pre-bound | Both packages exporting a same-named `renderMarkdown` with different output; the ui map bound in two places |
| The list of overridable Markdown elements (the `ComponentOverrides` contract) | `@lockness/markdown` — `types.ts` `ComponentOverrides` | Table primitives left hardcoded in `renderTableContent` **and** also listed in the type — two spellings of "what is overridable" |

## 6. Technical context

- **Language / runtime**: Deno, TypeScript, TC39 decorators, Hono JSX
  (`jsxImportSource: "hono"` in both packages).
- **Packages touched**: `@lockness/markdown` (engine + defaults + types),
  `@lockness/ui` (owns the styled map + `docs_renderer.tsx`), plus two `app/`
  callers and `deps.policy.jsonc`.
- **Testing**: `Deno.test` under each package's `tests/`. No DB, no network.
- **Scale**: one-time refactor; no runtime perf dimension.

### Domain Model

- **Bounded context**: _Documentation rendering_ (Markdown → JSX).
- **Vocabulary**:
  - **Renderer engine** — pure AST-node → JSX walker, parameterised by a
    component map. No identity; a function set.
  - **Component map** (`ComponentOverrides` / `Required<ComponentOverrides>`) —
    a **value object**: a bag of functional components keyed by Markdown element
    kind. Equality is by content, not identity. Two implementations exist: the
    **plain-HTML map** (in `markdown`) and the **ui map** (in `ui`).
  - **`MarkdownRendererOptions`** — value object carrying `components`,
    `stripTitle`, `class`.
- **Entities**: none (this is a stateless rendering pipeline).
- **Invariants**:
  - The engine never names a concrete component — it only calls `components.X`.
  - `markdown` never imports `ui` (FR-001). The dependency edge is one-way.
  - Styled output is unchanged (P2/SC-002): the ui map's JSX is the *same* JSX,
    only its home moves.
  - _(arch audit MEDIUM-3, confirms open #148)_ **URI-scheme sanitisation lives
    in the engine/parser, never in a component map.** After the split there are
    two `Link`/`Image` renderers (plain in `markdown`, styled in `ui`); if the
    scheme allowlist that open issue **#148** ("Allowlist link/image URI schemes
    in `@lockness/markdown`") will add lands in the *ui map*, a P1 markdown-only
    consumer ships with no link/image XSS protection and no build error to reveal
    it. Fixing the home now — in the parser/engine, before the component map —
    means both maps inherit it and #148 has one place to land. This plan does not
    implement #148; it fixes where #148 belongs.
  - _(security Finding 2)_ **`CodeBlock.html` is highlighter-generated, escaped
    output only — never caller-supplied HTML rendered raw.** This invariant was
    implicit while both maps lived in one package; now that the
    `ComponentOverrides.CodeBlock` contract spans the `ui`/`markdown` split, it
    is written here and mirrored in the `ComponentOverrides.CodeBlock` JSDoc so a
    third-party map author cannot read `html?: string` as "trusted HTML to
    inject". The only implementation that consumes `html` raw is `ui`'s
    `HighlightedCodeBlock`; the plain default ignores it (FR-003a).
- **Out of scope**: splitting either package further; changing rendered output;
  breaking the override API.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| 1. No direct `hono` import | ✅ both packages already use `jsxImportSource: hono` (the `@lockness/hono` alias); unchanged |
| 2. JSR-only specifiers, declared per package | ✅ removing the `ui` import *reduces* markdown's declared deps; ui's `markdown` dep already declared |
| 3. No `any` in exported APIs | ✅ engine uses `unknown`; the extended `ComponentOverrides` fields are typed `FC<…>` |
| 4. Tailwind v4 CSS-var syntax | ✅ N/A — no new Tailwind authored; ui map JSX moves verbatim |
| 5. Pre-completion gate | ✅ FR-009 |
| 6. Never hand-edit `deno.lock` | ✅ no dependency add; if resolution shifts, regenerate via `deno cache` |
| 7. JSDoc on public APIs | ✅ new exported map + any relocated function carry full JSDoc |
| 8. MVC layering | ✅ N/A — view-layer library, no controllers/services/DB |
| 9. One category per commit | ✅ this is a single `refactor`; the AGENTS-brief regeneration is a `chore` commit, the policy edit rides with the refactor |
| No silent catches | ✅ the one `catch` in `docs_renderer.tsx` already `console.error`s; unchanged |

**No violations → no Complexity Tracking entry.**

## 8. Surface impact

- **Public surface of `@lockness/markdown`**: `ComponentOverrides` gains
  optional table-primitive fields (additive). `renderMarkdown` /
  `renderMarkdownWithoutTitle` / `Markdown` / `MarkdownContent` keep their
  signatures; their **default output changes from ui components to plain HTML**
  (this is the intended severance — P1). Callers wanting styled output opt in
  via a component map / a ui wrapper (Q1).
  **⚠️ Breaking change for external JSR consumers** _(arch audit LOW-1)_: the
  output flip is source-compatible but behaviour-breaking for anyone on published
  `@lockness/markdown@^0.2.x` who relied on the styled default. Absorbed in-repo
  by the call-site updates below; for outside consumers it MUST be called out in
  the release notes / changelog. (Lockstep pre-1.0 versioning bumps anyway, so
  it is a changelog obligation, not a silent break.)
- **Public surface of `@lockness/ui`**: gains one export — the styled Markdown
  component map (name decided in tasks; e.g. `markdownComponents`). Under Q1
  option A it also gains styled `renderMarkdown` / `renderMarkdownWithoutTitle`
  wrappers.
- **Three styled call sites, not two** _(arch audit LOW-2)_ — all import the
  styled entry point and must be rewired to preserve P2 output:
  `app/controller/docs_controller.tsx`, `app/view/pages/blog/render.tsx`, **and**
  `packages/ui/docs_renderer.tsx`. The first two are one-line import changes
  (Q1); the third (`createDocsSection`) shields **exactly 34** `examples.tsx`
  consumers — none of the 34 change, but all 34 lose styling *silently* if that
  single internal call forgets the styled path. This is why the styled entry
  point (Q1) must be **singular**: it collapses a 34-file failure surface to one
  wiring point.
- No CLI, no HTTP route, no DB surface.

_No front-end UX surface is introduced (no new pages/components); the rendered
output is unchanged, so no `## Visual Prototyping with Claude Artifacts`
subsection applies._

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Styled output drifts (P2/SC-002 regression) | The ui map JSX is **moved, not rewritten**; a snapshot/DOM test on a representative doc asserts the ui component tree is unchanged before/after |
| The five table primitives get left behind, keeping a hidden `ui` import | FR-006 routes them through the extended `ComponentOverrides`; a `grep` gate (FR-001) is the check |
| App callers silently fall back to plain HTML (lose styling) | Q1's decision names exactly one styled entry point; both callers are updated in the same commit and covered by SC-002 |
| A future edit re-introduces the cycle | `deps.policy.jsonc` with empty `knownCycles` makes any new cycle a **build failure**, not a warning (FR-007) |
| `agents:brief` regeneration churns unrelated generated blocks | Regenerate, then commit only the two briefs as a separate `chore` |

## 10. Architecture audit

> Dispatched to `architect-expert` against this plan **before any code exists**.
> Findings and dispositions recorded here.

**Verdict: PASS** (advisory — 0 CRITICAL, 0 HIGH; `needs_followup` for the
MEDIUMs, now folded). The audit confirmed the inversion is the correct cure
against the smell catalogue, the injected component map is a sound
Parameterize-Method / Extract-Interface seam, both flagged homes are right (the
`renderTableContent` table primitives → `ComponentOverrides`; the edge direction
→ `deps.policy.jsonc`), and the design stays acyclic under **both** Q1 options.
It verified `deps_analyzer.ts` fails the build hard on any cycle absent from
`knownCycles`, so an empty `knownCycles` genuinely makes a regression a hard
failure.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| A-1 | MEDIUM | FR-001's `grep -rn "@lockness/ui" packages/markdown` gate is **unsatisfiable** — it always matches `deno.json`, `README.md`, `docs/DOCS.md` and the generated `AGENTS.md` "Must never import: ui" line that FR-008 keeps. | **Plan changed.** FR-001's check rescoped to source (`git grep "from '@lockness/ui" -- 'packages/markdown/**/*.ts*'`) + `deps:analyze` named as the real fail-hard guard. |
| A-2 | MEDIUM | `packages/markdown/deno.json` still declares `@lockness/ui` after the import is gone → declaration drift; `deps:analyze`/`publish:check` flag it and a published `markdown` still advertises a `ui` dep. FR-007 listed only the policy edit. | **Plan changed.** New **FR-007a** removes the `@lockness/ui` (and any now-unimported `clsx`/`tailwind-merge`) entry from `markdown`'s manifest in the same commit. |
| A-3 | MEDIUM | The split creates **two** `Link`/`Image` renderers; if open **#148**'s URI-scheme allowlist lands in the *ui* map, a P1 markdown-only consumer ships with no link/image XSS protection and no build error. | **Plan changed.** New §6 invariant: **URI-scheme sanitisation lives in the engine/parser, never a component map** — fixing #148's home so both maps inherit it. (Converges with security S-1 / FR-003b.) |
| A-4 | LOW | The default-output flip is a **breaking change** for external JSR consumers but was unlabelled. | **Plan changed.** §8 now labels it a breaking change with a changelog obligation. |
| A-5 | LOW | Blast radius undercount — "two app callers" is actually **three** styled call sites (the two app files + `docs_renderer.tsx`, which shields 34 `examples.tsx`). | **Plan changed.** §8 rewritten to name three call sites and the 34-file silent-failure surface behind `createDocsSection`. |

**Coverage.** Covered the plan end-to-end + ground-truth verification of
`renderer.tsx` (incl. the `renderTableContent` coupling at lines 269/277/284/
292-293), `mod.tsx`, `types.ts`, `deno.json`, `docs_renderer.tsx`, both app
callers, `deps.policy.jsonc`, and the cycle/declaration logic in
`deps_analyzer.ts` + `agents_brief.ts`; counted blast radius via `git grep`
(3 external markdown importers, 1 source ui import to sever, 34 `createDocsSection`
examples, 94 repo-wide `ui/components` importers for context); open-issue overlap
via `gh` (confirms #127, overlaps #148). **Not covered** (correctly): JSX
equality of the relocated ui map (no code yet — SC-002's snapshot is the net),
the eventual Q1 A-vs-C choice (a STOP decision), and any runtime behaviour.

## 11. Security audit

> Dispatched to `security-expert` against this plan **before any code exists**.
> Kept separate from §10.

**Verdict: PASS on the security-critical axis** — 0 CRITICAL, 0 HIGH
(`needs_followup` overall for the two lower items below). The refactor does not
degrade the existing sanitisation boundary: the parser-rebuild allowlist that
provides the actual XSS safety stays in `@lockness/markdown` (FR-002), the
styled docs/blog path is preserved byte-for-byte (SC-002), the sole
`dangerouslySetInnerHTML` sink (`@lockness/ui` `HighlightedCodeBlock`, fed only
by highlighter output) moves verbatim and is fed identically, and the
`join(componentsDir, relativePath)` path build in `docs_renderer.tsx` takes only
compile-time-constant component names and is untouched. No auth/account surface
is in scope.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| S-1 | MEDIUM | The **new** plain-HTML default map (FR-003) was unspecified on two quasi-raw sinks the styled map carries: the code-block `html` field (→ `dangerouslySetInnerHTML` today) and `javascript:` URL-scheme attributes on `href`/`src`. `@lockness/markdown` becomes independently consumable at exactly this change, so the styled pipeline's "html is always highlighter output" assumption no longer travels with it. | **Plan changed.** Added **FR-003a** (plain default `CodeBlock` renders escaped text only, never forwards `html` raw → no new `dangerouslySetInnerHTML` sink in `markdown`) and **FR-003b** (URL-scheme parity with today recorded explicitly; scheme allowlisting deferred to a pipeline-level review, out of scope). New **SC-005** greps for the sink. |
| S-2 | LOW | The `CodeBlock.html` "trusted highlighter output only" trust invariant was implicit in one package; FR-006 makes the map contract span two packages, so a third-party map author could read `html?: string` as "trusted HTML to inject". | **Plan changed.** Written into §6 Invariants and required in the `ComponentOverrides.CodeBlock` JSDoc (one comment now vs. a migration later). |

**Coverage.** Covers the security *delta* of the proposed refactor across
`plan.md` + 8 ground-truth files (renderer, mod, parser, types, docs_renderer,
ui CodeBlock, docs_controller, blog render). It does **not** clear the
*pre-existing* XSS posture of the blog `body_md → renderMarkdown` path in
absolute terms (`@libs/markdown` passthrough, `javascript:` URIs, highlighter
escaping on unknown-language fences) — that is unchanged by this refactor and
belongs to a code-level pipeline review, not a plan audit. Marked
**undetermined** where highlighter escaping of unknown-language fences could not
be settled from source.

## 12. Open questions

> **Q1 — DECIDED 2026-09-02 → Option A.** The styled `renderMarkdown` /
> `renderMarkdownWithoutTitle` move to `@lockness/ui`; it exports both the
> styled component map and the wrappers with the map pre-bound.
> `@lockness/markdown`'s own `renderMarkdown` keeps its name and now emits
> plain HTML. The three styled call sites
> (`app/controller/docs_controller.tsx`, `app/view/pages/blog/render.tsx`,
> `packages/ui/docs_renderer.tsx`) switch their import
> `@lockness/markdown` → `@lockness/ui`. No unanswered questions remain.

**Q1 — Where does the styled `renderMarkdown` entry point live after the
inversion?** (The one decision the code cannot make for us.)

- **Option A (recommended)** — the styled `renderMarkdown` /
  `renderMarkdownWithoutTitle` move to `@lockness/ui` (they own the component
  map). `@lockness/markdown`'s own functions keep their names but now emit
  plain HTML. The two app callers change `from '@lockness/markdown'` →
  `from '@lockness/ui'` (one line each). **Cost**: a small breaking relocation
  of a public function, absorbed entirely by in-repo callers we control.
  **Benefit**: cleanest layering — markdown = engine, ui = styling; a
  markdown-only consumer never sees ui.
- **Option C** — the entry point stays in `@lockness/markdown`; `@lockness/ui`
  exports only the map (`markdownComponents`); every styled caller passes
  `{ components: markdownComponents }`. **Cost**: more churn at call sites and a
  standing risk a caller forgets the map and silently loses styling.
  **Rejected unless the user prefers keeping the function's home in markdown.**

_(answer recorded here at STOP, with date)_

---

### Rejected architecture — recorded so it is not re-proposed

- **Option 2 from the issue Notes (extract the shared contract to
  `@lockness/contract`)** — **does not break this cycle.** The cycle is caused
  by `markdown` importing ui's **runtime** components (for its defaults) and
  `ui` importing markdown's **runtime** `renderMarkdown`. Moving the *types*
  (`ComponentOverrides`, node types) to `contract` erases at runtime and leaves
  both runtime edges intact. It only helps *combined* with inversion — at which
  point the types need not move at all. Rejected as insufficient on its own.

- **The issue Notes' "detection needs to ignore comment lines"** — **moot.**
  `scripts/deps_analyzer.ts` builds the graph from `deno info --json`, which
  does not see JSDoc `@example` imports. The baseline confirms exactly one real
  cycle (`markdown → ui`); no `cli ↔ drizzle` false positive exists today. No
  detector change is in scope.
