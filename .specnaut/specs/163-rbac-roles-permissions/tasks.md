---
description: "Task breakdown — optional RBAC role/permission model on gates (#195)"
---

# Tasks: Optional role/permission (RBAC) model on gates

**Input**: `plan.md` in this directory (the only design document).
**Backlog**: [#195](https://github.com/locknessland/lockness-monorepo/issues/195) — child of epic [#191](https://github.com/locknessland/lockness-monorepo/issues/191).
**Tests**: REQUIRED — TDD is non-negotiable (constitution); the plan mandates a match/no-match truth table and precedence/opt-in/error tests.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable (different file, no dependency on an incomplete task).
- **[Story]**: US1–US4 from `plan.md` §2.
- Exact file paths in every task.

## Decision-table homes carried forward (`plan.md` §5)

- **Fallback semantics** ("RBAC consulted only when no explicit ability/policy decided") → `packages/auth/gate.ts` (`#fallbacks` + `can()`).
- **Permission→ability matching** → `packages/auth/rbac.ts` internal `permissionMatches`.
- **Effective-permission union** → `packages/auth/rbac.ts` internal `effectivePermissions`.
- **Error propagation (no swallow/grant)** → `packages/auth/rbac.ts` `rbacResolver` (no `try/catch`).
- **Opt-in** → the app's `useRbac(gate, repo)` call site (no default registration).

A task may not introduce a second spelling of any of these.

---

## Phase 1: Setup

- [x] T001 [P] Create `packages/auth/rbac.ts` with `@fileoverview` / `@module @lockness/auth/rbac` header (no exports yet).
- [x] T002 [P] Create `packages/auth/tests/rbac.test.ts` with `@fileoverview` header and imports (`@std/assert`, `Gate` from `../mod.ts`).

---

## Phase 2: Foundational (blocking prerequisites)

**The `Gate.fallback()` extension and the core types block every user story.**

- [x] T003 Write FAILING tests for `Gate.fallback()` in `packages/auth/tests/gate.test.ts`: (a) a fallback is consulted only when no ability and no policy matched; (b) an explicit ability/policy — allow OR deny — is authoritative and the fallback never runs for it; (c) with zero fallbacks the gate is deny-by-default (unchanged).
- [x] T004 Implement `fallback(resolver)` + private `#fallbacks` on `Gate`, consulted in `can()` **after** abilities and dotted policies and **before** the final deny, first `true` grants; update `reset()` to clear `#fallbacks`; in `packages/auth/gate.ts`. (Home: fallback decision.) Make T003 green.
- [x] T005 [P] Define and document the types `Permission` (pattern string alias), `Role` (`{ name; permissions: Permission[] }`), `RbacIdentity` (`{ id: Authenticatable['id'] }`), and the `RoleRepository` port (`rolesFor(identity: RbacIdentity): Promise<Role[]>`) in `packages/auth/rbac.ts`.

---

## Phase 3: US1 — a role grants an ability (P1) 🎯 MVP

**Goal**: assigning a role grants its permissions' abilities with no per-ability `gate.define`.
**Independent test**: a user with role `editor` (perm `post.update`) passes `gate.can(user, 'post.update')` after `useRbac`.

- [x] T006 [US1] Write FAILING truth-table tests for `permissionMatches` in `packages/auth/tests/rbac.test.ts`: exact equality matches; bare `post` does NOT match `post.update`; `post.up` does NOT match `post.update`; a literal `.` is not a wildcard (no RegExp).
- [x] T007 [US1] Implement internal `permissionMatches(pattern, ability)` in `packages/auth/rbac.ts` using plain string ops only (exact / trailing `.*` one-segment / global `*`). (Home: matching.) Make T006 green.
- [x] T008 [US1] Write FAILING test for internal `effectivePermissions(roles)` (dedup union of role permissions) in `packages/auth/tests/rbac.test.ts`.
- [x] T009 [US1] Implement internal `effectivePermissions(roles)` in `packages/auth/rbac.ts`. (Home: union.) Make T008 green.
- [x] T010 [US1] Write FAILING test: `StaticRoleRepository` + `rbacResolver(repo)` registered via `useRbac(gate, repo)` grants `post.update` to a user holding role `editor`, and denies a user with no role, in `packages/auth/tests/rbac.test.ts`.
- [x] T011 [US1] Implement `StaticRoleRepository` (in-memory `Map` keyed by `id`), `rbacResolver(repository)` (calls `effectivePermissions` + `permissionMatches`; returns `true`|`undefined`; **no `try/catch`**), and `useRbac(gate, repository)` (registers via `gate.fallback`) in `packages/auth/rbac.ts`. Make T010 green.

---

## Phase 4: US2 — wildcard permissions (P1)

**Goal**: `post.*` grants any single-segment `post.<x>`; `*` grants everything.
**Independent test**: a user with `post.*` passes `post.update`/`post.delete`, fails `comment.delete`; a user with `*` passes any ability.

- [x] T012 [US2] Write tests in `packages/auth/tests/rbac.test.ts`: `post.*` grants `post.update` and `post.delete`, does NOT grant `post.comment.delete` (one segment) nor `comment.delete`; `*` grants an arbitrary ability. Extend `permissionMatches` if red. (Home: matching — no second matcher.)

---

## Phase 5: US3 — RBAC stays additive and safe (P1)

**Goal**: RBAC never overrides an explicit policy and never swallows a repository error.
**Independent test**: an ownership policy denying a non-owner still denies after a role grants the same ability; a throwing repository rejects the check.

- [x] T013 [US3] Write test (SC-005) in `packages/auth/tests/rbac.test.ts`: policy `post.update = (u, p) => u.id === p.authorId` denies a non-owner, and STILL denies after `useRbac` grants `editor → post.update` (fallback never runs when the policy decided).
- [x] T014 [US3] Write test (FR-007) in `packages/auth/tests/rbac.test.ts`: a `RoleRepository` whose `rolesFor` rejects makes `gate.can`/`authorize` reject (assertRejects), never resolves `true`/`false`.

---

## Phase 6: US4 — the layer is opt-in (P1)

**Goal**: an app that never calls `useRbac` is byte-for-byte unchanged.
**Independent test**: importing `@lockness/auth` adds no fallback/before-hook to a fresh gate.

- [x] T015 [US4] Write test (SC-002) in `packages/auth/tests/rbac.test.ts`: a fresh `new Gate()` after `import '@lockness/auth'` grants nothing by RBAC (no default fallback registered); existing gate/policy behaviour is unchanged.

---

## Phase 7: Polish & cross-cutting

- [x] T016 Export the 7 public symbols from `packages/auth/mod.ts`: `Permission`, `Role`, `RoleRepository`, `RbacIdentity`, `StaticRoleRepository`, `rbacResolver`, `useRbac` (keep `permissionMatches`/`effectivePermissions` internal).
- [x] T017 [P] Complete JSDoc on all public exports incl. `useRbac` documenting that `Gate.reset()` clears fallbacks (A5) and the never-`false` before-hook ordering caveat (S4), with an `@example`.
- [x] T018 [P] Add an RBAC subsection to `packages/auth/docs/DOCS.md` (module-level usage; end-to-end authz docs are #196). *(separate `docs` commit)*
- [x] T019 Run the gate: `deno fmt && deno lint && deno check packages/auth/rbac.ts packages/auth/gate.ts packages/auth/mod.ts && deno task test`. Green before done.

---

## Dependencies

```
T001,T002 (setup)
   └─> T003 -> T004 (Gate.fallback)   ┐
   └─> T005 (types)                    ├─ foundational
T004,T005 ─> US1 (T006->T007, T008->T009, T010->T011)
US1 ─> US2 (T012), US3 (T013,T014), US4 (T015)
all code ─> T016 -> T017,T018 -> T019 (gate)
```

## Parallel opportunities

- T001 ‖ T002 (setup).
- T005 ‖ the T003/T004 pair (types vs gate extension — different files).
- T017 ‖ T018 (JSDoc vs DOCS.md — different files).

## Implementation strategy

- **MVP = Phase 1–3 (US1)**: a role grants a flat ability. Independently shippable and testable.
- US2–US4 harden the same module (wildcards, fallback safety, opt-in guarantee) — small increments on the MVP.
- **Commits (one category each)**: one `feat(auth)` for `gate.ts` + `rbac.ts` + `mod.ts` + `tests/` (T001–T017, T019), one `docs(auth)` for `DOCS.md` (T018). Ships on branch `163-rbac-roles-permissions`, closes #195.
