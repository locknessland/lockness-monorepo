---

description: "Dependency-ordered breakdown for the consumer shutdown migration"
---

# Tasks: Migrate the resource-holding packages onto the core shutdown hook

**Input**: `/.specnaut/specs/005-consumer-shutdown-hooks/plan.md`
**Backlog item**: [#136 — Migrate queue, sse, session and cache onto the core shutdown hook](https://github.com/locknessland/lockness-monorepo/issues/136)

**Tests**: required, and first. TDD is non-negotiable per the constitution.

**Scope, after the stop**: `cache`, `queue`, `sse`, `logger`. **Session is out** — it carries a
CRITICAL auth bypass and a HIGH per-request leak, filed as their own items. #136's third acceptance
criterion was **renegotiated, not delivered**, and the merge report says so.

## 🔒 Carried forward from the decision table

`plan.md` §5 binds every task below. The traps, and the task most likely to spring each:

| The rule | Its only home | The task that would duplicate it |
| :--- | :--- | :--- |
| Collection-point lifetime: drain **snapshots and clears**, never freezes | `contract/lifecycle/disposables.ts` | T006 — copying `ShutdownRegistry`'s `#started` flag, which is right per-App and catastrophic process-wide |
| One entry **per disposable** in core's registry | `core/kernel/shutdown_sequence.ts` | T012 — one hook that loops, repealing #129's failure isolation |
| How a teardown failure is rendered | `contract/logging/sanitize.ts` (`renderError`, moved) | T009 — a second renderer written in contract because core's is unreachable |
| What runs before the server stops accepting | `core/kernel/shutdown_sequence.ts` — the `PREDRAIN` band | T014 — an SSE special case inside the drain loop |
| Who closes an injected client | `cache/drivers/redis_driver.ts` — the `ownsClient` flag | T020 — closing it because the other two drivers do |
| Which packages may import the foundation | `deps.policy.jsonc` | T004 — adding the import and silencing the analyser, or adding a `knownCycles` entry, which `scripts/deps_analyzer.ts:631` explicitly forbids |

---

## Phase 1 — Setup

- [X] T001 Confirm branch `005-consumer-shutdown-hooks` and `.specnaut/feature.json` naming this directory with `linked_issue: 136`
- [X] T002 Record the ordering constraint as an executable test — **landed in `packages/core/tests/shutdown_sequence.test.ts`, not the separate file this task named**, because the assertions need the sequence's own fixtures and a second file would have duplicated them: SSE streams prevent `server.shutdown()` from resolving, which is why a `PREDRAIN` band has to exist. Pin the mechanism, not the belief

## Phase 2 — Foundational (blocks every package)

### The collection point

- [X] T003 [P] Write the failing tests in `packages/contract/tests/disposables.test.ts`: register returns an opaque handle; deregister takes the **handle**, never a name; two disposables sharing a name both survive; drain runs each once
- [X] T004 Add `contract` to the `allow` list for `queue`, `sse` and `logger` in `deps.policy.jsonc` — **its own `chore(deps)` commit**, which `deps.policy.jsonc:18-19` demands of itself: "never bundled with the change that needed the widening". `cache` already allows it
- [X] T005 Create `packages/contract/lifecycle/disposables.ts` — `Disposable { name, dispose, priority? }`, `registerDisposable` returning a handle, `deregisterDisposable(handle)`, dedup on **object identity** (FR-017)
- [X] T006 Implement the drain as **snapshot-and-clear**, with **no** `#started` freeze. ⚠️ `shutdown_registry.ts:118-125`'s flag is correct for a per-App registry and catastrophic for a process-wide one: after the first app in the process shuts down every later registration becomes a silent no-op, and `packages/core/tests/` boots many apps per process — so the tests that would catch it are the ones it disables
- [X] T007 [P] Write the failing test that registering with core absent is a **no-op that neither throws nor warns** (FR-003) — a library used standalone must not complain about a framework that is not there
- [X] T008 Do **not** re-export the drain from `packages/contract/mod.ts`. It is `export *`, so anything placed there is public API on a published package: a process-wide "close everything now" importable by any controller, removable later only with a major bump (FR-002 / S5)

### The renderer moves

- [X] T009 Move `renderError` from `packages/core/kernel/shutdown_registry.ts` to `packages/contract/logging/sanitize.ts`, beside `safeForLog`, and re-export from core so **no caller changes**. The drain needs it and `contract` cannot import `core` — the same argument that moved `safeForLog` (FR-018)
- [X] T010 [P] Write the failing encoding test: a disposable named `"evil\nFAKE LOG LINE"` produces **one** log line. Not hypothetical — an SSE channel name is a request path segment in that package's own documented usage

### Core drains it

- [X] T011 [P] Write the failing test that core registers **one entry per disposable**: with three registered and the second throwing, all three are attempted (FR-004)
- [X] T012 Wire it in `packages/core/kernel/shutdown_sequence.ts`. ⚠️ One entry per disposable, **not** one hook that loops — collapsing them repeals `shutdown_registry.ts:180`'s stated policy for exactly the resources this feature exists to release
- [X] T013 [P] Write the failing pre-drain test: a `PREDRAIN` disposable runs **before** `server.shutdown()` is awaited
- [X] T014 Add `SHUTDOWN_PRIORITY.PREDRAIN` and run that band before the server drain (FR-016). This **is** a change to #129's mechanism; §8's promise was withdrawn at the stop

## Phase 3 — US1 (P1): `@lockness/cache`

**Independent test**: an app using the KV cache driver exits with its handle closed, sanitiser clean.

- [X] T015 [P] [US1] Write the failing tests in `packages/cache/tests/shutdown.test.ts`: the KV driver's handle is closed on drain; the memory driver is skipped; a second `getDriver()` after close does not return the closed one
- [X] T016 [US1] Add **optional** `close?()` to `CacheDriver` in `packages/cache/types.ts`. Optional, not required — `ARCHITECTURE.md:180` documents a `MemcachedCacheDriver implements CacheDriver` recipe that a required member breaks
- [X] T017 [US1] Implement `close()` on `DenoKvCacheDriver`, guarded on a handle that may never have been acquired: `drivers/deno_kv_driver.ts:42-47` opens **lazily**, so a driver constructed and never used holds nothing (FR-013)
- [X] T018 [US1] Implement **nothing** on `MemoryCacheDriver` — its `Map`s are module-level and shared across every instance (`memory_driver.ts:12-14`), so a `close()` clearing them corrupts other instances. Record that reasoning in the interface JSDoc, which §5 names as its home
- [X] T019 [US1] `close()` resets `cacheDriver` to `null` at `store.ts:20` and deregisters, so a programmatic `await app.shutdown()` cannot leave `getDriver()` handing out a closed handle and every later request failing `BadResource` (FR-019)
- [X] T020 [US1] `RedisCacheDriver` gains `ownsClient` (default `false`) and registers a **no-op** unless it is set. The client was handed in already connected (`redis_driver.ts:228`); closing it is S9's failure mode aimed at somebody else's connection (FR-014)
- [X] T021 [P] [US1] Update `packages/cache/ARCHITECTURE.md:180`'s recipe in the same commit, or the docs teach a driver that no longer satisfies the contract

## Phase 4 — US2 (P1): `@lockness/queue`

**Independent test**: an app running a worker exits with the loop stopped **and** the KV handle closed.

- [X] T022 [P] [US2] Write the failing tests: `QueueWorker.stop()` runs on drain; the driver's KV handle is closed; stopping the worker deregisters it
- [X] T023 [US2] `QueueWorker` registers on construction, deregisters in `stop()` (`mod.ts:426`)
- [X] T024 [US2] Add `close()` to `DenoKvQueueDriver` and register it. **#136 never mentions this resource**: `mod.ts:185-190` opens a KV handle lazily and `kv.close` appears nowhere in the package. A worker that stopped has not released the store it was reading — SC-002 would have gone green over it

## Phase 5 — US3 (P1): `@lockness/sse`

**Independent test**: an app holding open SSE connections exits with no interval armed.

- [X] T025 [P] [US3] Write the failing tests **with a real `heartbeatInterval`**. ⚠️ 7 of the 10 existing sites in `packages/sse/tests/sse.test.ts` pass `heartbeatInterval: 0`, which returns early at `channel.ts:347` — extending that file naively would exercise the no-interval path and prove nothing
- [X] T026 [US3] `SSEChannel` registers at `PREDRAIN` and clears every interval in `heartbeatIntervals` plus closes open connections
- [X] T027 [US3] Deregister when the channel closes, so a channel closed in normal operation is not torn down twice — and so a long-lived app opening and closing thousands of channels does not grow without bound (FR-005 / R2)
- [X] T028 [P] [US3] State the **registration granularity** in the code's JSDoc: per channel is O(distinct names a client can invent), per connection is O(concurrent connections). The two differ by orders of magnitude and the plan was silent
- [X] T029 [P] [US3] Write the bound test: N opens **without** closes stays bounded. This requires a bound to exist — `channel.ts:26` currently defaults `maxClients` to `Infinity` and `ChannelManager` never evicts. If giving it a finite default is judged out of scope, log it as an item rather than leaving the test unwritten

## Phase 6 — US4 (P2): `@lockness/logger`

**Independent test**: an app with a file transport exits with the file handle closed.

- [X] T030 [P] [US4] Write the failing test: the global logger's file handle is closed on drain
- [X] T031 [US4] Register the existing `close()` (`mod.ts:193`) against the `globalLogger` singleton (`:367`), at `STORES` — logs are written by the things torn down before it
- [X] T032 [US4] Replace the manual instructions at `packages/logger/docs/DOCS.md:165,501` and `README.md:157,509` — `await log.close() // Close file handles` is exactly what FR-010's original grep was hunting and failed to find

## Phase 7 — Polish and cross-cutting

- [X] T033 Write the shutdown sections in each package's `docs/DOCS.md`, and re-run the **corrected** enumerating search — `grep -rnE "\.close\(\)|\.stop\(\)|addSignalListener" packages/*/docs/ packages/*/README.md` — to prove nothing stale remains (FR-010)
- [X] T034 [P] Add a `## Shutdown` note to `docs/lifecycle-events.md` listing which packages now self-register, and stating plainly that **session does not** and why
- [X] T035 Run the gate: `deno fmt && deno lint && deno check && deno task test`, plus `deno task deps:analyze` — expect exactly three new edges to `contract`, no cycle
- [X] T036 Negative-test every new assertion: break the thing it claims and confirm red. Chase any "still passes" to its cause — a mis-targeted mutation and a weak assertion look identical from outside
- [X] T037 Update `packages/contract/AGENTS.md` — its "Imported by" list names seven packages where the source shows ten, and this change adds three more. Regenerate rather than hand-edit if `deno task agents:brief` covers it

---

## Dependencies

```
Phase 1 ─▶ Phase 2 ─┬─▶ Phase 3 (cache)  ─┐
                    ├─▶ Phase 4 (queue)  ─┤
                    ├─▶ Phase 5 (sse)    ─┼─▶ Phase 7
                    └─▶ Phase 6 (logger) ─┘
```

Phase 2 blocks everything — the collection point is what all four register into. Phases 3–6 are
**mutually independent** and each is independently shippable, which is the epic candidacy the PO
flagged; they run in parallel once Phase 2 lands.

## Implementation strategy

**MVP is Phases 1–3.** At the end of cache the mechanism exists and has one real user, which is what
makes it demonstrable — #129 shipped a lifecycle whose only users were core's own two, and this is
the same lesson applied.

**Phase 5 (sse) carries the only mechanism change.** If the pre-drain phase turns out riskier than it
looks, phases 3, 4 and 6 ship without it and sse follows — the dependency graph above already allows
that.

## Commit plan

| Commit | Covers |
| :--- | :--- |
| `chore(deps): allow queue, sse and logger to import the foundation` | T004, alone, as the policy file demands |
| `refactor(core): move renderError into the foundation beside safeForLog` | T009 |
| `feat(136): a process-wide disposables registry drained at shutdown` | T003, T005–T008, T010–T014 |
| `feat(136): release cache, queue, sse and logger resources at shutdown` | T015–T032 |
| `docs(136): …` | T033, T034, T037 |
