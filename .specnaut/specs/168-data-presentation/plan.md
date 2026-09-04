# Plan: Data presentation — pagination + API resources

**Branch**: `168-data-presentation` | **Date**: 2026-09-04 | **Backlog item**: [#197 — Data presentation: pagination + API resources](https://github.com/locknessland/lockness-monorepo/issues/197) (epic; children [#198](https://github.com/locknessland/lockness-monorepo/issues/198), [#199](https://github.com/locknessland/lockness-monorepo/issues/199), [#200](https://github.com/locknessland/lockness-monorepo/issues/200), [#201](https://github.com/locknessland/lockness-monorepo/issues/201))

**This is the epic's one planning document** — one decision table, one stop, covering all four children.

---

## 1. Why this exists

Competitive gaps #2 and #3. Every listing endpoint in a Lockness app today re-invents `limit`/`offset` + total + page links by hand, and every controller hand-shapes its JSON response, leaking model internals directly into the wire format. There is a `@lockness/ui` `Pagination` component but **no data-layer paginator** to feed it, and **no resource/serializer layer** to give API output a stable, versionable shape. Laravel (`paginate()` / API Resources), Rails (Kaminari / AMS) and Django REST all ship both; Lockness ships neither. The cost is duplicated, untested pagination math in every app and API responses coupled to the ORM row shape.

## 2. User scenarios

### US1 — Paginate a listing (P1)

**Given** a controller that lists records
**When** the developer calls the paginator with a page/perPage (offset) or a cursor
**Then** they receive a `{ data, meta, links }` envelope whose `meta` maps directly onto the existing `@lockness/ui` `Pagination` props, with no hand-written page math.

### US2 — Serve consistent API output (P1)

**Given** a model with internal fields that must not all reach the wire
**When** the developer wraps it in a Resource (and a collection in a ResourceCollection)
**Then** the JSON output is an explicit, opt-in field projection — internal fields are absent unless the Resource names them — and a collection carries pagination `meta`/`links` when built from a paginated result.

### US3 — Scaffold a resource (P2)

**Given** a developer starting a new resource
**When** they run `nessy make:resource Post`
**Then** a resource class stub is written under `./app/resource`, following the same generator pattern as `make:service`.

### US4 — Learn the layer (P2)

**Given** a developer new to the paginator and resource layer
**When** they read the docs
**Then** worked examples cover offset + cursor pagination, UI binding, and resource/collection output.

### Edge cases

- `perPage` requested absurdly large (e.g. 1_000_000) → clamped to a maximum, never fetched raw.
- `page` = 0, negative, or non-integer → coerced to a valid floor of 1.
- Empty result set → `data: []`, `meta` still coherent (`total: 0`, `lastPage: 1`), `links.next`/`prev` null.
- Cursor pagination on the last page → `nextCursor: null`, `hasMore: false`.
- Cursor value that is client-supplied → parameterised through Drizzle bindings (no raw interpolation), type-validated against the cursor column.

## 3. Requirements

- **FR-001**: A DB-agnostic paginator produces `{ data, meta, links }` for **both** offset and cursor strategies. Pure function of its inputs — no I/O.
- **FR-002**: Offset `meta` carries `total`, `perPage`, `currentPage`, `lastPage`, `from`, `to`; offset `links` carry `first`, `last`, `prev`, `next`, `self`. **Links are relative** (`pathname` + query only) — the paginator never emits an absolute URL and never reflects a request `Host`/`X-Forwarded-Host` (matching the existing UI `buildPageUrl` convention, `packages/ui/components/Pagination/mod.tsx:173`). `prev`/`next` are null at boundaries. *(hardened per security S3)*
- **FR-003**: Cursor `meta` carries `perPage`, `nextCursor`, `prevCursor`, `hasMore` (no `total` — cursor pagination does not count); cursor `links` carry `prev`, `next`, `self`, relative per FR-002. `nextCursor`/`prevCursor` are **opaque tokens** (base64url of `{ column, value }`), documented as *non-secret ordering positions* — not the raw internal column value on the wire, so a cursor does not surface an internal id that the Resource projection omitted. *(hardened per security S4 + architecture A2)*
- **FR-004**: `perPage` is clamped to a configurable maximum (with a default when omitted) in exactly one place; `page` is **both floored to ≥ 1 and capped to `lastPage`** in exactly one place (an oversized `page` cannot produce a giant SQL `OFFSET`). *(page ceiling added per security S5)*
- **FR-005**: A `toPaginationProps(meta, baseUrl, pageParam?)` helper maps offset `meta` to the plain object shape the `@lockness/ui` `Pagination` component consumes (`currentPage`, `totalPages`, `baseUrl`, **`pageParam`**) — forwarding `pageParam` so the UI's links and the envelope links cannot diverge — without either package importing the other. *(pageParam forwarding added per architecture A1)*
- **FR-006**: `@lockness/drizzle` exposes a `paginate()` helper that **accepts the caller's filter conditions** (not a pre-built builder) and composes the pagination predicate with them via `and(...conditions, cmp(col, cursor))` — never a bare second `.where()` (in drizzle-orm 0.36.3 a second `.where()` *overwrites*). The offset `count` query is built from the **same** conditions. It runs the offset window (`limit`/`offset`) or the cursor window (`orderBy` + `limit`) and returns the FR-001 envelope. The cursor codec (encode/decode/type-validate against the column) is homed here, since only the driver knows the column type. **A dropped tenancy/ownership filter must not be expressible through this API.** *(rewritten per security S1 + architecture A2)*
- **FR-007**: An API `Resource` base transforms one model into an explicit, **opt-in** JSON projection. The base `toArray()` is **abstract (fails closed)** — a subclass that names no fields serialises nothing, never the whole model. As defence-in-depth the base drops a central never-serialise name set (`password`, `passwordHash`, `token`, `secret`, `hash`) even if a subclass names one. A `ResourceCollection` wraps an array and, when constructed from a paginated result, carries its `meta`/`links`. *(hardened per security S2)*
- **FR-008**: `make:resource <Name>` scaffolds a resource class under `./app/resource`, registered in the `MAKE_COMMANDS` array and using an `.stub` template whose body is an **explicit field list** (never `{ ...model }` / `$inferSelect`), so a freshly generated, unedited resource is opt-in by default. The command imports `Stub` from its defining module (`packages/cli/stubs.ts`) rather than the `cli/mod.ts` barrel, so it does not re-widen the reverse-edge refactor [#244](https://github.com/locknessland/lockness-monorepo/issues/244) is filed to shrink. *(hardened per security S2 + architecture A3)*
- **FR-009**: Docs cover the paginator (offset + cursor), the Drizzle helper, the UI binding, and the resource/collection layer with runnable examples. Examples build `baseUrl` from a fixed path (never from the request `Host`), and point to cursor pagination as the large-table path that avoids deep-offset cost. *(per S3/S5)*
- **FR-010**: Every new exported symbol carries JSDoc (hard rule #7); no `any` in any exported signature (hard rule #3); all `@lockness/*`/`@std/*` specifiers bare in source and pinned in `deno.json` (hard rule #2).

## 4. Success criteria

- **SC-001**: A developer paginates a listing and renders the UI component without writing any page-count or link arithmetic themselves.
- **SC-002**: An API response's field set is decided solely by its Resource — adding a column to a model does not change the wire output until the Resource names it.
- **SC-003**: A request for an oversized page size cannot cause the app to fetch more than the configured maximum rows.
- **SC-004**: The paginator, the Drizzle helper, the resource layer and the generator all ship with tests and pass the full gate (`deno fmt && deno lint && deno check && deno task test && deno task deps:analyze && deno task agents:brief --check && deno task publish:check`).
- **SC-005**: A paginated query started from a filtered builder (e.g. `where(owner = me)` for both offset and cursor) returns **only** rows matching that filter, and `meta.total` counts only them — proven by a test that would fail if the pagination predicate replaced the caller's filter. *(cross-tenant guard, security S1)*

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The pagination envelope shape `{ data, meta, links }` and its `meta`/`links` field sets | `packages/contract/pagination/types.ts` | A second `meta`/`links` interface declared in `drizzle`, `core`, or an app; ad-hoc `{ total, page }` objects |
| How offset `meta`/`links` are computed from `(total, page, perPage, baseUrl)` | `packages/contract/pagination/paginate.ts` (`paginateOffset`) | Page-count math (`Math.ceil(total/perPage)`), `from`/`to`, or first/last/prev/next URL building re-spelled in `drizzle` or a controller |
| How cursor `meta`/`links` are computed from `(items, perPage, cursorOf)` | `packages/contract/pagination/paginate.ts` (`paginateCursor`) | `hasMore`/`nextCursor` logic re-spelled in `drizzle` |
| `perPage` maximum clamp + default, and `page` floor **and ceiling** (the only guard against oversized fetches / deep offsets) | `packages/contract/pagination/paginate.ts` (one `clampPerPage`/`clampPage`, `MAX_PER_PAGE`, `DEFAULT_PER_PAGE`) | A second clamp in `drizzle.paginate()` or a controller; an un-clamped `limit()`/`offset()` call |
| Reading `?page`/`?perPage`/`?cursor` off the request into `PaginationParams` (+ default perPage when omitted) | `packages/contract/pagination/paginate.ts` (`readPaginationParams`) | Each controller re-spelling the query-param read and its own default | *(new row — architecture A1/Q1)* |
| The default page query-param name (`page`) used to build envelope links **and** forwarded to the UI | `packages/contract/pagination/paginate.ts` (`DEFAULT_PAGE_PARAM`), passed through `toPaginationProps` | A hardcoded `'page'` literal in a second link builder, **or** `toPaginationProps` dropping `pageParam` so contract links say `?p=` while the UI renders `?page=`. **Note:** the `@lockness/ui` component independently defaults `pageParam='page'` (it cannot import contract) — it is an *asker*; `toPaginationProps` forwards the value so both askers use one decider *(architecture A1)* |
| meta → UI `Pagination` props mapping (incl. `pageParam`) | `packages/contract/pagination/paginate.ts` (`toPaginationProps`) | A controller building `{ currentPage, totalPages }` from `meta` by hand |
| Running the offset/cursor SQL for a paginated Drizzle query, **AND-composed with the caller's conditions** | `packages/drizzle/paginate.ts` | A repository issuing its own `.limit().offset()` + `count()` pair; a bare second `.where()` that overwrites the caller's filter |
| The cursor opaque-token codec (encode / decode / type-validate against the column) | `packages/drizzle/paginate.ts` (`encodeCursor`/`decodeCursor`) — the driver owns it because only it knows the column type; contract exposes only the position via `cursorOf` | Encode in contract + decode in a controller; a second cursor format when a new driver (#215) lands | *(new row — architecture A2 + security S4)* |
| A model's wire projection (which fields are exposed) | the app's own `Resource` subclass `toArray()` (base: `packages/core/resource/resource.ts`) | Returning `model.$inferSelect` rows straight from a controller; a second projection in the controller |
| Wrapping a collection + attaching pagination meta to it | `packages/core/resource/collection.ts` (`ResourceCollection`) | A controller hand-assembling `{ data: rows.map(...), meta }` |
| The `make:resource` scaffold (name → file path + stub) | `packages/cli/commands/make/resource.ts` (+ `packages/cli/stubs/make/resource.stub`) | A second resource template inlined elsewhere |

## 6. Technical context

**Language/Version**: Deno / TypeScript (workspace pinned), TC39 Stage-3 decorators.
**Primary Dependencies**: `@lockness/contract` (new `pagination/` module), `drizzle-orm@^0.36.3` (already present in `@lockness/drizzle`), `@lockness/ui` `Pagination` (already present, unchanged), `@lockness/cli` make system.
**Storage**: PostgreSQL via Drizzle for the `paginate()` helper; the paginator core is storage-agnostic.
**Testing**: `Deno.test` in each package's `tests/`. The contract paginator is pure → unit-testable with no DB; the Drizzle helper is tested against its query-shape (spy/stub the builder) — no live DB in unit tests.
**Target Platform**: Deno server runtime.
**Project Type**: framework library (monorepo packages).
**Performance Goals**: cursor pagination avoids `COUNT(*)` on large tables; `perPage` cap bounds worst-case fetch size.
**Constraints**: strict acyclic DAG (`deps:analyze`); hard rules #1–#9.
**Scale/Scope**: four children, four packages touched (`contract`, `drizzle`, `core`, `cli`) + docs.

### Domain model

- **Bounded context**: Data presentation — turning a set of persisted rows into a paginated, projected wire response.
- **Vocabulary**: *paginator* (computes the envelope), *page* (offset window), *cursor* (opaque position), *envelope* (`{data,meta,links}`), *meta* (counts/positions), *links* (navigation URLs), *resource* (per-model projection), *resource collection* (projected array + meta).
- **Entities** (identity): none — this feature adds no persisted entity.
- **Value objects** (no identity): `PaginationMeta` (offset | cursor variants), `PaginationLinks`, `PaginationEnvelope<T>`, `PaginationParams`.
- **Invariants**: `data.length ≤ perPage`; `perPage ≤ MAX_PER_PAGE`; `currentPage ≥ 1`; offset `lastPage = max(1, ceil(total/perPage))`; a Resource never emits a field it did not name.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| #1 no direct `hono` import | pass | Paginator/resource touch no Hono; UI binding returns a plain object, not JSX |
| #2 JSR-only, per-package | pass | New `drizzle → contract` edge declared in `drizzle/deno.json` + `deps.policy.jsonc` |
| #3 no `any` in exported APIs | pass | Generics (`PaginationEnvelope<T>`, `Resource<TModel>`); `unknown` + guards where a type is open |
| #4 Tailwind v4 var syntax | pass (N/A) | No new CSS; existing UI component unchanged |
| #5 pre-completion gate | pass | Full gate per child before each commit |
| #6 never hand-edit `deno.lock` | pass | No new npm dep (drizzle-orm already vendored); lock regenerated by `deno` if needed |
| #7 JSDoc on public APIs | pass | Every exported symbol documented (FR-010) |
| #8 MVC layering | pass | Resource is a presentation-layer projection; paginator is DB-agnostic; no DB in controllers |
| #9 commit discipline | pass | One commit per child, `Epic: #197` trailer, `chore(deps)` split out for the drizzle→contract edge |
| DDD (pure domain) | pass | Contract paginator is pure (no I/O); Drizzle adapter isolates SQL |
| Domain Model gate | pass | Section 6 above |

### Complexity tracking

No accepted violations. One deliberate scope narrowing (OpenAPI feed) is recorded as open question Q1, not a violation.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/contract` public API | yes | New `pagination/` module: types + `paginateOffset`/`paginateCursor`/`toPaginationProps` + subpath export `"./pagination"` |
| `@lockness/drizzle` public API | yes | New `paginate()` helper export; `deno.json` gains `@lockness/contract`; `deps.policy.jsonc` `drizzle.allow += "contract"` |
| `@lockness/core` public API | yes | New `resource/` module (`Resource`, `ResourceCollection`) re-exported via `core/mod.ts`; paginator surfaces automatically through `export * from '@lockness/contract'` |
| `@lockness/cli` command set | yes | New `make:resource` command + `make/resource.stub` |
| `@lockness/ui` | no | `Pagination` component unchanged — bound via a plain-object mapping |
| `@lockness/openapi` | no (this epic) | Resource→schema feed deferred to [#251](https://github.com/locknessland/lockness-monorepo/issues/251) — see Q1 |
| Docs | yes | New pagination + resources doc with worked examples |

### Documentation (this feature)

```text
.specnaut/specs/168-data-presentation/
├── plan.md    # This file
└── tasks.md   # tasks output, derived from this file once approved
```

### Visual Prototyping with Claude Artifacts *(front-end surface present — `.tsx` under `packages/ui`)*

**Not needed.** This epic adds **no net-new UI**: it reuses the existing `@lockness/ui` `Pagination` component unchanged and only supplies the data that feeds it. There is no new screen or state whose look is in question, so no artifact prototype is warranted. The UI-facing deliverable is the `toPaginationProps` mapping, verified by a unit test, not a visual.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| `perPage` abuse → unbounded fetch (DoS/memory) | Single clamp in the contract paginator (FR-004); the Drizzle helper calls it, never `limit()` raw |
| Cursor tampering / injection | Cursor bound through Drizzle parameterisation, never string-interpolated; cursor type validated against its column |
| Resource silently leaks sensitive fields | Base is **opt-in** — a Resource emits only fields it names; adding a model column changes nothing until named (SC-002) |
| `drizzle → contract` edge introduces a cycle | contract is foundation (imports only Hono *types*); the edge is strictly downward — verified by `deps:analyze` |
| Two spellings of the page-count / `pageParam` rule | Decision table rows 1–6 pin single homes; the UI's independent `pageParam` default is documented as an *asker*, not a second decider |
| New contract sub-module not reaching consumers | `contract/deno.json` has `publish.exclude` (tests only), **no** `include` list — so `pagination/` auto-publishes; the #225 `publish.include` failure mode does **not** apply here (architecture A4). The real required actions: add `exports["./pagination"]` to `contract/deno.json` **and** a `contract/mod.ts` barrel line `export * from './pagination/mod.ts'` (routing/lifecycle precedent) — the latter is what makes `core`'s auto-re-export true. `publish:check` in the gate |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Verdict: **needs_followup** — 0 critical/high, 3 MEDIUM, 3 LOW.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | MEDIUM — `pageParam` spelled in three unhomed places; `toPaginationProps` dropped the aligning field | **Plan changed.** FR-005 now forwards `pageParam`; decision table gains a row homing the request-param read + default perPage in the contract paginator, and the `pageParam` row records the UI as an *asker* of one decider |
| A2 | MEDIUM — cursor codec (encode/decode/validate) had no single home in §5 | **Plan changed.** New decision-table row homes the cursor codec in `packages/drizzle/paginate.ts` (the driver knows the column type); contract exposes only the position via `cursorOf`. FR-006 amended |
| A3 | MEDIUM — `make:resource` copying `make:service` re-widens the barrel reverse-edge refactor #244 is filed to shrink (`confirms #244`) | **Plan changed.** FR-008 now requires importing `Stub` from `packages/cli/stubs.ts` (defining module), not the barrel; noted in §12 |
| A4 | LOW — §9 risk misdiagnosed `publish.include` for contract (contract uses `exclude`, no include list) | **Plan changed.** Risk row rewritten: real action is `exports["./pagination"]` + `contract/mod.ts` barrel re-export |
| A5 | LOW — Resource base in `core` (tier 2) vs paginator in `contract` (tier 0): asymmetry unrecorded | **Recorded** as a rejected alternative in §12 (core chosen: app-authoring primitive, app-facing tier) |
| A6 | LOW — OpenAPI-feed deferral must become a filed backlog item or the parent AC reads as unmet | **Accepted** — folded into Q1's resolution: on "defer", a new backlog item is filed and referenced in §8/§12 |

**Verdict**: **needs_followup**, covering the decision table's completeness against FR-001–FR-010, each home's correctness (contract as paginator home *confirmed* over a new package), a counted blast radius (0 UI call sites to migrate, exactly 1 new package edge `drizzle→contract`, no `make:*` collision, no DAG rejection), and three-cycles-out predicted findings. All findings fixable as plan-spec edits (done above) — none requires re-architecting.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel. Verdict: **fail** — 0 critical, 1 HIGH, 4 MEDIUM, 0 low.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | **HIGH** — `paginate()` cursor/count queries could drop the caller's tenancy/ownership `WHERE` (drizzle 0.36.3 second `.where()` *overwrites*) → cross-tenant bulk disclosure; offset `count` without the filter → cross-tenant `meta.total` | **Plan changed — the headline fix.** FR-006 rewritten: `paginate()` accepts the caller's **conditions** (not a pre-built builder) and AND-composes the pagination predicate; the count reuses the same conditions; a dropped filter is not expressible through the API. New SC-005 is a cross-tenant test that fails if the filter is replaced |
| S2 | MEDIUM — Resource "opt-in" unpinned; base default / generated stub could ship opt-out and leak un-named columns (incl. `password_hash`) | **Plan changed.** FR-007: base `toArray()` is abstract (fails closed) + central never-serialise denylist; FR-008: stub scaffolds an explicit field list, never `{...model}`/`$inferSelect` |
| S3 | MEDIUM — envelope `links` relative-vs-absolute + `baseUrl` provenance unspecified → host-header injection / cache poisoning | **Plan changed.** FR-002/FR-003: links are relative (`pathname`+query), request `Host` never reflected; FR-009 examples build `baseUrl` from a fixed path |
| S4 | MEDIUM — cursor emits the raw ordering-column value; "opaque" in name only → internal-id disclosure bypassing the Resource projection | **Plan changed.** FR-003: `nextCursor`/`prevCursor` are opaque base64url tokens of `{column,value}`, documented as non-secret positions; codec homed in the driver (see A2) |
| S5 | MEDIUM — `page`/offset floored but not ceilinged → unbounded SQL `OFFSET` (resource exhaustion) | **Plan changed.** FR-004: `page` is capped to `lastPage` as well as floored, in the one clamp home |

**Verdict**: **fail** (advisory) — the HIGH (S1) and all four MEDIUMs are specification-tightening the plan absorbed above without re-architecting; the design's shape stands. S1's fix (conditions-not-builder API) is the migration-vs-one-line asymmetry the plan-time audit exists to catch, now closed before any code.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1** — The epic's parent AC says resources "feed OpenAPI", but child #200's own AC does not, and the feed is genuinely net-new (populate `components.schemas`, emit `$ref`s, add a generator seam + an `openapi → ?` edge). Ship #200 as the Resource base + collection + `make:resource` and **defer** the OpenAPI schema feed to a new backlog item? | **DEFER + file item.** #200 ships Resource base + collection + `make:resource` only. The Resource→OpenAPI schema feed became its own backlog item [#251](https://github.com/locknessland/lockness-monorepo/issues/251) (Backlog, Feature/P2/M/dx), referenced in §8. The parent #197 AC's OpenAPI clause is satisfied by that follow-up, not by #200. | 2026-09-04 |
| **Q2** — Home for the pure paginator: `@lockness/contract` vs. a new `@lockness/pagination` package. | **RESOLVED by both audits → `@lockness/contract`.** Architecture: a standalone package for pure functions with no independent consumer is Lazy Class / Speculative Generality; contract already carries runtime and is the foundation everyone can import. Security raised no objection. | 2026-09-04 |
| **Q3** — Cursor `meta`: omit `total` entirely (recommended — the point of cursor pagination is to skip `COUNT(*)`), or include an optional `total` when the caller supplies a count? | **OMIT `total`.** Cursor `meta` = `perPage`/`nextCursor`/`prevCursor`/`hasMore` only; no `COUNT(*)` on the cursor path (its whole purpose on large tables). Offset `meta` keeps `total`. | 2026-09-04 |

### Decided without asking

- **Resource base lives in `@lockness/core`** (`resource/`), not a new package — it is an app-authoring primitive like controllers, and `core` is what apps import. core already allows `contract`, so it can carry pagination meta into a `ResourceCollection`. *(Rejected alternative, architecture A5: Resource base in `@lockness/contract` beside the paginator — keeps all pure presentation primitives in one tier with no new edge, re-exported by core unchanged. Rejected because core is the app-facing home for authoring primitives; recorded so the asymmetry is visible.)*
- **`make:resource` follows the `make:service` pattern** (single stub, `./app/resource`, appended to `MAKE_COMMANDS`) — the established generator convention; no `stub_paths.ts` change needed — **except** it imports `Stub` from `packages/cli/stubs.ts` (defining module), not the `cli/mod.ts` barrel, to avoid re-widening refactor #244 (architecture A3). *If `cli/stubs.ts` does not yet exist, the implementer either lands #244's move first or imports at the barrel and records this as the 15th site to migrate — verified at implementation.*
- **UI binding is a plain-object mapping, not a UI edge** — `toPaginationProps` returns `{ currentPage, totalPages, baseUrl, pageParam }`; neither `ui` nor `contract` imports the other (the UI component's props are structural).
- **Cursor comparison uses Drizzle `gt`/`lt`** bound values, AND-composed with the caller's conditions — standard parameterised path, no raw SQL (security S1).
- **Unit tests stub the Drizzle builder** — no live PostgreSQL in the unit suite (per docs/testing.md); the pure paginator needs no DB at all.
- **Child dependency order**: #198 (contract paginator) → #199 (drizzle helper + UI binding, adds the deps edge) → #200 (core resource + cli generator) → #201 (docs).
