# Tasks — Production readiness (epic #217)

Derived from the approved `plan.md` v2 (both plan audits folded). Branch
`167-production-readiness`. Three sub-issues → three T-ordinal child commits;
the shared `@lockness/redis` foundation + the `deps.policy.jsonc` change land
first as foundational commits (`Epic: #217` trailer, no `T<NN>`/`#child`, like a
plan commit — they are prerequisites, not children). TDD throughout; existing
suites are the safety net for the extraction.

STOP-1 answers baked in: **D5** `acquire(): Promise<boolean>`; **D11** Redis +
Deno-KV lock drivers (+ in-memory for tests); **Q3** all three children now.

## Phase 0 — Foundation (prerequisite commits)

- [ ] **F1 — extract `@lockness/redis`.** New foundation package: move session's
  `resp.ts` (RESP codec) + the lazy single-flight connect / lifecycle-drain-close
  / `db`+`password` config discipline out of `packages/session/drivers/`. Depends
  only on `@lockness/contract` (`registerDisposable`, `safeForLog`). Preserve
  `sha256Hex` connection-memo key (never cleartext password — FR-015) and add a
  `tls` option with cert validation ON by default (FR-016). Refactor
  `session/drivers/redis.ts` to consume it; session's full suite stays green
  (behaviour identical). Commit: `refactor(redis): …`.
- [ ] **F2 — deps.policy + workspace.** Add `@lockness/redis` to the workspace;
  `deps.policy.jsonc`: `"redis": { "tier": "foundation", "allow": ["contract"] }`,
  add `redis` to `session`/`queue`/`core` allow-lists. `deno task deps:analyze`
  green. Commit: `chore(deps): …`.

## Phase 1 — #218 health subsystem (T01)

**Independent test:** `/ready` runs registered checks, 200 all-pass / 503 with the
failing check's **name** only; `/health` opens no connection.

- [ ] T001 [contract] `HealthCheck` interface (`name`, `check(): Promise<{ok, detail?}>`)
  + `lifecycle/health` public (`registerHealthCheck`/`deregisterHealthCheck`) and
  `.../internal` (`collectHealthChecks`), mirroring `disposables.ts` (D9, FR-001).
- [ ] T002 [core] `/health` (liveness, no deps) + `/ready` route: run all checks
  with a per-check timeout, 200/503 aggregation, **name+coarse-status body only**
  (SEC-F4), aggregate result cached a short TTL, checks reuse pooled connections
  (SEC-F5). Re-export `registerHealthCheck` from core. Wire as a bootstrap step /
  core controller.
- [ ] T003 [drizzle/cache/queue/redis] each self-registers a check when configured
  (FR-004), importing `@lockness/contract` (downward edge), not core.
- [ ] T004 TDD: SC-001 (503+name, 200, `/health` opens nothing); timeout + cache
  behaviour. **One commit** `feat(T01): … (#218)`.

## Phase 2 — #219 distributed scheduler lock (T02)

**Independent test:** two schedulers sharing a lock run a guarded task once; loser
skips; a stale owner-token cannot delete a live lock; TTL lets a crashed holder's
next occurrence run.

- [ ] T005 [scheduler] `ScheduleOptions.onOneServer?: boolean` (default false),
  validated in `validateScheduleOptions`; `@Schedule` passes it through (D4, FR-007).
- [ ] T006 [scheduler] Wire the injected `_lock` into `Scheduler.#run`
  (`scheduler.ts:446-509`): when `onOneServer`, `acquire(name, occurrence)` before
  run, `release` after; lost-race skip at debug, store-error skip at warn (FR-006,
  SEC-F9). Port signature unchanged (D5 boolean).
- [ ] T007 [core bootstrap + redis/kv adapters] `RedisSchedulerLock` (`SET <token>
  NX PX`, owner-checked compare-and-delete release via Lua, TTL>runtime guidance /
  renew-if-owner — SEC-F1/F2) and `DenoKvSchedulerLock` (KV atomic check+set,
  `expireIn` TTL, owner token) + an in-memory lock for tests. Built at the
  composition root (`bootstrap/steps/scheduler.ts`), selected by config, injected
  via `setLock` (D2, D11, FR-008). Adapters do NOT live in `@lockness/scheduler`.
- [ ] T008 TDD: SC-002 (once-across-two, owner-token safety, TTL crash-recovery)
  with a fake clock + in-memory lock. **One commit** `feat(T02): … (#219)`.

## Phase 3 — #220 durable Redis queue + DLQ + retry (T03)

**Independent test:** a job failed past `maxAttempts` is in the DLQ (not dropped)
and `queue:retry` re-enqueues it; the Redis driver survives a restart.

- [ ] T009 [queue] Widen `QueueDriver` with `deadLetter(job,error)`/`listFailed()`/
  `retryFailed(id)` (D6, breaking public — recorded); implement in Memory + DenoKv
  (simple) now so no driver is left partial.
- [ ] T010 [queue] Move the terminal decision to the **worker**: at its exhaustion
  branch (`worker.ts:145`) call `driver.deadLetter(...)`; `fail()` stops dropping
  (D7, FR-010). Shared `computeNextAvailable(attempt, config)`; `QueueConfig.backoff:
  'fixed'|'exponential'` default fixed (D8, FR-011).
- [ ] T011 [queue] `RedisQueueDriver` on `@lockness/redis`: durable push/pop/
  complete/fail/size/clear + durable DLQ with an **enforced retention TTL**
  (SEC-F8); `'redis'` added to the config union + manager switch + barrel export.
- [ ] T012 [cli] `queue:retry <id|--all>` in `queue_commands.ts`, re-enqueue from
  the DLQ; `listFailed`/retry project an **allowlist** (id, name, attempts,
  failed-at, error class) — raw payload opt-in only (SEC-F8, FR-012/013).
- [ ] T013 TDD: SC-003 (DLQ round-trip + retry + restart) against an in-memory
  RESP double. **One commit** `feat(T03): … (#220)`.

## Phase 4 — gate

- [ ] T014 Full gate: `deno fmt && deno lint && deno check && deno task test` +
  `deno task deps:analyze` (no new cycle) + `deno task publish:check` (new/moved
  modules in include-list packages — [[publish-include-not-in-gate]]) + `deno task
  agents:brief --check`. Then `review`.

## Dependencies & order

```
F1 (redis pkg) → F2 (deps.policy) → { T01 health ; T02 lock ; T03 queue }
```

F1/F2 first (T02 and T03 both need `@lockness/redis`). T01 (health) is otherwise
independent — its redis check just needs F1. Children then land as three commits.
Redis-touching tests use in-memory/fake RESP doubles (no live server in the gate).
