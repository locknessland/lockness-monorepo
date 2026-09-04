# Plan: Optional role/permission (RBAC) model on gates

**Branch**: `163-rbac-roles-permissions` | **Date**: 2026-09-04 | **Backlog item**: [#195 — Add role/permission model + @lockness/auth integration](https://github.com/locknessland/lockness-monorepo/issues/195)

**This is the feature's one planning document.** Part of epic [#191 — Authorization layer (policies / gates / RBAC)](https://github.com/locknessland/lockness-monorepo/issues/191). Sibling #195; #196 (e2e docs + tests) and #243 (PKCE) ship separately.

---

## 1. Why this exists

Epic #191 already shipped the authorization primitives: a `Gate` (abilities, `before` hooks), string-namespaced policies with dotted-ability resolution, and the `@Authorize`/`@Can` route decorators (#192–#194). What is missing is the layer every mature framework offers on top of a gate — **roles that group permissions**, so an app can say "an `editor` may `post.update`" once, assign the `editor` role to users, and have gate checks pass without a bespoke `gate.define` per ability per user.

Today an app must hand-write a `before` hook that reads its own role storage and re-implements permission matching. That is boilerplate every Lockness app that wants RBAC will write, and each will spell the matching rule slightly differently. This is **competitive gap #1** from the framework audit: Laravel (spatie/permission), AdonisJS (bouncer), Symfony (voters + roles) and Django all ship this.

The layer must be **optional**: an app using bare gates and policies keeps working with zero behaviour change.

## 2. User scenarios

### US1 — role grants an ability (P1)

**Given** a gate wired with an RBAC repository, and a user assigned the `editor` role whose permissions include `post.update`
**When** the app calls `gate.can(user, 'post.update', post)`
**Then** the check passes because a role permission matches the ability — no `gate.define('post.update', …)` was needed.

### US2 — wildcard permission (P1)

**Given** a user with a role carrying the permission `post.*`
**When** the app checks `post.update`, `post.delete` or `post.publish`
**Then** all pass; a permission `*` grants every ability (superadmin).

### US3 — RBAC stays additive (P1)

**Given** a user whose roles do **not** grant `post.delete`, but a `gate.define('post.delete', …)` (or a policy) that would allow it
**When** the app checks `post.delete`
**Then** the RBAC layer does not deny — it falls through, and the defined ability/policy decides. RBAC only ever **grants**.

### US4 — the layer is opt-in (P1)

**Given** an app that never wires an RBAC repository
**When** it uses gates and policies exactly as before #195
**Then** behaviour is byte-for-byte unchanged; nothing about RBAC is active.

### Edge cases

- A user with no roles → contributes no permissions → RBAC never grants (falls through).
- An unknown/empty ability string → no permission matches → falls through.
- A role referencing a permission that is itself a namespace prefix (`post`) → matches only the exact ability `post`, not `post.update` (only `post.*` or `*` match a namespace).
- A nested ability (`post.comment.delete`) checked against `post.*` → does **not** match (`.*` is one segment); only `post.comment.*` or `*` grant it.
- The repository throws (e.g. DB down) → the failure must not silently grant; it surfaces (constitution: no silent catch).
- Two `before` hooks registered (an admin allow-all plus the RBAC hook) → order-independent, because every hook returns `true` (grant) or `undefined` (fall through), never `false`.

## 3. Requirements

- **FR-001**: A `Permission` is a string ability pattern. It matches a requested ability by one of: exact equality; a trailing `.*` wildcard matching **exactly one further segment** under the namespace (`post.*` matches `post.update` but **not** `post.comment.delete`); or the global `*` matching every ability. Matching is decided in exactly one place, using **plain string operations only** — never a `RegExp` built from the pattern (a literal `.` must not become "any char", and pattern-derived regexes are a ReDoS / over-match sink). No `startsWith`-style prefix test (`post` must not match `post.update`). Its full behaviour is pinned as a match/no-match **truth-table TDD acceptance criterion**. The dotted grammar it reads is the same one `Gate.can` uses to split `namespace.method` — a future dotted convention must update both.
- **FR-002**: A `Role` has a stable `name` (its identity) and a set of `Permission` patterns.
- **FR-003**: A `RoleRepository` port resolves the roles of a user asynchronously, keyed by the user's **stable identity only** — `RbacIdentity = { id: Authenticatable['id'] }`, **not** the whole `Authenticatable`. Passing the full record would hand every adapter (Drizzle, HTTP, cache) the hashed `password` and arbitrary custom fields, inviting leakage via logs/cache-keys/external calls; narrowing the port after adapters exist is a breaking change (S3). The framework ships an in-memory `StaticRoleRepository`; persistent stores (Drizzle) are an app/adapter concern, out of scope here.
- **FR-004**: A user's **effective permissions** are the union of the permission patterns of all roles the repository returns for that user. Computed in exactly one place.
- **FR-005**: RBAC integrates as a **fallback resolver** (Q1 → B). `Gate` gains a `fallback(resolver)` registration and a `#fallbacks` list; in `can()`, fallbacks are consulted **only after** abilities and dotted policies produced no match, just before the deny-by-default return — the first resolver returning `true` grants, otherwise the gate stays deny. `rbacResolver(repository)` is such a resolver, and `useRbac(gate, repository)` registers it. RBAC therefore **only fills abilities that have no explicit rule**; any explicit ability or policy (including a subject-aware ownership/tenancy policy) is authoritative and is never bypassed. RBAC can never turn an allow into a deny.
- **FR-006**: RBAC is **opt-in**. No RBAC hook is registered on the default `gate` singleton, at boot, or as an import side-effect. It is active only after the app calls `useRbac`/`gate.before(rbacGate(...))`.
- **FR-007**: If the repository rejects, the rejection propagates to the caller of `gate.can`/`authorize` (which already awaits hooks); RBAC does not swallow it and does not grant on error.
- **FR-009**: RBAC's fallback precedence is documented and tested as an intentional property (S2): a test asserts that an ownership policy denying a non-owner is **not** overridden by a role grant of the same ability. The `useRbac` JSDoc also documents that `Gate.reset()` clears fallbacks (so `useRbac` must be re-applied after a reset, A5), and — for the separate `before`-hook mechanism — that order-independence holds only while every hook obeys never-`false` (S4).
- **FR-008**: The **public** surface exported from `@lockness/auth` is exactly: `Permission`, `Role`, `RoleRepository`, `RbacIdentity`, `StaticRoleRepository`, `rbacResolver`, `useRbac` (7 symbols), plus the `Gate.fallback()` method on the existing `Gate`/`gate`. `permissionMatches` and `effectivePermissions` stay **internal** to `rbac.ts` — they have no consumer outside it, and publishing them would freeze the wildcard grammar as a compatibility contract. Every export carries full JSDoc; the internal helpers are unit-tested via same-package import.

## 4. Success criteria

- **SC-001**: An app can grant an ability to a user purely by assigning a role, with no per-ability `gate.define`, in ≤ 3 lines of wiring (`useRbac(gate, repo)` + role/permission data).
- **SC-002**: An app that does not wire RBAC observes identical gate/policy behaviour to the pre-#195 build (the existing gate/policy/decorator test suites pass unchanged).
- **SC-003**: A user with `post.*` is authorized for every `post.<x>` ability and denied for a `comment.<x>` ability they hold no permission for.
- **SC-004**: RBAC never turns an allow into a deny: for any ability an app's gates/policies would grant, wiring RBAC leaves it granted.
- **SC-005**: RBAC never widens a subject-scoped policy into a blanket grant: an ownership policy that denies a non-owner for `post.update` still denies them after a role grants `post.update` (the explicit policy is authoritative).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Whether a permission pattern matches a requested ability (exact / `ns.*` / `*`) | `packages/auth/rbac.ts` — internal `permissionMatches(pattern, ability)` | Re-implementing the wildcard/prefix test inside the before-hook, the repository, or a controller |
| A user's effective permissions = union of their roles' permissions | `packages/auth/rbac.ts` — internal, named `effectivePermissions(roles)` function called by `rbacResolver` | Computing/deduping the union inside a `RoleRepository` implementation, or inline in the closure |
| RBAC is a **fallback** — consulted only when no explicit ability/policy decided; it grants or abstains, never denies (Q1 → B) | `packages/auth/gate.ts` — `#fallbacks` run after abilities+policies in `can()`; `packages/auth/rbac.ts` — `rbacResolver` | A `before` hook (would override policies — the rejected Q1 option A); any resolver returning `false` to force a deny |
| On repository error, the rejection propagates from `rbacResolver`; RBAC neither swallows it nor grants (FR-007) | `packages/auth/rbac.ts` — the `rbacResolver` has **no** `try/catch` | Any `try/catch` in a `RoleRepository` or a caller that converts a rejection to `undefined`/`false` |
| RBAC is opt-in — active only after the app wires it | The app's explicit `useRbac(gate, repo)` (or `gate.fallback(rbacResolver(repo))`) **call site** | Registering the resolver in `packages/auth/mod.ts`, in an `@OnBoot`, or as an import side-effect. Enforced by SC-002 + a guard test asserting that importing `@lockness/auth` registers zero fallbacks/before-hooks on a fresh gate |
| How a user's roles are stored/loaded | The app-provided `RoleRepository` implementation (framework ships only `StaticRoleRepository`) | A concrete DB query inside `rbac.ts` or the gate |

## 6. Technical context

**Language/Version**: TypeScript on Deno (TC39 Stage-3 decorators), matching the workspace.
**Primary Dependencies**: `@lockness/auth` internal only (`Authenticatable`, `Gate`). No new package dependency; no new workspace member. `Gate` gains a `fallback()` extension point (additive; existing behaviour unchanged with zero fallbacks registered).
**Storage**: N/A in-framework — role storage is the app's `RoleRepository`. The shipped `StaticRoleRepository` is in-memory (a `Map`).
**Testing**: `deno test` — unit tests under `packages/auth/tests/` (TDD, red→green).
**Target Platform**: Deno server / library.
**Project Type**: library (a module inside `@lockness/auth`).
**Performance Goals**: `permissionMatches` is O(pattern length); an effective-permissions resolution is O(total permissions across the user's roles). `rolesFor(user)` runs per gate check — apps with a DB-backed repository are expected to cache; documented, not enforced here.
**Constraints**: No `any` in exports; no direct `hono` import; JSR specifiers; RBAC additive-only.
**Scale/Scope**: One new module (`rbac.ts`) + a small `Gate.fallback()` extension in `gate.ts`, 7 public exports (2 helpers stay internal), one in-memory store. No migration, no new package.

### Domain model

- **Bounded context**: Authorization (`@lockness/auth`), extending the gate primitive.
- **Vocabulary**: *ability* (a checked action string, e.g. `post.update`), *permission* (a granted pattern, e.g. `post.*`), *role* (a named permission group), *effective permissions* (union over a user's roles), *additive grant* (RBAC may allow, never forbid).
- **Entities** (identity): `Role` — identified by `name`; owns its permission set.
- **Value objects** (no identity): `Permission` — a pattern string; interchangeable by value.
- **Invariants**: RBAC is a fallback — an explicit ability/policy is always authoritative and never bypassed; RBAC grants or abstains, never denies; permission→ability matching has one implementation; RBAC contributes nothing until wired.
- **Out of scope**: persistent (Drizzle) role storage; a `make:role` generator; role hierarchy/inheritance; per-team/tenant scoping; UI for role management. (These become follow-ups if wanted.)

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | `rbac.ts` imports only `./types.ts` and `./gate.ts`. |
| JSR-only specifiers | pass | No new dependency. |
| No `any` in exported APIs | pass | Generic `<User extends Authenticatable>`; patterns are `string`. |
| Tailwind v4 syntax | pass | No UI surface. |
| Pre-completion gate | pass | `deno fmt && deno lint && deno check && deno task test` before done. |
| Never edit `deno.lock` manually | pass | No dependency change. |
| JSDoc on public APIs | pass | FR-008. |
| MVC layering | pass | Port + in-memory adapter; no DB query in the primitive. |
| Commit discipline | pass | `feat` for code+tests, `docs` separately. |
| TDD | pass | Tests first per module. |
| DDD layering | pass | Pure matching + resolver (no I/O); repository is the port; store is an adapter. |
| No silent catches | pass | FR-007 — repository rejection propagates. |

### Complexity tracking

No violations.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/auth` public API | yes | Adds 6 exports via `mod.ts`: `Permission`, `Role`, `RoleRepository`, `StaticRoleRepository`, `rbacGate`, `useRbac`. `permissionMatches` + `effectivePermissions` stay internal (A3). |
| `Gate` (existing) | yes | Gains `fallback(resolver)` + `#fallbacks`, consulted after abilities/policies in `can()`. Existing behaviour unchanged with zero fallbacks; existing gate/policy/decorator tests unaffected. |
| CLI / stubs | no | No `make:role` in this ticket (out of scope). |
| Drizzle / persistence | no | Storage is the app's `RoleRepository`. |
| Docs | yes (separate `docs` commit) | `packages/auth/docs/DOCS.md` authorization section gains an RBAC subsection. |

### Documentation (this feature)

```text
.specnaut/specs/163-rbac-roles-permissions/
├── plan.md    # This file — the whole plan
└── tasks.md   # tasks output, derived from THIS file once approved
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Wildcard `*`/`ns.*` grants more than intended | Matching is one small, exhaustively unit-tested function; `*` is documented as superadmin; no implicit prefix matching (bare `post` ≠ `post.update`). |
| `rolesFor(user)` per check is a hot path with a DB-backed repo | Port is async; docs state apps should cache; `StaticRoleRepository` is O(1). No caching baked into the primitive (YAGNI). |
| A future deny-requirement tempts someone to return `false` from the hook | Invariant + decision-table row + a test asserting the hook never denies an otherwise-allowed ability. |
| Someone auto-wires RBAC and breaks the "optional" guarantee | Decision-table row (home = the `useRbac` call site) + SC-002 test + a guard test asserting `import '@lockness/auth'` registers zero `before` hooks on a fresh gate. |
| `gate.reset()` silently drops the RBAC hook (test isolation, hot reload) | Documented in `useRbac` JSDoc and DOCS: `reset()` clears `before` hooks, so `useRbac` must be re-applied after a reset; a test asserts this is intentional. |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 (MEDIUM) | "Opt-in = absence of default registration" is not an addressable, enforceable home | **Plan changed** — decision-table row 5 re-homed to the app's explicit `useRbac(gate, repo)` call site; "no default registration" demoted to an invariant enforced by SC-002 + a guard test (importing `@lockness/auth` registers zero `before` hooks). |
| A2 (MEDIUM) | FR-007 (repository error propagates; never swallow, never grant-on-error) had no decision-table row | **Plan changed** — added the error-propagation row (home = the `rbacGate` hook, no `try/catch`); a test will assert a throwing repository *rejects* `gate.can` rather than resolving `false`. |
| A3 (MEDIUM) | FR-008 over-exported internal rules, freezing the wildcard grammar as a public contract | **Plan changed** — FR-008 + §6 + §8 now keep `permissionMatches` and `effectivePermissions` internal; public surface is 6 symbols (port, adapter, `rbacGate`, `useRbac`, `Permission`, `Role`). Matcher tested via same-package import. |
| A4 (LOW) | Effective-permissions resolver buried in the `rbacGate` closure, not addressable | **Plan changed** — decision-table row 2 now names an internal `effectivePermissions(roles)` function. |
| A5 (LOW) | `gate.reset()` silently deregisters the RBAC hook — undocumented footgun | **Plan changed** — added a risk row; `useRbac` JSDoc + DOCS will document it, backed by a test. |
| A6 (LOW) | Nested-wildcard depth unspecified; dotted grammar parsed in two places | **Plan changed** — FR-001 pins `ns.*` to exactly one further segment and notes the shared grammar with `Gate.can`; edge case added for `post.comment.delete`. |
| A7 (LOW) | Export count inconsistent (§6 "~5" vs §8 lists 7) | **Plan changed** — stated once as 6 public exports (2 helpers internal). |

**Verdict**: needs_followup → all folded. Design sound and genuinely additive — opt-in, fail-closed-preserving, correct home for matching, blast radius on existing code counted at **zero** (37 importers of `@lockness/auth` unaffected; 1 production `gate` call site unaffected; 0 existing tests change). No CRITICAL/HIGH. Coverage: full `plan.md`, grounded against `gate.ts` / `types.ts` / `decorators.ts` / `mod.ts` and all existing gate/policy/decorator tests.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 (MEDIUM) | Permission-match grammar under-specified — a `startsWith`/regex/any-depth implementation silently over-grants (prefix, deep-namespace, or regex `.` over-match / ReDoS) | **Plan changed** — FR-001 now mandates plain string ops (no `RegExp` from the pattern, no `startsWith` prefix test), one-segment `.*`, and a match/no-match truth-table TDD acceptance criterion. |
| S2 (MEDIUM; **HIGH for multi-tenant**) | RBAC grant via a `before` hook is subject-blind and short-circuits a subject-aware ownership/tenancy policy of the same ability name → an authenticated role-holder can act on **any** user's / tenant's record | **Plan changed (Q1 → B).** RBAC is a **fallback resolver** (`Gate.fallback()`), consulted only when no explicit ability/policy decided — ownership/tenancy policies are authoritative and never bypassed. Encoded in FR-005, FR-009, the decision table, and SC-005 (a denying ownership policy is not widened by a role grant). The dangerous override path is designed out, not merely documented. |
| S3 (MEDIUM, leans LOW) | `RoleRepository` port received the full `Authenticatable` (incl. hashed `password`); narrowing later is a breaking change | **Plan changed** — FR-003 narrows the port to `RbacIdentity = { id }`. |
| S4 (LOW) | `before`-hook order-independence is an unenforced convention; a deny-hook composed with RBAC makes order significant | **Plan changed** — FR-009 documents the never-`false` convention and the ordering caveat in the `useRbac` JSDoc. |

**Positive confirmations (no action):** FR-006 opt-in is structurally sound (no default registration, verified against the gate's before-hook mechanics); FR-007 error propagation is correct fail-closed (traced `rolesFor` rejection → `can` → `authorize` → middleware → 500/deny) — the only trap is a catch-and-grant/swallow, which FR-007 forbids and a test will assert; the additive-only invariant is sufficient to preserve the gate's deny-by-default. `confirms #165` — a propagated repository error reaches Hono as a raw 500; #165's dev-only detail gating is the correct compensating control and RBAC does not change that surface.

**Verdict**: needs_followup → S1/S3/S4 folded; S2 raised as Q1 for the user. No CRITICAL/HIGH. The fail-closed core is sound. Coverage: full `plan.md` grounded against `gate.ts` / `types.ts` / `decorators.ts`, plus the access-control and error-handling security-domain memory.

## 12. Open questions

*Asked at the stop that ends the plan phase.*

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — RBAC precedence (from security S2).** When a role permission AND a subject-aware policy exist for the same ability (e.g. `post.update` with an ownership check): does the RBAC grant **override** the policy (A — `before` hook, Laravel-style) or act as a **fallback** consulted only when no explicit ability/policy decided (B — a small `Gate.fallback()` extension)? | **B — fallback.** RBAC is consulted only when no explicit ability/policy decided; ownership/tenancy policies are never bypassed. Safe by construction. | 2026-09-04 |

### Decided without asking

- **`.*` matches exactly one further segment** (`post.*` → `post.update`, not `post.comment.delete`) — both audits flagged the ambiguity; one-segment is the least-surprising, least-over-granting reading. `*` remains global superadmin. (A6/S1)
- **RBAC lives as a module inside `@lockness/auth`, not a new `@lockness/rbac` package** — the gate it extends lives here, the epic is scoped to auth, and a new package adds workspace/DAG/publish overhead for one small module. A split can happen later if RBAC grows.
- **`permissionMatches` + `effectivePermissions` stay internal** — no external consumer; publishing them would freeze the wildcard grammar as a compatibility contract. (A3)
- **Ship only an in-memory `StaticRoleRepository`** — persistent storage is app-specific and #195's own "Out of scope" excludes auth identity-storage internals.
- **No `make:role` generator / role hierarchy / tenancy in this ticket** — YAGNI for the MVP of the layer; each is a clean follow-up.
