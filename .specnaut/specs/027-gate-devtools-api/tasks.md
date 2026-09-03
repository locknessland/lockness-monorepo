# Tasks: Gate the devtools data & mutation routes behind authorization

**Issue:** [#161](https://github.com/locknessland/lockness-monorepo/issues/161)
· **Branch:** `027-gate-devtools-api` · **Plan:** [plan.md](plan.md)

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]** = parallelizable (different files, no dependency on an incomplete task).
- Tests are requested (issue AC + plan SC-001..007); TDD — failing test first.
- **🔒 Decision-table homes are binding** (plan §5): the authorization *decision*
  lives only in `packages/devtools/gate.ts`; the route *wiring* only in
  `packages/devtools/mod.ts`. A task must not put a decision anywhere else.

## Path Conventions

`packages/devtools/` (gate, routes, config, tests, docs) and
`packages/hono/mod.ts` (one additive re-export).

---

## Phase 1: Setup (Shared Infrastructure)

No project-init work — an existing package. Proceed to Foundational.

## Phase 2: Foundational (Blocking Prerequisites) — BLOCKS all user stories

- [X] T001 [P] Add a runtime Deno `getConnInfo` re-export to `packages/hono/mod.ts` (currently only the `GetConnInfo` *type* is exported; verified absent). Additive; JSDoc with `@example`. Keeps `hono`'s allow-list `[]` (resolves to external `hono/deno`). *(plan FR-007)*
- [X] T002 [P] Add optional `token?: string` and `authorize?: (c: Context) => boolean | Promise<boolean>` to `DevtoolsConfig` in `packages/devtools/types.ts`, with full JSDoc. Import `Context` type from `@lockness/hono`. *(plan FR-003/FR-004; no `any` — hard rule #3)*
- [X] T003 Write **failing** unit tests for the decider in `packages/devtools/tests/gate.test.ts` (TDD red): loopback peer → allow; non-loopback peer → deny; undetectable peer → deny (fail-closed); token configured → correct Bearer allows from any host, wrong/absent denies; token compare is constant-time (uses the timing-safe primitive, no early-exit); forwarding header (`X-Forwarded-For`/`Forwarded`/`X-Real-IP`) revokes loopback trust → deny; `Host` outside the localhost allowlist → deny; precedence `authorize › token › default`; `authorize` awaited — a callback returning a rejected Promise or throwing → deny; gate-internal throw → deny + WARN log. *(plan SC-001..005, FR-005/006/009/010/011)*
- [X] T004 Implement `authorizeDevtools(c, cfg)` in `packages/devtools/gate.ts` (TDD green) — the **single decider** (🔒 home): resolve `config.token ?? Deno.env.get('LOCKNESS_DEVTOOLS_TOKEN')` once; precedence `authorize › token › default` (FR-009); constant-time token compare inside the function (FR-006, not via `bearerAuth`); loopback predicate + FR-011 hardening (forwarding-header revocation, Host allowlist) beside it; `await` the callback inside a `try/catch` that denies **and** logs at WARN via `collector.addLog` (FR-010, no silent catch); fail-closed on any error / undetectable peer (FR-005). Full JSDoc. Do not touch `devtoolsActive()`.
- [X] T005 Apply the gate in `enableDevtools()` in `packages/devtools/mod.ts` (🔒 wiring home): register the gate middleware on **both** `app.use(basePath, …)` and `app.use(basePath + '/*', …)` so the bare `/_devtools` dashboard is covered; on deny emit **one** `401` shape with an empty body (the single denial-response home); remove the stray `console.log('[Devtools] Dashboard route hit!')` at `mod.ts:197`. *(plan §5 Row 1/Row 6, FR-001)*
- [X] T006 Update the 7 `enableDevtools` call sites in `packages/devtools/tests/debug_panels.test.ts` to inject loopback conn-info via `app.request(path, init, env)` (or a token) so the existing route tests keep passing under the gate. *(plan §6, audit F5)*

**Checkpoint:** `deno test -A packages/devtools/tests/gate.test.ts packages/devtools/tests/debug_panels.test.ts` green; the decider exists and is wired.

## Phase 3: User Story 1 — Local developer keeps zero-config access (P1) 🎯 MVP

**Independent test:** loopback, nothing configured → dashboard + `/api/data` succeed.

- [X] T007 [US1] Integration test in `packages/devtools/tests/gate_routes.test.ts` — active devtools, no credential, **loopback** conn-info injected: `GET /_devtools` and `GET /_devtools/api/data` return `200` with collector data. *(plan SC-002)*

## Phase 4: User Story 2 — Remote unauthenticated caller is denied (P1)

**Independent test:** non-loopback, nothing configured → every route denied, no mutation.

- [X] T008 [US2] Integration test (`gate_routes.test.ts`) — active devtools, no credential, **non-loopback** conn-info: each of the four routes (`GET /_devtools`, `GET /_devtools/api/data`, `GET /_devtools/api/component-tree/:name`, `POST /_devtools/clear`) returns `401` with zero collector fields; assert `POST /_devtools/clear` did **not** wipe the collector. *(plan SC-001)*

## Phase 5: User Story 4 — Proxied host does not silently trust remote callers (P1)

**Independent test:** loopback peer + forwarding header, or a foreign Host → denied.

- [X] T009 [US4] Integration test (`gate_routes.test.ts`) — loopback conn-info **plus** `X-Forwarded-For` present, no credential → `401` (trust revoked); and a request whose `Host` is not in the localhost allowlist → `401`. *(plan SC-004)*

## Phase 6: User Story 3 — Operator opens remote access deliberately (P2)

**Independent test:** with a token / `authorize`, credentialed calls succeed from any host; bad ones denied.

- [X] T010 [US3] Integration test (`gate_routes.test.ts`) — (a) `token` configured: correct `Authorization: Bearer` from a non-loopback peer → `200`, wrong/absent → `401` (SC-003); (b) `authorize` returning `true` → `200`, returning `false` → `401`, throwing / rejected Promise → `401` (SC-005). *(plan SC-003/SC-005, FR-004/FR-010)*

## Phase N: Polish & Cross-Cutting Concerns

- [X] T011 [P] Document the gate: add a "Securing the devtools endpoints" section to `packages/devtools/docs/DOCS.md` (default loopback posture, `token`, `authorize`, the reverse-proxy caveat, token hardening — CSPRNG 128-bit+ token, no per-attempt lockout, never trust `X-Forwarded-For` to *grant*), and a short pointer in `packages/devtools/README.md`. *(plan FR-008)*
- [X] T012 [P] Add the "endpoints are gated" pitfall to `packages/devtools/AGENTS.md`, then regenerate its generated blocks with `deno task agents:brief`.
- [X] T013 Run `deno task deps:analyze` (assert no new `devtools` edge — SC-006) and the full pre-completion gate `deno fmt && deno lint && deno check && deno task test` (SC-007). Fix any red before done.

---

## Dependencies & Execution Order

### Phase dependencies

- **Foundational (Phase 2)** blocks everything. Within it: T001, T002 are `[P]`
  (different files); T003 (red) precedes T004 (green); T004 precedes T005;
  T005 precedes T006.
- **User Stories (Phases 3–6)** all depend only on Foundational; each is an
  independent integration test and they may be written in parallel.
- **Polish** depends on the stories being green. T011, T012 are `[P]`; T013 last.

### Parallel opportunities

- Phase 2: `T001` ∥ `T002`.
- Phases 3–6: `T007` ∥ `T008` ∥ `T009` ∥ `T010` (distinct assertions; may share
  `gate_routes.test.ts` — coordinate if written concurrently).
- Polish: `T011` ∥ `T012`.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (US1):** the decider, wired, with loopback access
proven. But **US2 (deny remote) is the security point of the feature** — ship
Phases 2–6 together; US1 alone would gate nothing observable. All four US phases
validate one shared gate, so they land in the same increment.

**Commits (squash-by-scope at merge):** `feat(161)` for the bridge re-export +
gate + config + wiring + tests; `docs(161)` for DOCS/README/AGENTS.
