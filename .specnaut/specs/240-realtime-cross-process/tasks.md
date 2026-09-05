# Tasks: Real-time cross-process presence, eviction, and Redis pub/sub connection

**Input**: `plan.md` in this directory (the one design document).
**Prerequisites**: plan.md (approved 2026-09-05, both audits folded, Q1–Q4 settled).

**Tests**: INCLUDED — TDD is non-negotiable per the constitution. Every implementation task is preceded by a failing test.

**Scope**: One deliverable (Q3) — US1→US4 + the S1 durable-revocation work ship together.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1–US4 (user-story phases only)
- Exact file paths in every description; decision-table homes named where a task touches a rule.

## Path conventions

Two framework packages: `packages/redis/` and `packages/realtime/`. Tests live in each package's `tests/`. No app/controller/UI surface.

---

## Phase 1: Setup (shared infrastructure)

**Purpose**: confirm the ground the feature builds on; no behavior change.

- [X] T001 Confirm the `realtime → redis` edge is live: `packages/realtime/deno.json` already declares `@lockness/redis@^0.2.0` and `deps.policy.jsonc` grants it — run `deno task deps:analyze` and record the baseline green (the declaration is unused today; this feature makes it used, satisfying hard-rule-#2 declare-and-use).
- [X] T002 [P] Add a `RealtimeControlConfig` shape (per-deployment HMAC secret for FR-015) to `packages/realtime/types.ts` — a value object, no logic yet.

**Checkpoint**: baseline green, config surface stubbed.

---

## Phase 2: Foundational (blocking prerequisites — MUST complete before any user story)

**Purpose**: the shared redis connection seam and the widened driver contract every story below depends on.

**⚠️ CRITICAL**: no user-story work begins until this phase is complete.

### FR-013 — one home for the connection security discipline (resolves A1 + S4)

- [X] T003 Write failing tests in `packages/redis/tests/connection.test.ts`: an authenticated-socket primitive dials, TLS-wraps (cert validation ON, no trust-all), runs `AUTH`/`SELECT`, warns once on cleartext-AUTH, redacts the password from logs, and self-heals on desync.
- [X] T004 Extract the dial + TLS + `AUTH`/`SELECT` + cleartext-AUTH warning + self-heal discipline from `RedisClient.connect` into a shared primitive in `packages/redis/connection.ts` (decision-table home: "socket dial + TLS + handshake + self-heal"). Make T003 pass.
- [X] T005 Refactor `packages/redis/client.ts` `RedisClient` to consume the T004 primitive — behavior-preserving, no public signature change; existing `tests/client.test.ts` stays green.

### FR-001/002/003 — the subscribe-mode connection

- [X] T006 [P] Write failing tests in `packages/redis/tests/subscriber.test.ts` against a fake socket: the connection opens its OWN socket (never `RedisClient`'s), issues `PSUBSCRIBE`, invokes `(topic, payload)` per pushed message using the bounded `resp.ts` reader, and on a forced wire fault reconnects and re-issues every active `PSUBSCRIBE` (logged WARN).
- [X] T007 Implement `packages/redis/subscriber.ts` (decision-table homes: "enter subscribe mode", "which active subscriptions to re-issue on reconnect") consuming the T004 primitive + `resp.ts` (`encodeCommand`/`writeFrame`/bounded push reader per FR-002/FR-019). It satisfies the `RedisSubscriber` port structurally. Make T006 pass.
- [X] T008 Export the subscribe-mode connection + `connection.ts` primitive from `packages/redis/mod.ts`; add both to the package's `publish.include` list (per memory: include-list packages need new modules added or `publish:check` fails).

### Widened `BroadcastDriver` contract (resolves A2, A5; enables US2–US4)

- [X] T009 [P] Write failing tests in `packages/realtime/tests/driver_contract.test.ts`: a driver MAY expose optional presence-state ops (`addMember`/`removeMember`/`listMembers`) and an `onControl(handler)` seam; a driver WITHOUT them keeps single-process behavior (feature-detected).
- [X] T010 Extend `packages/realtime/driver.ts`: add the optional presence-state ops + `onControl` seam types (decision-table home: "how a control message reaches the manager" — a distinct seam, NOT folded into `onMessage`). Add a `ControlMessage` value object (kind + target + MAC). Make T009 pass.
- [X] T011 Add one feature-detect guard helper in `packages/realtime/manager.ts` (A5 — one helper, not an `if (driver.addMember)` per method) that the roster-aware methods route through.

**Checkpoint**: redis subscribe connection proven against a fake socket; driver contract widened and backward-compatible. User stories can begin.

---

## Phase 3: User Story 1 — Cross-process delivery over a real socket (Priority: P1) 🎯 MVP

**Goal**: a broadcast on instance A reaches an authorized subscriber on instance B over a real Redis pub/sub socket, re-bounded by B's local authorization.

**Independent test**: two `ChannelManager`s wired to real `RedisBroadcastDriver`s against a live Redis; a broadcast on A reaches an authorized subscriber on B; a locally-unauthorized connection on B receives nothing.

- [X] T012 [US1] Write failing integration test `packages/realtime/tests/driver_redis_live.test.ts` (SC-001) against a live `redis`: cross-process delivery + B re-applies local authorization (S6). Resource/op-sanitizer discipline for the opened sockets (per `packages/redis/tests/client.test.ts`).
- [X] T013 [US1] Wire `RedisBroadcastDriver` (`packages/realtime/drivers/redis.ts`) to construct its subscribe-mode connection INTERNALLY from config (FR-012, decision-table home: queue-mirror construction — mirror `packages/queue/manager.ts`), replacing the injected fake in production paths. Keep the injectable port for tests.
- [X] T014 [US1] Confirm `ChannelManager.deliverLocal` (`packages/realtime/manager.ts`) remains the single home for local re-authorization (FR-011, decision-table home S6) — the received message fans only to `subscriptions.get(channel)`; add a regression assertion, do not add a second auth check in the driver.
- [X] T015 [US1] Verify FR-019 ingest bounds: the driver's `onMessage` guard revalidates channel + event names via `isValidName` and the push reader rejects an oversized payload before `JSON.parse` (extend `tests/driver_redis.test.ts`).

**Checkpoint**: US1 fully functional against a real socket, independently testable (SC-001, SC-006 partial).

---

## Phase 4: User Story 2 — Consistent authoritative presence across instances (Priority: P1)

**Goal**: the `here` roster is identical on every instance; a join is announced to presence subscribers on all instances.

**Independent test**: two clients on two instances join the same presence channel; each roster lists both; each observed the other's `joined` — verified without reading any in-process map.

- [X] T016 [US2] Write failing test `packages/realtime/tests/presence_authoritative.test.ts` (SC-002): cross-instance roster consistency + cross-instance `joined`; assert on `SubscribeResult.members` and emitted frames only (no private-map access).
- [X] T017 [P] [US2] Implement the Redis-backed authoritative roster in `packages/realtime/drivers/redis.ts` `addMember`/`removeMember`/`listMembers` (decision-table home: "who is authoritatively here") — a per-presence-channel member store. Member key carries owning-instance/connection identity for the sweep (decision-table home: "how a member is identified for sweep").
- [X] T018 [P] [US2] Implement the in-process roster in `packages/realtime/drivers/memory.ts` (behavior preserved, sync-wrapped) so the memory driver keeps single-process semantics.
- [X] T019 [US2] Route `ChannelManager.subscribe` through the driver roster (FR-006): return the authoritative snapshot; announce the join cross-instance via the control/presence path. Enforce FR-018 — the client-visible `PresenceMember` and the sweep/owning-instance metadata are DISTINCT; only the client-visible field enters the snapshot and frames.
- [X] T020 [US2] Make `unsubscribe`/`disconnect` `async` (FR-017, A4) in `packages/realtime/manager.ts`; `handlerHooks.onClose` awaits `disconnect`; update the 2–3 test call sites (`presence.test.ts`, `broadcaster.test.ts`) to `await`.
- [X] T021 [US2] Retarget `emitPresence` (`packages/realtime/manager.ts`) to fan to `subscriptions.get(channel)` (local subscribers), NOT the driver roster (decision-table home A5 — the roster now holds unreachable remote members).
- [X] T022 [US2] Write failing test then implement the instance-scoped ghost sweep (Q1, FR-008): one instance-liveness key; on its expiry, sweep that instance's roster members. Test in `packages/realtime/tests/presence_sweep.test.ts` (SC-005) with FakeTime.

**Checkpoint**: US1 + US2 both work independently; roster is cross-instance authoritative with no ghost leak.

---

## Phase 5: User Story 3 — Cross-process eviction revokes the owning socket (Priority: P1)

**Goal**: an eviction issued on any instance reaches the instance owning the target's socket and revokes it; the S7 disclosure gap stays closed even if a control message is lost.

**Independent test**: an evict issued on a non-owning instance → target stops receiving events, is absent from the roster, and all instances' presence subscribers saw a `left`; and an evict issued while the owning socket was disconnected still lands after reconnect.

- [X] T023 [US3] Write failing test `packages/realtime/tests/eviction_control.test.ts` (SC-003): a server-only evict entry point on a non-owning instance revokes the owning socket; a locally-unauthorized/non-owner instance applies only the roster/`left` consequence.
- [X] T024 [US3] Implement the reserved control topic + control-message encode/decode in `packages/realtime/drivers/redis.ts` (decision-table home: "reserved control-topic name and shape") and deliver it via `onControl` (FR-016) — never through `onMessage`.
- [X] T025 [US3] Add a server-only evict entry point on `ChannelManager` (`packages/realtime/manager.ts`): NOT reachable from a client frame (the `decodeClientMessage` allowlist is unchanged — deny-by-default). On receipt of an evict control message the owning instance revokes; per Q2, **hard-close** the socket for a revocation-driven evict, plain `unsubscribe` for a channel leave.
- [X] T026 [US3] Write failing test then implement the FR-015 authenticity MAC (decision-table home S2: "whether a control/presence-identity message is authentic"): HMAC over the payload keyed by the per-deployment secret (T002 config), verified on ingest in `drivers/redis.ts` BEFORE any control/presence-identity message is actioned; absent/failed MAC dropped with WARN. Test `packages/realtime/tests/control_auth.test.ts` (SC-008) — a forged evict and a spoofed presence member are both rejected. Reuse redis's `credentialFingerprint`/HMAC discipline for redaction.
- [X] T027 [US3] Write failing test then implement the FR-014 durable revocation marker (decision-table home S1: "whether a revoked connection stays revoked across a reconnect"): a Redis-backed revocation set the owning instance re-checks on subscribe-socket reconnect + on a periodic reconcile. Test `packages/realtime/tests/eviction_durable.test.ts` (SC-007) — an evict issued while the owning socket is disconnected still revokes after reconnect (FakeTime).
- [X] T028 [US3] Extend FR-019 ingest validation to the control-message `target` id (`isValidName`) in `drivers/redis.ts`; regression in `control_auth.test.ts`.

**Checkpoint**: US1–US3 work independently; S7 is closed at both the functional (SC-003) and reliability (SC-007) level; the control plane is authenticated (SC-008).

---

## Phase 6: User Story 4 — Natural disconnect propagates the leave (Priority: P2)

**Goal**: a socket close on the owning instance removes the member from the authoritative roster and emits a `left` to presence subscribers on ALL instances.

**Independent test**: a presence member's socket closes on instance B; the member is absent from the authoritative roster and presence subscribers on A and B both received a `left`.

- [X] T029 [US4] Write failing test `packages/realtime/tests/disconnect_propagation.test.ts` (SC covering US4): `disconnect` on the owning instance fans a `left` cross-instance and removes the member from the authoritative roster.
- [X] T030 [US4] Wire `disconnect`/`unsubscribe` (already async from T020) to publish a presence-leave control message (authenticated per FR-015) so non-owning instances emit their local `left` via `onControl` and drop the member from their view. Reuse the T024 control path — no second control-topic literal.

**Checkpoint**: all four user stories independently functional.

---

## Phase 7: Polish & cross-cutting concerns

- [X] T031 [P] Update `docs/realtime.md`: multi-instance guidance, the subscribe-mode connection, the authoritative roster, the eviction/control plane, and the trusted-bus/HMAC posture (`prefix` is NOT a security boundary).
- [X] T032 [P] Update `packages/redis/docs/` (or DOCS) + `packages/realtime/docs/DOCS.md` for the new surface. (No `docs/DOCS.md` exists for either package — their user-facing docs are the `README.md` files, updated here; realtime's full reference stays `docs/realtime.md`.)
- [X] T033 Regenerate `packages/redis/AGENTS.md` and `packages/realtime/AGENTS.md` generated blocks: `deno task agents:brief` (gate step 5 fails on stale briefs). Hand-fix the redis "Invariants"/"Where to work" sections (currently placeholder stubs) to name the subscribe-mode connection + the extracted primitive. (Prose-only pass done here: the top summary, Invariants, and Where-to-work stubs are filled; generated blocks were left untouched.)
- [X] T034 Verify every success criterion SC-001..SC-008 in plan.md § 4 is met, with the test that proves each.
- [X] T035 Run the full gate from the repo root: `deno fmt && deno lint && deno check && deno task test && deno task deps:analyze && deno task agents:brief --check`.

---

## Dependencies & execution order

### Phase dependencies

- **Setup (P1)**: no dependencies.
- **Foundational (P2)**: depends on Setup; **blocks all user stories**. Within it: T003→T004→T005 (RedisClient refactor sequential); T006→T007→T008 (subscriber, [P] with the T003 chain); T009→T010→T011 (driver contract, [P] with the redis work — different package).
- **US1 (P3)**: depends on Foundational (needs T007 subscriber + T010 driver contract).
- **US2 (P4)**: depends on Foundational; independent of US1 at the roster level but shares the live driver from T013.
- **US3 (P5)**: depends on Foundational + US2's roster (T017) and the control seam (T010/T024).
- **US4 (P6)**: depends on US2 (roster) + US3 (control path T024).
- **Polish (P7)**: depends on all desired stories.

### Parallel opportunities

- T002 ∥ the T003 chain (config vs redis).
- The redis-side foundational chain (T003–T008) ∥ the realtime-side driver-contract chain (T009–T011) — different packages.
- T017 (Redis roster) ∥ T018 (memory roster) — different files.
- Polish T031 ∥ T032.

---

## Implementation strategy

Incremental by story, each an independently testable increment. The MVP checkpoint is US1 (real cross-process delivery), but per Q3 the whole set ships as one deliverable — US2/US3/US4 are not deferred. TDD throughout: the failing test in each task precedes its implementation.

## Notes

- Every task naming a decision-table rule names its single home — a task may not introduce a second spelling.
- Commit by category and by package (constitution #9): a `feat(redis)` chain, a `feat(realtime)` chain, `test`, `docs`, and `chore(agents)` for the brief regeneration are separate commits.
- Never `|| true` a gate step (memory: suppressed errors → false success).
- Remove any developer-agent worktree before running `deno task test` at the repo root (memory: the pre-commit `deno check` scans worktrees).
