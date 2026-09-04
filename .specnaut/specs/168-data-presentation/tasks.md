# Tasks: Data presentation — pagination + API resources (epic #197)

**Plan**: [plan.md](./plan.md) | **Branch**: `168-data-presentation` | **Epic**: #197

**Epic loop unit = one child = one commit.** The four children below are the loop's
dependency-ordered units; their commit scope position carries `T01`…`T04`. The `T00N`
IDs inside each child are the *internal* decomposition (TDD steps) and produce **one**
commit per child — they are NOT the loop counter (see `phases/epic-loop.md`).

TDD is mandatory (constitution): failing test first, minimal code to pass, refactor.
Each child ends on the **fast gate** (`run-gate.sh fast`); the full gate + review run at
the end of `implement`.

Decision-table homes (plan §5) are binding — a task may not place a decision anywhere but
its named home.

---

## Child T01 — #198 contract paginator (foundation, no deps)

**Goal**: pure DB-agnostic paginator in `@lockness/contract`. Home for the envelope shape,
offset/cursor compute, clamps, request-param read, and the UI mapping (plan §5 rows 1–6).
**Independent test**: unit tests exercise offset + cursor envelopes, clamps and mapping with
**no DB** — pure functions.

- [ ] T001 [US1] Write failing tests in `packages/contract/tests/pagination.test.ts`: `paginateOffset` envelope fields (`total`/`perPage`/`currentPage`/`lastPage`/`from`/`to`; links `first`/`last`/`prev`/`next`/`self` **relative**, prev/next null at boundaries); `paginateCursor` (`perPage`/`nextCursor`/`prevCursor`/`hasMore`, **no `total`**); `clampPerPage` (max + default), `clampPage` (floor ≥1 **and** ceil to lastPage); `readPaginationParams`; `toPaginationProps` forwards `pageParam`; empty-set and oversized-`page` edge cases.
- [ ] T002 [US1] Create `packages/contract/pagination/types.ts`: `PaginationEnvelope<T>`, `OffsetMeta`, `CursorMeta`, `PaginationLinks`, `PaginationParams` (no `any`; JSDoc each).
- [ ] T003 [US1] Create `packages/contract/pagination/paginate.ts`: `DEFAULT_PAGE_PARAM`, `MAX_PER_PAGE`, `DEFAULT_PER_PAGE`, `clampPerPage`, `clampPage`, `readPaginationParams`, `paginateOffset`, `paginateCursor` (accepts a `cursorOf` position extractor — codec lives in the driver), `toPaginationProps(meta, baseUrl, pageParam?)`. Links **relative** (pathname+query), host never reflected. All homes per plan §5.
- [ ] T004 [US1] Create `packages/contract/pagination/mod.ts` barrel; add `export * from './pagination/mod.ts'` to `packages/contract/mod.ts`; add `"./pagination": "./pagination/mod.ts"` to `packages/contract/deno.json` `exports` (plan §9 / architecture A4).
- [ ] T005 [US1] Fast gate for contract; commit `feat(T01): DB-agnostic offset+cursor paginator in contract (#198)` + `Epic: #197`.

## Child T02 — #199 drizzle paginate() + UI binding (depends on T01)

**Goal**: `@lockness/drizzle` `paginate()` that **accepts caller conditions** and AND-composes
the pagination predicate; cursor codec homed here; count reuses the filter (plan §5 rows 7–8,
FR-006, S1). Adds the `drizzle→contract` deps edge.
**Independent test**: query-shape tests stub the Drizzle builder (no live PG); **SC-005 cross-tenant
test** is mandatory.

- [ ] T006 [US1] `chore(deps)`: add `@lockness/contract` to `packages/drizzle/deno.json` imports and `drizzle.allow += "contract"` in `deps.policy.jsonc`; verify `deno task deps:analyze`. **This is its own commit** (one category), landed before T02's feat commit.
- [ ] T007 [US1] Write failing tests in `packages/drizzle/tests/paginate.test.ts`: offset path issues `limit`/`offset` + a count **built from the same conditions**; cursor path issues `and(...conditions, cmp(col, cursor))` + `orderBy` + `limit` (never a bare second `.where()`); `encodeCursor`/`decodeCursor` round-trip + type-validate; **SC-005**: a query started with `where(owner=me)` returns only owner rows and `meta.total` counts only them (fails if the filter is replaced).
- [ ] T008 [US1] Create `packages/drizzle/paginate.ts`: `paginate(db, table, { where?: conditions, orderBy, page/perPage | cursor })` composing predicates via `and(...)`; `encodeCursor`/`decodeCursor` (base64url of `{column,value}`, type-validated). Feeds the contract paginator. Export from `packages/drizzle/mod.ts`.
- [ ] T009 [US1] UI binding demo/test: a test showing `toPaginationProps(offsetMeta, baseUrl)` output spreads into the `@lockness/ui` `Pagination` props (structural, no import edge either way).
- [ ] T010 [US1] Fast gate for drizzle; commit `feat(T02): drizzle paginate() with caller-filter composition + cursor codec (#199)` + `Epic: #197`.

