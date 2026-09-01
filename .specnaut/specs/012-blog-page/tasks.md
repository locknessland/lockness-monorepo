---
description: "Task breakdown for the Blog Page feature (#80)"
---

# Tasks: Blog Page

**Input**: `plan.md` in this directory (the one design document).
**Feature**: SSR blog at `/blog` and `/blog/{slug}`, Postgres-backed, Markdown rendered via
`@lockness/markdown`, drafts hidden in production.
**Tests**: included — Q15 requested unit + route tests and the constitution's TDD rule applies.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable (different files, no dependency on an incomplete task).
- **[Story]** — US1 (index) / US2 (show) / US3 (draft preview, dev) / US4 (unknown → 404).
- Each task names its **decision-table home** where it touches a rule (plan §5).

## Decision-table homes carried forward (plan §5)

| Rule | Home — nothing else may spell it |
| :--- | :--- |
| Drafts hidden in prod | `app/service/post_service.ts` (env **injected**) |
| What is "production" | `config/app.ts` `isProduction`, injected via the env port |
| Query order (newest first) | `app/repository/post_repository.ts` (`ORDER BY date DESC`) |
| Dev "Draft" badge | `app/view/pages/blog/*` — render on `post.draft === true`, **no** env check |
| Unknown/hidden → 404 | `app/controller/blog_controller.tsx` (`c.notFound()`) |
| Slug uniqueness | `app/model/post.ts` (`unique()`) |
| Markdown render + safe meta | view helper `app/view/pages/blog/render.tsx` (one `@lockness/markdown` call) |
| No internal detail in prod errors | `app/view/pages/errors/error_handler.tsx` (existing; do **not** catch-and-render in blog) |

---

## Phase 1: Setup (shared infrastructure)

- [X] T001 Confirm `@lockness/markdown`, `@lockness/drizzle`, `@lockness/validator` are resolvable from `app/` (declared in root workspace); no new dependency file needed. Note in the commit if any specifier must be declared.

---

## Phase 2: Foundational (blocking prerequisites for all stories)

- [X] T002 Create the `posts` model in `app/model/post.ts` — `pgTable('posts', …)` with `id serial PK`, `slug text unique not null` (**home of slug uniqueness**), `title text not null`, `date timestamp not null`, `draft boolean not null default true` (Q5), `tags text[]` (Q3), `body_md text not null`, `created_at`/`updated_at timestamp` (Q4). Export Zod `insertPostSchema` (lowercase-kebab slug, Q7) + `selectPostSchema` via `@lockness/validator` `z`, and `Post`/`NewPost` from `$inferSelect`/`$inferInsert`. JSDoc on all exports.
- [X] T003 Generate the migration: run `deno task cli db:generate`, verify the emitted `database/migrations/000N_*.sql` creates `posts` with the unique `slug` constraint and `text[] tags`; commit the SQL + `meta/` snapshot + the auto-appended `_journal.json` (A4).
- [X] T004 [P] Create the env port in `app/service/environment.ts` — a `@Service()`-injectable exposing `isProduction` sourced from `config/app.ts` (A1/Q17). JSDoc. This is the **only** place `PostService` learns the environment; it never imports `isProduction` directly.
- [X] T005 [P] Unit test the env port in `tests/blog/environment.test.ts` — a fake implementation returns a controllable `isProduction` for service tests (proves A1 testability).
- [X] T006 Create `app/repository/post_repository.ts` — `@Service()` injecting `Database` from `@lockness/drizzle`. Methods (all `ORDER BY date DESC` — **home of query order**): `findAllPublished()` (`draft = false`), `findAllIncludingDrafts()` (A6 — legible-risk name), `findPublishedBySlug(slug)` (`slug = ? AND draft = false`, S1 fail-closed), `findBySlug(slug)` (dev, unfiltered). Bind `slug` via `eq()` only — never a raw `sql\`\`` template (S-affirmed). JSDoc.
- [X] T007 [P] Repository tests in `tests/blog/post_repository.test.ts` — assert each query’s filter + ordering with a mocked `Database` (Q15); assert `findPublishedBySlug` excludes drafts (S1).
- [X] T008 Create `app/view/pages/blog/render.tsx` — the **markdown render + safe-meta view helper** (**home**): one call to `@lockness/markdown` `renderMarkdownWithoutTitle(body_md)` (Q1); a `plaintextExcerpt(body_md)` that strips markdown/HTML for the `<meta description>` (S3, set via JSX prop, never string-concat). JSDoc.
- [X] T009 [P] Render-helper tests in `tests/blog/render.test.ts` — assert `<script>`/`onerror` in `body_md` do not survive to executable output (S-affirmed allowlist), and the excerpt is plaintext (S3).
- [X] T010 [P] Create `app/view/layouts/blog_layout.tsx` (Q10) — lightweight layout on `@lockness/ui` `RootLayout` (docs chrome minus the docs sidebar), props `{ title, description?, children }`. JSDoc.

---

## Phase 3: US1 — Blog index (P1)

**Goal**: `GET /blog` lists published posts, newest first (drafts absent in prod).
**Independent test**: request `/blog` with the fake env in prod mode → only non-draft posts, `date DESC`.

