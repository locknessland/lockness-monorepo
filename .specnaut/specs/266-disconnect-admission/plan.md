# Plan: a disconnected connection is refused at admission, and `unsubscribe` forgets before it leaves

**Branch**: `266-disconnect-admission` | **Date**: 2026-09-23 | **Backlog item**:
[#361 — Realtime: a subscribe resolving during a disconnect of the same connection strands a channel membership forever](https://github.com/locknessland/lockness-monorepo/issues/361)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #361 (2026-09-23, hard rule #11). This plan records it as binding. It adds what the
disposition left to the plan: the decision table, the requirements, the witnesses and mutants in
testable form, and the blast radius **re-counted on `main` at `c00bfcde`**, after #359 merged.

Both plan audits are folded in (§10, §11). The `architect-expert` rulings on A1–A12 and on the
security findings S1–S3 are **binding**:

- the custom transport's lifecycle contract is written down (A1/S1);
- the two refusal clauses throw two different errors (A2/S3);
- the refusal gives way to anything the authorizer's own result produced (A3);
- ADR 010 is written (A4);
- a failure is recorded by a flag, never by its value (A5);
- `handlerHooks.onClose` always runs `disconnect` (S2a).

Where the tree did not fit the disposition, this plan said so (D1–D7), and the audit ruled on each
one: D1, D2, D3, D5 and D6 were confirmed, D4 was corrected, and D7 was ruled against (A8).

- **D1 (confirmed).** The disposition's literal spelling,
  `#retired.has(this.connections.get(connection.id))`, does not type-check: `WeakSet.has` takes no
  `undefined` (TS2345, measured on Deno 2.9.6). It is spelled with a `bound !== undefined` guard
  (FR-002). The predicate is the same.
- **D2 (confirmed).** **No `CHANGELOG` exists in the tree.** `docs/releasing.md:65` says it "lives
  at the root with per-package sections", but no file does. #349, #358 and #359 recorded their
  breaking items in `docs/realtime.md` § *Upgrading to v0.4.0* only. The upgrade note is item **15**
  of that section, plus a README bullet (FR-017). No changelog file is created here. The missing
  root changelog is #364.
- **D3 (confirmed).** The disposition counted **one** battery row to repair (334). Recounted: **15
  rows in 9 batteries** anchor in or beside the disposition's edit sites. 1 is re-anchored (334), 1
  is re-verified because its anchor becomes a substring match (344 M6), and 13 stay as they are. The audit fold adds three edit sites, `handlerHooks.onClose`, `evict`'s durability collector and
  `revokeChannel`'s two collectors, with 7 more adjacent rows. All 7 stay as they are (§4). #359's M14 changes disposition too, and is not
  re-anchored.
- **D4 (corrected by the audit).** The disposition counted 53 test files calling `subscribe`, 40 of
  them without registration. The counts today are:
  - `grep -l '\.subscribe('` over `packages/realtime/tests/*.test.ts` finds **51**;
  - of those, **38** match none of `\.register\(|handlerHooks|buildEvents|createWebSocketHandler`.

  The argument holds: implicit registration is how most callers use `subscribe`.
- **D5 (confirmed).** **No test pins "one channel's failure does not abort the rest"** of a
  disconnect. Only `log_encoding_291`'s evict-teardown test reaches the re-throw. W6 holds a second
  channel and asserts that its teardown ran, and N11 relies on that assertion.
- **D6 (confirmed).** R13 (d)'s `GatedUnwatchDriver` extends `RecordingRevocationDriver`, a
  revocation-store double in the #359 test file that R13 (b, c) still use. "Moved" means removed
  from the #359 file with R13 (d), and re-created in the #361 file on `MemoryBroadcastDriver`, which
  has the roster W1 asserts on. The revocation base stays where it is.
- **D7 (ruled against, A8).** M14's `killedBy` is the #341 sentinel `'(none — equivalent)'`, not a
  witness name. Its `expectSurvival` reason names R13 (b, c) as the fixture that would kill it.

---

## 1. Why this exists

`ChannelManager.subscribe` (`packages/realtime/manager.ts:1374`) awaits the application's authorizer
(`:1397`). Only after that does it run `#checkChannelCaps` and
`this.connections.set(connection.id, connection)` (`:1464–1469`), and then join.
`ChannelManager.disconnect` (`:2461`) copies the connection's channel list once (`:2475`), awaits
`unsubscribe` for each entry, and in its `finally` (`:2512–2517`) deletes that id from
`#channelsByClient` and `connections`. **Nothing records that a connection has been disconnected.**
After the `finally`, "absent from `connections`" looks exactly like "never registered", and
`subscribe` may register implicitly.

So a `subscribe` that spans a `disconnect` of the same connection writes a membership that nothing
will ever tear down. There are three windows (disposition §1):

- **(a)** `disconnect` is suspended in its teardown loop when the authorizer resolves. The join
  misses the copied list, and the `finally` then forgets the id. The membership is **stranded**.
- **(b)** `disconnect` *finishes* while the authorizer is still pending.
- **(c)** `subscribe` is *called* after `disconnect` settled. Any `onMessage` that awaits before
  `subscribe` does this, and so does the worked example in `docs/realtime.md` (`:1016–1053`), which
  awaits `data.arrayBuffer()` and recommends an atomic Redis spend. A public channel needs no
  authorizer, so this window reaches the anonymous share.

In (b) and (c), the implicit `connections.set` also re-registers a **zombie**, which
`connectionCount` counts.

What a stranded membership costs:

- **Caps.** The slot counts against `maxWatchedChannels`, and against the anonymous share when the
  connection had no identity. A client that repeats the race uses up the instance's caps for every
  other client: an availability issue.
- **Broker.** The channel stays watched, and the instance holds a broker subscription that nobody
  listens to.
- **Presence.** The stranded member keeps its roster hold, so every client of the room, on every
  instance, sees a departed member in `here`. `#reassertRoster` (#349, `:2177`) iterates
  `this.presence` and **re-holds it after every liveness lapse**.
- **Confidentiality, when an application reuses ids.** Delivery walks `subscriptions.get(channel)`
  and sends to `connections.get(id)` (`deliverLocal`, `:3052`). A later connection registered under
  the stranded id therefore receives the channel's frames, presence frames included, on a private
  channel for which `authorize()` never ran. This breaks the documented contract (`Connection.id`
  "must be unguessable and never reused"). `handlerHooks` cannot reach it, because `buildEvents`
  mints `crypto.randomUUID()` per socket (`websocket.ts:154`). It is real for custom transports, and
  `types.ts` records that applications pass user or session ids. Rated **HIGH, conditional on id
  reuse** (disposition §5).

**A second cause strands the same state.** `unsubscribe` (`:2409`) awaits `#leaveLocal` before
`#forgetPresenceMember`. On the last local leave of a presence channel, `#leaveLocal` awaits
`unwatchChannel`, whose port contract says `@throws If the frame could not be written`. When that
rejects, `unsubscribe` throws before the forget. `disconnect` then forgets the id in its `finally`,
and the presence entry outlives the id: a roster ghost, which #349 re-holds. The same order also
makes a subscribe **during** a suspended unsubscribe take the re-join guard's roster read and report
`ok` while holding nothing (W9, A6). This is also the state in which deleting #359's M14 check is
observable, so **M14 can honestly move to `expectSurvival` only once this is fixed too**
(disposition §1.3, §7).

**Who is affected:**

- every application whose `onMessage` awaits before `subscribe` (windows (b) and (c));
- every application whose authorizer is slow enough to span a socket close (window (a));
- every application whose own `onClose` hook can throw: today `handlerHooks` then never runs
  `disconnect` at all (S2a);
- custom transports that reuse ids, for the confidentiality path.

The defect predates #359, which found it.

## 2. User scenarios

### US1 — a subscribe that spans the disconnect leaves nothing behind (P1)

**Given** a connection that holds a channel and has a presence subscribe pending on its authorizer
**When** the same connection disconnects, and the authorizer admits while the teardown is suspended
**Then** the subscribe rejects with `ConnectionDisconnectedError`, and the disconnect resolves
`'disconnected'`. Afterwards no map, cap, watch or roster names the connection, and the room never
saw a `joined` or `left` for it.

### US2 — a subscribe after the disconnect is refused before it costs anything (P1)

**Given** a connection whose `disconnect` has already settled
**When** the application's `onMessage`, resuming after an await, calls `subscribe` for it
**Then** the call throws `ConnectionDisconnectedError`. The authorizer is not called, no cap or
anonymous share is spent, and `connectionCount` does not grow.

### US3 — a reused id inherits nothing (P1)

**Given** a connection `c1` whose teardown is in progress
**When** a *different* connection object with id `c1` is registered, or subscribes to a private
room, during the teardown, and a third `c1` object is registered after it
**Then** the first two calls throw `ConnectionIdInUseError`, and the third object receives no frame
from that room until its own subscribe is authorized.

### US4 — a failed unwatch does not leave a presence ghost (P2)

**Given** the last local member of a presence room, whose driver's `unwatchChannel` rejects
**When** it disconnects
**Then** `disconnect` rejects with that error. The member is gone from the local presence map and
from the roster, the connection's other channels are still torn down, and a later liveness-lapse
re-assert re-holds nothing.

### US5 — the framework's own socket path is torn down, whatever the app's close hook does (P2)

**Given** an application using `handlerHooks`, whose own `onClose` throws
**When** the socket closes
**Then** the connection is still disconnected and retired, and the rejection the transport sees is
the application's own error. A later `subscribe` with that connection object throws.

### US6 — a join that committed before the disconnect behaves as today (P3)

**Given** a subscribe that passed its caps and started its join before the disconnect began
**When** the disconnect runs
**Then** the subscribe still resolves `{ ok: true }` (#330: committed, not still held), the
disconnect tears that membership down with the rest, and no state names the connection afterwards.

### Edge cases

- **A public channel** has no await between the two checks. The post-check is redundant there but
  harmless.
- **The authorizer's own result wins over a retirement that happened during it** (A3). A denial
  still answers `{ ok: false }`, and a result outside the contract still throws
  `AuthorizeResultError` or a member error. Nothing is written in either case. Before the
  authorizer, the retirement wins, because the authorizer never runs.
- **An anonymous connection on a private channel** that is retired throws. The pre-check runs before
  the `identity === null` denial, and that denial is not the authorizer's result.
- **A presence re-subscribe of a retired connection** is refused before its roster read.
- **`evict` retires.** `revokeLocal` calls `disconnect` (`:2617`), so a `subscribe` for an evicted
  socket is refused (W10), where today it re-registers the socket or strands it. `revokeChannel`
  does not disconnect, and does not retire.
- **`disconnect` of an id that is not owned** retires nothing and still reports `'not-owned'`.
- **A second `disconnect` of the same id** re-adds the same object: idempotent.
- **An unregistered connection's first `subscribe` racing `disconnect(id)` is STRANDED** (A1; the
  disposition's "consistent, live and owned" was wrong):
  - `disconnect` reports `'not-owned'` and retires nothing;
  - the subscribe then registers the connection and joins;
  - the socket is gone and nobody will disconnect it again.

  It breaks the transport lifecycle contract (row 16), since `register` was not called at open. It
  is unreachable through `handlerHooks`. Named residue (§9).
- **A transport that builds a fresh `Connection` object per call** is covered only in window (a),
  while the id is still bound. Afterwards a fresh object is neither retired nor bound. It breaks the
  same contract (§9).
- **A different object under the id of a live, non-retiring connection** is not refused. That is
  #363, out of scope.
- **Both leave and release fail in `unsubscribe`**: the leave's error is re-thrown, and the
  release's is WARNed. **Only the release fails**: its error is re-thrown, as today.
- **A rejection whose value is `undefined`** (an unwatch, a durability write or a record clear
  rejecting with nothing) is still re-thrown, by every collector in `manager.ts` (A5).

## 3. Requirements

**Retirement: one writer, one predicate, two refusals**

- **FR-001**: `ChannelManager` gains `readonly #retired = new WeakSet<Connection<Identity>>()`,
  declared beside `connections` and `#channelsByClient` (`:912–921`). Its JSDoc carries **the
  definition**:
  - retired means a `disconnect` has begun for this connection **object**;
  - it is terminal and per-manager;
  - it is keyed by object, so it is bounded by construction;
  - it is not a spelling of ownership;
  - a link to ADR 010.

  **The only writer is `disconnect`, in its first statements, before any await**: it takes
  `const bound = this.connections.get(clientId)`, then `if (bound) this.#retired.add(bound)`, then
  `const owned = bound !== undefined`. `grep -n '#retired' manager.ts` finds only the declaration,
  this `add` and the reads inside `#assertAdmissible`.
- **FR-002**: `#assertAdmissible(connection: Connection<Identity>): void` is **the one reader** of
  `#retired`, and one predicate with two clauses:
  1. `this.#retired.has(connection)` throws `new ConnectionDisconnectedError(connection.id)`. This
     object was retired.
  2. Otherwise, with `bound = this.connections.get(connection.id)`,
     `bound !== undefined && this.#retired.has(bound)` throws
     `new ConnectionIdInUseError(connection.id)`. A **different** object presents an id still bound
     to a retired one (D1 spelling). It holds only while the id is bound, so it retains nothing.

  Its JSDoc names its three call sites and why each exists.
- **FR-003**: `ConnectionDisconnectedError`, a new exported class in `manager.ts` beside
  `ConnectionIdError` (`:363`), shaped like it:
  - `override readonly name = 'ConnectionDisconnectedError'`;
  - an `id: string` rendered through `safeForLog`;
  - a constant message: this connection was disconnected, nothing was subscribed or registered, and
    no retry will help. It **must not contain** `ConnectionIdError`'s message text (FR-012);
  - full JSDoc: why a named type and not `{ ok: false }` (#331); why not a field on
    `SubscribeResult`; and an `@example` that drops the frame on `instanceof` in `onMessage`, since
    no client is left to answer.
- **FR-003a** (A2/S3): `ConnectionIdInUseError`, a new exported class shaped like
  `ConnectionIdError`:
  - `name`, and an `id` through `safeForLog`;
  - a message saying the id is still bound to a connection being disconnected. It makes **no retry
    claim and no "drop the frame" advice**;
  - JSDoc saying that the `Connection.id` contract forbids reuse, and that #363 may widen this
    refusal to live bindings;
  - it **must not contain** either sibling's message text.
- **FR-004**: `register` calls `this.#assertAdmissible(connection)` as its **first** statement,
  before `#assertUsableId`. The order is unobservable, because a retired object was already admitted
  and its id is usable, and it is kept for that reason (A3). It also keeps `connection_id_304`'s
  register anchor byte-identical. `@throws` gains both classes. The JSDoc states the lifecycle duty
  (FR-017a): `register` **must be called from the transport's open hook**.
- **FR-005**: **The pre-check.** In `subscribe`, `this.#assertAdmissible(connection)` is the
  statement **directly after** `const kind = channelKind(channel)`. It runs before the
  `identity === null` denial and before the authorizer, so a retired connection's authorizer never
  runs. The `channel_name_314` anchors end at `const kind = channelKind(channel)`, and the #347 and
  #357 anchors begin at `let member`, so all of them stay byte-identical.
- **FR-006**: **The post-check.** A second `this.#assertAdmissible(connection)` goes **between the
  #347 invariant's closing `}` and the `// BEFORE any membership mutation` comment**. It is below the
  deny `return` and every authorizer-result throw (FR-007a), and in the #323 synchronous turn with
  `#checkChannelCaps`, `connections.set` and `#joinLocal`'s adds, with no await between them. The
  347, 350, 353 and 357 anchors stay intact.
- **FR-007**: **No write before the refusal.** `subscribe`'s order is:
  1. the id and channel assertions;
  2. the pre-check;
  3. the authorizer, the deny `return`, classification, member admission and the #347 invariant;
  4. the post-check;
  5. `#checkChannelCaps`, then `connections.set`, then the join.

  A refused subscribe takes no slot, issues no watch, writes no presence entry or hold, and sends no
  frame. Nothing is undone. `subscribe`'s `@throws` gains both classes: raised before the authorizer
  and again after it, and always before every write.
- **FR-007a** (A3): **Precedence.** The retirement refusal replaces only an **admission**. Every
  outcome the authorizer's result produced, a defect (`AuthorizeResultError`, a member error) or a
  denial (`{ ok: false }`), is reported as produced. Before the authorizer, the retirement wins,
  because the authorizer never runs. Id and channel defects come first everywhere. `subscribe` never
  resolves `{ ok: true }` for a retired connection, and it resolves `{ ok: false }` only when its own
  authorizer denied. The pin is W3 (ii), and the mutant is N10.

**Ownership stays `connections`**

- **FR-008**: `disconnect`: retirement and the reverse-index copy happen **in one synchronous turn**.
  A join that committed before it is in the copy. A join after it meets the retirement. The loop
  keeps its contract: one channel's failure never aborts the rest, the first failure is re-thrown,
  later failures are WARNed, and the `finally` deletes from `#channelsByClient` and `connections`.
  **The collector uses a flag** (FR-010b): `let failed = false` plus the value, never
  `failure === undefined`. The docstring and the `owned` comment are corrected. The comment "It
  cannot change underneath: only this method's own `finally` deletes from `connections`" is false
  today, because `subscribe` re-adds the id. It becomes a statement of the retirement turn.
- **FR-009**: **Nothing else reads `#retired`.** `unsubscribe`'s `owned`, `evict` and
  `revokeLocal`, `#recheckRevocations`' `owns` predicate and its `if (!this.connections.has(...))
  continue` (the #359 decider), `deliverLocal` and `emitPresence` keep reading `connections`, byte
  for byte. `disconnect` does not delete from `connections` at entry.
- **FR-010**: **`unsubscribe` forgets before it leaves.** In order:
  1. `const owned = this.connections.has(clientId)`, unchanged;
  2. `const member = this.#forgetPresenceMember(channel, clientId)`;
  3. `left = await this.#leaveLocal(channel, clientId)` inside a `try`, whose `catch` records the
     failure with a flag and its value;
  4. `if (member)`, the release `await this.#syncRosterMember(channel, { clientId, member })` runs
     **whether or not the leave failed**, inside a `try`. A release failure is re-thrown if the leave
     succeeded. If the leave failed, the release failure is WARNed through `safeForLog(channel)` and
     `renderError`, and never names the member;
  5. the leave's error, if any, is re-thrown;
  6. otherwise the outcome is returned as today.

  Every promise is awaited where it is created. Two reasons, both witnessed:
  - a rejected unwatch no longer skips the forget and the release (W6);
  - a subscribe racing a suspended leave no longer takes the re-join guard's read and reports `ok`
    for a membership the leave is removing (W9, A6).
- **FR-010a** (A11): the #323 compensation in `#joinPresence` (`:1610–1611`) is **not** changed. It
  forgets, then awaits `#leaveLocal`, and if that rejects it skips its roster reclaim. After this
  change, `unsubscribe` collects that failure and still releases, so **the two leave paths
  differ**. The compensation undoes its own possibly-committed write under an error it is already
  propagating, and changing its reclaim would re-open the #323 and #330 batteries for a failure mode
  of its own. It is filed separately as residue (§9).
- **FR-010b** (A5, widened): **A failure is recorded by a flag, never by the error's value, in
  every collector in `manager.ts`.** The rule covers these sites, all fixed here:
  - `disconnect`'s collector (FR-008);
  - `unsubscribe` (FR-010);
  - `handlerHooks.onClose` (FR-010c);
  - **`evict`'s durability collector** (`:2570–2599`): `let durabilityError: unknown` and
    `if (durabilityError !== undefined) throw durabilityError` become a flag plus the value;
  - **`revokeChannel`'s durability collector** (`:2713–2749`): the capture, the
    `if (durabilityError === undefined) durabilityError = applied.clearError` fallback and the final
    re-throw become a flag plus the value;
  - **`#revokeChannelLocal`'s clear collector** (`:2806–2823`):
    `if (clearError === undefined) clearError = error` becomes a flag plus the value. The flag
    crosses the return (`{ outcome, clearFailed, clearError }`), so that `revokeChannel`'s fallback
    reads the flag. Its other caller, `#applyRevocation` (`:2898`), ignores the clear result and is
    unchanged.

  After the change, `grep -nE "(Error|failure) (===|!==) undefined" packages/realtime/manager.ts`
  finds no collector. W6 (ii) witnesses the rule, and N13 / N13b are its mutants.
- **FR-010c** (S2a): **`handlerHooks.onClose` always runs `disconnect`** (`manager.ts:1158–1161`).
  In order:
  1. `await userHooks.onClose?.(…)` inside a `try`, recording a failure by flag and value;
  2. `await this.disconnect(conn.id)` inside a `try`. Its failure is re-thrown if the app hook
     succeeded. Otherwise it is WARNed through `safeForLog(conn.id)` and `renderError`;
  3. the app hook's error is re-thrown first.

  Never a bare `try/finally`, which would drop the app's error silently if `disconnect` also threw.
  The witness is W12, and the mutant is N12.

**Surface, contract and hygiene**

- **FR-011**: `ConnectionDisconnectedError` and `ConnectionIdInUseError` are exported from
  `packages/realtime/mod.ts`, in the error block beside `ConnectionIdError` (`:84–85`). The block's
  comment gains one sentence: a lifecycle refusal on the shared `onError` hook needs `instanceof`
  too.
- **FR-012**: **Anchor hygiene.** No new comment or docstring quotes, verbatim, a line a battery row
  anchors on. That covers `this.connections.set(connection.id, connection)`,
  `const member = this.#forgetPresenceMember(channel, clientId)`,
  `await this.#syncRosterMember(channel, { clientId, member })`, `const kind = channelKind(channel)`,
  `conn.close(1011, 'unusable connection id')`, the durable-revocation WARN, and any sibling error's
  message text. A second match makes a row `DEAD`.

**Tests**

- **FR-013**: Witnesses W1–W12 go in a new `packages/realtime/tests/disconnect_admission_361.test.ts`
  (§4). They are committed **red on `main` first**, except the pins W3 (ii) and W7. The file defines
  its harnesses:
  - `GatedUnwatchDriver`, re-created from R13 (d) on `MemoryBroadcastDriver` (D6), with a recording
    watch pair and an unwatch that suspends until the test opens it;
  - an unwatch that rejects for a named channel, with a chosen value (`undefined` included);
  - a captured `onRosterLapse` handler.
- **FR-014**: Mutation battery `packages/realtime/tests/mutations/disconnect_admission_361.ts`, rows N1–N13 and N13b. SUITES is that test file, and each row is proven live. `this.#assertAdmissible(connection)`
  appears three times, so each row anchors on a neighbouring line (§4).
- **FR-015**: **#359 follow-through** (disposition §7):
  - **R13 (d) is retired** from `tests/revocation_paging_359.test.ts:832`, with its
    `GatedUnwatchDriver` (`:810`). One comment line stands in its place: *"R13 (d) retired by #361:
    its precondition, a membership naming an id absent from `connections`, is no longer reachable.
    See `disconnect_admission_361.test.ts` W1."*
  - **M14 moves to `expectSurvival`** in `tests/mutations/revocation_paging_359.ts:333`. The row is
    kept, and its anchor is unchanged. Its `killedBy` is the #341 sentinel `'(none — equivalent)'`
    (A8). Its reason: *"Equivalent since #361: an id absent from `connections` is named by no
    membership and no presence entry. A retired connection is refused at admission (#361 W1, W3,
    W8), and `unsubscribe` forgets presence before its awaited leave (#361 W6). Against such an id,
    applying is a no-op. The fixture that would kill it is R13 (b, c)'s foreign id, if applying
    there ever became observable."* The row comment (`:340–347`) and the battery header (`:36–39`)
    are updated. It is not re-pointed at an unwatch-failure witness.
  - `.specnaut/specs/265-paged-revocation-read/tasks.md`, after `:221`: *"Resolved by #361: R13 (d)
    retired, M14 is `expectSurvival`."*
- **FR-016**: The re-anchor list in §4 is applied: 334 is re-anchored and re-proven live, and 344 M6
  is re-verified live. Then `deno task mutate realtime` runs. Any other `DEAD MUTANT` is repaired,
  never deleted.

**The custom transport's lifecycle contract, and docs**

- **FR-017a** (A1/S1): **The lifecycle contract is written down.** A transport must:
  1. call `register` with the connection object from its open hook;
  2. present **that same object** for the socket's whole life;
  3. call `disconnect` at close.

  Homes:
  - the same-object rule goes in the `Connection` JSDoc (`types.ts:106–115`);
  - "must be called from the open hook" goes in `register`'s JSDoc;
  - `docs/realtime.md` § *Two constraints on your connection ids* (`:466`) becomes **one** section,
    covering the two id rules and these three duties;
  - item 15 and § *The connection* point to that section and do not restate it.

  `handlerHooks` and `buildEvents` meet all three duties, since `connFor` caches one object per
  socket. W11 pins that.
- **FR-017**: Docs (a breaking change on an edge path, disposition §14):
  - **`docs/realtime.md`**:
    - **item 15 of *Upgrading to v0.4.0***, with a before and after that documents **the two
      classes separately**:
      - `ConnectionDisconnectedError`: this connection object was disconnected. Catch it with
        `instanceof` and drop the frame;
      - `ConnectionIdInUseError`: a different object under an id still being torn down. It is a
        breach of the id contract, so it is not retried and not dropped silently;
    - item 15 also covers: an uncaught error reaches `onError`, or the default ERROR line; the
      precedence rule (a denial is still `{ ok: false }`); `handlerHooks` now always disconnects,
      even when the app's `onClose` throws; `connectionCount` no longer counts zombies; no wire change
      and no migration step;
    - the section's intro count and its "read items …" list are updated;
    - the worked example (`:1016–1053`) wraps `await dispatch(conn, frame)` in a `try` that drops
      the frame on `instanceof ConnectionDisconnectedError` and re-throws anything else;
    - § *The connection* gains a pointer to the lifecycle-contract section.
  - **`packages/realtime/README.md`**: one bullet in *What ships*.
  - **`packages/realtime/AGENTS.md`**:
    - both classes go in the *Public surface* row (`:56`);
    - the *Invariants* bullet becomes "…reaches a connection only after the authorizer approved
      **that object's own** subscribe";
    - a new **pitfall** reads: *retirement is keyed by object and terminal, and it is not a
      spelling of ownership. Never consult it in the revocation decider or any other ownership
      reader, never re-key it by id, and never delete from `connections` at `disconnect`'s
      entry.* It points at ADR 010;
    - the *Tests* list is regenerated by `deno task agents:brief`.
  - **ADR 010** (A4), `docs/adr/010-realtime-disconnect-retires-the-connection-object.md`, records:
    - the question and the three windows;
    - retirement by object;
    - admission versus ownership;
    - the two refusal types;
    - the precedence rule;
    - the transport lifecycle contract;
    - the rejected options with their costs (disposition §9);
    - the residue (§9);
    - that #363 amends it.

    `#retired`'s JSDoc keeps the definition, and the ADR links to it. **Its number is assigned at
    landing**, because #362 also planned 010.
  - **JSDoc**: `#retired`, `#assertAdmissible`, both classes, `register` and `subscribe`
    (`@throws`), `disconnect`, `unsubscribe`, `handlerHooks` (the `onClose` guarantee), `evict` (the
    flag) and `Connection` (FR-017a).
  - **No `CHANGELOG` file** (D2, #364).

## 4. Success criteria

- **SC-001**: For a connection **registered at open and always presented by the same object**
  (FR-017a), after any `disconnect` settles, no local state names its id: no connection, no
  reverse-index entry, no membership, no presence entry and no roster hold. This holds whatever
  `subscribe` calls were in flight or issued later.
- **SC-002**: A refused subscribe has no side effect: no cap slot, no anonymous share, no broker
  watch, no roster write and no presence frame. It makes no authorizer call when it was issued after
  the disconnect began.
- **SC-003**: A subscribe on a retired connection **never resolves `{ ok: true }`**. It resolves
  `{ ok: false }` only when its own authorizer denied. Otherwise it throws a named error.
- **SC-004**: A connection registered later under a reused id receives nothing from a room it was
  never authorized for.
- **SC-005**: A presence member whose last local leave fails to unwatch is still released from the
  roster, and a liveness lapse does not bring it back.
- **SC-006**: On the framework's socket path, a closed socket is always disconnected, whatever the
  application's close hook does.
- **SC-007**: Joins that committed before the disconnect, the ownership outcomes and the revocation
  re-check behave exactly as before.

**Witnesses** (FR-013), in `tests/disconnect_admission_361.test.ts`. "Red" means it fails on `main`
at `c00bfcde`. Test names start `#361 W<n> ` with a trailing space, so `W1 ` is not a prefix of
`W10`–`W12`.

| # | Setup → assertion |
| :--- | :--- |
| W1 (red), window (a) | `GatedUnwatchDriver`; presence room `ROOM` with observer `o` (member 2) on the same instance; `c1` (member 1) is the only member of `lobby`. `subscribing = subscribe(c1, ROOM)` with a gated authorizer; `disconnecting = disconnect('c1')`; await `driver.unwatching`; admit → `subscribing` rejects with `ConnectionDisconnectedError`; open the unwatch → `'disconnected'`. After: `connections`, `#channelsByClient`, every `subscriptions` set, `presence` and `readRoster(ROOM)` name `c1` / member 1 nowhere; `o` got no `joined` / `left` for member 1 |
| W2 (red), caps and watch | `maxWatchedChannels: 2`, `maxChannelsPerConnection: 2` (the constructor refuses a per-connection cap above the instance cap); the W1 race on a fresh `private-x` with `c1` holding `lobby`. The driver never watched `private-x`; `subscriptions.has('private-x')` is false; a new identified connection then takes two fresh channels without `ChannelLimitError` |
| W3 (i) (red), window (b) | `c1` holds nothing; `subscribe(c1, 'private-x')` with a gated authorizer; `await disconnect('c1')` resolves while it is pending; admit → rejects with `ConnectionDisconnectedError`; `connectionCount === 0`; no state names `c1`; no watch of `private-x`. On `main`: `ok` and a zombie |
| W3 (ii) (pin, A3) | The W3 (i) setup with an authorizer that **denies** → `{ ok: false }`; nothing written (`connectionCount === 0`, no membership, no watch). Green before and after |
| W4 (red), window (c) | (i) `register(c1)`, `await disconnect('c1')`, `subscribe(c1, 'private-x')` throws `ConnectionDisconnectedError`, with the spy authorizer called **0** times. (ii) `maxWatchedChannels: 2`, `maxChannelsPerConnection: 2`, `anonymousHostingShare: 0.5` (anonymous ceiling `floor(2 × 0.5) = 1`); anonymous `a` registered and disconnected; `subscribe(a, 'news')` throws; a fresh anonymous `b` then gets `{ ok: true }` on `'feed'` (the share is unspent); `connectionCount === 1` |
| W5 (red) | After `await disconnect('c1')`, `register(c1)` (the same object) throws `ConnectionDisconnectedError`, and `connectionCount` is unchanged. The same holds during a suspended teardown |
| W6 (red), the second cause | (i) `c1` (member 1) is the last local member of `ROOM` and also holds `news`, in that order; `unwatchChannel(ROOM)` rejects with `E`. `disconnect('c1')` rejects with **`E`**; `presence.has(ROOM)` is false; `readRoster(ROOM)` does not hold member 1; `news` was still torn down, unwatched and absent from `subscriptions` (D5); `connections` lacks `c1`; firing the captured `onRosterLapse` issues **no** `holdMember`. (ii) A5: the same with the unwatch rejecting with **`undefined`**: `disconnect` still rejects. And, each with the dependency rejecting with `undefined`: `evict('c2')` (`markRevocation`) still rejects after the local revoke; `revokeChannel('c2', ROOM)` (`markRevocation`) still rejects after the local leave; `revokeChannel('c3', ROOM)` with only `clearRevocation` rejecting still rejects |
| W7 (pin) | A join committed before the disconnect: `subscribe(c1, ROOM)` is suspended in a gated `holdMember`; `disconnect('c1')` starts; release → the subscribe resolves `{ ok: true }`, the disconnect resolves `'disconnected'`, no state names `c1`, and the roster does not hold member 1. Green before and after |
| W8 (red), id reuse | During a suspended teardown of `c1` (object A holding `lobby`), a **different** object B with id `c1`: `register(B)` and `subscribe(B, ROOM)` each throw **`ConnectionIdInUseError`**, and the authorizer is never called. After the teardown settles, a third object C with id `c1` is registered; `broadcast(ROOM, …)` and a presence change by the observer reach C with **no** frame. After C's own authorized subscribe, it receives the next broadcast (the positive control) |
| W9 (red, A6) | `c1` is the last local member of `ROOM`. `unsubscribe(c1, ROOM)` is suspended in a gated unwatch; `subscribe(c1, ROOM)` resolves `ok`; open the unwatch and drain → `subscriptions.get(ROOM)`, `presence.get(ROOM)` and `readRoster(ROOM)` all hold `c1` / member 1. On `main` the subscribe takes the re-join guard's read, and nothing is held |
| W10 (red, A7) | `c1` owned; `await evict('c1')`; `subscribe(c1, 'private-x')` throws `ConnectionDisconnectedError`, with the spy authorizer called **0** times |
| W11 (red, A1) | Through the framework's socket path: `buildEvents(manager.handlerHooks({ onOpen: capture }), identity)`; fire `onOpen`, then `onClose`, and drain until `connectionCount === 0`; `subscribe(captured, 'news')` throws `ConnectionDisconnectedError`. This pins that `connFor` presents one object for the socket's life |
| W12 (red, S2a) | `manager.handlerHooks({ onClose: () => { throw APP } })`; `onOpen(c1)`, `c1` subscribes `news`; the composed `onClose` rejects with **`APP`**; afterwards `connectionCount === 0`, `news` is not in `subscriptions`, and `subscribe(c1, 'news')` throws `ConnectionDisconnectedError`. A second case with `disconnect` also failing: the rejection is still `APP`, and the disconnect failure is one WARN |
| — | Every existing realtime test stays green unmodified, except R13 (d), which is retired (FR-015) |

**Mutants** (FR-014), battery `tests/mutations/disconnect_admission_361.ts`, each proven live:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| N1 | the post-check removed (anchored on it plus `// BEFORE any membership mutation`) | W1, W3 (i) |
| N2 | the pre-check removed (anchored on `const kind = channelKind(channel)` plus it) | W4 (the authorizer call count) |
| N3 | the retirement moved from `disconnect`'s entry into its `finally` | W1 |
| N4 | the post-check moved below `connections.set` | W3 (i) (`connectionCount`) |
| N5 | `register`'s check removed (anchored on it plus `#assertUsableId`) | W5 |
| N6 | `unsubscribe`'s forget moved back after the awaited leave | W6, W9 |
| N7 | the release skipped when the leave failed | W6 |
| N8 | the bound-object clause removed from `#assertAdmissible` | W8 |
| N9 | the split collapsed: clause 2 throws `ConnectionDisconnectedError` | W8 |
| N10 | the post-check hoisted above the deny `return`, straight after the awaited authorizer | W3 (ii) |
| N11 | `disconnect`'s per-channel `try`/`catch` removed | W6 (i) (`news` still torn down) |
| N12 | `handlerHooks.onClose` back to the unprotected order (app hook, then `disconnect`, no collection) | W12 |
| N13 | `disconnect`'s collector back to `failure === undefined` | W6 (ii) |
| N13b | `#revokeChannelLocal`'s clear collector back to `clearError === undefined` (the returned flag dropped) | W6 (ii) (the `revokeChannel` clear case) |

**Re-anchor and repair list.** This was counted on `main` at `c00bfcde`:

- every battery under `tests/mutations/` (34 of them) was evaluated with a stub harness that dumped
  each row's file and anchors;
- `presence_member_frozen_354`'s type rows were read by hand;
- every anchor in `manager.ts` was located, and the ones in or beside an edit site were kept.

*Adjacent rows: **22 in 11 batteries**. 1 is re-anchored, 1 is re-verified, and 20 stay as they
are, provided FR-004–FR-006, FR-010b, FR-010c and FR-012 hold.*

- **Unchanged, disposition sites (13):**
  - `connection_id_304` ×3: the `register()` guard, kept by FR-004; the `subscribe()` guard; the id
    encoded in the message.
  - `channel_name_314` ×3: two end at `const kind`; "UNSUBSCRIBE guarded too" anchors on the
    signature, and its injected assertion now lands above the forget. Re-verified live.
  - `authorize_result_347` M7.
  - `authorize_result_357` M1, M5 and M7.
  - `manager_debt_353` M1.
  - `presence_member_306` ("moved AFTER the roster write").
  - `presence_member_admission_350` M10.
- **Unchanged, sites added by the audit fold (7):**
  - `handlerHooks.onClose`: `connection_id_304` ×2 anchor on `onOpen`'s
    `conn.close(1011, 'unusable connection id')` lines, and FR-010c touches only `onClose`.
  - `evict`'s collector: `connection_id_304`'s evict guard, and `log_encoding_291` ×2 on the
    durable-revocation WARN. FR-010b changes only the capture and the final re-throw.
  - `revokeChannel` / `#revokeChannelLocal`: `channel_revoke_332` ×2, on
    `revocationId: revocation.id,` (the publish) and on `if (left === 'left') {` / `for (const id of
    group.ids) {` (the clear loop). FR-010b touches only the capture lines and the return shape, so
    both stay byte-identical. Re-verified live, because the clear loop's `catch` sits right below
    the second anchor.
- **Re-anchored (1):** `presence_eviction_334` "#334 the local entry is dropped AFTER the roster
  write, not before". FR-010 separates its two anchor lines.
  - The new anchor is `"        const member = this.#forgetPresenceMember(channel, clientId)\n"`.
    It is unique, because the #323 compensation forgets `connection.id`.
  - The mutant becomes `"        const member = this.presence.get(channel)?.get(clientId)\n"`.
  - The row is re-proven live.
- **Re-verified (1):** `presence_member_transitions_344` M6. Its 12-space anchor
  `"            await this.#syncRosterMember(channel, { clientId, member })\n"` becomes a
  substring of the 16-space release line inside FR-010's `try`, and still matches once. Re-proven
  live, and repaired to the 16-space line if not.
- **Changed disposition, not re-anchored (1):** `revocation_paging_359` M14 moves to
  `expectSurvival` (FR-015).
- **Nothing anchors** in `disconnect`'s body, the field block or `types.ts`. A3 adds no re-anchor,
  because `register`'s order is kept.

*Tests to repair: 1.* R13 (d) is retired. A scan found no existing test that calls `subscribe` or
`register` with an object after its `disconnect` or `evict`. It covered the 8 files that call
`disconnect` and the **7** that call `evict`. Its two hits in `channel_revoke_332` are new objects
in later tests. The full suite is still run before any edit (§9).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| 1. What "retired" means: a `disconnect` has begun for this connection **object**; terminal, per-manager, keyed by object | `#retired` and its JSDoc, `packages/realtime/manager.ts` (ADR 010 links to it) | an id-keyed `Set<string>` or tombstone; a per-id generation; a `closed` flag on `Connection`; a `#disconnecting` set cleared in `finally`; a TTL; a set in the driver; the definition restated in ADR 010 or `AGENTS.md` instead of linked |
| 2. Only `disconnect` retires: in its first statements, before any await, from the same `connections.get` that decides `owned` | `disconnect`'s entry, `packages/realtime/manager.ts` | `revokeLocal` or `handlerHooks.onClose` also adding to `#retired`; retiring in `finally`; retiring after an `await`; a second `get` for `owned` |
| 3. Whether a connection is admissible: not retired (clause 1), and not a different object bound under a retired one's id (clause 2) | `#assertAdmissible`, `packages/realtime/manager.ts` (the one reader of `#retired`) | `#retired.has(…)` inlined at a call site; a check in `#joinLocal`, `#joinPresence` or `#checkChannelCaps`; a check in `websocket.ts` or `handlerHooks`; two predicates, one per clause |
| 4. Where admission is asked: `register` (first statement), `subscribe` before its authorizer (directly after `const kind`), and `subscribe` in the #323 turn (between the #347 invariant and `#checkChannelCaps`) | the three `#assertAdmissible(connection)` calls, `packages/realtime/manager.ts` (three askers, one decider) | a fourth call site (in `unsubscribe`, `evict` or `deliverLocal`); a post-check below `connections.set` or above the deny `return`; a pre-check above the id or channel assertions |
| 5. Ownership and admissibility are different questions: `connections` answers ownership (unsubscribe's outcome, evict routing, `revokeLocal`, the #359 decider and `owns`, delivery); `#retired` answers only admission | `connections` (ownership) and `#assertAdmissible` (admission), `packages/realtime/manager.ts` | `#retired` read by `#recheckRevocations`, `owns`, `unsubscribe` or `evict`; `connections.delete` at `disconnect`'s entry; an `owned && !retired` compound |
| 6. A refused admission **throws**; `subscribe` never resolves `{ ok: true }` for a retired connection | the `#assertAdmissible` throws, `packages/realtime/manager.ts` | `return { ok: false }` for a retired connection; a `reason` field on `SubscribeResult`; a no-op resolving `ok`; catching it inside `subscribe` |
| 7. Two refusal types, one predicate: clause 1 → `ConnectionDisconnectedError` (this object was retired; no retry helps; drop the frame); clause 2 → `ConnectionIdInUseError` (the id contract breached; no retry or drop claim; #363 may widen it) | the two classes in `packages/realtime/manager.ts`, exported from `packages/realtime/mod.ts`; the choice in `#assertAdmissible` | one class for both; a bare `Error`; reusing `ConnectionIdError` or `ChannelLimitError`; a class in `websocket.ts`; a message carrying the raw id; a flag on one class distinguishing the clauses |
| 8. Precedence: the retirement refusal replaces only an ADMISSION. Every outcome the authorizer's result produced (a defect, a denial) is reported as produced; before the authorizer, the retirement wins because the authorizer never runs; id and channel defects come first everywhere; `register`'s lifecycle-first order is unobservable and kept for that reason | `subscribe`'s statement order and `register`'s first statement, `packages/realtime/manager.ts` (FR-007a) | the post-check above the deny `return` or above `classifyAuthorizeResult`; a retirement check that turns a denial into a throw; id or channel assertions moved below the pre-check |
| 9. No write before the refusal: nothing is taken, watched, held or announced, and nothing is undone | `subscribe`'s statement order, `packages/realtime/manager.ts` (FR-007) | refuse-and-undo; a check after `connections.set`; an `unsubscribe` from `subscribe`; a roster release for a refused join |
| 10. Retirement and the reverse-index copy share one synchronous turn | `disconnect`'s entry, `packages/realtime/manager.ts` | an `await` between them; re-reading `#channelsByClient` until empty; a second teardown pass |
| 11. `unsubscribe` forgets presence **before** its awaited leave; the release runs even when the leave rejects; the leave's failure is re-thrown, and a release failure after it is WARNed. Why: a failed unwatch must not skip the forget or the release (W6), and a subscribe racing a suspended leave must not take the re-join guard's read (W9). The #323 compensation is **not** aligned (FR-010a): it undoes its own write under an error it already propagates, and its reclaim gap is filed separately | `unsubscribe`, `packages/realtime/manager.ts` | the forget after the leave; the release skipped on a leave failure; `Promise.allSettled` over leave and release; a leave promise awaited after the release; a swallowed second failure; the reorder duplicated in `disconnect`; the compensation changed here |
| 12. A failure is recorded by a flag, never by the error's value (a rejection may be `undefined`) | every collector in `packages/realtime/manager.ts`: `disconnect`, `unsubscribe`, `handlerHooks.onClose`, `evict` (`:2570–2599`), `revokeChannel` (`:2713–2749`) and `#revokeChannelLocal` (`:2806–2823`, the flag carried in its return), all fixed here | `failure === undefined`, `durabilityError !== undefined`, `clearError === undefined`; a returned error value without its flag; `?? new Error()` substitution; a sentinel object; a new collector added later without a flag |
| 13. A disconnect's per-channel policy: the rest are still torn down, the first failure is re-thrown, later ones are WARNed, and the id is forgotten in `finally` | `disconnect`'s loop and `finally`, `packages/realtime/manager.ts` | a second collection policy in `unsubscribe` for disconnect's sake; `disconnect` swallowing |
| 14. The framework's socket path always disconnects on close: the app hook's failure is recorded by flag, `disconnect` always runs, the app's error is re-thrown first, and a disconnect failure after it is WARNed | `handlerHooks.onClose`, `packages/realtime/manager.ts` (FR-010c) | a bare `try/finally` (drops the app error when both fail); `disconnect` before the app hook; a catch in `websocket.ts`'s `onClose` instead (a separate item); swallowing either error |
| 15. Implicit registration stays: `subscribe` of a non-retired connection absent from `connections` still registers it | `subscribe`'s `connections.set`, `packages/realtime/manager.ts` (unchanged) | refusing unregistered connections (a mandatory `register`, rejected, disposition §9; its residue is filed separately) |
| 16. The custom transport's lifecycle contract: (1) call `register` with the connection object from the open hook; (2) present that same object for the socket's whole life; (3) call `disconnect` at close | same-object rule: the `Connection` JSDoc, `packages/realtime/types.ts`; open-hook rule: `register`'s JSDoc, `packages/realtime/manager.ts`; the user-facing statement: the merged id-and-lifecycle section of `docs/realtime.md` (item 15 and § *The connection* point to it) | the duties restated in item 15, the README or `AGENTS.md`; a second "constraints" section; a runtime check that the object is the registered one (that is #363's question) |
| 17. Deleting the #359 decider's `connections.has` check is equivalent once #361 holds | M14's `expectSurvival` reason (sentinel `killedBy: '(none — equivalent)'`), `packages/realtime/tests/mutations/revocation_paging_359.ts` | the reason restated in the #361 battery; M14 re-pointed at an unwatch-failure witness; M14 deleted; R13 (d) kept with a new precondition |
| 18. What an application does about each refusal: drop the frame on `ConnectionDisconnectedError`; treat `ConnectionIdInUseError` as a contract breach | item 15 and the worked example, `docs/realtime.md` | the guidance restated beyond one README bullet; a `handlerHooks` wrapper that swallows either (no silent catches) |
| 19. The race harness (a gated unwatch on a roster-capable driver) | `GatedUnwatchDriver` in `packages/realtime/tests/disconnect_admission_361.test.ts` | the #359 copy kept; a second gated driver elsewhere; a shared helper module for one caller |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary Dependencies**: `@lockness/realtime` only; no
new import · **Storage**: none; one in-memory `WeakSet` per manager · **Testing**: `deno test`;
`MemoryBroadcastDriver` subclassed with a gated or rejecting unwatch and a captured `onRosterLapse`;
`buildEvents` driven directly for W11; the shared mutation harness · **Target**: server library ·
**Project type**: framework package · **Performance**: per `subscribe`, at most two `WeakSet`
lookups and one `Map.get` per check (two checks); one `WeakSet.add` per `disconnect`; no retained
memory · **Constraints**: no wire, driver-port, control-frame or option change; two new public error
classes · **Scale**: unchanged.

### Domain model

- **Bounded context**: realtime (`ChannelManager`'s connection lifecycle and channel admission).
- **Vocabulary**:
  - *connection*: a client socket registered in `connections` under its id;
  - *membership*;
  - *watch*;
  - *teardown loop*;
  - **retired**: a `disconnect` has begun for this connection *object*. Terminal, per-manager;
  - **admissible**: not retired, and not a different object bound under a retired one's id;
  - **owned**: present in `connections`. A retiring connection is still owned, but no longer
    admissible;
  - *stranded*: state naming an id that no teardown will reach;
  - **lifecycle contract**: register at open, the same object throughout, disconnect at close.
- **Entities**:
  - `ChannelManager`, the aggregate root: it owns `connections`, `subscriptions`,
    `#channelsByClient`, `presence`, the caps and `#retired`;
  - `Connection`: identified by its object for retirement, and by its id for ownership.
- **Value objects**:
  - `ConnectionDisconnectedError(id)` and `ConnectionIdInUseError(id)`: lifecycle refusals, never
    denials;
  - `DisconnectOutcome` and `LeaveOutcome`, unchanged.
- **Invariants**:
  - every membership and presence entry names an id in `connections`, and that id is in
    `#channelsByClient` with the channel;
  - after `disconnect(id)` settles, no state names `id`, for a connection that honours the
    lifecycle contract;
  - a membership exists only for a connection **object** whose own `subscribe` was authorized;
  - retirement and the reverse-index copy share one synchronous turn;
  - a refusal lands before any write;
  - ownership is read only from `connections`, and admissibility only through `#assertAdmissible`;
  - a failure is recorded by a flag.
- **Out of scope**:
  - driver contracts;
  - the durable revocation re-check (#359);
  - #349's lapse re-assert (unmodified);
  - #363;
  - retiring implicit registration;
  - `websocket.ts`'s unguarded `onClose` (S2b, a separate item);
  - the #323 compensation's reclaim gap (A11).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | both classes take `id: string` |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | per task, plus `deno task mutate realtime` |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-003, FR-003a, FR-017 and FR-017a list every block |
| MVC layering | pass | not applicable (library aggregate) |
| Commit discipline | pass | test (red witnesses) / fix (manager, export, `types.ts` JSDoc) / test (battery, #359 follow-through, re-anchors) / docs (ADR 010, `realtime.md`, README, `AGENTS.md`) |
| No environment detail in versioned files | pass | none |
| Design decisions go to architect-expert | pass | disposition; plan audit A1–A12 and rulings on S1–S3 binding |
| Act, don't recommend | pass | residue is filed (§9); #364 carries the changelog gap |
| TDD, red first | pass | W1–W12 are red on `main` except the pins W3 (ii) and W7 |
| No silent catches | pass | every collector re-throws the first failure and WARNs the second; `handlerHooks.onClose` never drops the app's error; a failure is recorded by flag, so an `undefined` rejection is not lost |
| Domain Model gate | pass | §6 |
| #323 synchronous turn | pass | the post-check adds no await |
| #331: a denial never revokes; this refusal is not a denial | pass | a denial is still reported as produced (FR-007a) |
| #330: derived where derivable | pass | "this socket ended" cannot be derived after `finally`; it is recorded where it bounds itself |

### Complexity tracking

No violation. Added:

- one private field, one private predicate and two exported error classes;
- three call sites;
- the `unsubscribe` reorder;
- four collector rewrites (`disconnect`, `evict`, `revokeChannel`, `#revokeChannelLocal`) and one new
  collector (`handlerHooks.onClose`);
- one JSDoc contract in `types.ts`;
- one ADR.

The second error class (A2/S3) exists because one message cannot be true for both clauses. The
rejected alternatives are the disposition's §9.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | yes, **breaking on an edge path** | new exports `ConnectionDisconnectedError` and `ConnectionIdInUseError`; `subscribe` and `register` throw them for a disconnected connection or a different object under a retiring id, where `subscribe` used to resolve `{ ok: true }` and re-register |
| `handlerHooks` | yes | `onClose` always disconnects, even if the app's `onClose` throws; the app's error is still the rejection |
| `Connection` contract (`types.ts`) | doc | the same-object rule is written down |
| `evict`, `revokeChannel` | behaviour on an `undefined` rejection only (durability write or record clear) | now re-thrown instead of lost |
| `connectionCount` | yes | no longer counts zombies |
| `unsubscribe` | behaviour on failure and under a racing subscribe | presence is forgotten before the leave; a rejected unwatch no longer skips the release; a racing subscribe now joins instead of reporting a read |
| `disconnect` | internal | retires at entry; the flag collector |
| Driver ports, wire, control plane, options, `websocket.ts` | no | — |
| Revocation re-check (#359) | no | reads `connections` byte for byte |
| Tests | yes | new witness file and battery; R13 (d) retired; M14 moved to `expectSurvival`; 334 re-anchored; 344 M6 re-verified |
| Docs | yes | ADR 010 (number at landing), `docs/realtime.md` (item 15, the merged contract section, the worked example, § *The connection*), README, `AGENTS.md` (exports, the Invariants bullet, the pitfall, the generated tests list), JSDoc; one line in #359's `tasks.md` |

### Documentation (this feature)

```text
.specnaut/specs/266-disconnect-admission/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| An existing test reuses a disconnected object and now throws | The scan found none (§4). The full realtime suite runs before the first edit, and a test relying on a zombie is repaired, never weakened |
| A check is placed off its line and a 314, 347, 350, 353 or 357 anchor goes DEAD or changes meaning | FR-005 and FR-006 fix the lines; §4 lists the 18 unchanged rows; `deno task mutate realtime` is in the gate |
| A new comment quotes an anchor line | FR-012; the harness reports `DEAD` |
| The `unsubscribe` reorder changes an observable ordering | The new state is the correct one (W9 is the defect it removes); the presence batteries (323, 330, 334, 343, 344, 345, 348, 349) are re-run whole |
| 344 M6 matches as a substring, and its injected line lands in the `try` | Re-proven live; repaired to the 16-space line if not |
| Someone reads `#retired` in the revocation decider, or deletes from `connections` at entry | Rows 3 and 5; the `AGENTS.md` pitfall and ADR 010; M14's reason goes false if the invariant breaks |
| Someone re-keys retirement by id to cover #363 | The pitfall: memory becomes unbounded under churn (disposition §2, §9) |
| An app that relied on the silent re-registration now sees one ERROR line per race | Intended (disposition §15); item 15 shows the `instanceof` drop |
| **Residue (S2b):** `websocket.ts`'s `onClose` is `void hooks.onClose?.(…)`, outside `guard()`. A rejection from the composed `onClose`, which W6 pins for a failed unwatch and W12 for an app error, is an **unhandled rejection, fatal on Deno's default path**, until that item lands | Filed separately, at high priority. Out of scope here: the fix is in `websocket.ts`'s error routing, a different seam with its own battery (`websocket_error_routing_352`) |
| **Residue (A1/S1):** an unregistered connection's first `subscribe` racing `disconnect(id)` is **stranded**. Nothing was retired, so the subscribe registers and joins a socket nobody will disconnect, with S1's harms (caps, watch, presence ghost, and inheritance under id reuse). Unreachable through `handlerHooks` | Filed separately (retiring implicit registration). Documented as a breach of the lifecycle contract (row 16) |
| **Residue (A1):** a transport that builds a fresh `Connection` object per call is covered only in window (a), while the id is bound. In (b) and (c), a fresh object is neither retired nor bound | Breaks the same-object duty (row 16), stated in the `Connection` JSDoc and the contract section |
| **Residue (A11):** the #323 compensation skips its roster reclaim when `#leaveLocal` rejects | Filed separately; FR-010a says why the two leave paths now differ |
| **Residue:** a failed roster release during teardown leaves the driver-side hold (disposition §10.4) | Filed separately. Local state is clean, and `disconnect` re-throws |
| **Residue:** a failed unwatch leaves an orphan broker watch with no local member (disposition §10.5) | Filed separately. It heals on the next reconnect's re-issue |
| Changing `#revokeChannelLocal`'s return shape (the added `clearFailed`) breaks a caller | It is private, with two callers: `revokeChannel` (updated) and `#applyRevocation` (ignores the clear result). `deno check` catches a missed one; W6 (ii) and `channel_revoke_332` re-run |
| **Residue (D2):** no root `CHANGELOG` | #364 |
| Residue: a join committed before the disconnect resolves `ok: true` and is then torn down | #330's semantics, pinned by W7; nothing leaks |
| The ADR number collides with #362's planned 010 | The number is assigned at landing (FR-017) |

## 10. Architecture audit

*`architect-expert`, 2026-09-23, against this document before any code. Verdict: **fail — 1 HIGH,
6 MEDIUM, 5 LOW**. Its rulings on A1–A12, on D1–D7 and on the security findings S1–S3 are binding
(hard rule #11). The disposition's design is confirmed; A1 corrects one of its §10 claims.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 HIGH (merged with S1) | The fix assumed a lifecycle the API never states. A transport that does not register at open, or presents a fresh object, escapes retirement. The disposition's "consistent (live and owned)" for an unregistered first subscribe racing `disconnect` is wrong: that state is **stranded** | Plan changed. Row 16 is the custom transport's lifecycle contract (register at open with the object; the same object for life; disconnect at close), homed in the `Connection` JSDoc, `register`'s JSDoc and one merged `docs/realtime.md` section that item 15 and § *The connection* point to (FR-017a). SC-001 is qualified. The §2 edge case and a §9 row now say "stranded", and the residue is filed. W11 pins the framework path. A §9 row records that a per-call fresh object is covered only in window (a) |
| A2 MED (with S3) | One error for two clauses makes one message false. "No retry will help / no client is left" is true only of a retired object, not of a different object under a retiring id | Plan changed. Clause 2 throws a new `ConnectionIdInUseError` (FR-003a): one predicate, both exported. W8 expects it. N9 collapses the split. Item 15 documents the two separately. Row 7 |
| A3 MED | Precedence was unstated. A post-check hoisted above the deny `return` would turn a denial into a throw | Plan changed. FR-007a and row 8 state the precedence rule. SC-003 now reads "never resolves `{ ok: true }`; resolves `{ ok: false }` only when its own authorizer denied". Pin W3 (ii), mutant N10 |
| A4 MED | The decision has no ADR, although it sets a standing constraint across three consumers | Plan changed. ADR 010 (FR-017), with the number assigned at landing because #362 also planned 010. The `#retired` JSDoc keeps the definition, the pitfall points at the ADR, and the *Invariants* bullet says "that object's own subscribe" |
| A5 MED | `failure === undefined` loses a rejection whose value is `undefined`. `evict` has the same shape | Plan changed. FR-010b and row 12 ("recorded by a flag, never by the error's value"); `evict`'s collector (`:2570–2599`) is fixed here; W6 (ii), N13. While folding this, `revokeChannel`'s two collectors (`:2713–2749`, and `#revokeChannelLocal`'s `clearError` at `:2814`) were found with the same spelling. **The ruling was widened**: the rule applies to every collector in `manager.ts`, and both are fixed here (FR-010b), with W6 (ii) extended and N13b added |
| A6 MED | The reorder has a second reason the plan missed: a subscribe racing a suspended leave takes the re-join guard's read and reports `ok` while nothing is held | Plan changed. W9 (red on `main`); N6 is killed by W6 and W9; row 11 gains the reason |
| A7 MED | `evict`'s retirement was only an edge-case line, with no witness | Plan changed. W10 |
| A8 LOW (D7) | The D7 `killedBy` naming R13 (b, c) misuses attribution | Plan changed. M14 uses the #341 sentinel `'(none — equivalent)'`, and names R13 (b, c) inside its reason (FR-015, row 17) |
| A9 LOW | "The rest are not aborted" had a witness but no mutant | Plan changed. N11, killed by W6's `news` assertions |
| A10 LOW | `#assertLive` names liveness, not admission | Plan changed. Renamed `#assertAdmissible` throughout |
| A11 LOW | After the reorder, the #323 compensation and `unsubscribe` handle a rejected leave differently, and the plan did not say so | Plan changed. FR-010a and row 11 state the difference and why the compensation is left alone. §9 residue, filed separately |
| A12 LOW | Residue named without backlog items | Plan changed. §9 cites the filed items (implicit registration with S1's harm, the driver-side hold after a failed release, the orphan watch after a failed unwatch, A11), "filed separately" where a number is pending, and #364 for the changelog |
| D1, D2, D3, D5, D6 | — | Confirmed |
| D4 / blast radius | 38 files (not 36) call `subscribe` without registration, by `\.register\(\|handlerHooks\|buildEvents\|createWebSocketHandler`; `evict` appears in 7 test files, not 9; 15 adjacent rows confirmed; A3 adds no re-anchor unless `register` is reordered | Plan corrected (D4, §4). The 5 extra adjacent rows from the audit fold's own sites were counted in the same pass, all unchanged |

**Verdict** (as reported by the seat): **fail — 1 HIGH / 6 MEDIUM / 5 LOW**, all folded above; the
design is confirmed with A1's correction. **Coverage** (as reported by the seat): this plan in full,
including D1–D7, the decision table, the witnesses and mutants, and the re-anchor count, checked
against `manager.ts` on `main` at `c00bfcde`, the realtime batteries and the disposition. The
per-file list was not itemised in the relay.

## 11. Security audit

*`security-expert`, 2026-09-23, in parallel. Verdict: **needs follow-up — 0 CRITICAL, 0 HIGH,
2 MEDIUM, 1 LOW**. Its findings were ruled on by the `architect-expert`, and the rulings are
binding.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | The guarantees rest on a transport lifecycle (register at open, one object, disconnect at close) that nothing states. An unregistered first subscribe racing `disconnect` strands state with every harm of §1, id-reuse inheritance included | Folded into A1: row 16, FR-017a, SC-001 qualified, the §2 edge case and §9 residue ("stranded", filed separately), W11 |
| S2 MED | (a) `handlerHooks.onClose` awaits the app's `onClose` first, so an app hook that throws skips `disconnect`: no teardown, no retirement, and every harm this feature removes. (b) `websocket.ts` runs `void hooks.onClose?.(…)` outside `guard()`, so any rejection from it is unhandled | Split by ruling. **(a) In scope**: FR-010c and row 14. Every failure is recorded by flag, `disconnect` always runs, the app's error is re-thrown first, and a disconnect error after it is WARNed through `renderError`; never a bare `try/finally`. W12, N12. **(b) A separate item**, filed separately at high priority. A §9 residue row records that the rejection W6 and W12 pin is fatal on the default path until it lands |
| S3 | One error class for both clauses. Clause 2's "no retry / drop the frame" advice is wrong for a different object under a retiring id, and conflates a benign race with a contract breach | Folded into A2: `ConnectionIdInUseError` with no retry claim and no drop advice, and its JSDoc pointing at the id contract and #363 |

**Verdict** (as reported by the seat): **needs follow-up — 0 CRITICAL / 0 HIGH / 2 MEDIUM / 1 LOW**,
all folded above. Windows (a)–(c) and id-reuse inheritance are closed **for registered
connections**. No refusal leaves a partial write. The `unsubscribe` reorder is sound. The error
messages leak nothing (the id goes through `safeForLog`). **Coverage** (as reported by the seat):
the three windows, id-reuse inheritance, partial writes on refusal, the `unsubscribe` reorder and
its failure handling, the close path through `handlerHooks` and `websocket.ts`, and the new error
messages. The per-file list was not itemised in the relay.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Any product question? | None (disposition §15; neither audit raised one). AC3 delegated throw versus no-op, and the disposition settled it. A denial is still a denial (A3). Only calls on a connection that has already gone, or under an id still being torn down, change outcome. The user keeps the veto | 2026-09-23 |
| Approve the architecture as audited (tasks → implement → review)? | _Asked at stop 1._ | — |

### Decided without asking

- The design is the #361 `architect-expert` disposition (2026-09-23), as amended by the binding
  audit rulings A1–A12 and S1–S3.
- **D1:** `#assertAdmissible` guards `bound !== undefined` before `#retired.has(bound)`.
- **D2:** no `CHANGELOG` file. The upgrade note is item 15 in `docs/realtime.md` plus a README
  bullet; the missing root changelog is #364.
- **D5:** W6 holds a second channel to pin "the rest are not aborted", and N11 relies on it.
- **D6:** `GatedUnwatchDriver` is re-created on `MemoryBroadcastDriver`. The revocation base stays
  in the #359 file.
- The ADR number is assigned at landing, because #362 also planned 010.
- The leave's failure is "the first failure" in `unsubscribe`, because it runs first. A release
  failure after it is the one WARNed.
- W3 (ii) is folded into W3 as its denial variant, not a separate witness, because it shares the
  setup.
- W6 (ii) witnesses the flag rule for `disconnect`, `evict` and `revokeChannel` (durability and
  clear). N13 mutates `disconnect`'s collector; N13b mutates `#revokeChannelLocal`'s, whose flag
  crosses a return.
- W8's positive control (C receives after its own authorized subscribe) is kept, so "receives
  nothing" cannot pass on a broken broadcast.
- The `AGENTS.md` *Tests* list is regenerated with `deno task agents:brief`.
- #363 is out of scope, and blocked by this item.
