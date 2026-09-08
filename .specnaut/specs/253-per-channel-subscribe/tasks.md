# Tasks: per-channel subscribe

**Input**: `.specnaut/specs/253-per-channel-subscribe/plan.md` — the only design
document.
**Linked issue**: [#295](https://github.com/locknessland/lockness-monorepo/issues/295)
**Branch**: `253-per-channel-subscribe`

**Tests**: included and written first. TDD is non-negotiable in
`.specnaut/memory/constitution.md`, and this feature's whole failure class is
*silent* — a channel recorded locally, unsubscribed on the broker, `{ ok: true }`
returned, nothing logged. A test written after the code here proves nothing,
because the code is what taught the test what to look for.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelisable: a different file, no dependency on an incomplete task.
- **[Story]** — US1…US4 from plan.md §2.

## The rule that governs every task below

**A task may not put a decision anywhere but its home in plan.md §5.** Where a
task touches a rule in that table, the row is named in the task. A review
finding that a decision has two homes is a plan violation, not a style opinion.

**Three warnings carried from the audits, because they name what an implementer
will actually reach for:**

1. `watchChannel` **will** be written closing over `channel` and passing it to
   the handler — it is right there in scope. That kills `onMessage`'s
   deny-by-default check (FR-019, §5 row 11).
2. The pending record **will** be written on `RedisSubscribeConnection` rather
   than on the generation, the first time someone hits the burst. That is #245's
   shape (§5 row 8).
3. `watchChannel` **will** call `topic(channel)`, which returns the right bytes
   today and silently corrupts the subscription the first time `topic()` learns
   to escape (§5 row 4).

---

## Phase 1: Setup — measure before changing anything

- [X] T001 Bring up a scratch broker and confirm the live suite is green on today's tree, so every later red is this feature's: `docker run -d --rm --name lockness-295-redis -p 6388:6379 redis:7-alpine`, then `LOCKNESS_REDIS_PORT=6388 deno task test:redis`. **Port 6379 on this machine belongs to an unrelated project's container and must not be touched.**
- [X] T002 Record the SC-001 baseline in `.specnaut/specs/253-per-channel-subscribe/baseline.md`: for an instance hosting a strict subset, the broker receiver count for a publish to a non-hosted channel, measured with `PUBLISH`'s integer reply. Today it is non-zero; the feature's claim is that it becomes 0.
- [X] T003 Record the SC-005 baseline in the same file: `PSUBSCRIBE` frames on the wire for a burst of N joins, at N = 8, 32, 128. Expected N(N+1)/2 today. **This is the measurement the original CRITICAL was about, and no criterion currently sees it.**

## Phase 2: Foundational — the subscriber's record. Blocks every user story.

**This phase is where the last three CRITICALs lived.** Nothing in Phase 3+ is
correct if the state machine is not.

- [X] T004 [P] Failing test SC-010 in `packages/redis/tests/subscriber.test.ts`: watch → unwatch (allowed to settle) → watch of the same pattern **on one socket generation** issues a second `PSUBSCRIBE` and delivers.
- [X] T005 [P] Failing test SC-015 in `packages/redis/tests/subscriber.test.ts`: the same cycle with the re-watch landing **before** the `+punsubscribe` acknowledgement. This is the window `retire`-at-enqueue exists for; SC-010 does not reach it.
- [X] T006 [P] Failing test SC-016 in `packages/redis/tests/subscriber.test.ts`: a `+psubscribe` arriving **after** its pattern was retired records nothing, on a **live** generation with a stale claim.
- [X] T007 [P] Failing test SC-009 in `packages/redis/tests/subscriber.test.ts`: a `+psubscribe` arriving after its generation was **discarded** records nothing on the new generation.
- [X] T008 Add `claim` / `confirm` / `retire` / `has` to `SocketGeneration` over two **private** sets in `packages/redis/subscriber.ts` (FR-009, §5 row 8). **Every mutation is co-turn with its frame's enqueue** — `claim(p)`, the `patterns.has(p)` re-read before it and that pattern's enqueue are one synchronous turn, and so are `retire(p)`, `patterns.delete(p)` and the `PUNSUBSCRIBE` enqueue. An `await` between a claim and its enqueue lets an unwatch reach the chain first: broker subscribed, `has(p)` false, `patterns` empty, a live subscription with no handler. FR-013 does not catch it. `confirm` returns early when `#pending.delete(p)` is false — a retired claim makes the acknowledgement stale, and that one line is what closes both routes of the third CRITICAL.
- [X] T009 Bind `const gen = this.#generation` at `#activate`'s construction site in `packages/redis/subscriber.ts:780-783`, pass it to `#armKeepalive` at `:843`, and delete the now-redundant predicate at `:690` (FR-021). This is #298's FR-002 finally landing; annotate `.specnaut/specs/251-socket-generation-object/plan.md` FR-002 with the date, and close [#321](https://github.com/locknessland/lockness-monorepo/issues/321).
- [X] T010 Thread the generation into the read path — `#readLoop(conn, gen)` → `#dispatch(reply, gen)` — in `packages/redis/subscriber.ts` (FR-021). **Do not** reach it through `this.#generation` in `#dispatch`: a discard landing inside `readReply` would record a pattern on a generation that never confirmed it.
- [X] T011 Recognise the 3-element `+psubscribe` / `+punsubscribe` push frames in `#dispatch` — currently discarded at `packages/redis/subscriber.ts:1079`'s `reply.value.length !== 4` guard — and call `gen.confirm(pattern)` on the subscribe ack (FR-009). The third element is an **integer**; `reply.type === 'simple'` is a branch that never fires.
- [X] T012 Make `#activate` issue only patterns where `gen.has(p)` is false, and `claim` each one **before the first await** in `packages/redis/subscriber.ts` (FR-009, §5 row 7). The whole burst bound rests on that ordering.
- [X] T013 Re-read `patterns.has(pattern)` **and** the generation's record inside `#activate`'s loop rather than trusting the pre-await snapshot (FR-013). `#dispatch` writes to the record during those same awaits.
- [X] T014 Report the count **this activation put on the wire** — the delta's length — at `packages/redis/subscriber.ts:917` (FR-010). Not `patterns.size`, which over-reports an outage that ends, and **not** the generation's issued size, which is driven by acks that may not have landed. **Leave `:998` alone**: it is the retry *scheduling* line, fired before any generation exists, forecasting what the retry will attempt — `patterns.size` is already correct there.
- [X] T015 Add `punsubscribe?` and an **awaitable single-pattern subscribe** returning `void | Promise<void>` to the `RedisSubscriber` port in `packages/realtime/drivers/redis.ts:155-177` (FR-001). Existing `psubscribe(pattern, handler): void` is untouched — that is what keeps all 9 implementations working and keeps Q2's "no second port break later" true.
- [X] T016 Implement both on `RedisSubscribeConnection` in `packages/redis/subscriber.ts`. **The single-pattern seam REJECTS when the write does not reach the socket, and still schedules the retry** (FR-001) — `#activate` catches everything and returns normally (`:753-757`, `:859`), so a seam that just returns `#activate([p])` resolves with nothing on the wire. `#activate`'s never-throw contract stays untouched for `psubscribe` and the retry timer: they have no caller to reject to.
- [X] T016a The JSDoc states the guarantee **and its failure leg**: *"the frame is on the wire, or the caller was told it is not"* — never the first half alone. Plus the residual: one RTT **plus the queue depth ahead of the frame** on the generation's serialized write chain, bounded by FR-017a's cap.
- [X] T017 [P] Mutation battery for the state machine in `packages/redis/tests/mutations/per_channel_record_295.ts`, following `docs/testing.md`'s convention. At minimum: `retire` clearing only one set; `confirm` recording unconditionally; `claim` moved after the first await. Each row must be **proven to go red** against the witness that owns it.

## Phase 3: Foundational — the realtime seam. Blocks every user story.

- [X] T018 [P] Add `watchChannel?` / `unwatchChannel?` returning `void | Promise<void>` to `BroadcastDriver` in `packages/realtime/driver.ts` (FR-002, §5 row 5).
- [X] T019 [P] Add a `channelWatcher(driver)` capability guard beside `presenceRoster` in `packages/realtime/manager.ts:112-120`, narrowing to a watch-capable driver **as a set** (FR-025, §5 row 13). Detecting the two members independently is the defect; a subscriber with `psubscribe` and no `punsubscribe` accumulates one permanent subscription per channel ever hosted, which is strictly worse than today and invisible.
- [X] T020 [P] Failing test for the funnel in `packages/realtime/tests/manager.test.ts`: every membership mutation crosses `#joinLocal`/`#leaveLocal`, and the empty `Set` is deleted so `has()` is the single spelling of "not hosted".
- [X] T021 Introduce `#joinLocal` / `#leaveLocal` in `packages/realtime/manager.ts` as the **only** writers of `subscriptions`, funnelling `:432`, `:444`, `:463` and `:507` (FR-011, FR-012, FR-020, §5 rows 1 and 2). The transition test and its hook run in the **same synchronous turn** as the mutation — no `await` between them, or S5's window reopens: a join during a leave's roster round-trip unwatches a channel with a live authorized subscriber, permanently.
- [X] T022 [P] Give the test doubles the new members so the hermetic suite can reach the new path (SC-014 prerequisite): `packages/realtime/tests/fake_redis.ts`, `packages/realtime/tests/recording_ports.ts`, and `driver_contract.test.ts`'s conformance driver. **Both port members are optional, so zero of the 23 implementations are forced to change** — without this the pre-completion gate exercises the branch this feature replaces.
- [X] T023 Replace the **event half** of `awaitSubscribers`'s readiness gate in `packages/realtime/tests/live_realtime.ts:432` with a probe on a channel the instance has watched (FR-024). **Keep polling for a non-zero receiver count — do not treat the watch resolving as proof.** A watch can resolve on the failure leg with a WARN and a scheduled retry (T016), and a gate that asserts once instead of polling hangs for 10 s: the exact symptom this task exists to remove. **Leave the control half byte-identical**, including its deliberately unsigned probe — that probe's expected `dropped a control message of invalid shape` line is live evidence the FR-015 MAC check runs against a real broker. Without this task all **ten** callers in `redis_broker_integration.test.ts` time out at 10 s.
- [X] T024 [P] Test SC-013 in `packages/realtime/tests/`: `isValidName` rejects every Redis glob metacharacter — `*`, `?`, `[`, `]`, `\`, `^` — in a test **named for the dependency it protects**, and add a mutation row. Widening `NAME_RE` must turn a silent broker-wide firehose into a red test.
- [X] T025 Record the FR-022 dependency at all four sites: `packages/realtime/protocol.ts` beside `NAME_RE` (`:48`) and in `isValidName`'s JSDoc; `packages/realtime/manager.ts` in `#assertUsableChannel`'s docstring (`:353`); `packages/realtime/drivers/redis.ts` at the `watchChannel` docstring; and `packages/redis/connection.ts` at `discard` (`:516-522`), where FR-021's local depends on the close and the null being one synchronous step. **Recording it only at `watchChannel` reaches the one reviewer who is not the risk.** Also amend #314's "cleanup is total" comment at `manager.ts:499-505` to say cleanup is now a **wire** operation.

## Phase 4 — US1: an instance receives only what it hosts (P1)

**Independent test**: two instances under one prefix, A hosting `alpha` and B
hosting `beta`; a publish to `beta` produces **zero** receivers on A. Live broker.

- [X] T026 [P] [US1] Failing live test SC-001 in `packages/realtime/tests/redis_broker_integration.test.ts`, measured by `PUBLISH`'s integer receiver count — exact, and immune to the timing that makes a frame-sampling assertion flaky.
- [X] T027 [P] [US1] Failing test SC-005 in `packages/realtime/tests/`: N `subscribe()` calls **started without awaiting** and settled with `Promise.all` put N `PSUBSCRIBE` frames on the wire, not N(N+1)/2. Written as `for (…) await subscribe(…)` this passes while never forming a burst — that construction is part of the criterion, not an implementation detail of the test.
- [X] T028 [US1] Add `eventPattern(channel)` to `packages/realtime/drivers/redis.ts` as the **pattern-context** topic builder, distinct from `topic(channel)`'s literal context (§5 rows 3 and 4). One builder serving both is what `drivers/redis.ts:830-836` separated on purpose.
- [X] T029 [US1] Implement `watchChannel` in `packages/realtime/drivers/redis.ts`: awaits FR-001's seam, and **throws when no handler has been registered** (FR-004) — `onMessage` being called first at `manager.ts:202` is an ordering, not a contract.
- [X] T030 [US1] Make `onMessage` register the handler **without subscribing** when the subscriber is watch-capable, and keep today's prefix-wide `PSUBSCRIBE` when it is not (FR-004, D-5).
- [X] T031 [US1] Call `watchChannel(channel)` from `#joinLocal` on the 0→1 transition and nowhere else, in `packages/realtime/manager.ts` (FR-003, §5 row 1), and **await** it (FR-002).
- [X] T031a [US1] Handle the rejection in `ChannelManager.subscribe`: **keep the membership** (the retry re-issues from `patterns`; dropping it turns a transient write failure into permanent deafness), log **one** WARN naming the channel, answer `{ ok: true }`. This is the plan's one new `catch` — §7's constitution row is written for it, and `{ ok: false }` is wrong because it would be indistinguishable from an authorization denial.
- [X] T032 [P] [US1] Test FR-019 in `packages/realtime/tests/`: the channel a frame is attributed to comes from the **delivered topic** (§5 row 11). Pin that a `watchChannel` closure capturing `channel` fails this test, because that implementation will look correct.

## Phase 5 — US2: the last leaver stops the traffic (P1)

**Independent test**: A is the only host of `alpha`; the last client leaves; a
publish to `alpha` produces zero receivers on A.

- [X] T033 [P] [US2] Failing live tests SC-003 and SC-006 in `packages/realtime/tests/redis_broker_integration.test.ts`: two clients on one channel produce exactly one `PSUBSCRIBE` **per socket generation** and, after both leave, exactly one `PUNSUBSCRIBE`; and after the unwatch, zero receivers — measured at the broker, because a subscription with no handler delivers nothing and still costs bandwidth.
- [X] T034 [US2] Implement `unwatchChannel` in `packages/realtime/drivers/redis.ts`, and `retire(pattern)` at the `PUNSUBSCRIBE` **enqueue** in `packages/redis/subscriber.ts` (FR-005). Remove from `patterns` at the enqueue too: ack-timed removal deletes a live handler under a live subscription when the channel is re-watched inside the round trip.
- [X] T035 [US2] Call `unwatchChannel(channel)` from `#leaveLocal` on the 1→0 transition and nowhere else (FR-003, §5 row 1). `unwatchChannel` is reachable **only** from a key already in `subscriptions` — never from a caller-supplied string — which is why #314's unasserted `unsubscribe` does not put an unvalidated name into a `PUNSUBSCRIBE` pattern context.
- [X] T036 [P] [US2] Failing test SC-008 in `packages/realtime/tests/`: a join landing during a leave's roster round-trip leaves the channel watched and delivering.

## Phase 6 — US3: a reconnect restores every live subscription (P1)

**Independent test**: A hosts `alpha`, `beta`, `gamma`; its socket faults and
re-dials; all three deliver again. Live broker — a fired `onReconnect` is not
proof frames are flowing (#309's shipped contract).

- [X] T037 [P] [US3] Failing live tests SC-002 and SC-007 in `packages/realtime/tests/redis_broker_integration.test.ts`, SC-007 at **N = 1 000** — FR-017a's per-instance cap, deliberately the same number.
- [X] T038 [P] [US3] Failing test SC-011 in `packages/redis/tests/`: after a fault on an instance hosting N channels, the reconnect seam fires within **one** write of the re-issue starting, not N.
- [X] T039 [P] [US3] Failing test SC-012 in `packages/redis/tests/`: a re-issue forced to fail at write *k* leaves the control topic subscribed and delivering, and exactly the channels at positions ≥ *k* unsubscribed until the retry converges.
- [X] T040 [US3] Issue the control topic **first** in `#activate`, ahead of every event topic, and fire `#fireReconnect` once its write has landed rather than after the full loop, in `packages/redis/subscriber.ts` (FR-023, §5 row 9). Today which subscription survives a partial re-issue is settled by Map insertion order, itself settled by `manager.ts:202` preceding `:205` — and FR-004 silently inverts it. Event delivery resuming late is a latency cost; enforcement resuming late is a security one.
- [X] T041 [US3] Keep the two `#activate` callers distinct: the retry path passes the full set, an ordinary watch passes the delta (FR-010, §5 row 7).

## Phase 7 — US4: a channel dropped before the reconnect stays dropped (P2)

**Independent test**: A hosted `alpha`, its last client left, the socket faults;
`alpha` is not re-issued.

- [X] T042 [P] [US4] Failing live test in `packages/realtime/tests/redis_broker_integration.test.ts`: after a fault, a channel unwatched beforehand receives nothing and appears in no `PSUBSCRIBE`. A subscription resurrected by a reconnect is a leak that only appears under fault.
- [X] T043 [US4] Verify FR-005's `patterns` removal is what excludes it, and that nothing in the realtime driver keeps a second list to re-issue from (§5 row 6).

## Phase 8: Polish and cross-cutting

- [X] T044 [P] Failing test SC-017 in `packages/realtime/tests/`: in the WARN release a cap breach emits one WARN naming the breached scope and its **actual count** and admits the subscribe; in the refusing release the same breach raises `ChannelLimitError` and leaves membership unchanged.
- [X] T045 Implement the caps in `packages/realtime/manager.ts` — 1 000 per instance, 100 per connection, tested in `subscribe` **before `set.add`** (FR-017, §5 row 14). The per-connection count comes from a `Map<clientId, Set<channel>>` maintained inside `#joinLocal`/`#leaveLocal`; D-1 is amended for it, and nothing may read *hosting* from that map. Export `ChannelLimitError` from `packages/realtime/mod.ts` from the first release, inert until the second.
- [X] T046 File the issue that **removes** the WARN in the following release (FR-017b), and reference it from FR-017b the way #321 is referenced from FR-021. A deprecation shim nobody deletes is how a two-release plan becomes permanent.
- [X] T047 [P] Throttle `#handlerFaults` once per socket **generation** rather than per pattern in `packages/redis/subscriber.ts` (FR-014). **The map stays a class field** — `subscriber.ts:199-205` records that it is reached from a deferred `.catch` that can outlive the generation. Emit the per-pattern tally at `#discardSocket`'s clear (`:637`) so volume is bounded without losing attribution.
- [X] T048 [P] Arm the keepalive on a **generation change**, not on every activation, in `packages/redis/subscriber.ts:843` (FR-015). An instance joining more often than `keepaliveMs` currently never emits a `PING`, and the liveness signal stops being independent of application traffic.
- [X] T049 [P] Add a `watchChannel` to #288's fixtures in `packages/realtime/tests/prefix_anchoring.test.ts` — under FR-004 a fixture that registers the seams and never watches has zero event subscriptions and `eventSubscriptions`'s `found.length > 0` throws (S12).
- [X] T050 [P] Docs: the fan-out section in `docs/realtime.md` (what an instance now receives, and the caps); the unsubscribe seam in `packages/redis/README.md`; the watched-set/re-issue-set invariant in `packages/realtime/AGENTS.md`. Verify the `AGENTS.md` edit falls **outside** the `<!-- generated:* -->` regions.
- [X] T051 Update the mutation-battery counts in `docs/testing.md` and in each battery's own docblock. **A number changed here is a number quoted elsewhere** — grep the old figure, not the thing it counts.
- [X] T052 Re-measure T002 and T003's baselines against the shipped tree and record before/after in `baseline.md`, including SC-005's burst at N = 8, 32, 128.
- [X] T053 Full gate: `deno fmt && deno lint && deno check && deno task test`, then the live suite on the scratch broker, then `deno task mutate`. Remove the scratch broker; confirm the unrelated container on 6379 is still running.

---

## Dependencies

```
Phase 1 (measure)
  └─> Phase 2 (subscriber record) ─┐
  └─> Phase 3 (realtime seam) ─────┴─> Phase 4 (US1)
                                        └─> Phase 5 (US2)
                                        └─> Phase 6 (US3)   [needs Phase 2 T012, T040]
                                              └─> Phase 7 (US4)  [needs US2's retire]
                                                    └─> Phase 8
```

- **Phase 2 and Phase 3 are independent of each other** and can run in parallel:
  one is `@lockness/redis`, the other `@lockness/realtime`, and they meet only
  at the port declared in T015/T018.
- **US1 needs both.** US2 needs US1's driver seam. US4 needs US2's `retire`.
- **US3 is the only story that can start before US2**, since re-issue correctness
  is a subscriber property — but its SC-002 negative half needs US4's unwatch.

## MVP

**Phase 1 → Phase 2 → Phase 3 → Phase 4 (US1).** That delivers the fan-out
reduction the issue was filed for, measured by SC-001, with the record correct
under burst. It is not shippable alone: without US2 an instance never
unsubscribes, so the pattern set is monotonic over the process lifetime — the
exact behaviour D-5 rejects as *worse* than today. **US1 is the checkpoint, not
the release.**

## Parallel opportunities

- T004–T007 (four failing subscriber tests, one file each concern) — all [P].
- Phase 2 and Phase 3 entirely, by two workers, one per package.
- T044, T047, T048, T049, T050 in Phase 8 — five different files.
