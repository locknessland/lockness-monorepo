# Tasks: Real-time (WebSockets + broadcasting)

**Feature**: `210-real-time-websockets` | **Epic**: [#210](https://github.com/locknessland/lockness-monorepo/issues/210) | **Children**: [#211](https://github.com/locknessland/lockness-monorepo/issues/211), [#212](https://github.com/locknessland/lockness-monorepo/issues/212), [#213](https://github.com/locknessland/lockness-monorepo/issues/213)

**One `tasks.md`, one branch, one flat merge.** Each child is one commit
(`type(T<NN>): subject (#child)` + `Epic: #210` trailer). The `T00N` counter
below is the task counter, **not** the commit scope position — see
`phases/epic-loop.md`. Tests are TDD: written first inside each child, red then
green, full gate before the child's commit. **Decisions**: app-wired (core
untouched); single-process presence MVP; codec + thin `RealtimeClient`.

---

## Phase 1: Setup — new package (child #211)

- [ ] T001 [US1] Create `packages/realtime/deno.json` (name `@lockness/realtime`, exports `./mod.ts` + `./client` leaf, hard deps `@lockness/contract` + `@lockness/hono` + `@lockness/redis` pinned JSR-bare, dev dep `@lockness/notification` for SC-005) and register the workspace member in root `deno.jsonc`
- [ ] T002 [US1] Add the `realtime` entry to `deps.policy.jsonc` — tier implementation, `allow: [contract, hono, redis]`, `soft: [events]` — committed on its own as `chore(deps)`
- [ ] T003 [US1] Add `realtime` to `tests/package_structure.test.ts` PACKAGES list

## Phase 2: WebSocket handler + Connection + upgrade guards (child #211, US1)

**Goal (US1)**: accept a WS connection with lifecycle hooks, a server-derived
identity, and an origin gate. **Independent test**: a fake upgrade drives
onOpen/onMessage/onClose; a forged wire id is ignored; a bad/absent/null origin
is 403'd.

