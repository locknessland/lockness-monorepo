# Tasks: Registration introspection on @lockness/container

**Feature**: #128 — Expose registration introspection on `@lockness/container`
**Branch**: `018-container-introspection`
**Plan**: `.specnaut/specs/018-container-introspection/plan.md` (approved 2026-09-02)

TDD is in force (constitution): failing test first, minimal code to pass, then refactor. Test tasks
precede their implementation. The 🔒 decision-table homes from plan §5 are named in each task that
touches a rule.

---

## Phase 1: Setup

- [x] T001 Confirm the feature branch `018-container-introspection` is checked out and the working tree is clean before starting (no new deps, no config changes needed — `@lockness/container` already depends only on `@lockness/contract`).

## Phase 2: Foundational (blocking prerequisite for all stories)

The `ContainerRegistration` type is the shared vocabulary every story reads. It has ONE home
(plan §5 row 1) and must land before the method that returns it.

- [x] T002 Add the `ContainerRegistration` interface to `packages/contract/types.ts` — `{ id: string; token: Constructor | symbol | string; resolved: boolean }`, with full JSDoc (description of each field, and the trust note that `token` is a live identity key, not a copy). Home per plan §5 row 1. No `any`.
- [x] T003 Add `registrations(): ContainerRegistration[]` to the `ContainerContract` interface in `packages/contract/types.ts`, beside the existing `size` member. JSDoc `@returns`.

## Phase 3: US1 — Enumerate registrations for display (P1)

**Goal**: a caller lists every registration's display id + resolved flag, no cast.
**Independent test**: mixed class/symbol/string tokens → one descriptor each, `id` readable, `resolved` present.

- [x] T004 [P] [US1] Write failing test in `packages/container/tests/registrations_test.ts` — empty container returns `[]`; a container with a class token, a `Symbol('X')` token and a string token returns three descriptors whose `id` values are the class name, the symbol description and the string, each `resolved: true`, and whose `token` re-looks-up via `container.get(descriptor.token)`.
- [x] T005 [US1] Implement `registrations()` on `Container` in `packages/container/container.ts` — iterate `this.services` **directly** (never `this.get()` — plan §5 "Enumeration never constructs"), reuse the existing private `describeToken()` for `id` (plan §5 row 2), compute `resolved` from map membership (plan §5 row 4, always `true` under the single map), and allocate a **new array of new objects** per call (plan §5 "fresh and inert"). Full JSDoc with `@example`.
- [x] T006 [US1] Add `ContainerRegistration` to the **named** re-export allowlists in `packages/container/mod.ts` and `packages/container/types.ts` (these barrels are not `export *`; core reach is automatic via `contract`/`core` `export *`). Confirm `import { ContainerRegistration } from '@lockness/container'` resolves.

## Phase 4: US2 — Reading must not instantiate (P1)

**Goal**: enumerating never runs a constructor.
**Independent test**: SC-002 — a service constructor increments a counter that stays at zero across enumeration.

- [x] T007 [P] [US2] Write failing test in `registrations_test.ts` — register a class token whose constructor increments a module counter, but never `get()` it (so it is absent); assert `registrations()` on that container does not contain it and the counter stays 0. Additionally: `set()` a token, snapshot `size`, call `registrations()`, assert `size` unchanged and a second `registrations()` returns equal data (no map mutation). Verifies plan §5 "Enumeration never constructs".

## Phase 5: US3 — Returned data is inert (P2)

**Goal**: mutating the return value cannot reach the container.
**Independent test**: SC-003 — mutate the array and a descriptor's `id`/`resolved`; a re-read is identical.

- [x] T008 [P] [US3] Write failing test in `registrations_test.ts` — call `registrations()`, `push` a bogus entry into the returned array and overwrite a descriptor's `id`/`resolved`; assert a fresh `registrations()` is unaffected (fresh array + fresh objects per call, plan §5 "fresh and inert"). Note the `token` field is intentionally the live key (not asserted immutable).

## Phase 6: Polish & docs

- [x] T009 [P] Update `packages/container/README.md` — document `registrations()` and `ContainerRegistration` with a worked example; add the SEC-B usage note (tokens are identifiers, not secret stores).
- [x] T010 [P] Update `packages/container/docs/DOCS.md` similarly, and record the SEC-1 consumer obligation (any surface rendering the identifier list to an untrusted user must be dev/authz-gated; see #149).
- [x] T011 [P] Update the `ContainerContract` interface stub tables in `packages/contract/AGENTS.md` and `packages/core/AGENTS.md` to list the new method + `ContainerRegistration` (stub-sync discipline, plan §8 / ARCH-5).
- [x] T012 Run the full pre-completion gate: `deno fmt && deno lint && deno check packages/container/*.ts packages/contract/types.ts && deno task test`. All green before declaring done.

---

## Dependencies

```
T001 → T002 → T003 → T004/T005/T006 (US1) → T007 (US2) → T008 (US3) → T009/T010/T011 → T012
```

- T002/T003 (foundational types) block everything that returns or names the descriptor.
- Within a story, the test task precedes its implementation (TDD).
- T009/T010/T011 (docs) are `[P]` — independent files, run in parallel once the method exists.

## Parallel opportunities

- T004, T007, T008 all touch the same `registrations_test.ts` — write sequentially in that one file, though they belong to different stories.
- T009, T010, T011 are genuinely parallel (README / DOCS / two AGENTS.md).

## MVP scope

**US1 + US2** (T001–T007) is the shippable core: enumerate registrations for display, provably
without instantiation. US3 (inert guarantee) and docs complete the AC.

## Decision-table carry-forward (plan §5)

| Rule | Home named in task |
| :-- | :-- |
| Descriptor shape | T002 (`packages/contract/types.ts`) |
| Token → id | T005 (reuse `describeToken` in `container.ts`) |
| What set is enumerated | T005 (read `this.services` directly) |
| `resolved` meaning | T005 (map membership) |
| Enumeration never constructs | T005 + T007 |
| Fresh & inert return | T005 + T008 |
