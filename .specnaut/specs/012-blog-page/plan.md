# Plan: Blog Page

**Branch**: `012-blog-page` | **Date**: 2026-09-02 | **Backlog item**: [#80 — Blog Page](https://github.com/locknessland/lockness-monorepo/issues/80)

**This is the feature's one planning document.** Business and technical together, read whole by
whoever implements it.

---

## 1. Why this exists

Lockness has no way to publish project announcements or release notes on its own site. Today an
announcement lives in a GitHub release or a commit message — invisible to a visitor on the marketing
site, unciteable by URL, and outside the framework's own dogfooding story. A framework that sells
"build web apps fast" should be able to show a blog built on itself.

The blog also serves as a **reference implementation**: a small, real MVC feature (model →
repository → service → controller → view) that reads from Postgres and renders Markdown through the
framework's own pipeline. It is documentation-by-example as much as a content channel.

## 2. User scenarios

### US1 — Read the blog index (P1)

**Given** published posts exist in the database
**When** a visitor opens `/blog`
**Then** every published post is listed, newest first, each linking to its own page; drafts are absent
(in production).

### US2 — Read a single post (P1)

**Given** a published post with slug `hello-world`
**When** a visitor opens `/blog/hello-world`
**Then** the post's title and Markdown body (rendered to styled HTML) are shown in the blog layout.

### US3 — Preview drafts in development (P2)

**Given** a draft post exists and `APP_ENV=development`
**When** a developer opens `/blog` or `/blog/{slug}` for that draft
**Then** the draft is visible (so authors can preview before publishing), visually marked as a draft.

### US4 — Unknown post (P1)

**Given** no post with slug `nope` exists (or it exists but is a draft in production)
**When** a visitor opens `/blog/nope`
**Then** the standard 404 page is returned — a hidden draft is indistinguishable from a missing post.

### Edge cases

- **DB unreachable / query error** → the request surfaces a 500 through the framework's central error
  handler; the response body carries **no** stack trace in production.
- **Empty blog** (`/blog` with zero published posts) → the index renders an empty state, not an error.
- **Body starts with its own H1** → the rendered body must not double the title already shown from the
  `title` column.
- **Very long list** → v1 renders all published posts on one page (no pagination — accepted for v1).

## 3. Requirements

- **FR-001**: A `posts` table exists with `id`, `slug`, `title`, `date`, `draft`, `tags`, `body_md`.
- **FR-002**: `GET /blog` lists every **published** post (`draft = false`, or all posts in
  development), sorted by `date` descending.
- **FR-003**: `GET /blog/{slug}` renders the matching **published** post; its `body_md` is rendered
  to JSX through the framework's Markdown pipeline (single rendering path — see the decision table).
- **FR-004**: A post with `draft = true` is **never** served in production — not on the index, not on
  its own URL. In development it is served and visually marked as a draft.
- **FR-005**: A request for an unknown slug (missing, or a draft in production) returns the standard
  404 response — enumerated by: the two blog routes are the only readers of `slug`.
- **FR-006**: A persistence error (any failure from the `posts` query) surfaces as a 500 through the
  framework's central error handler, with **no** stack trace in the production response body.
- **FR-007**: `slug` is unique — two posts cannot share a slug.
- **FR-008**: "Production" is decided in exactly one place; blog code adds **no _new_** raw
  `Deno.env.get('APP_ENV')` read, and `PostService` receives the env signal by injection rather than
  importing `isProduction` (A1). Enumerated by: grep `APP_ENV` under `app/` shows **no new** match beyond
  the pre-existing `error_handler.tsx:28` read (that read is #144's scope, not the blog's — A7).

## 4. Success criteria

- **SC-001**: A visitor can reach a published post by its URL and read its full formatted content.
- **SC-002**: A draft post is invisible to a production visitor on both the index and its direct URL,
  and visible to a developer running locally.
- **SC-003**: An unknown post URL yields the site's standard "not found" page, not a blank page or a
  server error.
- **SC-004**: A database failure yields the site's standard error page with no internal details
  leaked to the visitor.
- **SC-005**: The blog's Markdown renders with the same styling (headings, code highlighting, lists)
  as the existing documentation pages.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Drafts are hidden in production (and shown in dev) | `app/service/post_service.ts` — the one method that, given the **injected** env signal, asks the repository for the right set (`findAllPublished`/`findPublishedBySlug` in prod, `findAllIncludingDrafts`/`findBySlug` in dev) | A `draft`/`isProduction` check in `blog_controller.tsx`; **any caller of the repository other than `PostService`** (e.g. a future RSS/sitemap); a `{draft && …}` or `{isDevelopment && …}` guard in a view |
| What counts as "production" | `config/app.ts` (`isProduction`) — the project's single source, **injected into** `PostService`, never read by it (A1) | A raw `Deno.env.get('APP_ENV')` in blog code; `PostService` importing `isProduction` directly |
| List/show query order — newest first (FR-002) | `app/repository/post_repository.ts` — `ORDER BY date DESC` in the query | A re-sort in the service or the view (A2) |
| The dev "Draft" badge (FR-004) | `app/view/pages/blog/*` — render the badge whenever `post.draft === true`; the service already guarantees a draft reaches the view **only** in dev, so the view needs **no** env check | An `isDevelopment`/`isProduction` check in the view (A3) |
| An unknown/hidden post is a 404 | `app/controller/blog_controller.tsx` — `return c.notFound()` when the service yields nothing | A view rendering its own "not found" markup; a second 404 branch in the service |
| `slug` uniqueness | `app/model/post.ts` — `unique()` on the column (DB constraint) | An application-level "does this slug exist?" check in the service or repository |
| Post body is rendered through the shared pipeline | **A view helper** under `app/view/pages/blog/` — one call to `@lockness/markdown` `renderMarkdownWithoutTitle` (A5; keeps the controller thin) | A second Markdown renderer (`@deno/gfm`, `marked`); inline HTML assembly from `body_md`; a render call in the controller |
| `<meta description>` is safe (S3) | The same view helper — **plaintext-extracted** excerpt set via a **JSX attribute binding** (`content={excerpt}`) | String-concatenating `body_md` into a `<meta>` tag; feeding raw markdown to the attribute |
| Error responses carry no internal detail in production | `app/view/pages/errors/error_handler.tsx` (existing central handler; `showDetails` gated on env) | A `try/catch` in the blog controller that renders error text/stack into the response body; copying the docs `catch → c.notFound()` (S6) |

## 6. Technical context

**Language/Version**: TypeScript on Deno (repo standard, TC39 Stage-3 decorators).
**Primary Dependencies**: `@lockness/core` (routing, JSX, `@Controller`/`@Get`/`@Cache`, `Context`),
`@lockness/drizzle` (`Database` service, `db:*` CLI), `@lockness/markdown` (`renderMarkdownWithoutTitle`),
`@lockness/validator` (`z` for insert/select schemas), `drizzle-orm/pg-core`, `@lockness/ui` (layout/components).
**Storage**: PostgreSQL via Drizzle. New table `posts`. Migration generated by `deno task cli db:generate`,
applied by `deno task cli db:migrate`. Schema file globbed from `app/model/*.ts` (no central registry).
**Testing**: `Deno.test` — service unit tests (draft/env rule) with a mocked repository; controller/route
tests for 404 + list/show; migration verified by `db:generate` producing the expected SQL.
**Target Platform**: SSR web (Deno Deploy / standalone). No client JS island required.
**Project Type**: web-service (full MVC feature inside the `app/` boilerplate).
**Performance Goals**: page render dominated by one indexed Postgres query + Markdown render; `@Cache`
(as docs pages use) keeps repeat renders cheap.
**Constraints**: SSR-only (SSG deferred, #54 non-blocking); no admin/write UI in v1.
**Scale/Scope**: tens of posts; single page renders the whole published set in v1.

### Domain model

- **Bounded context**: Content / Blog.
- **Vocabulary**: *Post*, *slug*, *draft*, *published*, *body* (Markdown source), *tag*.
- **Entities**: **Post** — identity is `id` (surrogate) with `slug` as the unique natural key; owns its
  title, publication `date`, `draft` flag, `tags`, and `body_md`.
- **Value objects**: **Slug** (URL-safe identifier), **PostStatus** (draft | published, derived from
  `draft` + environment), **Tags** (an unordered set of labels).
- **Invariants**: `slug` is unique; a draft is never served in production; a post always has a title and
  a body; `body_md` is only ever rendered through the shared Markdown pipeline.
- **Out of scope**: comments, RSS, search, pagination, tag landing pages, SSG, an authoring/write UI.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | `Context`, `@Get`, `FC` all from `@lockness/core`. |
| JSR-only specifiers | pass | All deps are `@lockness/*` / `@std/*` / declared drizzle deps. |
| No `any` in exported APIs | pass | `Post`/`NewPost` from `$inferSelect`/`$inferInsert`; `z` schemas. |
| Tailwind v4 parentheses syntax | pass | Views reuse existing UI components / `config` classes. |
| Pre-completion gate | pass | `deno fmt && deno lint && deno check && deno task test` before done. |
| Never hand-edit `deno.lock` | pass | Migration + deps via CLI tasks. |
| JSDoc on public APIs | pass | Model, repository, service, controller all documented. |
| MVC layering | pass | Controller (thin) → Service (draft/env rule) → Repository (Drizzle) → Model. |
| No silent catches | pass | No swallowing catch in blog code; errors propagate to the central handler. |
| One category per commit | pass | feat / test / docs split at implement/merge. |

### Complexity tracking

No violations. The one judgement call — introducing a `PostService` rather than querying from the
controller — is *required* by MVC layering (business rule "drafts hidden in production" is logic, not
persistence) and gives the decision table a single home for that rule. Recorded as a question (Q2)
only to confirm the layer is wanted rather than folded into the repository.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| HTTP routes | yes | New `GET /blog` (`blog.index`) and `GET /blog/{slug}` (`blog.post`). |
| Database schema | yes | New `posts` table + generated migration. |
| Model | yes | `app/model/post.ts` (table + Zod schemas + `Post`/`NewPost` types). |
| Repository | yes | `app/repository/post_repository.ts` — `findAllPublished` / `findPublishedBySlug` (prod, query-level `draft = false`, S1) and `findAllIncludingDrafts` / `findBySlug` (dev, A6). All order `date DESC` (A2). |
| Service | yes | `app/service/post_service.ts` — applies the draft/env rule using the **injected** env signal (A1). |
| Env signal / port | yes | A tiny injectable exposing `isProduction` (container-resolved, faked in tests) so the draft rule is testable (A1). |
| Seeder registry | yes (if Q6) | `database/seeders/database_seeder.ts` — manual `seeders` array; `PostSeeder` must be registered (A4). |
| Migration journal | yes (auto) | `database/migrations/meta/_journal.json` auto-appended by `db:generate` (A4). |
| Controller | yes | `app/controller/blog_controller.tsx`. |
| Views | yes | `app/view/pages/blog/index.tsx`, `show.tsx`, and a blog layout. |
| Routes registry | yes | `app/routes.ts` regenerated to include `BlogController` (prod/compile). |
| Kernel / main | no | Auto-discovery in dev; no wiring change. |
| Seeder | maybe | A `posts` seeder for sample content (Q6). |
| Docs | yes | A short blog section in the app docs (feature-level). |

### Documentation (this feature)

```text
.specnaut/specs/012-blog-page/
├── plan.md    # This file
└── tasks.md   # derived from THIS file once approved
```

### Visual Prototyping with Claude Artifacts *(front-end feature)*

Two screens are worth a quick artifact before implementation: the **index** (post-card list, empty
state) and the **post page** (title + rendered Markdown + draft badge in dev). The question a
prototype answers: does the blog reuse the existing docs/landing chrome, or does it want its own
lighter layout? Deferred to Q10 rather than pre-built.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Draft leaks to production via a forgotten filter | Single home for the rule (service); a route test asserts a draft 404s with `isProduction`. |
| Stack trace leaks in a 500 body | Reuse the central handler; do not catch-and-render in the controller; test asserts no details in prod. |
| Second Markdown path diverges from docs styling | Decision table forbids a second renderer; reuse `renderMarkdownWithoutTitle`. |
| `app/routes.ts` not regenerated → controller missing in prod build | Note in tasks: regenerate routes; verify `BlogController` present before compile. |
| No write UI → no content to show | Ship a seeder with sample posts (Q6) so the feature is demonstrable. |
| CodeBlock renders highlighter HTML via `dangerouslySetInnerHTML` (S4) | Residual sink inherited from the shared renderer; safe under trusted-author v1; recorded for the later write-UI threat model. |
| Renderer allowlists tags but not link/image URI schemes (S2) | Trusted-author v1; `javascript:`/`data:` scheme-allowlisting filed as a `@lockness/markdown` follow-up (benefits docs too). |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Kept
separate from §11.*

| # | Sev | Finding | What was done |
| :--- | :--- | :--- | :--- |
| A1 | HIGH | The draft/env rule is correctly homed in `post_service.ts`, but if the service reads `config/app.ts`'s `isProduction` **module const** (frozen at import, the `docs_loader.ts` pattern), its production branch is **untestable** — a mocked repository gives no control over the env const, so SC-002 and Risk-row-1's "draft 404s in prod" test cannot be written. The plan's #1 risk would ship unguarded. | **Plan changed.** The environment is **injected into** `PostService` (a tiny env signal / port the container resolves, faked in tests), never **read by** it. The controller stays free of any env check (row 1 preserved). Decision table + §6 amended; SC-002 becomes testable in both branches. |
| A2 | LOW | Sort order (FR-002 "newest first") has no decision-table row — duplicable across query + a view/service re-sort. | **Plan changed.** New decision-table row: single home = the repository query (`ORDER BY date DESC`). |
| A3 | MEDIUM | "Visually marked as a draft" (FR-004) has no home — the place env can leak back into the view. | **Plan changed.** New row: the service returns a draft to the view **only** in dev, so the view renders the badge whenever `post.draft === true` and needs **no** env check. Pre-empts a `{isDevelopment && …}` view guard (which row 1 forbids). |
| A4 | MEDIUM | Blast radius under-counts the **seeder registration** surface: `database/seeders/database_seeder.ts` is a manual array (seeders are not auto-discovered), and `database/migrations/meta/_journal.json` is auto-appended. | **Plan changed.** §8 now lists `database_seeder.ts` (modified, if the Q6 seeder ships) and the migration journal. |
| A5 | LOW | Decision-table row 5 named **two** homes ("controller or a view helper") — an ambiguous single home is not a single home. | **Plan changed.** Pinned to a **view helper** (keeps the controller thin, hard rule #8); noted docs renders in-controller today but the blog chooses one. |
| A6 | MEDIUM | The repository's unfiltered `findAll` is a draft-leak attractive nuisance — only convention routes callers through the service; a future RSS/sitemap/admin surface could bypass it. | **Plan changed.** Method renamed **`findAllIncludingDrafts`** (risk legible at the call site); row 1's duplication clause extended to "any caller of the repository other than `PostService`"; an integration test asserts no surface but the blog reads posts. Shape (repo offers both queries) accepted. |
| A7 | LOW/info | `confirms #144`. FR-008's acceptance ("grep `APP_ENV` under `app/`") will still match the **pre-existing** `error_handler.tsx:28` read, which is #144's scope, not the blog's. | **Plan changed.** FR-008 acceptance reworded to **"no *new* raw read"**, not "zero matches". The blog correctly does not fix the inherited read. |

**Verdict** (`fail` → resolved by edits): covered all four questions against `plan.md` and the existing
`docs_controller.tsx`, `docs_loader.ts`, `user.ts`, `user_repository.ts`, `error_handler.tsx`,
`config/app.ts`, `routes.ts`, `drizzle.config.ts`, `database_seeder.ts`, `docs_loader.test.ts`. The
layering and the drafts-in-service home are **sound**; every finding is an edit, not a rewrite. All
seven are folded above — the plan as amended clears them. **A1 is the one to eyeball**: it changes the
service from reading the environment to receiving it.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel. Kept separate from §10.*

**The strong control, credited:** `@lockness/markdown` is an **allowlist-by-construction** transform,
not a raw-HTML passthrough. `parseHtmlToAst` recognises only a fixed tag set and only named
attributes; `<script>`, `<iframe>`, `onerror=`, `style=` etc. are **dropped**, and the JSX re-emit
escapes text and props. So `<script>`/`<img onerror>` in `body_md` do **not** execute. Trust model:
v1 has no write UI — `body_md` is seeded/DB-authored by trusted operators (LOW risk today); the
findings below bound the blast radius if an author account or the DB is later compromised, or a write
UI ships.

| # | Sev | Finding | What was done |
| :--- | :--- | :--- | :--- |
| S1 | MEDIUM | Draft filter on the **show** path lives only in the service; `findBySlug` returns drafts, so a future caller can leak an unpublished post ("the second query that forgets the filter"). | **Plan changed.** Repository exposes a query-level `findPublishedBySlug` (`WHERE slug = ? AND draft = false`) as the production show path — fails closed at the DB. `findBySlug` (unfiltered) is used **only** on the dev/all branch. Decision-table row 1 amended accordingly. |
| S2 | MEDIUM | The shared renderer allowlists tags/attributes but does **not** allowlist link/image **URI schemes** — `[x](javascript:…)` renders a clickable `javascript:` link. `body_md` is DB-authored (lower trust than repo `DOCS.md`). | **Plan changed** (recorded): trust boundary stated explicitly; scheme-allowlisting (`http`/`https`/`mailto`/relative) filed as a follow-up in `@lockness/markdown` (benefits docs too). A future write-UI feature **must not** assume the renderer sanitizes schemes. Accepted for v1 (trusted authors). |
| S3 | MEDIUM | `<meta description>` derived from `body_md` (Q13) is a **new sink** the blog adds that docs lacks; it bypasses the renderer allowlist (raw HTML-attribute context). | **Plan changed.** The excerpt must be **plaintext-extracted** (strip markdown/HTML) and set via a **JSX attribute binding** (`content={excerpt}`, Hono-escaped) — never string-concatenated into markup. Bound into Q13/FR. |
| S4 | LOW | CodeBlock keeps the highlighter's raw inner HTML via `dangerouslySetInnerHTML`; safety depends on `@libs/markdown` highlighting escaping code text. Pre-existing, shared with docs. | **Accepted for v1.** Listed as a residual sink inherited from the shared renderer (see §9 risks) for the later write-UI threat model. No blog-specific change. |
| S5 | LOW | Inbound `slug` not positively validated on the read path (bound `eq()` param, so not injectable — unknown value simply 404s). | **Accepted / optional.** May add `^[a-z0-9-]+$` + length cap in the controller to short-circuit garbage; not required for safety. |
| S6 (watch) | — | The docs controller wraps its body in `try/catch → c.notFound()`, swallowing **every** error (incl. DB failures) into a 404 — porting it verbatim would violate FR-006. | **Watch-item for `implement`.** The blog must **not** copy the docs catch-to-404; DB errors propagate to the central 500 handler. Already committed in §7. |

**Affirmed safe (checked):** SQL injection — none (`slug` is a bound `eq()` param); script/handler XSS via
`body_md` — blocked by the allowlist parser; draft enumeration oracle — none (hidden draft → 404,
identical to missing); IDOR — none (URL key is the natural `slug`, surrogate `id` never exposed); 500
stack-trace leak — the central handler gates details on env (provided S6 is honoured).

**Verdict** (`needs_followup`): reviewed the full `body_md`→HTML→AST→JSX render path, the `slug`
input/query binding, the draft/env authorization rule, id/meta exposure, and the 500 path. Design is
sound — parameterised queries, allowlist Markdown render, 404-not-oracle, natural-key URLs — with 3
MEDIUM + 2 LOW hardening items folded in and one error-handling watch-item. No CRITICAL/HIGH.

## 12. Open questions

*Asked at the stop that ends the plan phase, and answered before any code exists.*

*All 19 answered at the plan stop on 2026-09-02; every recommendation accepted (the 4 highest-leverage
via selector, the remaining 15 as a batch).*

| # | Question | Settled decision | Date |
| :--- | :--- | :--- | :--- |
| Q1 | Markdown renderer (AC says `@deno/gfm`; repo uses `@lockness/markdown`) | **`@lockness/markdown`** (`renderMarkdownWithoutTitle`) — overrides the AC's ungrounded `@deno/gfm` wording; reuses docs styling + the XSS allowlist. | 2026-09-02 |
| Q2 | Service layer? | **Yes — `PostService`** between controller and repository (single home for the draft/env rule). | 2026-09-02 |
| Q3 | `tags` storage | **Postgres `text[]`**, stored but **not surfaced** in v1. | 2026-09-02 |
| Q4 | `date` semantics + timestamps | `date` = **publication** timestamp; **add `created_at`/`updated_at`** for audit. | 2026-09-02 |
| Q5 | `draft` default | **`true`** (nothing publishes by accident). | 2026-09-02 |
| Q6 | Content in v1 | **Ship a `PostSeeder`** (2–3 sample posts). | 2026-09-02 |
| Q7 | Slug validation | Store as given; **Zod lowercase-kebab**; DB `unique`. | 2026-09-02 |
| Q8 | Draft marking in dev | Visible **"Draft" badge** (view-side, no env check). | 2026-09-02 |
| Q9 | Draft-in-prod direct URL | **404** (indistinguishable from missing). | 2026-09-02 |
| Q10 | Layout | **New lightweight `BlogLayout`** on `RootLayout` (docs chrome minus the docs sidebar). | 2026-09-02 |
| Q11 | Caching | **`@Cache` `{strategy:'both', ttl:3600}`**; ≤1h staleness accepted. | 2026-09-02 |
| Q12 | Structured logging | **App idiom** (`console.error` + core `formatErrorForConsole`); not `@lockness/logger`. | 2026-09-02 |
| Q13 | Post meta | **`<meta description>`** from a **plaintext excerpt**, JSX-escaped (S3); OG tags out of scope. | 2026-09-02 |
| Q14 | i18n | **No** — single-locale in v1. | 2026-09-02 |
| Q15 | Tests & DB | **Mocked-repository** unit tests + route tests; no live DB required. | 2026-09-02 |
| Q16 | Route prefix | **Fixed `/blog`**, named routes `blog.index` / `blog.post`. | 2026-09-02 |
| Q17 | A1 env-injection shape | **Tiny container-resolved env port** exposing `isProduction`, faked in tests. | 2026-09-02 |
| Q18 | S2 scheme-allowlisting | **Defer** — file a `@lockness/markdown` follow-up; out of the blog's scope (trusted authors v1). | 2026-09-02 |
| Q19 | Seeder registration | **Ship it**; register `PostSeeder` in `database/seeders/database_seeder.ts` (A4). | 2026-09-02 |

### Decided without asking

- **Rendering is SSR only** — the issue's resolved notes settle this (#54 SSG is non-blocking).
- **No admin/authoring UI** — out of scope per the issue.
- **Errors flow through the existing central handler** — it is auto-wired by convention; the blog does
  not register its own.
- **Production detection uses `config/app.ts` `isProduction`** — the project's single source; no new raw
  env read (aligns with #144).