- [ ] T004 [P] [US1] Write `packages/realtime/tests/websocket.test.ts` — SC-001: fake upgrade + fake WSContext; hooks fire; `Connection.send` reaches the socket; an onMessage throw routes to onError, not a crash
- [ ] T005 [P] [US1] Write `packages/realtime/tests/origin.test.ts` — SC-002: exact-triple match; not-listed, substring-lookalike, **absent** Origin, literal **`null`** all 403 (S5)
- [ ] T006 [P] [US1] Write `packages/realtime/tests/identity.test.ts` — SC-002a: `Connection.identity` comes from the upgrade-time verifier; a `subscribe` frame carrying a forged user id does not change it (S1)
- [ ] T007 [US1] Implement `packages/realtime/types.ts` — `Connection` (id, `send`, `close`, immutable `identity`, `readonly metadata`), hook types, structural driver-payload types; `WSContext` via `import type` from `@lockness/hono/network` (A-M2)
- [ ] T008 [US1] Implement `packages/realtime/websocket.ts` — `createWebSocketHandler(hooks)` over `upgradeWebSocket` from `@lockness/hono/deno` (single home, #1); the origin guard (FR-002); identity resolution at upgrade from an app-supplied verifier / session (FR-001a)
- [ ] T009 [US1] Create `packages/realtime/mod.ts` (public surface so far), `AGENTS.md`, `README.md`; `@fileoverview`/`@module`
- [ ] T010 [US1] Full gate for #211 (`run-gate.sh full`), then commit `feat(T01): WebSocket handler + Connection + upgrade guards (#211)` with `Epic: #210`

## Phase 3: Channels + authorizer + drivers + broadcaster (child #212, US2)

**Goal (US2)**: public/private/presence channels with an authorizer, a
memory/Redis driver, presence, and a `BroadcasterLike` broadcaster with
eviction. **Independent test**: unauthorized private subscribe gets nothing;
Redis fan-out reaches a second instance and re-applies the local authorizer;
eviction stops delivery.

- [ ] T011 [P] [US2] Write `packages/realtime/tests/channels.test.ts` — SC-003: public reaches all; private rejects unauthorized subscribe + delivers no event to it; authorized delivers (fake authorizer over `Connection.identity`)
- [ ] T012 [P] [US2] Write `packages/realtime/tests/driver_redis.test.ts` — SC-004 + SC-004a: fake RESP pub/sub fans a broadcast to a second instance; the receiving instance delivers only to locally-authorized subscribers (S6); cross-channel isolation; reserved prefix + bulk-string encoding
- [ ] T013 [P] [US2] Write `packages/realtime/tests/broadcaster.test.ts` — SC-005: import the **real** `BroadcasterLike` from `@lockness/notification` (dev-dep, test-only edge) for a structural assign; per-clientId send does not reach another; SC-005a eviction stops further events
- [ ] T014 [P] [US2] Write `packages/realtime/tests/presence.test.ts` — SC-006: `here`/join/leave to authorized members only; unclean disconnect emits leave (single-process authoritative)
- [ ] T015 [US2] Implement `packages/realtime/driver.ts` (`BroadcastDriver` interface) + `drivers/memory.ts` + `drivers/redis.ts` (injected `RedisCommandClient`, pub/sub, reserved prefix, RESP bulk strings; fail-clear when unconfigured/unreachable — FR-004/FR-004a)
- [ ] T016 [US2] Implement `packages/realtime/channel.ts` — public/private/presence kinds + the authorize gate over `Connection.identity` (FR-003), presence member registry (single-process)
- [ ] T017 [US2] Implement `packages/realtime/manager.ts` — `ChannelManager`/broadcaster: subscribe/unsubscribe, fan-out to authorized subscribers, `send(clientId, event, data): boolean` (`BroadcasterLike`, FR-005), eviction `unsubscribe`/`disconnect` (FR-005a), and the disconnect-teardown handler factory (A-M4); receiving-instance re-authorization on Redis messages
- [ ] T018 [US2] Export the channel/driver/broadcaster surface via `mod.ts`; update `AGENTS.md`/`README.md`
- [ ] T019 [US2] Full gate for #212, then commit `feat(T02): channels + authorizer + memory/Redis driver + broadcaster (#212)` with `Epic: #210`

## Phase 4: Wire protocol + events bridge + client (child #213, US3)

**Goal (US3)**: a JSON wire protocol with name validation, a soft
events→broadcast bridge, and a thin browser client. **Independent test**:
codec round-trip; malformed/oversized/bad-name frames → typed error;
`broadcastOn()` forwarded emitting only `broadcastWith()`.

- [ ] T020 [P] [US3] Write `packages/realtime/tests/protocol.test.ts` — SC-007 + SC-007b: subscribe→subscribed→event round-trip; malformed/oversized frame → typed protocol error (no throw); out-of-charset/oversized channel/event name rejected at the boundary (S3)
- [ ] T021 [P] [US3] Write `packages/realtime/tests/events_bridge.test.ts` — SC-007a: a `Broadcastable` event is forwarded to its channels (fake dispatcher); a non-`Broadcastable` is not; only `broadcastWith()` output leaves, absent → minimal projection, a non-`broadcastWith` field never leaves (S2); the `onAny` subscription is registered with a signal and torn down (A-M5)
- [ ] T022 [P] [US3] Write `packages/realtime/tests/client.test.ts` — the thin `RealtimeClient` codec + subscribe API; it never trusts/echoes server-relayed names without encoding (FR-006a/FR-008)
- [ ] T023 [US3] Implement `packages/realtime/protocol.ts` — envelope types + encode/decode + name validation (charset + max length) + oversized-frame guard (FR-006/FR-006a/FR-009)
- [ ] T024 [US3] Implement `packages/realtime/broadcastable.ts` (`Broadcastable` marker + type guard) and `packages/realtime/events_bridge.ts` — soft-load `@lockness/events` via `tryImport`, structural dispatcher/event types (no `import type` — A-M1), `onAny(handler, { signal })` + teardown (FR-007/FR-007a/FR-007b), forward only `broadcastWith()`, dev-warn on a public-channel target
- [ ] T025 [US3] Implement `packages/realtime/client.ts` — leaf, dependency-free `RealtimeClient` over browser `WebSocket` + the shared protocol codec (FR-008); export via the `./client` subpath
- [ ] T026 [US3] Full gate for #213, then commit `feat(T03): wire protocol + events bridge + client (#213)` with `Epic: #210`

## Phase 5: Polish & cross-cutting

- [ ] T027 Add `docs/realtime.md` (handler, channels/auth/presence, drivers, protocol, events broadcasting, the notifications-broadcaster wiring, and the single-process-presence limitation + follow-up) + link from the AGENTS.md docs index
- [ ] T028 File the cross-process-presence follow-up issue (arch A-M3) via the PO; `deno task agents:brief` regenerate; final full gate on the whole branch before the review handoff

---

## Dependencies & order

- **#211 → #212 → #213** (strict): channels need the `Connection`/handler; the protocol + bridge need the channel manager + broadcaster.
- Within a child, `[P]` test tasks are written together (different files), then implementation.

## Parallel opportunities

- #211: T004 ∥ T005 ∥ T006. #212: T011 ∥ T012 ∥ T013 ∥ T014. #213: T020 ∥ T021 ∥ T022.

## MVP

**US1 (#211)** alone is the MVP checkpoint — a WS connection with lifecycle,
identity, and the origin gate. US2/US3 are the full path in the same branch.

## Independent test criteria

- **US1**: hooks fire on a fake upgrade; forged wire id ignored; bad/absent/null origin 403'd.
- **US2**: unauthorized private subscribe gets nothing; Redis fan-out re-authorizes on the receiving instance; eviction stops delivery; presence to members only.
- **US3**: codec round-trip; bad name/oversized frame → typed error; `broadcastOn()` forwarded emitting only `broadcastWith()`.
