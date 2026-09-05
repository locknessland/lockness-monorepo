# Plan: Anti-replay on signed control-plane frames

**Branch**: `244-control-frame-anti-replay` | **Date**: 2026-09-05 | **Backlog item**: [#272 — Realtime: anti-replay on signed control-plane frames](https://github.com/locknessland/lockness-monorepo/issues/272)

**This is the feature's one planning document.**

---

## 1. Why this exists

A control frame on the realtime bus is authenticated but **not bound to a moment**. Its MAC covers
`{kind, target, channel, member, origin}` and nothing else (`packages/realtime/drivers/redis.ts`,
`#canonical`). Nothing in that tuple changes between the first delivery and the ten-thousandth, so
**a captured frame stays valid forever**, to every instance except the one that sent it.

The attacker FR-015 was written against is "anyone with bus PUBLISH". Someone who also has
SUBSCRIBE — the same person, on a shared or compromised broker — can capture a valid signed frame
and re-publish it at a time of their choosing, without the secret and without forging anything.

**What that buys them today is genuinely small, and saying so plainly is part of the argument for
doing this now rather than later:**

| Replayed frame | Effect today | Persists? |
| :--- | :--- | :--- |
| `evict` | **Conditional, not a no-op.** On the framework's own Hono path a connection id is `crypto.randomUUID()` (`websocket.ts:151`) and never reissued, so a replayed evict finds nothing. But `Connection.id` is a caller-supplied `readonly id: string` documented as "a stable per-connection transport id" (`types.ts:53`), `ChannelManager` is exported from `mod.ts`, and an app wiring its own transport chooses that id — "stable" invites a user id or a session id. With a guessable, reused id the replay **hard-closes a live socket, unsubscribes every channel, and removes the member from the authoritative Redis roster**, repeatably, forever, from one captured frame. | until re-connect |
| `presence-leave` | **Not cosmetic.** The table's first draft graded each replay at the moment of *capture*; the attacker picks the moment of *replay*. Capture a `leave` for member M, wait for M to rejoin, replay: every subscriber on every instance but the origin is told a **present** member has gone. A false negative in presence — a live user shown as absent, so nobody messages them — is the more damaging direction. | until each client re-subscribes |
| `presence-join` | A departed member reappears in every client's roster view. Symmetric with the row above, and equally persistent. | until each client re-subscribes |
| **any presence frame, repeated** | `emitPresence` (`manager.ts:479-486`) writes to **every** connection subscribed to that channel, on every instance, with no rate limit and no dedup. One captured frame re-published at line rate is a fleet-wide fan-out amplifier the attacker never had to forge. | while the flood lasts |

**Nothing on the server corrects any of this.** The only authoritative roster read is `rosterSnapshot`, and it runs on *subscribe* (`manager.ts:242`). The FR-008 ghost sweep reconciles the **Redis** roster, which a replay never touched — so it will never emit a corrective frame for a phantom it has no record of. The lie lives in client views until each client re-subscribes.

**An earlier draft of this section called two of these no-ops and the third cosmetic.** Both plan-time audits rejected that independently, and they were right: the error was grading each replay at the moment of capture rather than at the attacker's chosen moment, and assuming a framework guarantee (`crypto.randomUUID()` ids) that holds on one code path out of two. The corrected reading is three reachable effects, two of them conditional on deployment shape, plus an amplification channel — still bounded, still client-side, and no longer describable as harmless.

The forward-looking argument stands unchanged and is still the stronger one: **the blast radius is a property of the current `kind` set, not of the design.** `ControlMessage['kind']` is a union that will grow, and the next kind carrying real authority arrives replayable, read by someone who will reasonably conclude from "control frames are HMAC-authenticated" that the plane is safe.

## 2. User scenarios

The actor is **an attacker with SUBSCRIBE and PUBLISH on the realtime bus, and no control secret.**

### US1 — A captured frame is refused on re-publish (P1)

**Given** a valid signed control frame observed on the bus
**When** the attacker re-publishes it verbatim
**Then** every receiving instance that was up when the original was issued drops it, logs the
reason, and takes no action from it — while the original delivery was obeyed normally.

### US2 — A frame that is merely old is refused (P1)

**Given** a valid signed control frame captured earlier
**When** it is re-published after the freshness window has passed
**Then** it is dropped as stale, without needing to have been seen before — so an instance that
restarted, or that started after the original, is protected by the window even though it holds no
nonce for it.

### US3 — Legitimate traffic is unaffected (P1)

**Given** normal operation across instances, including two instances publishing concurrently
**When** control frames are published and delivered once each
**Then** every one is accepted. **This is the requirement most at risk**: a duplicate check keyed
wrongly drops one sender's frames as another's duplicates, and it fails closed and silently.

### US4 — A rolling deployment behaves as §12 Q1 decides (P2)

**Given** a deployment mid-upgrade, with some instances on the old wire format
**When** an old instance publishes a frame with no timestamp or nonce
**Then** it is dropped at the shape gate, and cross-instance control frames are lost for the length
of the rollout — deliberately (Q1). Presence self-heals on the next subscribe, and a missed evict is
recovered by the durable-revocation reconcile. No compat flag exists to be left on.

### Edge cases

- **A `leave` replayed after the member rejoined** — a live user shown as gone. The reason the §1
  table is graded at the moment of replay, not of capture.
- **An application that supplies its own `Connection.id`** — the framework guarantees unguessable
  single-use ids only on its own Hono path.
- **Two instances publishing concurrently** — the duplicate check must not confuse their frames.
- **Clock skew between instances** — a receiver whose clock is far ahead rejects everything from a
  given sender, silently, and looks exactly like a broken bus.
- **An instance restarts inside the window** — its nonce state is gone; only the window protects it.
- **An instance starts *after* a frame was issued** — it holds no nonce for a frame that asserts a
  truth-claim about a moment before it existed.
- **Sustained legitimate load** — the duplicate state must be bounded by size, not only by age.
- **A quiet instance** — prune-on-ingest never runs when nothing is ingested.
- **A frame replayed back to its own sender** — already dropped by the existing self-loopback check.

## 3. Requirements

- **FR-001**: A control frame carries a **timestamp** and a **nonce**, both inside the bytes the MAC
  covers. The nonce is **16 bytes from `crypto.getRandomValues`, hex-encoded to a fixed width**, and
  the duplicate store is keyed by the pair **`(origin, nonce)`** — both halves, not either. The pair
  key removes cross-sender collision; the CSPRNG removes intra-sender collision across a restart,
  which a counter would reintroduce by resetting to zero inside a live window.
- **FR-002**: On ingest, a frame whose timestamp is outside the freshness window in **either**
  direction is dropped with a WARN naming staleness and the observed delta. Future-dated frames are
  rejected too: a clock an attacker can push forward is a window they can extend.
- **FR-003**: On ingest, a frame whose `(origin, nonce)` has already been seen within the window is
  dropped with a WARN naming duplication.
- **FR-004**: The duplicate store is bounded on **two** axes: by **age** — pruned immediately before
  each lookup, so no entry older than the window is ever consulted — and by **size** — a fixed entry
  cap, above which the **oldest** entry is evicted and a one-shot WARN names the cap. Drop-oldest
  fails open for one forgotten in-window nonce; refuse-new would fail closed and take the control
  plane down, which §9 rates as the worse outcome. Pruning is on ingest, never on a timer: a timer
  is one more thing that can stop, and `close()` already reasons about three.
- **FR-005**: Both replay checks run **after** the MAC check and never before it. An unauthenticated
  frame must not populate or probe the replay store — that would trade one weakness for a worse one.
- **FR-006**: Every drop is distinguishable in the log — oversized, invalid shape, bad MAC, invalid
  name, stale, duplicate. Operationally these mean six different things: an attack, a bug, a
  misconfiguration, a bug, a clock problem, an attack.
- **FR-007**: The freshness window is configurable on the existing `control` options object, with
  one default constant, resolved once in the constructor, and **validated at boot**. A `NaN` window
  is the dangerous input and an easy one to produce (`Number(Deno.env.get(...))` on an unset
  variable): `Math.abs(x) > NaN` is false for every frame, so it disables the freshness check
  silently and restores the pre-#272 posture on any fresh process. Zero or negative does the
  opposite and drops everything. The control secret beside it already throws at construction; so
  does this.
- **FR-008**: Legitimate delivery is unchanged — every frame published once is accepted once by
  every instance except its sender, including when instances publish concurrently.
- **FR-009**: The HMAC scheme is unchanged — same primitive, same key. Only the covered field set
  grows. Note for whoever extends it next: `#canonical` fixes the **top-level** key order only, and
  hands `member` to `JSON.stringify` as-is, so nested field order is the sender's. That fails
  *closed* today (a re-ordered `member` yields different bytes and the MAC is rejected), but
  "canonical-JSON discipline" claims more than the code does, and a nested field added later will
  inherit the gap.
- **FR-010**: Rejection is proven end-to-end by the #273 live-broker suite, publishing an
  attacker-chosen payload onto the run's own control topic. Prerequisite: [#282](https://github.com/locknessland/lockness-monorepo/issues/282), which turns "the control topic is namespace-anchored" from a belief into an assertion.
- **FR-011**: The byte ceiling is **configurable and enforced on BOTH ends** — `publishControl`
  refuses to send above it, and ingest refuses to accept above it. Publish-side is the half that
  matters operationally: every receiver rejects an oversized frame, so without it an app whose
  `PresenceMember.info` grew past the ceiling would publish happily, update the roster, and have
  every remote instance drop the frame silently — the WARN appearing only on the instances that
  cannot fix it. That is the fail-closed inversion §9 rates as worse than the replay. A fleet must
  raise the limit everywhere at once, since publisher and receiver each enforce their own.
  The **pre-MAC** gate bounds cost as well as shape. It rejects a control payload above a
  fixed byte ceiling of a few KB, and rejects a `member` that is not a plain object of the expected
  scalar fields, *before* any MAC computation. Today `member` is the one field the shape gate never
  checks (`drivers/redis.ts:842-849`), and `hmacSha256Hex` is a **synchronous, pure-JS SHA-256**
  (`packages/redis/memo.ts:98`) allocating twice the message length — so one unauthenticated PUBLISH
  costs every instance a parse, a re-serialize and a blocking hash over attacker-chosen bytes. The
  RESP reader caps a frame at 10 MB (`packages/redis/resp.ts:43`), so this is an amplifier rather
  than an unbounded one; a few KB is the honest bound for a control frame.
- **FR-012**: The pre-MAC gate type-checks the new fields: `Number.isInteger(ts)` and a `nonce` that
  is a string of the exact expected width. `1e400` parses to `Infinity`, and `JSON.stringify`
  collapses `Infinity`, `-Infinity` and `null` to the same bytes — three wire values, one MAC. Not
  reachable today, and one `Number.isInteger` away from never being reachable. An object nonce is
  the worse case: used as a store key it compares by identity, so every replay is a fresh key and
  duplicate detection silently fails while the store grows.
- **FR-013**: A test mutates **each** MAC-covered field in turn and asserts the MAC changes. Today
  **zero of the 17 control-plane tests construct a wire with a hand-computed MAC** — verified:
  `grep hmacSha256Hex packages/realtime/tests/` returns nothing — so the entire suite would stay
  green whether or not the two new fields are actually inside the MAC. This is [#280](https://github.com/locknessland/lockness-monorepo/issues/280)'s class one level
  up: not a fake modelling a command wrongly, but a suite covering the control plane and covering
  the wrong property.
- **FR-014**: `control_auth.test.ts`'s five forgery tests are re-verified to still drop at the **MAC**
  gate rather than at the new shape gate. If the shape gate learns to require `ts`/`nonce`, those
  tests keep passing for a different reason and the FR-015 forgery matrix is silently lost.

## 4. Success criteria

- **SC-001**: An operator replaying a captured control frame against an instance that was running
  when the original was issued sees it take effect **zero** times, where today it takes effect every
  time.
- **SC-002**: A frame older than the window is refused by **every** instance, including one that
  restarted or started after the original and holds no nonce for it.
- **SC-003**: Under normal multi-instance operation — including concurrent publishers — no
  legitimate control frame is dropped. Presence and eviction behave exactly as before.
- **SC-004**: An operator whose instance clocks have drifted far enough to break the control plane
  can tell that from the logs alone, rather than concluding the bus is down.
- **SC-005**: Duplicate-detection memory is bounded by **both** the freshness window and a fixed
  entry cap, under sustained load and regardless of uptime or window configuration.
- **SC-006**: Removing any single field from the MAC's covered set fails a test.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| What bytes the control MAC covers | `drivers/redis.ts` → `#canonical` | A second field list in `publishControl` or `#verifyAndDecode`; adding a field to `ControlWire` without adding it here — which silently ships it unauthenticated, and which **no existing test can catch** (FR-013) |
| Whether a frame is fresh | `ControlReplayWindow.admit` | A second window comparison at a call site; a `Date.now()` bound inline in `#verifyAndDecode` |
| Whether a frame is a duplicate | `ControlReplayWindow.admit` | A per-kind cache; a second set in `manager.ts`; a check in `handleControl` |
| **What makes two frames "the same frame"** | `ControlReplayWindow`'s key derivation — the `(origin, nonce)` pair | Keying on the nonce alone, which drops one sender's frames as another's duplicates; keying on the whole payload, which a re-serialisation would break |
| How long a nonce is remembered | the same class — derived from the window, never configured separately | A second TTL constant; a prune cadence differing from the window |
| The clock a timestamp is read from | one `now()` seam, **non-optional at the class boundary**, defaulted once in the driver | A `Date.now()` in `publishControl` and another in the verifier; an optional constructor option, which gives production and test two different paths through the seam this row exists to collapse |
| How long a frame stays fresh — the **number** and its default | one `DEFAULT_CONTROL_WINDOW_MS` beside the four existing `DEFAULT_*` constants (`drivers/redis.ts:265-269`), plus one option field, resolved once in the constructor | The default repeated as a literal in JSDoc; a second window read at the predicate |
| Whether a frame with no timestamp/nonce is accepted | **it is not** — the pre-MAC shape gate requires both, so there is no predicate, no flag and no second canonical form (Q1) | A `?? 0` default on the timestamp, which silently accepts every legacy frame as either infinitely stale or infinitely fresh depending on comparison direction; a compat flag added later without also adding a `v` field inside the MAC |
| The order of ingest checks — cost gate, shape gate, MAC, then replay | `#verifyAndDecode`, top to bottom, kept as a **flat guard chain** | Any replay check hoisted above the MAC; any decomposition of the existing gates into a chain-of-responsibility or polymorphic dispatch, which hides the one property this row makes binding |
| What a drop is called | `#verifyAndDecode`'s guard chain — one WARN per gate, none anywhere else | A WARN raised inside the freshness predicate or the replay store; a second message for the same condition; `manager.ts` logging a drop it cannot see. **Clarified after review**: this row bans *drop reasons* elsewhere, not all output. FR-004's one-shot capacity WARN is an operational fact about the store — "I am full" — and not a verdict about any frame; nothing outside the store can observe it, so it cannot be moved into the guard chain without inventing a channel for it. The two requirements do not conflict once "what a drop is called" is read as what it says. |
| Which wire fields reach `manager.ts` | the explicit projection literal at the end of `#verifyAndDecode` | A spread (`{...wire}`) replacing it — which would leak `ts` and `nonce` into the manager-facing shape, compile cleanly, and pass the one existing assertion (`control_plane.test.ts:49`) |

**Two files, not one — and the split is by state, not by decision.** The *decisions* stay in
`drivers/redis.ts`, where #268 put the control plane's other authenticity rules. But the replay
store is **mutable, time-dependent, per-instance state with its own lifecycle**, which is a second
reason to change inside a file already at 1025 lines owning pub/sub, the roster, the heartbeat, the
ghost sweep, the revocation index and the MAC. It becomes a concrete `ControlReplayWindow` class:
constructed by the driver, holding the window and an injected clock, exposing one method
`admit(origin, nonce, ts): 'ok' | 'stale' | 'duplicate'` that prunes on call and logs nothing.

**Deliberately a class and not an interface.** One implementation exists and the second is
hypothetical, so a port here would be speculative generality. If Q2 is ever revisited toward a
shared store, the swap is one class rather than a reopened verifier.

## 6. Technical context

**Language/Version**: TypeScript on Deno (repo-pinned).
**Primary Dependencies**: none new. HMAC via the existing `hmacSha256Hex`.
**Storage**: in-process only (§12 Q2); no new Redis key.
**Testing**: `Deno.test` with `FakeTime` for window and pruning behaviour; `FakeRedis` for the bus; the #273 live-broker suite for FR-010.
**Target Platform**: any Lockness deployment on the Redis broadcast driver.
**Project Type**: framework library.
**Performance Goals**: no added Redis round-trip on publish or ingest. Counted: control frames are emitted from three call sites (`manager.ts:237` presence subscribe, `:298` presence unsubscribe, `:380` remote evict), all gated on `kind === 'presence'` (`manager.ts:217`) — so a non-presence app emits **zero**, and a presence app emits `2 × (presence channels joined)` per connection lifecycle, each MAC-verified by every other instance.
**Constraints**: no public `BroadcastDriver` change; the wire format changes (§12 Q1); `no-explicit-any`; JSDoc.
**Scale/Scope**: two files change.

### Domain model

- **Bounded context**: the realtime control plane — the frames carrying authority between instances.
- **Vocabulary**: *control frame*, *nonce*, *freshness window*, *replay store*, *ingest*.
- **Value objects**: **Nonce** — 16 bytes from `crypto.getRandomValues`, hex-encoded. Unpredictability is *not* required by the anti-replay property, since an attacker cannot forge a MAC over a nonce of their choosing; the CSPRNG is how uniqueness survives a restart and holds across instances without coordination. Saying so explicitly, because silence here invites a counter, and a counter collides across senders and again after every restart. **Timestamp** — epoch milliseconds at issue.
- **Invariants**:
  - a frame is obeyed **at most once per receiving process, per window** — the honest statement of what an in-memory store provides, deliberately weaker than "once per instance", which a restart falsifies;
  - a frame is obeyed only inside its freshness window — this one holds unconditionally, and is what protects a restarted or newly-started instance;
  - both properties are enforced only after the MAC verifies;
  - the store holds no entry older than the window at any point where one is consulted, and never more than the entry cap.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1 — No direct `hono` import | pass | Not touched. |
| 2 — JSR-only specifiers | pass | No new dependency; no graph change. |
| 3 — No `any` in exported APIs | pass | `ControlWire` is internal; `ControlReplayWindow` is typed. |
| 4 — Tailwind v4 syntax | pass | No CSS. |
| 5 — Pre-completion gate | pass | Plus the #273 live-broker suite for FR-010. |
| 6 — Never edit `deno.lock` | pass | No dependency change. |
| 7 — JSDoc on public APIs | pass | Including why the ingest order is normative. |
| 8 — MVC layering | pass | No controller/service/model involvement. |
| 9 — Commit discipline | pass | `feat` for the wire + checks, `test`, `docs`, `chore` for the regenerated brief. |
| TDD | pass | Replay currently succeeds, so the failing test is free. |
| Domain Model gate | pass | Section 6. |
| No silent catches | pass | FR-006. The new WARNs interpolate no error object and no unencoded caller string, so they neither worsen nor resolve [#277](https://github.com/locknessland/lockness-monorepo/issues/277), and this change does not widen the dependency graph. |

### Complexity tracking

No violations.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `packages/realtime/drivers/redis.ts` | yes | `ControlWire` gains two fields; `#canonical` covers them; `publishControl` sets them; `#verifyAndDecode` gains a cost gate, a shape gate and one `admit` call. |
| `packages/realtime/control_replay_window.ts` (new) | yes | The store, the window, the clock seam. |
| `BroadcastDriver` public interface | **no** | Signatures unchanged. |
| `packages/realtime/manager.ts` | **no** | `handleControl` sees only frames that already passed. |
| **`Connection.id`'s documented contract** (`types.ts:53`, `websocket.ts:109`) | yes — **docs only** | "A stable per-connection transport id" is corrected to state the security-relevant constraint A2 exposed: an id that is guessable or reused turns a replayed `evict` from a no-op into a live weapon. The framework guarantees unguessable single-use ids on its Hono path (`websocket.ts:151`) and cannot on a caller-supplied one. |
| The Redis **wire format** | **yes — the compatibility surface** | Two new MAC'd fields; §12 Q1. |
| `packages/realtime/tests/` | yes | Replay, staleness, window, cap, pruning, concurrent-publisher and skew tests; FR-013's per-field MAC mutation; FR-014's re-verification of the five forgery tests. |
| `packages/realtime/tests/live_realtime.ts` | yes | Its control probe publishes literal `'{}'` (`:284`) and its comment (`:241-245`) documents the exact WARN it expects — both go stale if the shape gate or its message changes. Plus FR-010's attacker-publish seam. |
| `packages/realtime/tests/control_plane.test.ts` | yes | `:49` asserts `mac` is absent from the manager-facing shape; it grows to assert `ts` and `nonce` are absent too (§5's projection row). |
| `docs/realtime.md`, `packages/realtime/README.md` | yes | The window, its default, and what each drop WARN means. |
| `packages/realtime/AGENTS.md` | yes | Regenerated — `agents:brief --check` is a hard CI step. |

### Visual Prototyping with Claude Artifacts

Not applicable — no rendered surface.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **The check fails closed and silently breaks the control plane** — worse than the replay it prevents | FR-008 + SC-003; the `(origin, nonce)` key (FR-001) is what makes concurrent publishers safe; FR-004 chooses drop-oldest over refuse-new for the same reason |
| Clock skew rejects legitimate frames | FR-007's configurable window; FR-002's WARN names the observed delta so the cause is legible |
| A rolling deployment drops control frames mid-upgrade | §12 Q1, settled with its §5-row-1 consequence attached |
| The replay store grows without bound | FR-004's two axes. Age alone is not a bound: memory is window × rate × entry size, and an operator widening the window for bad NTP raises the ceiling linearly with no signal until an OOM |
| The replay store becomes an unauthenticated write surface | FR-005; §5's ordering row |
| **An unauthenticated flood costs the fleet real CPU** | FR-011's pre-MAC cost gate. Bounded above by the 10 MB RESP cap today, which makes this an amplifier rather than unbounded — but a synchronous pure-JS SHA-256 over attacker-chosen bytes on every instance is not a cost the MAC check contains, and FR-005 must not be read as if it were |
| **The suite covers the control plane and covers the wrong property** | FR-013 + SC-006. This is [#280](https://github.com/locknessland/lockness-monorepo/issues/280)'s failure class one level up, and it is why zero existing tests would fail if a new field were left out of `#canonical` |
| The forgery matrix is silently lost | FR-014 |
| Two clocks that must agree | §5's clock row — non-optional at the class boundary |
| The residual: a duplicate obeyed once per restart or new instance, inside one window | Accepted and named in §12 Q2, not argued away. Bounded, self-limiting, and strictly better than today |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | **HIGH** — §1 called a replayed `presence-leave` cosmetic. It grades each replay at the moment of *capture*; the attacker picks the moment of *replay*. Captured after M leaves, replayed after M rejoins, it tells every subscriber a present member is gone — a false negative in presence, the more damaging direction — and nothing on the server corrects it. | **Plan changed** — §1 rewritten and graded at the moment of replay; edge case added to §2. |
| A2 | **HIGH** — the `evict` no-op rests on an id choice made outside the control plane. `crypto.randomUUID()` appears once, on the Hono path (`websocket.ts:151`); `Connection.id` is caller-supplied and documented as "stable", and `ChannelManager` is public. With a reused id the replay hard-closes a live socket, unsubscribes every channel and **removes the member from the authoritative Redis roster** — contradicting §1's own mitigating claim. Verified independently. | **Plan changed** — §1's row states the precondition; §8 adds a docs-only correction to `Connection.id`'s contract. |
| A3 | **HIGH** — §5 row 1 and Q1 cannot both hold. Accepting legacy frames requires MACing over two field sets, which is exactly the second field list row 1 forbids. Row 6 presented Q1 as free; one of its answers invalidates a decision-table row. | **Escalated to the user as Q1**, with both consequences written into the options rather than discovered at implementation time. |
| A4 | **HIGH** — blast radius, counted: **zero of 17 control-plane tests construct a wire with a hand-computed MAC** (`grep hmacSha256Hex packages/realtime/tests/` → nothing). None breaks when two MAC'd fields are added, and none can catch a field left *out* of `#canonical`. Worse, the five forgery tests would keep passing at the new shape gate instead of the MAC gate, silently losing the FR-015 matrix. Verified independently. | **Plan changed** — new **FR-013** (per-field MAC mutation), **FR-014** (re-verify the forgery matrix), **SC-006**, and a §9 row citing #280. |
| A5 | MEDIUM — FR-006 (drop-reason vocabulary) had no decision-table row; row 6 was a different rule. | **Plan changed** — "What a drop is called" row added. |
| A6 | MEDIUM — FR-007's window *value* and default had no home, beside four existing `DEFAULT_*` constants. | **Plan changed** — row added naming one constant plus one option, resolved once. |
| A7 | MEDIUM — Q2's conclusion holds but its reasoning did not: it conflated "every instance receives every frame" with "every instance was up when it was sent". | **Plan changed** — Q2 answered with the corrected justification, and the residual recorded in §9 rather than argued away. |
| A8 | MEDIUM — the store is mutable, time-dependent state, a second reason to change inside a 1025-line driver. A concrete class, not an interface — a port would be speculative generality with one implementation. | **Plan changed** — `ControlReplayWindow` in §5 and §8; two files, not one. |
| A9 | MEDIUM — FR-004 bounded the store by age only. Memory is window × rate × entry size, and an operator widening the window for bad NTP raises the ceiling with no signal until an OOM. | **Plan changed** — FR-004 gains an entry cap with drop-oldest stated, and SC-005 names both bounds. |
| A10 | LOW — `#verifyAndDecode` is a borderline Long Method, but its structure is not hidden and **its order is normative**. A general decomposition would hide the one property the table makes binding. | **Objection accepted, and recorded as a constraint** — §5's ordering row now forbids decomposing the existing gates as part of this change. |
| A11 | LOW — the wire → `ControlMessage` projection had no row; a `{...wire}` spread would leak the new fields, compile, and pass the one existing assertion. | **Plan changed** — projection row added; `control_plane.test.ts:49` named in §8. |
| A12 | LOW — the #273 live harness publishes literal `'{}'` on the control topic and documents the exact WARN it expects; both go stale if the shape gate changes. FR-010 depends on #282. | **Plan changed** — `live_realtime.ts` named in §8, #282 cited in FR-010. |
| A13 | INFO — the new WARNs land in the file [#277](https://github.com/locknessland/lockness-monorepo/issues/277) is about. | **Recorded in §7** — they interpolate no error object, so they neither worsen nor resolve it. |

**Verdict** (`architect-expert`, plan-time, read-only): **fail** — 0 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW. All four HIGH are claims in `plan.md` the ground truth did not support, and all four are edits rather than redesigns; the core design (timestamp + nonce inside the MAC, MAC first, prune on ingest, in-memory store) was explicitly endorsed. **Covered**: §1's impact table against `handleControl`/`emitPresence`/`revokeLocal` and `websocket.ts` id generation; every requirement against every table row; the single-home argument against the driver's existing responsibilities and line count; Q1 against row 1; Q2's reasoning; counted publish call sites; a file-by-file test inventory including `fake_redis.ts` and `live_realtime.ts`; cross-checks against #277, #278, #280, #282. **Not covered**: the window's default *value* (an operations question); whether `hmacSha256Hex` is the right primitive (out of scope per #272); the subscribe-connection internals; any benchmark of the ingest path.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel with the architecture audit.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | **HIGH** — the nonce's uniqueness *domain* was unspecified. Keyed on the nonce alone with any sender-local value, instance C stores A's nonce and drops B's legitimate frame as a duplicate — fire-and-forget publish, no retry. This fires §9's own top risk through the plan's own under-specification. | **Plan changed** — FR-001 specifies a 128-bit CSPRNG nonce **and** an `(origin, nonce)` store key; §5 gains a "what makes two frames the same frame" row. |
| S2 | **HIGH** — FR-005's containment covers state but not **cost**. `member` is never shape-checked pre-MAC, and `hmacSha256Hex` is a synchronous pure-JS SHA-256 allocating twice the message length, so one unauthenticated PUBLISH costs every instance a parse, a re-serialize and a blocking hash. | **Plan changed** — new **FR-011** adds a pre-MAC byte ceiling and `member` shape check. **One correction to the finding**: it stated "512MB, nothing caps it"; `packages/redis/resp.ts:43` caps a frame at 10 MB and `:421` enforces it (#268's FR-019). Verified. The finding stands as an amplifier, not as unbounded, and §9 says so. |
| S3 | **HIGH** — the in-memory lean contradicted §6's invariant and SC-001. A restart lets a frame be obeyed twice; and an instance that starts *after* a frame was issued obeys a stale truth-claim, which the reasoning miscategorised as "delivery, not replay". Under a rolling deploy, instances start constantly. | **Plan changed** — §6's invariant is now "at most once per receiving **process**, per window", SC-001 and US2 are scoped to match, and Q2 records the residual instead of arguing it away. |
| S4 | MEDIUM — the `ts`/`nonce` shape gate was unspecified. `1e400` parses to `Infinity`, and `JSON.stringify` collapses `Infinity`/`-Infinity`/`null` to identical bytes — three wire values, one MAC. An object nonce compares by identity, so duplicate detection silently fails while the store grows. Duplicate JSON keys checked and cleared (last-wins, and the MAC is recomputed from the parsed object, so no differential). | **Plan changed** — new **FR-012**. |
| S5 | MEDIUM — §1 *under*-stated impact: `emitPresence` fans to every subscriber on every instance with no rate limit, making one captured frame a fleet-wide amplifier; and "until the next authoritative read" was doing unearned work, since nothing on the server ever corrects the phantom. | **Plan changed** — §1 gains an amplification row and states that only a client re-subscribe corrects it. |
| S6 | MEDIUM — Q1 is a permanent bypass unless bound. **Good news recorded**: a downgrade attack is *not* available — stripping the fields changes the canonical bytes and the MAC fails. **Bad news**: any frame captured while old-format instances published stays replayable for as long as compat is on. | **Folded into Q1's options** — the reject option carries no such window; the accept option is time-bounded, off by default, and files its removal issue in the same commit, #278-style. |
| S7 | LOW — FR-004's "no entry may outlive the window" is not satisfiable by ingest-time pruning: a quiet instance prunes nothing. | **Plan changed** — FR-004 restated as "no entry older than the window is ever *consulted*", which is the property that actually matters, with the "not on a timer" reasoning kept. |
| S8 | INFO — the plan was silent on whether the nonce must be unpredictable. Uniqueness suffices for the property; silence invites a counter, which fails S1 and fails again after a restart. | **Plan changed** — §6 states it, with the reason. |
| S9 | INFO — `#canonical` fixes only the top-level key order; `member` is stringified as-is, so nested order is the sender's. Fails closed today; "canonical-JSON discipline" claims more than the code does. | **Recorded in FR-009** as a note for whoever adds a nested field next. |

**Verdict** (`security-expert`, plan-time, read-only): **fail** — 0 CRITICAL, 3 HIGH, 3 MEDIUM, 1 LOW. The mechanism was judged right and FR-005's ordering discipline explicitly good; the gaps were one that silently breaks legitimate traffic (S1), one containment claim that overreached (S2), and one deferred question whose lean contradicted the plan's own invariant (S3). **Covered**: the two new input fields and their validation surface; the ingest ordering including the self-loopback position (safe — a skip never reaches the store and cannot be used to probe it, since both paths return `undefined` silently); §1's claims verified arm-by-arm against `handleControl`; Q2's reasoning under restart, cold start and partition; the pre- and post-MAC cost of a flood; identifier and timestamp exposure (no new leak — an observer with SUBSCRIBE already sees the join/leave events and their arrival times, which is strictly more than `ts`); and the account-boundary question: **nothing** — `handleControl`'s three arms reach `revokeLocal` for a locally-held id and `emitPresence`, and no auth state, session or roster write, so a bus attacker changes what clients *believe* and cannot act as a user. **Not covered**: the `.specnaut/memory/security/` catalogue was not loaded this run (dispatch instruction), so severities are unbacked judgement; `revokeLocal` and the ghost sweep read only through their call sites; #282, which FR-010 depends on.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Q1 — What happens to a frame with no timestamp/nonce during a rolling deployment? | **Rejected.** A frame without both fields fails the pre-MAC shape gate and is dropped as invalid shape — there is **no legacy predicate and no compat flag**, so §5 row 1 stays intact with one canonical form and one field list. The cost is accepted deliberately: for the length of the rollout, control frames do not cross between old and new instances. That is bounded and self-healing — presence re-reads the authoritative Redis roster on every subscribe (`manager.ts:242`), and a missed evict is recovered by #268's durable-revocation reconcile and #271's reconnect trigger. The alternative was a second canonical form plus a flag that S6 showed leaves every frame captured during the rollout replayable for as long as it stays on, and which #278 already demonstrates outlives its rollout. | 2026-09-05 |
| Q2 — Is the replay store per-instance in memory, or shared in Redis? | **In-memory.** Both audits converged on this conclusion while rejecting the reasoning that first produced it. The honest justification: the **freshness window** is the protection for any instance that lacks the nonce, and the nonce store only *tightens* it for instances that were up for the original. A shared store would put a Redis round-trip on the hottest path in the feature — every ingest, on every instance, for every presence subscribe and unsubscribe — and would convert a Redis blip into §9's top risk, the control plane failing closed. **The residual is recorded, not argued away**: a duplicate can be obeyed once per restart-or-new-instance inside one window. Bounded, self-limiting, and strictly better than today. | 2026-09-05 |
| Q3 — What is the default freshness window? | **30 seconds.** It absorbs NTP-synced skew — typically well under a second — with a wide margin, while keeping both the replay window and the store small. A fleet with genuinely broken clock sync will see the control plane fail closed, which is why FR-002's WARN names the observed delta and FR-007 makes the window configurable: the failure is legible and the remedy is one option. | 2026-09-05 |

### Decided without asking

- **Timestamp *and* nonce, not either alone.** A timestamp alone permits replay inside the window; a nonce alone needs state that grows forever. Together the window bounds the state and the nonce closes the window.
- **Both fields inside the MAC.** Outside it they are attacker-editable and the mechanism is decorative.
- **Future-dated frames are rejected**, not just old ones — a one-sided check lets anyone who can influence a clock extend the window indefinitely.
- **The nonce is a CSPRNG value, not a counter** — for uniqueness across restarts and instances, not because prediction is the threat (S8).
- **The store is keyed by `(origin, nonce)`** — the single change that keeps concurrent publishers working (S1).
- **Pruning on ingest, not on a timer** — a timer is one more thing that can stop.
- **Drop-oldest, not refuse-new, at the entry cap** — failing open for one forgotten in-window nonce beats failing closed and taking the control plane down (A9 + §9's top risk).
- **`manager.ts` is not touched.** `handleControl` acts on frames that already passed; a check there would give the rule two homes and leave the driver's other `onControl` consumers unprotected.
- **The self-loopback check stays above the MAC check.** Skipping is never obeying, and the security audit confirmed it cannot be used to probe or poison the store.
- **`Connection.id`'s contract is corrected in docs, not enforced in code.** A2's exposure is real, but the framework cannot police an id it does not generate; the honest fix is to state the constraint where the type is defined rather than to add a check that cannot be complete.
