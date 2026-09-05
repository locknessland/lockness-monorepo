# Tasks: Anti-replay on signed control-plane frames

**Feature**: `244-control-frame-anti-replay` | **Backlog item**: [#272](https://github.com/locknessland/lockness-monorepo/issues/272)
**Plan**: [plan.md](plan.md) — read §5 before writing a line. Eleven rows, and three of them exist
because a plan-time audit found the rule had no home.

**The ordering in `#verifyAndDecode` is normative, not stylistic.** Cost gate → shape gate → MAC →
replay checks. FR-005 and §5's ordering row make it binding: a replay check above the MAC turns the
store into an unauthenticated write surface.

**Mutation verification is the discipline here.** The audit established that zero of the 17 existing
control-plane tests can fail when a MAC'd field is added or removed — so "the suite is green" proves
nothing about this feature by default. Every task marked *mutation-verify* is the proof.

---

## Phase 1 — The replay window (no driver changes yet)

**Home: `packages/realtime/control_replay_window.ts`** (new). A concrete class, not an interface —
§5 says a port here would be speculative generality with one implementation.

- [X] T001 Create `packages/realtime/control_replay_window.ts` with `@fileoverview`/`@module`. Export `ControlReplayWindow` with a **non-optional** clock at the class boundary (§5's clock row: an optional `now` gives production and test two paths through the seam the row exists to collapse).
- [X] T002 Implement `admit(origin, nonce, ts): 'ok' | 'stale' | 'duplicate'` — the **single home** for freshness, duplication and the key derivation. Keyed on the **`(origin, nonce)` pair** (FR-001/S1): keyed on the nonce alone, one sender's frame drops as another's duplicate, which is §9's top risk fired by under-specification. It logs **nothing** — §5's drop-reason row puts every WARN in the verifier's guard chain.
- [X] T003 Prune inside `admit`, before the lookup, never on a timer (FR-004). The property is "no entry older than the window is ever *consulted*" — a quiet instance prunes nothing, so a claim that no entry ever *exists* past the window would be false (S7).
- [X] T004 Add the entry cap with **drop-oldest** and a one-shot WARN naming it (FR-004/A9). Drop-oldest fails open for one forgotten in-window nonce; refuse-new would fail closed and take the control plane down, which §9 rates worse.
- [X] T005 [P] Test freshness both ways under `FakeTime`: inside the window `ok`, past it `stale`, and **future-dated** `stale` (FR-002 — a one-sided check lets anyone who can push a clock extend the window).
- [X] T006 [P] Test that two origins using the **same nonce value** both get `ok` (FR-001/S1/US3). Mutation-verify by keying on the nonce alone and watching this fail — this is the regression that would silently break legitimate traffic.
- [X] T007 [P] Test duplicate rejection: same `(origin, nonce)` twice → `ok` then `duplicate`.
- [X] T008 [P] Test both bounds (SC-005): entries past the window are gone after a later `admit`, and the store never exceeds the cap under sustained load.

## Phase 2 — The wire format

**Home: `packages/realtime/drivers/redis.ts`.**

- [X] T009 Add `ts: number` and `nonce: string` to `ControlWire`.
- [X] T010 Add both to `#canonical` — §5 row 1. A field on the wire but not here ships **unauthenticated**, and T017 is the only thing that can detect it.
- [X] T011 Set both in `publishControl`: `ts` from the one `now()` seam, `nonce` from `crypto.getRandomValues` (16 bytes, fixed-width hex). A counter would collide across senders and again after every restart (S8).
- [X] T012 Add `DEFAULT_CONTROL_WINDOW_MS = 30_000` beside the four existing `DEFAULT_*` constants (`drivers/redis.ts:265-269`), plus the option on `control`, resolved **once** in the constructor (§5's window row, A6).
- [X] T013 Construct the `ControlReplayWindow` in the driver constructor, passing the resolved window and the driver's `now()`.

## Phase 3 — Ingest, in the order the plan makes binding

- [X] T014 Add the **pre-MAC cost gate** (FR-011/S2): reject a control payload above a few KB before `JSON.parse`, and reject a `member` that is not a plain object of the expected scalar fields. Today `member` is the one field the shape gate never checks, and `hmacSha256Hex` is a synchronous pure-JS SHA-256 — so one unauthenticated PUBLISH costs every instance a parse, a re-serialize and a blocking hash. The 10 MB RESP cap (`packages/redis/resp.ts:43`) bounds it; a few KB is the honest bound for a control frame.
- [X] T015 Extend the shape gate for the new fields (FR-012/S4): `Number.isInteger(wire.ts)` and a `nonce` string of exact width. `1e400` parses to `Infinity` and `JSON.stringify` collapses `Infinity`/`-Infinity`/`null` to identical bytes — three wire values, one MAC. An object nonce compares by identity, so duplicate detection would silently fail while the store grows.
- [X] T016 Call `admit` **after** the MAC check (FR-005), map its verdict to two distinct WARNs — stale naming the observed clock delta (SC-004), duplicate naming the origin. Keep the guard chain **flat**: §5's ordering row forbids decomposing the existing gates as part of this change, because the order is the specification and a chain-of-responsibility would hide it (A10).

## Phase 4 — The tests the existing suite cannot provide

**This phase exists because of a counted finding**: `grep hmacSha256Hex packages/realtime/tests/`
returns nothing, so none of the 17 control-plane tests would notice a MAC'd field going missing.

- [X] T017 Write the per-field MAC-mutation test (FR-013/SC-006): mutate **each** covered field in turn — `kind`, `target`, `channel`, `member`, `origin`, `ts`, `nonce` — and assert the MAC changes for every one. Then mutation-verify the test itself by removing a field from `#canonical` and confirming it fails.
- [X] T018 Re-verify `control_auth.test.ts`'s five forgery tests still drop at the **MAC** gate, not the new shape gate (FR-014/A4). If they drop earlier they keep passing for a different reason and the FR-015 forgery matrix is silently lost. Assert on the WARN each one produces.
- [X] T019 [US1] End-to-end replay test on `FakeRedis`: capture a legitimately published frame, re-publish it verbatim, assert it is obeyed **once** and the replay produces no effect. Mutation-verify by removing the `admit` call.
- [X] T020 [US2] Staleness test: an instance with an **empty** store rejects a frame older than the window — the case that protects a restarted or newly-started instance, which holds no nonce (S3).
- [X] T021 [US3] Concurrent-publisher test: two instances publish, a third accepts **both**. The regression T006 guards at unit level, asserted here through the real driver.
- [X] T022 Update `control_plane.test.ts:49` to assert `ts` and `nonce` are **absent** from the manager-facing shape alongside `mac` (§5's projection row, A11) — a `{...wire}` spread would leak them, compile cleanly and pass the existing assertion.
- [X] T023 Assert `manager.ts` is untouched: `handleControl` receives only frames that already passed, and no replay check exists there.

## Phase 5 — Live broker, docs, and the contract correction

- [X] T024 [US1] Add the FR-010 rejection test to the #273 live-broker suite: publish an attacker-chosen replay onto the run's **own** control topic and assert the drop.

  **The first version was a false green.** It replayed an `evict` and asserted the socket stayed closed — which holds whether or not anti-replay works, because a replayed evict is a no-op once its target is gone. Disabling the check entirely left it passing. Rewritten against `presence-join`, which re-emits on every delivery, and mutation-verified. This is the second time on this branch that "not obeyed" turned out to be satisfied by an unrelated path. Prerequisite noted in the plan: [#282](https://github.com/locknessland/lockness-monorepo/issues/282) turns "the control topic is namespace-anchored" from a belief into an assertion — proceed, and record in the report that the seam rests on it.
- [X] T025 Update `packages/realtime/tests/live_realtime.ts` — its control probe publishes literal `'{}'` (`:284`) and its comment (`:241-245`) names the exact WARN it expects. Both go stale the moment the shape gate changes (A12).
- [X] T026 Correct `Connection.id`'s documented contract (`types.ts:53`, `websocket.ts:109`). "A stable per-connection transport id" invites a user id; A2 showed that a guessable or reused id turns a replayed `evict` into a live weapon that hard-closes a socket and strips the member from the authoritative roster. Docs only — the framework cannot police an id it does not generate.
- [X] T027 [P] Document the window, its default, and what each of the six drop WARNs means in `docs/realtime.md` and `packages/realtime/README.md`.
- [X] T028 Regenerate the agent brief — `deno task agents:brief`. A new non-`.test.ts` file lands in the package's **source** inventory and `agents:brief --check` is a hard CI step.
- [X] T029 Run the pre-completion gate: `deno fmt && deno lint && deno check && deno task test`, then the live suite `LOCKNESS_REDIS_PORT=<port> deno task test:redis` against a throwaway `redis:7` broker.

---

## Dependencies

```text
Phase 1 (T001-T008)  the replay window, standalone and fully testable
   └─> Phase 2 (T009-T013)  the wire format
          └─> Phase 3 (T014-T016)  ingest, in the binding order
                 └─> Phase 4 (T017-T023)  the coverage the suite lacks
                        └─> Phase 5 (T024-T029)
```

Phase 1 has no dependency on the driver at all — it is a pure class with an injected clock, which is
the point of extracting it (A8).

## Parallel opportunities

- T005 ‖ T006 ‖ T007 ‖ T008 — independent unit tests of one class.
- T027 ‖ T028 — different files.

## MVP scope

**Phases 1–3** (T001–T016) deliver the mechanism. **Phase 4 is not optional polish** — without
T017 the feature can ship with a field outside the MAC and every gate stays green, which is the
defect class this project has now hit three times.

## Review cycle (2026-09-05)

The `/specnaut review` gate returned **fail — 0 CRITICAL, 3 HIGH, 10 MEDIUM, 11 LOW**.

| # | Finding | Outcome |
| :--- | :--- | :--- |
| HIGH | The 8KB ceiling was enforced at **ingest only**. Every receiver rejects an oversized frame, so an app whose `PresenceMember.info` outgrew it would publish happily and have every remote instance drop it silently — the WARN landing where it cannot be fixed. The fail-closed inversion §9 rates as worse than the replay. | Fixed — publish-side refusal, and the ceiling is now configurable |
| HIGH | `isPlainMember` had **zero tests**; replacing the whole conjunct with `true` left the suite green | Fixed — 7 rejection cases plus a negative control |
| HIGH | FR-014 was implemented for **1 of 5** forgery tests; two were observed still reaching the MAC gate, so one more pre-MAC constraint would silently move them and lose the matrix | Fixed — all five pin their gate |
| MED | `windowMs` unvalidated: `NaN` makes `Math.abs(x) > NaN` false for every frame, silently disabling freshness | Fixed — validated at boot, like the secret beside it |
| MED | `#prune`'s early `break` does not hold the invariant its comment claimed | **Comment fixed, algorithm untouched** — see below |
| MED | The entry cap is global, fixed, and never passed from the driver | Filed as [#283](https://github.com/locknessland/lockness-monorepo/issues/283) |

**On `#prune` — the one I expected to be a bug and was not.** I flagged it to the reviewer as my own
main doubt: entries carry the *frame's* timestamp but arrive in wire order, so an older entry can
survive behind a younger one and the `break` stops early. All three seats independently confirmed
the invariant is false **and** that the verdict is never wrong: a surviving entry can only be matched
by an identical `(origin, nonce)`, and both are inside the MAC along with `ts` — so the only frame
that can reach it is a verbatim replay carrying that same old `ts`, which the freshness gate rejects
first. The consequence is retention, bounded at ~2 windows and absolutely by the cap. Had I acted on
my own instinct during the freeze I would have changed working code.

**The plan contradicted itself and the review refused to adjudicate it, correctly.** FR-004 requires
a one-shot capacity WARN from the replay store; §5 bans WARNs there. Resolved in favour of both: the
row bans drop *reasons* elsewhere, and "the store is full" is an operational fact about the store,
not a verdict about a frame.

## Not delivered by this feature

- **The HMAC scheme itself** — out of scope per #272 and FR-009. Recorded there: `#canonical` fixes only the top-level key order, so a nested field added later inherits a gap that today fails closed.
- **Enforcement of `Connection.id`'s properties** — T026 documents the constraint; it cannot be checked completely in code.
- **[#282](https://github.com/locknessland/lockness-monorepo/issues/282)** — FR-010's seam rests on it and it stays open.
