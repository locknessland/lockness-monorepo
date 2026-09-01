# Tasks: Memoize the session driver per process

**Input**: `.specnaut/specs/008-memoize-session-driver/plan.md` (the only design document).
**Branch**: `008-memoize-session-driver` | **Backlog**: [#138](https://github.com/locknessland/lockness-monorepo/issues/138)

**Scope**: Redis is **gated** (stop-1 decision) — it stays a first-class per-request branch; its
memoization is the follow-up issue. This branch delivers memory + deno-kv memoization, the
memory-persistence P0, single-flight acquisition, and the `close()` shutdown wiring.

**Tests**: included, written first (TDD). Deno-specific pieces (single-flight promise idiom,
`Deno.Kv` close semantics, resource/op sanitizers) consult the `deno-expert` skill during implement.

## 🔒 Decision-table homes carried forward (plan §5)

| Decision | Home |
| :--- | :--- |
| Which instance serves a resolved config | `drivers/registry.ts` — `getOrCreateDriver` |
| Config resolved per request, never memoized (#137) | `middleware.ts:62` — unchanged |
| Per-request vs memoized — **cookie AND redis are first-class per-request branches** | `drivers/registry.ts` — explicit branches before any memo lookup |
| The memo key (no redis key while gated; never the password) | `drivers/registry.ts` — `driverKey` |
| When a resource is released | each driver's `close()` + its `registerDisposable` handle; drained by core `shutdown_sequence.ts:273` |
| The memo's reset/clear lifecycle (close-then-clear, branch on capability) | `drivers/registry.ts` — `resetDriverRegistry` |
| Whether redis is memoized | gated — the redis branch + the follow-up issue |

---

## Phase 1: Setup — the dependency edge and the registry skeleton

- [ ] T001 Add `"@lockness/contract": "jsr:@lockness/contract@^0.2.0"` to `packages/session/deno.json` imports, add `"contract"` to `session.allow` in `deps.policy.jsonc`, and run `deno cache` to materialise `deno.lock` (never hand-edit it). Do NOT run `deno task deps:analyze` yet — it will pass once the import exists (T003).
- [ ] T002 [P] Create `packages/session/drivers/registry.ts` with `@fileoverview`/`@module` and stub signatures: `getOrCreateDriver(c: Context, config: SessionConfig): SessionDriver`, `driverKey(config: SessionConfig): string`, and `resetDriverRegistry(): void`. Full JSDoc; document the per-request/per-process split as this file's single home (architecture Finding 4 — the `Context` is used only on the cookie branch). Not re-exported from `mod.ts` (§8).

## Phase 2: Foundational — the memo core (blocks every user story)

- [ ] T003 In `drivers/registry.ts`, implement `driverKey(config)`: canonical string over `driver`, `kvPath`, and redis `hostname`/`port`/`db` — **compute NO key for the `redis` branch while gated** (security Finding 1), and **never** include the password (§5 row 6). Implement `getOrCreateDriver`: explicit `cookie` branch (per-request `new CookieSessionDriver(c, config)`) and explicit `redis` branch (per-request, via `createDriver`) BEFORE the memo lookup; `memory`/`deno-kv` look up a module-level `Map<string, SessionDriver>` by `driverKey` and construct-on-miss. `deno check` it.
- [ ] T004 Implement `resetDriverRegistry()`: for each memoized driver, call `close()` if present else `clear()` if present (branch on capability — `close?` is optional, `MemorySessionDriver` has `clear()`), then clear the `Map` (architecture Finding 1 / FR-010). Register one registry-level disposable that calls `resetDriverRegistry` so shutdown clears the memo; idempotent close makes the overlap with core's drain safe.
- [ ] T005 Reroute `middleware.ts:64` from `createDriver(c, sessionConfig)` to `getOrCreateDriver(c, sessionConfig)`. The per-request config resolution at `:62` stays exactly as is (#137). `deno check` the file.

## Phase 3: US1 — a memory login persists across requests (P1)

- [ ] T006 [US1] In `packages/session/tests/driver_memo.test.ts`, write the FR-008 persistence test: drive the real `sessionMiddleware` with `driver: 'memory'`, POST to a `/set` route, then GET a `/get` route on a second request with the returned cookie, and assert the value written on request 1 is read on request 2. Reset the registry in setup. It fails today (fresh Map per request). Record the failure. This replaces the false-green shape of [#142](https://github.com/locknessland/lockness-monorepo/issues/142).
- [ ] T007 [US1] Confirm T003's memo makes T006 pass (memory driver now memoized per config). Add the FR-007 identity assertion: two requests resolve the **same** `MemorySessionDriver` instance.

## Phase 4: US2 — deno-kv holds one handle, single-flighted (P1)

- [ ] T008 [US2] Single-flight `DenoKvSessionDriver.getKv` (FR-012): cache the in-flight promise (`this.kvPromise ??= Deno.openKv(this.kvPath)`) so a concurrent burst opens one handle. Register the disposable when the handle is acquired and deregister in `close()` — the `@lockness/cache/drivers/deno_kv_driver.ts` pattern, via `@lockness/contract/lifecycle/internal`. Consult `deno-expert` for the promise-cache idiom and `Deno.Kv.close` semantics.
- [ ] T009 [US2] In `driver_memo.test.ts`, write FR-009: drive **two concurrent** first-requests through a memoized deno-kv driver and assert exactly one `Deno.Kv` handle is opened (spy/count on `getKv` or on `disposableCount`), and identity across requests. The concurrency is the point — a sequential test would not exercise the race (security Finding 2). Close/drain in a `finally`; watch the resource sanitizer.

## Phase 5: US3 — cookie and redis stay per-request (P1)

- [ ] T010 [US3] In `driver_memo.test.ts`, assert **non-identity** across two requests for `cookie` AND for `redis` (FR-007 / security Finding 1). The redis assertion is the gate: it goes red the instant redis enters the memo. Constructing the redis branch must not require a live server — assert the returned instances are distinct objects without connecting.

## Phase 6: US4 — handles released at shutdown (P2)

- [ ] T011 [US4] In `driver_memo.test.ts`, write FR-006/US4: register a memoized deno-kv driver, drain the disposables registry (`drainDisposables()` then run each `dispose()`), and assert the driver's `close()` ran and the handle is released exactly once (idempotent close verified by draining twice). Reset the registry after.

## Phase 7: Polish & cross-cutting

- [ ] T012 [P] Repoint `packages/session/drivers/redis.ts:24`'s comment from #138 to the Redis follow-up issue (the memoization + mutex + single-flight connect owner) — architecture Finding 3.
- [ ] T013 [P] Wire `resetDriverRegistry()` into the session tests' lifecycle (shared helper or per-test setup) so the process-wide memo does not leak state between tests (FR-010 / SC-005). Verify with `deno test --shuffle`.
- [ ] T014 [P] Full gate: `deno fmt && deno lint && deno check packages/session/**/*.ts && deno task test`. All green.
- [ ] T015 [P] `deno task deps:analyze` — the one new `session → contract` edge is declared and passes; `deno.lock` changed only by that edge's resolution (SC-004).
- [ ] T016 [P] `deno task agents:brief` — `packages/session/AGENTS.md` dependency-contract block gains the `contract` edge; the public-surface table is unchanged (registry is internal). Commit as `chore(codegen)`.
- [ ] T017 Invoke `review` on the frozen tree.

---

## Dependencies

```
T001 ─┬─ T002 ─ T003 ─ T004 ─ T005 ─┬─ US1 (T006→T007)
      │                             ├─ US2 (T008→T009)
      │                             ├─ US3 (T010)
      │                             └─ US4 (T011)
      └───────────────────────────────── Polish (T012‥T017)
```

- **T003 (getOrCreateDriver + driverKey) blocks every user story.**
- **T005 (the middleware reroute)** is what makes the memo live in the real request path.
- US1–US4 are independent once the core lands; T013's reset hook must be in place before the suite is run order-independently (T014).

## Parallel opportunities

- T002 skeleton, T012 comment, T014–T016 checks are `[P]`.

## MVP

**US1 (T001–T007)** is the checkpoint that closes the P0 — a memory login persists. US2 stops the
deno-kv handle leak; US4 wires shutdown release. Redis is out of scope by the stop-1 decision and
tracked in the follow-up. Ship the full gated path.