## Child T03 — #200 core Resource base + make:resource (depends on T01)

**Goal**: opt-in `Resource`/`ResourceCollection` in `@lockness/core` (plan §5 rows 9–10, FR-007);
`make:resource` in `@lockness/cli` (FR-008). Fail-closed base + explicit-field stub (S2).
**Independent test**: Resource projects only named fields; base `toArray()` fails closed; denylist
drops secret-named fields; `ResourceCollection` from a paginated result carries `meta`/`links`;
`make:resource Foo` writes `./app/resource/foo_resource.ts` from the stub.

- [ ] T011 [US2] Write failing tests in `packages/core/tests/resource.test.ts`: abstract `toArray()` throws / a no-field subclass emits `{}` (never the whole model); central denylist (`password`/`passwordHash`/`token`/`secret`/`hash`) dropped even if named; `ResourceCollection(items, meta?)` embeds pagination `meta`/`links` when present.
- [ ] T012 [US2] Create `packages/core/resource/resource.ts` (`Resource<TModel>` base, abstract `toArray`, denylist) and `packages/core/resource/collection.ts` (`ResourceCollection`). Re-export via `packages/core/mod.ts` (`resource/` module). No `any`; JSDoc.
- [ ] T013 [US3] Write failing test in `packages/cli/tests/make_resource.test.ts`: `make:resource Post` writes `./app/resource/post_resource.ts` with an explicit-field body; registered in `MAKE_COMMANDS`.
- [ ] T014 [US3] Create `packages/cli/commands/make/resource.ts` (imports `Stub` from `packages/cli/stubs.ts` if present, else the barrel — record which per architecture A3) + `packages/cli/stubs/make/resource.stub` (explicit field list, never `{...model}`); append to `MAKE_COMMANDS` in `packages/cli/commands/make/index.ts`.
- [ ] T015 [US2] Fast gate for core + cli; commit `feat(T03): API Resource base + ResourceCollection + make:resource (#200)` + `Epic: #197`.

## Child T04 — #201 docs (depends on T01–T03)

**Goal**: worked-example docs for the paginator, drizzle helper, UI binding and resource layer (FR-009).
**Independent test**: docs render; examples are copy-pasteable and build `baseUrl` from a fixed path
(never the request Host); cursor pointed to as the large-table path.

- [ ] T016 [US4] Write `docs/pagination-and-resources.md` (or per-package DOCS.md additions): offset + cursor examples, drizzle `paginate()` with a filtered query, UI binding via `toPaginationProps`, Resource/ResourceCollection output; note the perPage cap and cursor-for-large-tables guidance.
- [ ] T017 [US4] Update the doc index in `AGENTS.md` / relevant package `DOCS.md` cross-links.
- [ ] T018 [US4] Fast gate (docs affect nothing compiled, but run fmt); commit `docs(T04): document pagination + API resources (#201)` + `Epic: #197`.

---

## Dependencies

```
T01 (#198 contract) ──┬──▶ T02 (#199 drizzle)  ──┐
                      └──▶ T03 (#200 core+cli) ──┴──▶ T04 (#201 docs)
```

- T01 blocks T02 and T03 (both consume the contract paginator).
- T02 and T03 are independent of each other (different packages) but the loop runs them
  sequentially in dependency order (one commit per child, no accumulated tree).
- T04 is last (documents the shipped surface).

## Parallel opportunities

Within T01, T002 (types) and the test authoring T001 are the TDD pair; T02 and T03 could in
principle be built in parallel, but the epic loop commits them sequentially to preserve the
one-child-one-commit match resume depends on.

## Implementation strategy

**MVP = T01 + T02** (paginate a listing end-to-end, US1). T03 (resources, US2/US3) and T04 (docs,
US4) complete the epic. All four ship in this branch; children close at the epic merge.
