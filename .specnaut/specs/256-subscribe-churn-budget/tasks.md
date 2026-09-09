# Tasks: bound the cost of subscribe-verb churn on the WebSocket message path

**Input**: `.specnaut/specs/256-subscribe-churn-budget/plan.md`
**Backlog item**: [#329](https://github.com/locknessland/lockness-monorepo/issues/329)

**Tests**: yes — FR-007 mandates one, and it is **foundational rather than final**: the published
cost table is *derived* from it (§5 row 3), so the numbers must exist and be verified before any
prose quotes them.

**Organization**: by user story, in `plan.md` §2's priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable: different files, no dependency on an incomplete task.
- Every task names its file path, and where it touches a rule in §5 it names that rule's **home**.

## 🔒 Carried forward from `plan.md` §5 — binding on every task below

| The rule a task might touch | Its ONE home | Never spell it anywhere else |
| :--- | :--- | :--- |
| The framework does not meter the verb rate | `packages/realtime/manager.ts` — `handlerHooks` docstring | no option, no counter map, no error type, no `WebSocketHooks` member, no refusal in `unsubscribe` |
| A meter is charged to a stable projection of `connection.identity` | `packages/realtime/types.ts` — `Connection.identity` JSDoc | elsewhere it is a **pointer**, never a restatement |
| What a cycle costs | `packages/realtime/tests/churn_cost_329.test.ts` | no second executable count; the doc table says it is derived |
| The burst floor | `packages/realtime/manager.ts` — `get maxChannelsPerConnection` | never the literal `100`, never the default constant presented as the floor |
| `authorize` gates admission, never verb rate | `docs/realtime.md` — the corrected section | README and JSDoc **point**, never restate |
| What remains unmetered | `docs/realtime.md` — the same section | derived from the cost table, never a second list |

---

## Phase 1: Setup — capture the baselines the verification depends on

**Purpose**: FR-001's structural check and §5's enforcement grep both compare *against* a baseline.
Capture it before anything changes, or there is nothing to diff.

- [X] T001 Capture the pre-change public surface to `<scratchpad>/surface-before.json` via `deno doc --json packages/realtime/mod.ts` — FR-001's check is this file diffed at T028, because `git diff --stat packages/realtime/mod.ts` is blind to a new **member** on `ChannelManagerOptions`, `WebSocketHooks` or `ChannelManager` (audit A3)
- [X] T002 [P] Record the two §5 enforcement greps' current output in the same scratchpad — `rg -n 'churnBudget|maxSubscribesPerConnection|subscribeBudget|verbRate|SubscribeBudgetError|ChannelChurnError|rateLimit\?:' packages/realtime/` (expect **0**) and `rg -n 'onMessage: userHooks\.onMessage' packages/realtime/manager.ts` (expect **1**)
- [X] T003 [P] Record `rg -n 'writes nothing|announces nothing|publishes nothing' docs/realtime.md packages/realtime/ --glob '!tests/'` — FR-005's enumerating search, expected **4 hits**: `docs/realtime.md:578`, `packages/realtime/README.md:108`, `packages/realtime/manager.ts:845` (×2 clauses). If the count differs, the set changed since the audit and FR-005's target list is re-derived before editing, never assumed

---

## Phase 2: Foundational — the executable cost model

**⚠️ BLOCKING**: every user story's prose quotes these numbers. Nothing downstream may state a cost
the test has not produced.

- [X] T004 Create `packages/realtime/tests/churn_cost_329.test.ts` with a `@fileoverview` stating that this file is the **single home** of the per-cycle cost (§5 row 3), that the `docs/realtime.md` table is derived from it, and that the atoms are owned by three other files it must not re-assert — `channel_watch_295.test.ts:118-128` (the watch pair), `roster_atomicity_323.test.ts` (one `EVAL` per roster write), `presence_rejoin_327.test.ts:111,169` (the re-join's zero writes and its authoritative read)
- [X] T005 Add the counting driver double to `churn_cost_329.test.ts` — four independent measures per FR-004, not two: **driver commands**, **control publishes issued**, **control-frame verifications delivered** (count `onControl` deliveries), and **application authorizer invocations**. The last is the term S1 found nobody was counting and it is the one an operator pays for
- [X] T006 Assert the **composite** per-cycle totals for a `presence-*` channel in `churn_cost_329.test.ts`, sole-holding connection, driven as `subscribe → unsubscribe → subscribe` — exact numbers, never "bounded" (#329's AC-5 as amended: a publish count is bounded only by refusing frames, which presumes the rejected option)
- [X] T007 [P] Assert the composite totals for a `private-*` channel in the same file — the row that isolates the **authorizer invocation** from the roster work
- [X] T008 [P] Assert the composite totals for a **public** channel in the same file, including that **zero** authorizer invocations occur — this is the cheapest amplification path in the package (§1) and the cell that proves `authorize` is structurally blind to it
- [X] T009 [P] Assert the `not a member / not owned → 0` cell in the same file — `#leaveLocal` returns early at `manager.ts:1307` and the presence branch is gated on `members?.get(clientId)`. This is the ordinary double-unsubscribe **and** the case #332 will add a caller to (audit A12)
- [X] T010 Assert the **re-join** row in `churn_cost_329.test.ts`: zero writes, zero publishes, and **one authoritative roster read** whose reply is the whole room. The read is the correction FR-005 exists for, and asserting it here is what stops the prose drifting back to "free"
- [X] T011 Run `deno test packages/realtime/tests/churn_cost_329.test.ts` and record the produced totals in the scratchpad — **these numbers, and no others, are what Phase 3 publishes**

---

## Phase 3: US1 (P1) — an operator can size a verb budget

**Goal**: the numbers a budget can be keyed on are published, on axes the seam can observe.

**Independent test**: an operator reading only `docs/realtime.md` can state the worst-case cost of a
`subscribe` frame on each channel kind without opening the source.

- [X] T012 [US1] Write the published cost table into `docs/realtime.md`, replacing nothing yet — axes are **`verb × channel kind`, worst case per frame** (audit A1: the 0→1 / already-hosted / 1→0 transitions live in private maps and are invisible to a meter running in `onMessage` before `manager.subscribe`, so publishing them satisfies the letter of SC-001 and gives an operator numbers they cannot key a bucket on)
- [X] T013 [US1] Show transition-dependent variation as a **range** in that table, with one sentence saying the seam cannot tell the cheap cell from the expensive one so the budget is sized on the worst
- [X] T014 [US1] Caption the table as **derived from `packages/realtime/tests/churn_cost_329.test.ts`**, naming all four test files (§5 row 3 — the caption is what makes this a pointer rather than a second claim), and state the driver-collapse axes: a driver with no roster capability has no `EVAL` and no `HGETALL`; a driver with no control plane has no publishes
- [X] T015 [US1] Add the **fleet-wide verification** column and its explanation to that section — the loopback drop is *before* the MAC (`drivers/redis.ts:1732`), so every other instance pays a length gate, `JSON.parse`, field validation, a synchronous SHA-256 HMAC, a timing-safe compare and a replay-window admit; scales with **fleet** size and is charged to instances hosting nothing (audit A7). State that it is CPU, not retained memory — `ControlReplayWindow` is bounded at 10 000 entries with per-origin fair share — so nobody files it as a leak
- [X] T016 [US1] Verify no benchmarked throughput, latency or capacity figure entered the table (FR-004, security S10's binding boundary): counts and shapes only. `rg -n 'req/s|frames/sec|ms\b|throughput|saturation' docs/realtime.md` over the new section returns nothing — a measured rate describes the maintainer's machine, not the framework, and is hard rule #10's line

---

## Phase 4: US2 (P1) — an application refuses churn without breaking eviction

**Goal**: the four sites that today point at `authorize` point at `onMessage` instead, and the
worked example cannot be followed into any of the three traps the security audit found.

**Independent test**: an application following the example refuses a sustained loop, and an
anonymous socket cannot deny service to other anonymous sockets through it.

- [X] T017 [US2] Rewrite `docs/realtime.md:597-603` — the home of "authorize gates admission, never verb rate" (§5 row 5). Name all three reasons the hook cannot carry a verb budget, each with its anchor: public channels run none (`manager.ts:892`), `unsubscribe` runs none (`manager.ts:1451`), and per #331 a denial on a held channel changes nothing. **Add the fourth**, which is S1's: the authorizer runs *ahead of every cap* (`#checkChannelCaps` is downstream at `manager.ts:916`), so a **denied** subscribe on an invented `private-*` name buys a full DB read for one 30-byte frame — the hook #329 proposed as the remedy is the largest per-frame charge in the package, and it doubles as a channel-name enumeration oracle
- [X] T018 [US2] Write the worked example in that section. Its **first branch handles `identity === null`** — refusing the verb outright, or falling back to a per-connection bucket with its reconnect reset named. **Never one shared anonymous bucket** (security S3): `resolveIdentity` is optional and defaults to `null` (`websocket.ts:262`), so in the default wiring every socket shares that key and one attacker denies service to all of them — rejected option (d)'s failure mode reappearing inside the remedy
- [X] T019 [US2] In the same example, key on an explicit **stable string projection** (`String(user.id)`), never on `connection.identity` directly, with the one-sentence reason: `Identity` is `unknown`, so an object identity keys a `Map` **by reference**, misses every time, and the meter **fails open** silently with no type complaint (security S7)
- [X] T020 [US2] In the same example, show the **throttled upgrade route beside** the metered `onMessage`, and install an `onError` hook — the seam is only half the answer (R4), and without `onError` the framework's default sink emits one `console.error` per malformed frame at whatever rate the client chooses (`websocket.ts:184`, security S8)
- [X] T021 [US2] Add to that section: an application whose **signup is unauthenticated** needs a second key above the identity meter, because a per-identity bucket scales with account count — "does not rotate on reconnect" is not "cannot be minted" (security S6). And one sentence on the fail-open default: kind is derived from the name, the default is **public**, a channel matching neither prefix runs no authorizer and is readable by any anonymous socket — **naming is the access control** (security S9)
- [X] T022 [P] [US2] Rewrite `packages/realtime/README.md:113-115` to the one-line version plus the link — it currently says verbatim "`authorize` runs on every presence subscribe and is where a per-call budget belongs", which survives every other edit in this feature and alone fails SC-005 (audit A5)
- [X] T023 [P] [US2] Add **one clause** to `packages/realtime/channel.ts:78`, the published `AuthorizeResult` JSDoc: "…which is not a verb budget: see `ChannelManager.handlerHooks`." **Delete nothing** — an authorizer legitimately *is* a rate-limit increment for the **admission** decision and #331's reasoning depends on that reading (audit A5). This JSDoc ships to every consumer's editor
- [X] T024 [P] [US2] Add the same clause at `packages/realtime/AGENTS.md:144`

---

## Phase 5: US3 (P1) — a reconnecting client is never refused, on any configured cap

**Goal**: the published burst floor is the **effective** cap, not the default constant.

**Independent test**: an operator running `maxChannelsPerConnection: 200` — the value
`docs/realtime.md:614` itself shows — sizes a burst that does not refuse their own clients.

- [X] T025 [US3] Add `get maxChannelsPerConnection(): number` to `ChannelManager` in `packages/realtime/manager.ts`, returning `this.#maxChannelsPerConnection`, with JSDoc saying it is the **effective** cap this instance was constructed with and that `MAX_CHANNELS_PER_CONNECTION` is only its default (FR-010, §5 row 4 — this getter **is** the home of the burst floor). Sole admitted surface addition; additive, non-breaking, no `any`
- [X] T026 [US3] Document the burst floor in `docs/realtime.md` **by naming the getter**, never the literal `100` and never the default constant presented as the floor (audit A2: `MAX_CHANNELS_PER_CONNECTION`'s own JSDoc calls itself the default, the effective value was private, and the same doc page sets it to 200 — an operator following the old guidance refuses their own 200-channel client's reconnect, which is what US3 forbids)
- [X] T027 [P] [US3] Record the charge-target rule at its home — `Connection.identity`'s JSDoc in `packages/realtime/types.ts` (§5 row 2): `id` is minted per socket and never reused so it is **not** a charge target; `identity` does not rotate on reconnect so it is, subject to being mintable at signup cost. Everywhere else this is a pointer

---

## Phase 6: US4 (P2) — the pass-through is a decision, and deleting its reason fails a test

**Goal**: `manager.ts:630` explains itself at the line a maintainer would edit, and the explanation
is anchored rather than merely written.

**Independent test**: delete the docstring paragraph → a test fails.

- [X] T028 [US4] Write the decision into `ChannelManager.handlerHooks`' docstring in `packages/realtime/manager.ts`, immediately above `onMessage: userHooks.onMessage` (FR-002, §5 row 1 — this is the home). It states: the framework composes `onOpen` and `onClose` and deliberately does **not** compose `onMessage`; why `connection.id` cannot be the charge target (§6's arithmetic — #329's AC-3 and AC-4 are jointly unsatisfiable on a per-socket UUID); that the decisive reason is **revocation**, not the arithmetic — six paths reach `unsubscribe` and exactly one is client-driven, so a spent budget makes an eviction leave permanent roster ghosts; and that option (g), a subscribe-only budget, was considered
- [X] T029 [US4] Include the source-text marker `VERB RATE IS THE APPLICATION'S` in that docstring — the anchor that makes SC-004 falsifiable, on this repo's own precedent at `packages/realtime/tests/log_encoding_291.test.ts:392` (audit A10: without it, delete the docstring and every gate stays green)
- [X] T030 [US4] Reconcile the contradicting neighbour in the **same** edit: `manager.ts:618` already says "the app's own onOpen — where a per-socket rate limit ... lives", twelve lines above. One clause distinguishes them — a per-**socket** limit at open, the per-**verb** budget below. Both are true; a maintainer scanning for "where does a rate limit go" must not find two undifferentiated answers on one screen
- [X] T031 [US4] Assert the marker in `packages/realtime/tests/churn_cost_329.test.ts` — read `manager.ts`, slice the `handlerHooks` region, `assertStringIncludes` the marker. The prose stays free to improve; the decision cannot be silently deleted
- [X] T032 [US4] Run `deno task mutate presence_join_323 roster_sync_330` once (FR-008). Both batteries anchor in `manager.ts` on exact source text, `presence_join_323.ts:118-131` records that one anchor already had to move because `throw error` "also matches `handlerHooks`'s onOpen" — the exact method T028 edits — and `deno task mutate` is **not** in hard rule #5's gate, so a broken anchor ships green and surfaces the next night. One command turns an assumption into evidence

---

## Phase 7: Polish & cross-cutting

- [X] T033 [P] Correct the re-join claim at its three real sites (FR-005, from T003's verified list): `docs/realtime.md:578`, `packages/realtime/README.md:108`, and `packages/realtime/manager.ts:845` — the published `subscribe` JSDoc, which the plan's first draft missed. Each says the re-join writes nothing, announces nothing and publishes nothing **and still performs one authoritative roster read whose reply is the whole room**
- [X] T034 [P] **Add** — not correct — one hand-written pitfall row to `packages/realtime/AGENTS.md`: that `onMessage: userHooks.onMessage` is a decision rather than an omission, the six paths into `unsubscribe`, and that a budget on that method turns an eviction into a permanent roster ghost. The file carries no re-join cost claim today; an earlier draft of the plan asserted it did and the audit disproved it (A6)
- [X] T035 Write the **exhaustive** unmetered list into `docs/realtime.md`'s corrected section (FR-006, §5 row 6), **derived** from the cost table rather than asserted: every `(verb, kind)` cell with non-zero cost that no cap charges. It contains — the verb rate itself; `ping`; application frames; the public-channel churn loop on unique names; **an authorizer invocation per private/presence subscribe, denied ones included, ahead of every cap**; **the decode-rejection path** (`decodeClientMessage` runs a full `TextEncoder().encode(text)` over the whole frame *before* the size check, so the cost is proportional to what was sent, plus one `console.error` per malformed frame without an app `onError`); **the empty `presence` entry** a presence churn cycle retains (R5); the reconnect that resets any per-connection counter; and for an anonymous socket the absence of any non-rotatable charge target — **with the warning that keying the meter on the null identity is an amplifier, not a fallback**
- [X] T036 Write R3 and R4 into `docs/realtime.md` as **accepted residue, in the words the plan uses** (FR-006). R4 especially: the accepted state is that **nothing bounds the reconnect by default** — `@Throttle` is opt-in and neither the handler nor the docs require it on the upgrade route; `by: 'ip'` reads `cf-connecting-ip` / `x-real-ip` / `x-forwarded-for` and the framework's own comment says a client behind a non-stripping proxy can forge them; and **with no proxy at all `clientAddress` returns the literal `'unknown'`** for every request, one shared bucket for the entire internet (security S2). An understated written acceptance is worse than an absent one
- [X] T037 Add the `docs/realtime.md` §Upgrading entry — a "read this", not a "do this": no consumer action is required, the shipped `authorize` guidance was wrong and is corrected, and one read-only getter was added
- [X] T038 Run `deno task agents:brief` — the new test file changes the realtime brief's counts, and the pre-push gate refuses a stale brief. Regenerate the **generated** blocks only; T034's hand-written pitfall is preserved
- [X] T039 Verify FR-001 structurally: `deno doc --json packages/realtime/mod.ts` diffed against T001's baseline shows **exactly one** addition, `ChannelManager.maxChannelsPerConnection`, and no member on `ChannelManagerOptions` or `WebSocketHooks`. Re-run T002's identifier grep: still **0**, and `onMessage: userHooks.onMessage` still matches unwrapped
- [X] T040 Pre-completion gate (hard rule #5): `deno fmt && deno lint && deno check <changed files> && deno task test`. All green before anything is declared done — and `presence_cap_concurrency_323.test.ts`, `presence_rejoin_327.test.ts`, `subscribe_unsubscribe_race_330.test.ts` green **unmodified** (FR-008)
- [ ] T041 File **R1** as a `domain:realtime` issue via the product-owner agent, citing this plan: a re-join costs one `HGETALL` per frame whose reply is the whole cluster-wide roster, and an app-side **frame-rate** meter bounds frames but never per-frame **bytes** — the one residue the documented remedy provably does not close. Proposed shape: a per-channel single-flight on `rosterSnapshot`, which has no client-chosen key, refuses nothing, and reduces work rather than rationing it
- [ ] T042 File **R5** as a `domain:realtime` issue via the product-owner agent, citing this plan: `this.presence` is never deleted — `#joinPresence` does `presence.set(channel, new Map())` (`manager.ts:979`), `unsubscribe` deletes only the member (`:1453`), and there is no `this.presence.delete` anywhere in the file, so each unique presence channel name retains an empty inner `Map` for the life of the process. Fix mirrors `#leaveLocal`: delete the channel entry when `members.size === 0`
- [ ] T043 Add one sentence to **#332**'s body via the product-owner agent: landing `revokeChannel` adds a non-frame caller to the leave path and therefore obliges an update to `churn_cost_329.test.ts` and the published cost table (audit A12). One sentence now is what stops the number going stale
- [ ] T044 Comment the disposition on **#329** via the product-owner agent — AC-1 requires it recorded on the issue. Include the three corrections to the issue's own body (the per-pair count, the re-join's read, and that the `authorize` hook it proposes as the remedy is the largest per-frame charge), and that AC-5 is amended to an exact composite assertion

---

## What the run corrected in these instructions

Three tasks turned out to be wrong as written. Each is left above in its original
form with the correction here, because a silently-edited task loses the finding.

- **T003 found FOUR sites, not three.** The plan named `docs/realtime.md:578`,
  `README.md:108` and `manager.ts:845`; the search also returned
  `manager.ts:984`, the inline comment inside `#joinPresence` carrying the same
  claim. All four were corrected. This is exactly why T003 says to re-derive the
  list rather than trust it.
- **T032's command silently ran ONE battery.** `deno task mutate a b` read only
  `args[0]`, discarded the rest, printed `1 battery: 1 clean` and exited 0.
  Fixed in `scripts/mutate.ts` in its own commit; both batteries then ran clean
  from one invocation, and a typo in any argument now exits 1.
- **T039's check does not detect what it was meant to detect.** The audit
  replaced `git diff --stat mod.ts` with a `deno doc --json` diff, but that
  output does not expand re-exported symbols into member lists, so it reported
  "no change" while the getter had been added. The check that works is a
  filtered source diff: every added non-comment line under `packages/realtime/`,
  which showed exactly one — the getter.

## Dependencies

```text
Phase 1 (T001-T003)  baselines
        │
Phase 2 (T004-T011)  the executable cost model  ── BLOCKS every prose task
        │
        ├── Phase 3  US1 (T012-T016)  the published table
        ├── Phase 4  US2 (T017-T024)  the corrected guidance
        ├── Phase 5  US3 (T025-T027)  the effective burst floor
        └── Phase 6  US4 (T028-T032)  the anchored decision
                │
Phase 7 (T033-T044)  polish, verification, backlog
```

- **T011 blocks T012–T016**: the table publishes the test's numbers, not numbers anyone recalled.
- **T028–T030 block T031**: the marker must exist before a test asserts it.
- **T028 blocks T032**: the batteries are re-run *after* the docstring edit, which is the point.
- **T025 blocks T026**: the doc names the getter, so the getter exists first.
- **T003 blocks T033**: the target list is re-derived, never assumed.
- **T038 after T004**: the brief's counts change with the new test file.
- **US3 and US4 are independent of US1 and US2** and of each other.

## Parallel opportunities

- **Phase 1**: T002, T003 together.
- **Phase 2**: T007, T008, T009 together once T005 lands.
- **Phase 4**: T022, T023, T024 together — three different files.
- **Phase 5**: T027 alongside T025/T026.
- **Phase 7**: T033, T034 together; T041, T042, T043, T044 are one product-owner dispatch, batched
  per the board skill's rule that multiple mutations go in one request, not call-by-call.

## Implementation strategy

**MVP = Phase 2 + Phase 4.** The executable cost model plus the corrected guidance is the smallest
increment that stops shipping advice which cannot work — and the guidance is the half a reader acts
on. Phase 3 makes it sizeable, Phase 5 makes it correct off-default, Phase 6 makes it durable.

**Commit split (hard rule #9, one category each):**

| Category | Tasks |
| :--- | :--- |
| `test:` | T004–T011, T031 |
| `feat:` | T025 (the getter) |
| `docs:` | T012–T024, T026–T030, T033–T037 |
| `chore:` | T038 (regenerated brief) |

T028–T030 are a docstring and ride with `docs:`; T031 asserts it and rides with `test:`.