- [X] T011 [US1] Add `list()` to `app/service/post_service.ts` — `@Service()` injecting `PostRepository` + the env port; **home of the draft/env rule**: `isProduction ? findAllPublished() : findAllIncludingDrafts()`. No env read anywhere else. JSDoc.
- [X] T012 [P] [US1] Service test `tests/blog/post_service_list.test.ts` — fake env prod → published only; dev → includes drafts (SC-002 both branches, now testable via T004).
- [X] T013 [US1] Create `app/controller/blog_controller.tsx` — `@Controller('/blog')`, `@Get('/', { name: 'blog.index' })` + `@Cache({ strategy: 'both', ttl: 3600 })` (Q11), inject `PostService` via accessor, return `c.html(<BlogLayout>…</BlogLayout>)`. Thin — no env/draft logic. JSDoc.
- [X] T014 [P] [US1] Create `app/view/pages/blog/index.tsx` — post-card list (title, date, link via `route('blog.post', { slug })`), empty state when zero posts (edge case). `class=` not `className`.
- [X] T015 [US1] Route test `tests/blog/blog_index.test.ts` — `/blog` returns 200 and lists published posts in `date DESC`; empty DB → empty state, not error.

---

## Phase 4: US2 — Single post (P1) + US4 — unknown post (P1)

**Goal**: `GET /blog/{slug}` renders a published post; unknown/hidden slug → 404.
**Independent test**: known published slug → 200 + rendered body; unknown slug and draft-in-prod → 404.

- [X] T016 [US2] Add `get(slug)` to `app/service/post_service.ts` — **draft/env rule home**: `isProduction ? findPublishedBySlug(slug) : findBySlug(slug)`; returns `null` when nothing matches. JSDoc.
- [X] T017 [P] [US2] Service test `tests/blog/post_service_get.test.ts` — prod: published slug → post, draft slug → `null` (Q9/S1); dev: draft slug → post.
- [X] T018 [US2] Add `@Get('/:slug', { name: 'blog.post' })` + `@Cache(...)` to `blog_controller.tsx` — `c.req.param('slug')`, call `service.get`, **`return c.notFound()` when null** (**home of unknown→404**, US4). Do **not** wrap in `try/catch → notFound` (S6) — let DB errors propagate to the central 500 handler (FR-006). JSDoc.
- [X] T019 [P] [US2] Create `app/view/pages/blog/show.tsx` — title from the `title` column + `renderMarkdownWithoutTitle` body via the T008 helper + safe `<meta description>` (S3).
- [X] T020 [US2/US4] Route test `tests/blog/blog_show.test.ts` — published slug → 200 + rendered body; unknown slug → 404; **draft slug in prod → 404 identical to missing** (Q9, no enumeration oracle); a repository error → 500 with **no** stack trace in the body (FR-006/S6).

---

## Phase 5: US3 — Draft preview in development (P2)

**Goal**: drafts visible + badged in dev; invisible in prod.
**Independent test**: dev env → draft appears on index and its page with a "Draft" badge; prod → absent.

- [X] T021 [US3] Add the "Draft" badge to `app/view/pages/blog/index.tsx` and `show.tsx` — render on `post.draft === true` (**home of the badge**); **no** `isDevelopment`/env check in the view (A3). Uses `@lockness/ui` Badge.
- [X] T022 [US3] Route test `tests/blog/blog_draft_preview.test.ts` — fake env dev → draft listed + badged on index and reachable on its page; fake env prod → absent from both (SC-002).

---

## Phase 6: Content + polish (cross-cutting)

- [X] T023 [P] Create `database/seeders/post_seeder.ts` (Q6) — 2–3 sample posts (≥1 draft) with Markdown bodies; register `PostSeeder` in `database/seeders/database_seeder.ts` `seeders` array (A4).
- [X] T024 Regenerate `app/routes.ts` so `BlogController` is in the `controllers` array (prod/compile); verify it is present.
- [X] T025 [P] FR-008 check — `grep -rn "APP_ENV" app/` shows **no new** raw read from blog files (only the pre-existing `error_handler.tsx:28`, A7); `PostService` imports the env port, not `isProduction`.
- [X] T026 [P] Docs — add a short blog section to the app docs describing the `posts` model, the `/blog` routes, draft behaviour, and the trusted-author trust model + the S2 URI-scheme caveat (renderer allowlists tags/attrs, not schemes).
- [X] T027 Pre-completion gate — `deno fmt && deno lint && deno check <changed files> && deno task test` all green (constitution rule #5).

---

## Dependencies & order

- **Phase 2 blocks everything.** T002→T003 (model before migration); T004→T005; T006→T007; T008→T009; T010 independent.
- **US1 (Ph3)** needs T006 + T004 (service) + T010 (layout). **US2/US4 (Ph4)** needs T006/T008/T010 + the controller from T013. **US3 (Ph5)** needs the US1/US2 views.
- **Phase 6**: T023 needs T002/T003; T024 after the controller exists; T025/T027 last.

## Parallel opportunities

- After T002/T003: **T004, T006, T008, T010** are parallel (distinct files).
- Test tasks **T005, T007, T009, T012, T017** are `[P]` against their SUT.
- Views **T014, T019** parallel; docs **T026** parallel with code.

## MVP scope

**US1 + US2 + US4** (P1) = a working public blog: list + read + correct 404. **US3** (dev draft
preview, P2) and the seeder polish follow. Ship increment 1 after Phase 4.

## Suggested commit split (by category, plan §9 / constitution rule #9)

1. `feat(80)` — model, migration, env port, repository, service, controller, views, layout, helper, seeder.
2. `test(80)` — all `tests/blog/*`.
3. `docs(80)` — the blog docs section.
4. `chore(80)` — `routes.ts` regeneration if hand-touched.
