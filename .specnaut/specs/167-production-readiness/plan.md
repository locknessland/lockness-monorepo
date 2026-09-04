# Plan: Production readiness

**Branch**: `167-production-readiness` | **Date**: 2026-09-04 | **Backlog item**:
[#217 — Production readiness](https://github.com/locknessland/lockness-monorepo/issues/217)

**This is the feature's one planning document.** Epic #217 closes three
competitive gaps that block running Lockness on more than one replica: no health
subsystem, an unimplemented scheduler lock port (every replica fires every cron
task), and queue drivers that are Memory + Deno-KV only with no durable store,
no dead-letter, and no retry command. Children: #218 (health), #219 (scheduler
lock), #220 (durable Redis queue + DLQ + retry).

> **v2 — plan-time audits folded.** The architecture and security audits both
> returned `fail` on v1 with corrections that are cheap now and expensive after
> code. All are folded below; the two HIGH architecture corrections (health
> registry home, lock-adapter placement) and the two HIGH security corrections
> (owner-checked lock release, TTL-vs-runtime) changed the design, not just the
> wording. §13 records every audit finding and where it landed.

---

## 1. Why this exists

Three concrete gaps, each measured against the code as it stands:

| Gap | Today | Consequence at >1 replica |
| :--- | :--- | :--- |
| Health (#218) | Only a liveness stub in the `init` API kit; **nothing in `core`**, no `/ready`, no check registry | K8s/Deno-Deploy cannot tell if a replica's DB/Redis/queue is reachable; a broken replica keeps serving |
| Scheduler lock (#219) | `SchedulerLock` port exists (`packages/scheduler/types.ts:72-83`); `Scheduler` takes `_lock?` but **ignores it** (`scheduler.ts:189`); only mitigation is a `SCHEDULER_ENABLED` kill-switch | Every replica runs every cron task — double-charged jobs, duplicate emails, races |
| Durable queue (#220) | `Memory`/`DenoKv` `fail()` re-push until `attempts >= maxAttempts` then **silently drop**; no dead-letter, no Redis, no retry command | Failed jobs vanish with no audit trail; no durable cross-replica queue; no replay |

## 2. User scenarios

### US1 — a readiness probe reports real dependency health (P1) 🎯 MVP

**Given** an app with a DB and a Redis-backed queue
**When** the platform polls `/ready`
**Then** it gets `200` only when every registered check passes, and `503` with a
**name + coarse status** body (never raw errors/topology, per §13 SEC-F4) when
any fails; `/health` stays a cheap auth-free liveness ping that touches nothing.

### US2 — a cron task runs once across replicas (P1) 🎯 MVP

**Given** three replicas and a task marked `onOneServer`
**When** its cron occurrence fires on all three
**Then** exactly one replica acquires the lock and runs it, the others skip; a
crashed holder's lock expires (TTL); release deletes **only the caller's own**
lock (owner token, §13 SEC-F1); the guarantee is at-most-once **within the TTL**
(§13 SEC-F2).

### US3 — an exhausted job lands in a durable dead-letter and can be retried (P2)

**Given** a Redis queue and a job that throws past `maxAttempts`
**When** it exhausts its attempts
**Then** the **worker** writes it to a persistent dead-letter store (not dropped),
and `nessy queue:retry <id|--all>` re-enqueues it.

## 3. Requirements

**Health (#218)**
- **FR-001** A `HealthCheck` abstraction (name + async `check()` → healthy/unhealthy
  + optional detail) and a registry, living in **`@lockness/contract`**
  (`lifecycle/health` public + a `.../internal` register side), mirroring
  `registerDisposable` exactly — NOT in core (§13 ARCH-A1).
- **FR-002** `/health` = liveness, auth-free, touches no dependency.
- **FR-003** `/ready` = readiness: core runs every registered check with a
  per-check timeout and 200/503 aggregation. Body carries **check name + coarse
  status enum only** (up/down, optional bounded duration) — no raw dependency
  errors, hostnames, ports, versions, or connection strings (§13 SEC-F4). The
  aggregate result is **cached for a short TTL** and checks **reuse pooled
  connections** — never open a connection per probe (§13 SEC-F5).
- **FR-004** Built-in checks self-register only for configured dependencies (DB,
  cache, queue, redis), each importing `@lockness/contract` (a legal downward
  edge), not core.

**Scheduler lock (#219)**
- **FR-005** A concrete `SchedulerLock` (the unwired port), acquired with a
  **unique per-claim CSPRNG token** as the stored value (`SET key <token> NX PX`).
  `release` is an **owner-checked compare-and-delete** (Lua `if get==token then
  del`) — a blind `DEL` is forbidden (§13 SEC-F1). TTL must exceed worst-case
  task runtime, or the adapter renews-if-owner on a watchdog (§13 SEC-F2).
- **FR-006** `Scheduler.#run` (`scheduler.ts:446-509`) acquires before a guarded
  task and releases after. A **lost race** skips at debug level; a **lock-store
  error** skips (fail-safe) but logs at warn (§13 SEC-F9).
- **FR-007** A per-task `@Schedule` opt-in `ScheduleOptions.onOneServer?: boolean`
  (default `false` → unchanged behaviour), validated in `validateScheduleOptions`.
- **FR-008** The concrete lock is built at the **composition root** — core's
  `bootstrap/steps/scheduler.ts`, constructed from the `@lockness/redis` client
  and injected via the existing `setLock` (mirroring `setReporter`). The adapter
  does **not** live in `@lockness/scheduler` (keeps its `allow: []` ceiling)
  (§13 ARCH-A2).

**Durable queue (#220)**
- **FR-009** A `RedisQueueDriver` implementing `QueueDriver`, durable across
  restarts/replicas; `QueueConfig.driver` union widened with `'redis'`.
- **FR-010** A cross-driver dead-letter: the **worker** calls
  `driver.deadLetter(job, error)` at its existing exhaustion branch
  (`worker.ts:145`); `fail()` stops being the drop site (§13 ARCH-A3). All three
  drivers implement `deadLetter`/`listFailed`/`retryFailed` (Memory/DenoKv simple,
  Redis durable). Widening `QueueDriver` is a **breaking public-API change**
  (recorded).
- **FR-011** Backoff computed once in a shared `computeNextAvailable(attempt,
  config)` (queue package / worker) that every driver merely persists as
  `availableAt` — not re-derived per driver (§13 ARCH-A4). `QueueConfig.backoff:
  'fixed' | 'exponential'`, default `'fixed'` (today's `retryDelay`).
- **FR-012** A `queue:retry <id|--all>` CLI command in
  `packages/cli/commands/queue_commands.ts` re-enqueuing from the DLQ.
- **FR-013** DLQ entries carry an **enforced retention bound** (a TTL on the
  Redis key or a purge step — not documentation only); `listFailed`/`queue:retry`
  project an **allowlist** by default (id, job name, attempts, failed-at, error
  class) — raw payload only on explicit opt-in (§13 SEC-F8).

**The `@lockness/redis` foundation package**
- **FR-014** Extract session's raw-RESP client (`resp.ts` + connection discipline)
  into a new `@lockness/redis` **foundation** package; session, the lock, and the
  queue driver consume it. It depends on `@lockness/contract` (for
  `registerDisposable` + `safeForLog`) — NOT zero-dep (§13 ARCH-A5).
- **FR-015** Any connection memo/cache key folds `password` through `sha256Hex`
  (carry session's digest verbatim) — never cleartext; `password` is redacted from
  every log/error line via `safeForLog` (§13 SEC-F6).
- **FR-016** The client supports **TLS with certificate validation ON by default**
  (a `tls` option / `rediss` scheme); no trust-all default. AUTH over non-TLS is
  the operator's explicit documented trade-off (§13 SEC-F7).

**Cross-cutting**
- **FR-017** No hard rule broken: `@lockness/core` only, JSR bare specifiers, no
  `any` in exported APIs, JSDoc on public members, MVC layering, DAG acyclic.

## 4. Success criteria

- **SC-001** `/ready` → 503 with the failing check's **name** (not its error)
  when a dependency is down, 200 when all pass; `/health` never opens a
  connection (asserted).
- **SC-002** Two `Scheduler` instances sharing one lock run a guarded task once
  total; the loser skips; a released lock only removes the owner's token (a stale
  token cannot delete a live lock); after a simulated holder crash the TTL lets
  the next occurrence run (fake clock + in-memory lock).
- **SC-003** A job failed past `maxAttempts` is retrievable from the DLQ and
  `queue:retry` re-enqueues it; the Redis driver survives a driver restart with
  jobs intact (against a fake/in-memory RESP double).
- **SC-004** Full gate green incl. `deno task deps:analyze` (**no new cycle** —
  the health registry in contract and the lock adapter at the root are what make
  this achievable) and `deno task publish:check` ([[publish-include-not-in-gate]]).

## 5. The binding decision table

Rows revised per the audits. ❓ = an open question in §12.

| # | Decision | Choice (post-audit) | Rejected / why-not |
| :--- | :--- | :--- | :--- |
| D1 | Redis client home | **Extract `@lockness/redis` foundation package** (Rule of Three: session + lock + queue); `redis → contract` | Duplicate RESP ×3 (DRY); cache-style injected client (pushes durability-critical connection mgmt to the app) |
| D2 | Scheduler lock adapter **placement** | **Composition root** — built in core's scheduler bootstrap from the redis client, injected via `setLock`; scheduler stays `allow: []` | In `@lockness/scheduler` — breaches its zero-dep ceiling, drags Redis into every in-process-cron app (ARCH-A2) |
| D3 | Lock backing store | `RedisSchedulerLock` (`SET NX PX` + owner token) + in-memory lock for tests | — |
| D4 | Lock opt-in | `ScheduleOptions.onOneServer?: boolean`, default false | Global switch — too blunt |
| D5 | Lock `acquire` return type | **`Promise<boolean>`** (STOP-1: fencing out of scope; at-most-once-within-TTL is the documented guarantee) | Widen to `LockHandle` now — deliberately declined; residual is acceptable for cron (SEC-F3) |
| D6 | DLQ scope | **Cross-driver capability** on `QueueDriver` (deadLetter/listFailed/retryFailed); breaking public-API change | Redis-only — leaves Memory/DenoKv dropping silently |
| D7 | DLQ terminal seam | **Worker** calls `deadLetter` at exhaustion (`worker.ts:145`); `fail()` no longer drops | Each `fail()` re-deriving "last attempt" — double-owned counter bug (ARCH-A3) |
| D8 | Backoff home | Shared `computeNextAvailable(attempt, config)`; drivers persist `availableAt` | Per-driver branch ×3 — duplicate-code defect (ARCH-A4) |
| D9 | Health registry home | **`@lockness/contract`** (`lifecycle/health`), mirroring `registerDisposable`; core owns routes/timeout/aggregation + re-exports register | In core — closes 4 cycles, SC-004 unachievable (ARCH-A1) |
| D10 | Health package | No separate `@lockness/health` — registry in contract, routes in core | A new package — more parts than two endpoints warrant |
| D11 | Lock drivers | **Redis + Deno-KV** (STOP-1): `RedisSchedulerLock` (`SET NX PX` + token) **and** `DenoKvSchedulerLock` (KV atomic check+set with `expireIn` TTL, owner token), for KV-only deployments; + in-memory lock for tests. Core's bootstrap selects by config. Both adapters at the composition root | Redis-only — declined; KV-only apps (Deno Deploy sans Redis) need a lock too |

## 6. Constitution & hard-rules check

- `deps.policy.jsonc` gains: `"redis": { "tier": "foundation", "allow": ["contract"] }`;
  `redis` added to `session` and `queue` allow-lists; `core → redis` for the lock
  adapter + redis queue wiring. The health registry adds `drizzle/cache/queue →
  contract` (legal downward edges). All reviewed in a `chore(deps)` commit.
- Hard rule #3 (no `any` in exported APIs): RESP reply is a discriminated union;
  `HealthCheck`, `LockHandle` (if D5 widens), and the DLQ methods are typed.
- Hard rule #8 (layering): health checks are services behind a contract port; the
  lock adapter is infrastructure at the composition root; the controller stays thin.
- **Two Redis stories acknowledged:** owned raw-RESP (`@lockness/redis` for
  session/lock/queue — durability-critical, must own the connection) and injected
  `RedisClient` (`cache` — tolerates a dropped connection). This is deliberate;
  cache is **not** migrated by this epic (recorded so a reader isn't left asking).

## 7. Public surfaces touched

New `@lockness/redis`. `@lockness/contract` (+ `HealthCheck`, `registerHealthCheck`).
`@lockness/core` (`/health`+`/ready` routes, health orchestration, `setLock` wiring,
re-export of `registerHealthCheck`). `@lockness/scheduler`
(`ScheduleOptions.onOneServer`; the port is unchanged unless D5 widens it).
`@lockness/queue` (`RedisQueueDriver`, DLQ methods on `QueueDriver` — **breaking**,
`'redis'` in the union, backoff config). `@lockness/cli` (`queue:retry`). Session's
external surface is unchanged (RESP moves behind `@lockness/redis`).

## 8. Risks & mitigations

| Risk | Mitigation |
| :--- | :--- |
| Extracting session's RESP regresses sessions | Move verbatim; session's full suite is the guard |
| Lock deletes another holder's lock on release | Owner token + compare-and-delete; blind DEL forbidden (SEC-F1) |
| Lock expires mid-run → concurrent execution | TTL > worst-case runtime, or renew-if-owner watchdog; residual guarantee documented (SEC-F2) |
| Lock store down → task runs on no replica, invisibly | Distinguish lost-race (debug) from store-error (warn) (SEC-F9) |
| Unauth `/ready` leaks internals / amplifies load | Name+status-only body; pooled conns + short result-cache TTL (SEC-F4/F5) |
| Redis password in a memo key or log | `sha256Hex` key + `safeForLog` redaction (SEC-F6) |
| Cleartext credential/payload in transit | TLS with validation on by default (SEC-F7) |
| DLQ hoards sensitive payloads / over-fetches | Enforced retention + allowlisted listing (SEC-F8) |
| `QueueDriver` widening breaks external drivers | Acceptable at 0.2.x; recorded as breaking; all 3 in-tree drivers migrated in the same change |

## 9. Plan audits

Both ran on v1 in parallel, both returned `fail` with corrections now folded
(§13). Architecture: two HIGH (registry home, lock placement) + two MEDIUM + one
LOW. Security: two HIGH (owner-checked release, TTL-vs-runtime) + six MEDIUM +
one LOW. Neither vetoed the architecture (shared `@lockness/redis`, cross-driver
DLQ, core-orchestrated health) — they constrained how it is built.

## 10. Sequencing

```
@lockness/redis (FR-014)  →  #219 scheduler lock (adapter at root)
                          →  #220 durable queue + DLQ + retry
#218 health (contract registry + core routes)  — independent
```

Each child = one commit, `Epic: #217` trailer, flat merge. The `@lockness/redis`
extraction + the `deps.policy.jsonc` change are their own commits (foundational).

## 11. Out of scope

Full APM/observability (epic #221). Full Redlock/fencing beyond the owner-token
lock (unless D5 widens the port). A queue dashboard. Multi-region Redis.
Migrating `cache` to the owned Redis client. Changing Memory/DenoKv retry
semantics beyond the DLQ terminal step + the backoff option.

## 12. Open questions (STOP 1) — ANSWERED

- **Q1 (D5) — lock `acquire` return type.** → **`Promise<boolean>`.** Fencing is
  out of scope; the documented guarantee is at-most-once-within-TTL (SEC-F2).
- **Q2 (D11) — lock store.** → **Redis + Deno-KV.** Both a `RedisSchedulerLock`
  and a `DenoKvSchedulerLock` (KV atomic + `expireIn` TTL + owner token), so
  KV-only deployments are covered; in-memory lock for tests.
- **Q3 — scope/MVP order.** → **All three children** in one pass to STOP 2.

## 13. Audit findings ledger

**Architecture** (all folded): **ARCH-A1** HIGH health registry → contract not
core (D9, FR-001/004). **ARCH-A2** HIGH lock adapter → composition root not
scheduler (D2, FR-008). **ARCH-A3** MED DLQ terminal seam → worker (D7, FR-010).
**ARCH-A4** MED backoff → shared compute (D8, FR-011). **ARCH-A5** LOW `redis →
contract`, policy edges (FR-014, §6). D3/D4 endorsed unchanged.

**Security** (all folded): **SEC-F1** HIGH owner-checked release + CSPRNG token
(FR-005). **SEC-F2** HIGH TTL-vs-runtime + residual guarantee (FR-005, US2).
**SEC-F3** MED `acquire` return-type decision → Q1 (D5). **SEC-F4** MED `/ready`
name+status only (FR-003, SC-001). **SEC-F5** MED pooled conns + result cache
(FR-003). **SEC-F6** MED `sha256Hex` key + no-log password (FR-015). **SEC-F7**
MED TLS validation on by default (FR-016). **SEC-F8** MED DLQ retention +
allowlisted listing (FR-013). **SEC-F9** LOW lost-race vs store-down reporting
(FR-006).
