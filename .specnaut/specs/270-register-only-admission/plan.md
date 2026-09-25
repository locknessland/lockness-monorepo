# Plan: `register` is the only way in — one owner object per connection id

**Branch**: `270-register-only-admission` | **Date**: 2026-09-25 | **Backlog items**:
[#370 — Realtime: retire subscribe's implicit registration](https://github.com/locknessland/lockness-monorepo/issues/370)
and
[#363 — Realtime: a different Connection registered under a live connection's id takes over its memberships, and the old socket's disconnect then tears the new one down](https://github.com/locknessland/lockness-monorepo/issues/363).
This one feature closes both.

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition of 2026-09-25 (hard rule #11), posted on both issues. This plan records it as binding.
It adds what the disposition left to the plan: the decision table, the requirements, the witnesses
and mutants in testable form, and the blast radius **counted on `main` at `150755df`**. The
maintainer's standing instruction also applies: take the strictest security option, and accept the
compatibility cost.

**Both plan audits are folded in (§10, §11).** Both returned **fail**, and the `architect-expert`
rulings are binding. The largest change they made: **`disconnect` becomes owner-scoped** (A1/S1,
HIGH). A teardown keyed by id let another socket's close tear down the live holder, which is the
second half of #363's title. The fold adds:

- an object form of `disconnect`, and an owner-guarded `finally` (row 16);
- a named owner decider, `#isOwner`, which `handlerHooks.onMessage` asks before running the app's
  hook (row 17, S1);
- a commit order that proves the fixture migration weakens nothing (A2);
- single homes for rows 4, 6, 7 and 9 (A4);
- no id in the two new error messages (S3);
- the id-minting guidance, with its consequences (S2).

Where today's tree does not fit the disposition, this plan says so (D1–D8):

- **D1 — the migration count.** The grep behind "38 files" is right as a grep, but it is not the
  blast radius:
  - `grep -l '\.subscribe('` over `packages/realtime/tests/*.test.ts` finds **53** files. Of those,
    **38** match none of `\.register\(|handlerHooks|buildEvents|createWebSocketHandler`.
  - **4 of the 38 are false positives.** `client`, `live_fake_conformance`,
    `presence_roster_read_333` and `redis_broker_integration` call a client or driver
    `subscribe`, and stay green.
  - **10 files that do register still fail**: `authorize_result_357`, `channel_revoke_332`,
    `churn_cost_329`, `connection_id_charset`, `deliver_local_reauth`, `disconnect_admission_361`,
    `eviction_durable`, `eviction_reconnect`, `leave_outcome_332` and `log_encoding_291`.
  - **Measured by a probe.** The disposition's three edits were applied to a scratch copy of
    `manager.ts`, with a plain `Error` standing in for the new class. The realtime suite then ran,
    and the file was restored. The baseline is **988 passed, 0 failed, 37 ignored**. The probe
    gives **449 failing tests in 44 files** (per-file list in §4).
  - **The fresh-object calls are 206 in 24 files, not 27.** That is the single-line
    `subscribe(conn(` count. Counted across lines, it is **215**. Across every factory spelling
    (`conn` 215, `connection` 15, `identified` 10, `fakeConn` 4, `tab` 2) it is **246 calls in 28
    files**.
  - **The migration lands first** (A2): the fixture commit must pass against the **unmodified**
    `manager.ts`.
- **D2 — the battery anchors.** Counted by a stub-harness dump of every battery (34 of 38; the other
  4 were read by hand), not "20 anchors in 6 batteries":
  - **18 rows in 8 batteries** anchor in or beside an edit site: **9 are re-anchored, 1 is
    re-verified, and 8 stay as they are** (§4);
  - the fold adds `disconnect`'s entry and `finally` and `handlerHooks.onClose`/`onMessage` as edit
    sites. **Nothing anchors in `disconnect`'s body.** `#361` N12 anchors on `onClose` and is
    re-anchored (§4);
  - #370's own "restore `connections.set`" mutant never existed as a row. It is recorded as the
    equivalent row M9.
- **D3 — the #361 witness file breaks too.** 12 tests in `disconnect_admission_361.test.ts` go red:
  W1, W2, W4, W5 and the eight W6 cases. Their fixtures subscribe an object they never registered,
  and are migrated like every other file. `#361` N4 loses **both** anchors and is rewritten. Its new
  killer is **`#361 W13`**, added **to that file**, because it is the #361 battery's only suite (A3).
- **D4 — ADR 010 §4 rejected this design.** Its bullet "Making `register` mandatory" is reversed by
  the amendment. Retirement by object already covers window (a), so no delete at entry is needed.
  **§5's first three bullets are closed here.** Bullets 4–7 are unchanged. The two overlapping
  teardowns of one object are new residue (§9).
- **D5 — the 1011 close reason.** `handlerHooks.onOpen` closes with `'unusable connection id'` for
  **every** `register` refusal, now including `ConnectionIdInUseError`. It stays unchanged, for two
  reasons (A9, S2):
  - it adds no new text visible to the client;
  - a distinct reason would tell the client whether an id is live.
- **D6 — the "escapes" claim has three homes.** These are:
  - the lifecycle section of `docs/realtime.md` (`:522–525`);
  - the `Connection` JSDoc (`types.ts:118–120`);
  - `register`'s JSDoc (`manager.ts:1436–1438`).

  All three become false and are rewritten (FR-017).
- **D7 — one standalone example would throw.** The `ChannelManager` class `@example`
  (`manager.ts:970–974`) calls `subscribe` on a `conn` nothing registered. It gains
  `manager.register(conn)`. The § *Channels* snippet (`docs/realtime.md:74–91`) builds its own
  manager, so it gains the same line. The intro example **does** register (`docs/realtime.md:22`,
  A9). The search is
  `git grep -n 'manager.subscribe(' -- docs/realtime.md 'packages/realtime/*.ts' packages/realtime/README.md`.
- **D8 — the upgrade section's preamble counts** (`docs/realtime.md:2198–2213`) become 21 items and
  15 breaking, and items 20 and 21 join the read list. The `disconnect` change rides in item 21, so
  the counts are unchanged by the fold.

---

## 1. Why this exists

`ChannelManager` admits a connection **object** under its id at two points
(`packages/realtime/manager.ts`):

- `register` (`:1448–1451`) runs `#assertAdmissible` and `#assertUsableId`, then
  `this.connections.set(connection.id, connection)`;
- `subscribe` (`:1600`) does the same `connections.set` **implicitly** at `:1699`.

Neither asks whether the id is already held by a **different, live** object. And
`disconnect(clientId)` (`:2739`) is keyed by **id**: it tears down whatever object holds that id,
and its `finally` deletes whatever binding is there when it ends.

**#370: a zombie no disconnect will reach (availability, `security`).** Take a connection an app
never registered, whose first `subscribe` is waiting on its authorizer when its socket closes:

1. `disconnect(id)` finds nothing, reports `'not-owned'` and retires nothing;
2. the authorizer resolves, and `subscribe` registers, joins, watches and takes cap slots;
3. nothing will ever disconnect that binding, and `connectionCount` counts it.

A client that repeats this exhausts the watched-channel caps for every other client. `handlerHooks`
cannot reach it; **every app that wires the manager by hand can**. 38 of the 53 realtime test files
that call `subscribe` never register. The intro example of `docs/realtime.md` does register
(`:22`), but the class `@example` does not (D7).

**#363: a takeover, then a cross-teardown (confidentiality and availability).** When a different
object B is presented under the id of a live object A:

1. **takeover**: delivery resolves `connections.get(id)`, so every channel A holds, private and
   presence included, reaches B. B's `authorize()` never ran for them;
2. **cross-teardown**: a teardown keyed by id acts on whoever holds the id. It happens by two routes
   (A1/S1):
   - **the refused socket's own close.** `websocket.ts:240` runs `onClose` for **every** socket,
     including one `onOpen` refused. `handlerHooks.onClose(B)` then runs `disconnect('c1')`, which
     retires and tears down **A**;
   - **an evict and a fast reconnect.** The old socket's late close runs `disconnect('c1')` against
     the new holder. If two teardowns overlap, the later `finally` deletes the new binding without
     retiring it;
3. **the app's own hooks** (S1): `userHooks.onMessage(B)` can run before B's close lands, and an app
   that calls `unsubscribe(conn.id, …)` there strips A.

The `Connection.id` contract forbids reuse, and `handlerHooks` mints `crypto.randomUUID()` per
socket. An app that passes a user or session id through a custom transport, and reconnects before
the old close lands, hits all three.

**One cause, one fix.** `connections` has two writers, and teardown has no owner rule. The
disposition, as amended by the audit:

- gives every id **one owner object**;
- makes `register` the only way in;
- lets `subscribe` admit only the owner;
- lets `register` refuse an id held by a different object;
- **scopes every teardown the framework runs to the object that owns the id.**

**Who is affected by the fix:**

- apps that call `subscribe` without `register` now get `ConnectionNotRegisteredError`;
- custom transports that reuse ids now get `ConnectionIdInUseError`, or a `1011` from
  `handlerHooks.onOpen`. The refused socket's close no longer harms the holder;
- apps on `handlerHooks` with framework ids see **no change**;
- apps that call `disconnect(conn.id)` from their own close hook keep the id-keyed behaviour. They
  should pass `conn` (item 21); the deprecation is residue (§9).

## 2. User scenarios

### US1 — an unregistered connection is refused before it costs anything (P1)

**Given** an app that never calls `register`, and a private channel with a slow authorizer
**When** the connection subscribes and its socket closes while the subscribe would be waiting
**Then** the subscribe rejects with `ConnectionNotRegisteredError`, the authorizer is called **0
times**, and no connection, membership, cap slot, anonymous share, broker watch or roster entry
exists afterwards.

### US2 — a second object under a live id is refused (P1)

**Given** a live connection A holding a private and a presence channel
**When** a different object B carrying A's id is registered, or subscribes to either channel
**Then** each call throws `ConnectionIdInUseError`, the authorizer is called 0 times for B, and B
receives nothing. A keeps receiving both channels.

### US3 — the refused socket's close, and a late close, harm no one else (P1)

**Given** the refused B from US2, on `handlerHooks`
**When** B's socket closes, and its frames arrive before that
**Then** A stays bound and receiving, and the app's `onMessage` never runs for B.
**And given** a connection evicted and re-registered as a new object under the same id
**When** the old socket's close arrives late
**Then** the new holder is untouched.

### US4 — the framework path and same-object re-registration behave as today (P2)

**Given** an app on `handlerHooks`, or a transport calling `register` twice with the same object
**When** it opens, subscribes and closes
**Then** everything behaves as before, and the second `register` is a no-op.

### US5 — a custom transport that reuses ids and drives `handlerHooks` hears about it (P2)

**Given** a custom transport driving `manager.handlerHooks()` with its own ids
**When** it opens a second socket under the id of one still open
**Then** `onOpen` **throws synchronously** with `ConnectionIdInUseError`, the second socket is
closed with `1011 'unusable connection id'`, the app's own `onOpen` is not called for it, and the
first socket is untouched.

### Edge cases

- **A retired object whose id is unbound** gets `ConnectionDisconnectedError`, not
  `ConnectionNotRegisteredError`, because `#assertBound` asks admissibility first.
- **The post-site's unregistered clause is unreachable**, now that `disconnect` deletes only its own
  object's binding (row 14, M8).
- **Defect order**: `ConnectionIdError` and `ChannelNameError` come before any admission refusal, as
  today. `register` asks admission before the id charset. That order is unobservable, because a
  bound id was already usable.
- **An unregistered anonymous connection on a private channel** throws
  `ConnectionNotRegisteredError`, since the pre-site runs before the `identity === null` denial.
- **A denial is still a denial**: `{ ok: false }` for an owner whose authorizer denies.
- **`disconnect(conn)` for a non-owner** returns `'not-owned'` and touches nothing: no retirement,
  no teardown, no delete.
- **`disconnect(id)`, the id form**, keeps today's behaviour for `revokeLocal` and for apps. Its
  `finally` is owner-guarded as well.
- **An id reused after the teardown settles** is admitted. This is named residue.
- **The same object registered twice** is a no-op.

## 3. Requirements

**Admission: one writer, one owner, three askers**

- **FR-001**: **`register` is the only writer of a binding.** `subscribe`'s implicit
  `this.connections.set(connection.id, connection)` (`manager.ts:1699`) is deleted.
  `grep -n 'connections.set' packages/realtime/manager.ts` then finds exactly **one** line, in
  `register`.
- **FR-002**: **`#assertAdmissible`'s clause 2 widens** from
  `bound !== undefined && this.#retired.has(bound)` to `bound !== undefined && bound !== connection`.
  It still throws `ConnectionIdInUseError`. Clause 1 is unchanged and stays first.
  - `#assertAdmissible` stays the only **reader** of `#retired`.
  - `grep -c 'this.#retired' manager.ts` is **3** today (clause 1, clause 2, `disconnect`'s `add`),
    and **2** after the change (clause 1 and the `add`). This is measured; the audit's "4" did not
    fit the tree (A9).
  - Its JSDoc is **the home of row 4**: it lists the askers and what each asks.
- **FR-003**: **`#assertBound(connection)`**, a new private method below `#assertAdmissible`. It
  calls `this.#assertAdmissible(connection)`, then throws `new ConnectionNotRegisteredError()` when
  `!this.connections.has(connection.id)`. Its JSDoc:
  - holds **row 14's reasons** for M8 and M9;
  - says it is `subscribe`'s decider;
  - says that admissibility comes first.
- **FR-004**: **`ConnectionNotRegisteredError`**, a new exported class in `manager.ts` after
  `ConnectionIdInUseError`, with **no shared base class**:
  - it takes **no id**, and its constant message carries none (S3);
  - the message says the connection was never registered, so nothing was subscribed, and that
    `register` must be called from the transport's open hook. It must not contain either sibling's
    message text (FR-012);
  - its JSDoc states the remedy, names `handlerHooks` as the zero-work path, has an `@example` that
    registers in `onOpen`, and **links to ADR 010 §7** for why there is no base class (row 6).
- **FR-005**: **`register` keeps `#assertAdmissible`** as its first statement, unchanged (`#361`
  N5's anchor is untouched). It asks admission before the id charset, which is unobservable.
  `@throws {ConnectionIdInUseError}` widens to "any different holder, live or retiring".
- **FR-006**: **`subscribe` asks `#assertBound` at both of #361's sites** and nowhere else:
  - the pre-site, directly after `const kind = channelKind(channel)`;
  - the post-site, between the #347 invariant and `// BEFORE any membership mutation`. The two
    comment lines above it stay byte-identical.

  After the change, `grep -c '#assertBound(connection)'` is 2, and
  `grep -c '#assertAdmissible(connection)'` is 2 (`register` and `#assertBound`'s body).
- **FR-007**: **Statement order (row 7a):**
  1. the id and channel assertions;
  2. the pre-site;
  3. the authorizer, the deny `return`, classification, member admission and the #347 invariant;
  4. the post-site;
  5. `#checkChannelCaps`;
  6. the join.

  A refusal writes nothing and undoes nothing. The authorizer's own outcome is reported as produced.
- **FR-008**: `subscribe`'s comments about the deleted write are corrected. That includes the #353
  invariant's comment ("above the caps and `connections.set` … would leave a `connections` entry
  behind"). No comment may quote an anchored line (FR-012).

**Teardown is owner-scoped (A1/S1)**

- **FR-009**: **`#isOwner(connection: Connection<Identity>): boolean`**, a new private decider
  beside `#assertBound`. It returns `this.connections.get(connection.id) === connection`. It is
  **the one home** of "this object owns its id" (row 17). Its askers are:
  - `disconnect`'s object form (FR-009a);
  - `disconnect`'s `finally` (FR-009b);
  - `handlerHooks.onMessage` (FR-009c).

  No other code compares a binding to an object outside `#assertAdmissible`, `#assertBound` and
  `#isOwner`.
- **FR-009a**: **`disconnect(target: string | Connection<Identity>)`**:
  - **the object form** first asks `#isOwner(target)`. If the object is not the owner, it returns
    `'not-owned'` **before** retiring, copying or awaiting anything;
  - if it is the owner, the teardown runs as today, for `target.id`, with `bound === target`;
  - **the id form** is unchanged. `revokeLocal` (`:2916`) keeps passing the id.

  `DisconnectOutcome` is unchanged. The JSDoc is **the home of transport duty 3** (row 9): "call
  `disconnect(conn)` when the socket closes, with the object you registered".
- **FR-009b**: **`disconnect`'s `finally`** deletes from `#channelsByClient` and `connections` only
  when `bound !== undefined && this.#isOwner(bound)`. A teardown whose object was replaced while it
  ran leaves the new binding and its reverse index alone. The per-channel collector and its flag are
  unchanged.
- **FR-009c**: **`handlerHooks`**:
  - `onClose` runs `await this.disconnect(conn)`, the object form. Its #361 collector is otherwise
    unchanged;
  - `onMessage` becomes a wrapper: it runs `userHooks.onMessage?.(conn, data)` **only when**
    `this.#isOwner(conn)`, and otherwise drops the frame **without a log line**. A refused or
    retired socket has no owner to answer, and one line per frame would be a flooding vector;
  - `onOpen` is unchanged (D5).

  `websocket.ts` is not touched.
- **FR-009d**: **Nothing else changes.** These keep reading `connections` by id, byte for byte:
  - ownership readers: `unsubscribe`'s `owned`, `evict`, `revokeLocal`, `#recheckRevocations` and
    `owns`;
  - delivery: `deliverLocal` and `emitPresence`.

  `disconnect`'s retirement stays at its entry, from the same read as `owned`.

**Surface and contract**

- **FR-010**: `ConnectionNotRegisteredError` is exported from `packages/realtime/mod.ts` beside
  `ConnectionIdInUseError` (`:88–90`). The block's comment names the three lifecycle refusals.
  `disconnect`'s widened parameter needs no new export.
- **FR-011**: **`ConnectionIdInUseError` widens, and carries no id** (S3):
  - its constructor takes no argument;
  - its constant message says a different connection object already holds this id, and that ids are
    minted per socket and never reused. It drops "being disconnected";
  - its JSDoc states the live-or-retiring rule and drops "#363 may widen it";
  - its `@example` is kept, and the class name is kept.
- **FR-012**: **Anchor hygiene.** No new comment, docstring or message quotes, verbatim, a line a
  battery row anchors on. That covers:
  - `this.connections.set(connection.id, connection)`;
  - `const kind = channelKind(channel)`;
  - `this.#assertUsableId(connection.id)`;
  - `conn.close(1011, 'unusable connection id')`;
  - the #353 invariant's `throw` text;
  - either sibling's message text.

**Tests (commit order is binding, A2)**

- **FR-013**: **The fixture migration lands FIRST**, as its own `test` commit, and is **green against
  the unmodified `manager.ts`**. That is the proof that no assertion was weakened.
  - **Scope.** Re-run the probe on the branch first. It lists the tests to migrate: 449 in 44 files
    at `150755df`.
  - **The shape.** Each connection object is built once, **registered at the socket's open, with the
    manager that subscribes it**, and reused. A fresh object per call becomes one held object.
  - **Where.** Each file keeps its own factory, since the 35 `conn` factories differ in shape. No
    shared module.
  - **Premise tests.** A test whose **premise** was implicit registration cannot pass both before
    and after (for example, it asserts `connectionCount` grew from a `subscribe`). It is **not** in
    that commit. It is rewritten **after** the fix, in its own `test` commit, and listed by name in
    the implement report.
- **FR-014**: **Witnesses** W1–W9 and W11–W13 go in a new
  `packages/realtime/tests/register_only_admission_370.test.ts` (§4). They are committed **red on
  `main` first**, except the pins W6 and W9. Test names start `#370 W<n> ` with a trailing space.
  `#361 W13` (formerly W10) goes in `disconnect_admission_361.test.ts` (A3).
- **FR-015**: **Mutation batteries.**
  - **The new battery** is `packages/realtime/tests/mutations/register_only_admission_370.ts`, rows
    M1–M13 (§4). SUITES is the new test file plus `disconnect_admission_361.test.ts`.
  - **M8 and M9** are `expectSurvival` with the #341 sentinel `'(none — equivalent)'`. Their reason
    points to `#assertBound`'s JSDoc and does not restate it (row 14).
  - **The re-anchor list** in §4 is applied, and each row is re-proven live.
  - **The whole run.** `deno task mutate realtime` then runs. Any `DEAD MUTANT` is repaired, never
    deleted.

**Docs**

- **FR-016**: **`docs/realtime.md`**:
  - **item 20, "`subscribe` requires `register`"**:
    - a before/after, with `ConnectionNotRegisteredError` thrown before the authorizer;
    - the fix: `register(conn)` from your open hook;
    - **`handlerHooks` is the zero-work path**;
    - `connectionCount` counts only registered connections;
  - **item 21, "An id held by a live connection is refused"**:
    - a before/after for `register` and `subscribe`, and the `1011` from `handlerHooks.onOpen`;
    - **the server mints the id per socket** (`crypto.randomUUID()`), never from client input and
      never from a user or session key;
    - **the consequences of a guessable or shared id** (S2):
      - **lockout**: whoever registers a known id first keeps its owner out;
      - **disclosure**: a refusal tells the caller whether that id is live, which leaks who is
        online;
    - **`evict(id)` recovers a leaked binding**;
    - **`disconnect(conn)`** is now owner-scoped. Pass the object from your close hook, because
      `disconnect(conn.id)` still acts on whoever holds the id;
    - `handlerHooks.onMessage` skips frames from a socket that does not own its id;
    - the `ConnectionIdInUseError` constructor now takes no argument;
  - **item 17's `ConnectionIdInUseError` bullet** reads "a different object holds this id, live or
    being torn down";
  - **the lifecycle section** (`:503–551`) stays **the one home** of the duties:
    - the "reaches only … escapes it" sentences (D6) are replaced by the enforced rules;
    - duty 3 reads "call `disconnect(conn)` with the registered object";
    - it points to `disconnect`'s JSDoc;
    - the paragraph about a different object "while a teardown is still running" widens to any
      holder;
  - **`:24`**, the intro example, becomes `onClose: (conn) => manager.disconnect(conn)`;
  - **the § *Channels* snippet** gains `register` (D7);
  - **the preamble** counts are updated (D8).
- **FR-017**: **JSDoc**:
  - `Connection`: the "escapes" sentence is replaced;
  - `Connection.id`: the server mints the id per socket, never from client input or a user or
    session key (S2);
  - `register`: its lifecycle paragraph, and `@throws`;
  - `subscribe`: `@throws {ConnectionNotRegisteredError}` and the widened
    `@throws {ConnectionIdInUseError}`;
  - `disconnect`: the object form, the owner-guarded `finally`, and duty 3;
  - `handlerHooks`: `onClose` passes the object, and `onMessage` is owner-gated;
  - `#assertAdmissible` (row 4), `#assertBound` (row 14) and `#isOwner` (row 17);
  - the three error classes;
  - the `ChannelManager` class `@example` (D7).
- **FR-018**: **ADR 010 is amended**:
  - **the header**: "Amended by" names #370 and #363 with the date;
  - **a new §7, "Amendment — `register` is the only way in, and teardown is owner-scoped"**,
    recording:
    - the owner rule;
    - clause 2 widened;
    - `#assertBound` and its order;
    - `#isOwner` and its three askers;
    - `disconnect`'s object form and its guarded `finally`;
    - **why the third class has no base class** (the remedy differs: register at open), which is
      row 6's reason;
    - the rejected options with their costs (row 13);
    - what this does not solve;
  - **"Amended by §7" pointers** under §2's *Three askers, one decider* and *Two refusal types, one
    predicate*, and under §3 (A9);
  - **§4's "Making `register` mandatory"** gains a closing line: #370 reverses it, and why (D4);
  - **§5**: bullets 1–3 are marked resolved; bullets 4–7 are unchanged;
  - **§6's standing constraint** gains: `register` is the only writer of `connections`, and a
    teardown acts only on its owner.
- **FR-019**: **`packages/realtime/README.md`**: the "A disconnected connection is refused at
  admission" bullet widens its `ConnectionIdInUseError` sentence, and gains one sentence each on
  `ConnectionNotRegisteredError` and `disconnect(conn)`, with links to items 20 and 21. No second
  bullet.
- **FR-020**: **`packages/realtime/AGENTS.md`**:
  - `ConnectionNotRegisteredError` joins the class row (`:56`);
  - the pitfall "Retirement is never an ownership reader's business" (`:603–611`) gains:
    - `register` is the only writer of `connections`;
    - a teardown acts only on its owner (`#isOwner`);
    - never re-add a `connections.set`;
    - never narrow clause 2 back;
    - never compare a binding to an object outside the three deciders;
    - never call `#assertAdmissible` from `subscribe`, or `#assertBound` from `register`;
  - its witness and battery lists gain the #370 files;
  - the *Tests* list is regenerated with `deno task agents:brief`.
- **FR-021**: **No `CHANGELOG` file.** The GitHub Release is the only changelog since #364, generated
  from items 20 and 21.

## 4. Success criteria

- **SC-001**: A connection the app never registered can hold nothing: no membership, cap slot,
  share, watch, roster entry or count.
- **SC-002**: A connection receives a private or presence frame only for a channel its **own**
  object's subscribe was authorized for.
- **SC-003**: On the framework path, closing one socket never tears down another socket's state,
  and a socket that does not own its id never reaches the app's `onMessage`.
- **SC-004**: A refused call has no side effect, and a refusal at the pre-site runs no authorizer.
- **SC-005**: Apps on `handlerHooks` with framework ids see no behaviour change. The fixture
  migration passes against the unmodified manager.
- **SC-006**: An app that must change learns what to do from one upgrade item, each with a
  before/after.

**Witnesses** (FR-014). "Red" means it fails on `main` at `150755df`.

| # | Setup → assertion |
| :--- | :--- |
| W1 (red), #370's S1 | App never registers. `subscribe(c1, 'private-x')` with a **gated** spy authorizer; `disconnect('c1')` → `'not-owned'`; then the gate is opened. The subscribe rejects with **`ConnectionNotRegisteredError`**, and the authorizer was **called 0 times**. After settle: no map, set or roster names `c1`; `connectionCount === 0`; no watch of `private-x`; with `maxWatchedChannels: 2`, a registered `c2` then takes two fresh channels |
| W2 (red), public and anonymous | `maxWatchedChannels: 2`, `anonymousHostingShare: 0.5`. Unregistered anonymous `a`: `subscribe(a, 'news')` throws `ConnectionNotRegisteredError`; no watch; a registered anonymous `b` then gets `{ ok: true }` on `feed`; `connectionCount === 1` |
| W3 (red), a fresh object per call | `register(conn('c1'))`, then `subscribe(conn('c1'), 'private-x')` with a different object: it throws `ConnectionIdInUseError`, and the authorizer is called 0 times |
| W4 (red), #363: no unauthorized delivery | Live A (`c1`, alice) holds `private-x` and presence `ROOM`, with observer `o`. B (`c1`, mallory): `register(B)`, `subscribe(B, 'private-x')` and `subscribe(B, ROOM)` each throw `ConnectionIdInUseError`, with the authorizer called 0 times for B. The message contains neither `c1` nor `disconnect` (S3). `connections.get('c1') === A`. A broadcast and a presence change by `o` reach B with **no** frame; A receives both (the positive control) |
| W5 (red), #363: the holder's own close | After W4: `disconnect(A)` → `'disconnected'`; `connectionCount === 0`. Then `register(B)` succeeds, and B's own authorized subscribe receives the next broadcast (the positive control) |
| W6 (pin), same object | `register(A)` twice → no throw; `connectionCount === 1`; A still receives |
| W7 (red), `handlerHooks` with a reused id | A custom transport drives `manager.handlerHooks({ onOpen: spy })`: `onOpen(A)`, then **`assertThrows`** on `onOpen(B)` with `ConnectionIdInUseError` (it is synchronous). B's `close` was called with `(1011, 'unusable connection id')`; `spy` was called once, for A; A is still bound and receiving |
| W8 (red), the registered identity is the authorized one | Live A (alice). B (`c1`, mallory) subscribes `private-x` with an authorizer that admits only mallory: it throws `ConnectionIdInUseError`, and the authorizer never saw mallory |
| W9 (pin), clause 1 first | `register(A)`, `await disconnect('c1')`, then `subscribe(A, 'news')` throws **`ConnectionDisconnectedError`**, not `ConnectionNotRegisteredError` |
| W11 (red), the refused socket's close (A1/S1) | W7, then `await hooks.onClose(B, 1000, '')` → `disconnect(B)` is `'not-owned'`; A is still in `connections`, still retired-free (`register(A)` is a no-op), still holds `private-x`, and receives the next broadcast |
| W12 (red), a late close after re-registration (A1) | (i) `register(A0)`; `await evict('c1')`; `register(A1)` (same id, new object) with A1 subscribed to `news`; then `await hooks.onClose(A0, …)` → `connections.get('c1') === A1`, and A1 still holds `news` and receives. (ii) Two teardowns of A0 overlap: the one started by `evict` (id form), and one started by A0's close (object form, entered while A0 still owned). The first settles, and A1 registers while the second is still suspended. When the second settles, `connections.get('c1') === A1`, and `#channelsByClient` still lists A1's channels |
| W13 (red), the `onMessage` gate (S1) | W7's setup with `onMessage: spy`: `hooks.onMessage(B, frame)` → `spy` not called; `hooks.onMessage(A, frame)` → called once. A retired A (after `disconnect(A)`) → not called |
| `#361 W13` (pin, in `disconnect_admission_361.test.ts`) | The post-site before the caps: `maxWatchedChannels: 1`, filled by a registered `c2`. Registered `c1`'s `subscribe(c1, 'private-y')` waits on a gated authorizer; `await disconnect(c1)`; admit → `ConnectionDisconnectedError`, **not** `ChannelLimitError` |
| — | Every existing realtime test is green after the migration, with no assertion weakened. `#361` W8 stays green unmodified |

**Mutants** (FR-015), battery `tests/mutations/register_only_admission_370.ts`:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| M1 | `#assertBound`'s unregistered throw removed | W1, W2 |
| M2 | the pre-site calls `#assertAdmissible` | W1 (authorizer call count) |
| M3 | clause 2 narrowed back to `this.#retired.has(bound)` | W4, W3 |
| M4 | clause 2 removed | W4 |
| M5 | clause 2 over-widened to `bound !== undefined` | W6 |
| M6 | clause 1 removed | `#361` W5 |
| M7 | `#assertBound` asks the binding before `#assertAdmissible` | W9 |
| M8 (`expectSurvival`) | the post-site calls `#assertAdmissible` | `'(none — equivalent)'`; the reason points to `#assertBound`'s JSDoc (row 14). It is equivalent only while FR-009b's guarded `finally` holds |
| M9 (`expectSurvival`) | `subscribe`'s `connections.set` restored after `#checkChannelCaps` | `'(none — equivalent)'`; the reason points to `#assertBound`'s JSDoc |
| M10 | `disconnect`'s object-form owner check removed | W11, W12 (i) |
| M11 | `disconnect`'s `finally` guard removed (unconditional deletes) | W12 (ii) |
| M12 | `handlerHooks.onMessage`'s owner gate removed | W13 |
| M13 | `handlerHooks.onClose` passes `conn.id` | W11 |

**Re-anchor and repair list.** Counted on `main` at `150755df`. 34 batteries were dumped with a stub
harness, and 4 were read by hand (`presence_member_frozen_354`, `live_conformance_285`,
`self_skip_310`, `sweep_parse_316`, none adjacent).

- **Re-anchored, because the anchor includes the deleted `connections.set` (5):**
  - `authorize_result_347` M7: re-anchored on the `#checkChannelCaps(…)` block alone, and its label
    drops "and the `connections` write";
  - `authorize_result_357` M5 and `presence_member_admission_350` M10: their third edit anchors on
    `connection.identity !== null,\n        )\n` plus the blank line and
    ``// `member` is set``;
  - `manager_debt_353` M1: re-anchored below `#checkChannelCaps`, with its label updated and its
    killer unchanged;
  - `disconnect_admission_361` N4: rewritten as "the post-site moved below `#checkChannelCaps`",
    killed by **`#361 W13`** (D3).
- **Re-anchored, because the subscribe call becomes `#assertBound` (3):** `#361` N1, N2 and N10.
  Only the method name changes, and their killers are unchanged.
- **Re-anchored, because clause 2's text changes (1):** `#361` N8, on
  `if (bound !== undefined && bound !== connection) {` plus its `throw`.
- **Re-verified (1):** `#361` N9, since `throw new ConnectionIdInUseError(` still occurs once. Its
  `to` line drops the argument to match FR-011.
- **Re-anchored by the fold (1):** `#361` N12 anchors on `handlerHooks.onClose`, and FR-009c changes
  `this.disconnect(conn.id)` to `this.disconnect(conn)`. It is re-proven live against `#361` W12 (i).
- **Unchanged (8):**
  - `authorize_result_357` M1 and M7;
  - `presence_member_306`;
  - `channel_name_314` ×2;
  - `connection_id_304`'s `register()` and `subscribe()` guards;
  - `#361` N5.
- **Not adjacent (2):** `connection_id_304` ×2 on `onOpen`'s close line (D5).

**Tests to migrate** (FR-013). The probe measured these failures per file at `150755df`, 449 in 44
files (`.test.ts` omitted):

- **50 or more:** `authorize_result_357` 84, `authorize_result_347` 55.
- **10 to 49:**
  - `presence_member_id_type_346` 47, `manager_debt_353` 34;
  - `lapse_rehold_349` 28, `presence_member_admission_350` 28;
  - `presence_member_frozen_354` 18, `channel_watch_295` 16;
  - `revocation_paging_359` 13, `disconnect_admission_361` 12, `channel_revoke_332` 10.
- **5 to 9:**
  - `presence_sweep_departure_348` 8;
  - 7 each: `churn_cost_329`, `presence_join_compensation_323`, `presence_local_member_343`,
    `presence_member_transitions_344`;
  - `presence_rejoin_327` 6, `presence_snapshot_bound_339` 5.
- **2 to 4:**
  - 4 each: `channels`, `leave_outcome_332`, `presence`, `presence_eviction_334`,
    `revoke_channel_idless_340`, `subscribe_unsubscribe_race_330`;
  - 3 each: `authorize_denial_331`, `driver_redis`, `driver_redis_live`, `member_info_bound_326`,
    `revocation_clear_race_337`;
  - 2 each: `emit_isolation_323`, `presence_cap_concurrency_323`, `presence_read_bound_341`.
- **1 each:** `connection_id_charset`, `control_auth`, `deliver_local_reauth`,
  `disconnect_propagation`, `eviction_control`, `eviction_durable`, `eviction_reconnect`,
  `log_encoding_291`, `mixed_fleet_332`, `presence_authoritative`, `presence_join_rosterless_342`,
  `roster_holders_345`.

The 23 existing test calls of `disconnect(…)` keep the id form, and stay valid.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| 1. **One owner object per id; `register` is the only writer of a binding** | `register`, `packages/realtime/manager.ts` (the one `connections.set`) | `subscribe`'s set restored; a lazy register in `handlerHooks.onMessage` or `websocket.ts`; an "upsert" helper; a set in `#joinLocal` / `#joinPresence` |
| 2. **What admissible means**: not retired (clause 1), and no *different* object bound, live or retiring (clause 2, `bound !== undefined && bound !== connection`) | `#assertAdmissible`, `packages/realtime/manager.ts`, the only reader of `#retired` | `#retired` read elsewhere; clause 2 split in two; an inline `bound === connection` in `register` or `subscribe`; an id-keyed tombstone |
| 3. **What bound means for `subscribe`**: admissible, **then** registered | `#assertBound`, `packages/realtime/manager.ts` | `connections.has` inlined in `subscribe`; the registration test inside `#assertAdmissible`; a check in `#checkChannelCaps`, `#joinLocal` or `websocket.ts` |
| 4. **Who asks what**: `register` asks `#assertAdmissible` first; `subscribe` asks `#assertBound` at the pre-site and the post-site | **`#assertAdmissible`'s JSDoc**, `packages/realtime/manager.ts` (the list of askers) | the asker list restated in `#assertBound`'s or `subscribe`'s JSDoc; `register` calling `#assertBound`; `subscribe` calling `#assertAdmissible`; a fourth site |
| 5. **Same-object re-registration is a no-op** | clause 2's `bound !== connection`, `packages/realtime/manager.ts` | an early `return` in `register`; an "already registered" error; an id comparison |
| 6. **Three refusal classes, one per remedy, no shared base**: `ConnectionDisconnectedError` (drop the frame), `ConnectionIdInUseError` (mint per socket), `ConnectionNotRegisteredError` (register at open) | the classes in `packages/realtime/manager.ts`, exported from `packages/realtime/mod.ts`. **The no-base reason is in ADR 010 §7**, and each class's JSDoc states its own remedy and links there | a `ConnectionAdmissionError` base; one class with a `reason` field; reusing `ConnectionIdError`; `{ ok: false }`; the no-base reasoning restated in JSDoc |
| 7a. **`subscribe`'s statement order**: id and channel defects, the pre-site, the authorizer and its result checks, the post-site, the caps, the join | `subscribe`'s body, `packages/realtime/manager.ts` (FR-007) | a post-site above the deny `return`; the caps above the post-site; the id assertion below the pre-site |
| 7b. **`#assertBound`'s order**: admissibility, then registration. `register` asks admission before the id charset, which is unobservable | `#assertBound`'s and `register`'s bodies, `packages/realtime/manager.ts` | `NotRegistered` for a retired object; the charset check moved above admission "for safety" |
| 8. **A refusal writes nothing and undoes nothing** | `subscribe`'s statement order, `packages/realtime/manager.ts` | refuse-and-undo; a check after a write |
| 9. **The transport lifecycle duties are enforced, and stated once** | the user-facing statement: `docs/realtime.md` § *Your connection ids and your transport's lifecycle*; duty 1: `register`'s JSDoc; duty 2: the `Connection` JSDoc (`types.ts`); **duty 3: `disconnect`'s JSDoc** | the duties restated in items 20 and 21, the README or `AGENTS.md`; a surviving "escapes it" sentence (D6) |
| 10. **`handlerHooks` meets the duties for the app**: `onOpen` answers any `register` refusal with `1011 'unusable connection id'` and skips the app's `onOpen`; `onClose` tears down **the object** it opened; `onMessage` runs the app's hook only for the owner | `handlerHooks`, `packages/realtime/manager.ts` | a catch that distinguishes `ConnectionIdInUseError`; a distinct close reason (D5); a retry that disconnects the holder (#363(b)); a gate in `websocket.ts` |
| 11. **What an app does about each refusal, and how it mints ids** | items 20 and 21 (plus item 17's bullet), `docs/realtime.md` | a `CHANGELOG` (none, FR-021); the guidance restated beyond one README bullet; an entropy check in the manager (S2) |
| 12. **Why `register`-only admission and owner-scoped teardown are right, and what they do not solve** | ADR 010 §7, `docs/adr/010-realtime-disconnect-retires-the-connection-object.md` | the rationale kept only in this plan, or restated in `AGENTS.md` |
| 13. **Rejected options, with their costs**: (a) #370(b), implicit registration under the same checks: it needs an id tombstone (ADR 010 §4) and keeps two entry points; (b) #370(c), deprecate first: keeps an availability hole open in a published package; (c) #363(b), last registration wins: an async `register`, and any stable id becomes a way to kill a socket; (d) a no-op old `disconnect`: B still receives A's channels; (e) `subscribe(id, channel)`: a forgeable string replaces an unforgeable object; (f) **an `onClose`-only guard** (the security seat's proposal): it protects only the framework path, and reads a binding outside the deciders; (g) **an object-only `disconnect`**: it breaks `revokeLocal` and 23 test calls; (h) **deferring the teardown fix**: #363 would close while still reproducible | ADR 010 §7 | the list restated in `docs/realtime.md` or `AGENTS.md` |
| 14. **The post-site's unregistered clause is unreachable while `disconnect` deletes only its owner's binding; restoring `subscribe`'s write is equivalent** | **`#assertBound`'s JSDoc**, `packages/realtime/manager.ts`; M8 and M9 point to it | the reason restated in the battery row or the test file; a witness pretending to reach either |
| 15. **Test fixture shape: one object per socket, registered at the socket's open with the manager that subscribes it, and reused for every call** | each migrated test file's own factory (no shared module) | a shared `conn` helper for 35 shapes; a test-mode flag that re-enables implicit registration; a weakened assertion |
| 16. **A teardown acts only on the owner of the id**: `disconnect(conn)` for a non-owner is `'not-owned'` and touches nothing; the `finally` deletes the binding and reverse index only while the torn-down object still owns the id; `revokeLocal` keeps the id form | `disconnect`, `packages/realtime/manager.ts` (FR-009a, FR-009b) | an owner check in `handlerHooks.onClose` instead (rejected, row 13 (f)); an unconditional delete; a second teardown path for objects; `revokeLocal` switched to the object form |
| 17. **Whether an object owns its id**: `connections.get(connection.id) === connection` | `#isOwner`, `packages/realtime/manager.ts`. Its askers are `disconnect`'s object form, `disconnect`'s `finally` and `handlerHooks.onMessage` | a `connections.get(…) === conn` comparison inlined in `handlerHooks`, `disconnect` or `websocket.ts`; a per-socket "owner" flag; a set of refused sockets |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary Dependencies**: `@lockness/realtime` only; no
new import · **Storage**: none new · **Testing**: `deno test`; `MemoryBroadcastDriver` with a spy and
gated authorizer and a gated unwatch; `handlerHooks` driven directly for W7, W11, W12 and W13; the
shared mutation harness · **Target**: server library · **Project type**: framework package ·
**Performance**: one `Map.has` per `subscribe` site; one `Map.get` per `onMessage` and per
`disconnect` (object form and `finally`); no retained memory · **Constraints**:
- no wire, driver-port, control-frame or option change;
- one new public class;
- one widened parameter (`disconnect`);
- one error class whose message and constructor change;
- a breaking change on the unregistered and reused-id paths, accepted by the maintainer's standing
  instruction.

**Scale**: unchanged.

### Domain model

- **Bounded context**: realtime (`ChannelManager`'s connection lifecycle, admission and teardown).
- **Vocabulary**:
  - **binding**: the `connections` entry mapping an id to one object;
  - **owner**: the object bound under an id (`#isOwner`);
  - **registered**: bound by `register`, the only writer;
  - **admissible**: not retired, and no different object bound under its id;
  - **bound**, for `subscribe`: admissible and registered;
  - **owner-scoped teardown**: a `disconnect` that acts only on the owner;
  - **retired**, **owned** (by id, in `connections`) and **zombie**, as in #361;
  - **takeover** and **cross-teardown**: both can no longer happen through `register`, `subscribe`
    or `handlerHooks`.
- **Entities**:
  - `ChannelManager` is the aggregate root;
  - `Connection` is identified by its object for admission, retirement and teardown scope, and by
    its id for ownership reads and delivery.
- **Value objects**: the three lifecycle refusals. None carries the id in its message except
  `ConnectionDisconnectedError`, which is unchanged.
- **Invariants**:
  - every binding was written by `register`;
  - an id has at most one owner object;
  - every membership names an id whose owner's own subscribe was authorized;
  - a teardown the framework runs deletes only its own object's binding;
  - a refusal lands before any write;
  - a binding is compared to an object only inside `#assertAdmissible`, `#assertBound` and
    `#isOwner`.
- **Out of scope**:
  - `websocket.ts`;
  - driver contracts;
  - revocation (#359, #362);
  - the ADR 010 §5 bullets 4–7;
  - the id-form `disconnect` apps still use;
  - overlapping teardowns of one object (§9).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | `disconnect` takes `string \| Connection<Identity>` |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | per task, plus `deno task mutate realtime` |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-004, FR-011 and FR-017 list every block |
| MVC layering | pass | not applicable (library aggregate) |
| Commit discipline | pass | **in this order (A2)**: (1) `test`: the fixture migration, green against the unmodified `manager.ts`; (2) `test`: the red witnesses; (3) `fix`: `manager.ts`, `mod.ts`, `types.ts` JSDoc; (4) `test`: the implicit-registration premise tests, rewritten and listed; (5) `test`: the battery and re-anchors; (6) `docs`: ADR 010, `realtime.md`, README, `AGENTS.md` |
| No environment detail in versioned files | pass | none |
| Design decisions go to architect-expert | pass | the disposition and the audit rulings A1–A9 are binding |
| Act, don't recommend | pass | the §9 residue items are filed by the product-owner |
| TDD, red first | pass | W1–W5, W7, W8 and W11–W13 are red on `main`; W6, W9 and `#361 W13` are pins |
| No silent catches | pass | no catch is added. The `onMessage` gate drops a frame by rule, not by catching |
| Domain Model gate | pass | §6 |
| #323 synchronous turn | pass | the post-site adds no await; `#isOwner` is synchronous |
| #331: a refusal is not a denial | pass | FR-007 |

### Complexity tracking

No violation. Added:

- two private deciders (`#assertBound`, `#isOwner`);
- one exported class;
- one widened clause;
- one deleted line;
- two call-site renames;
- one widened `disconnect` parameter and one guarded `finally`;
- an `onMessage` wrapper;
- one ADR amendment.

The migration is large (449 tests in 44 files) but mechanical, and it lands first. The rejected
alternatives are row 13.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | yes, **breaking** | new export `ConnectionNotRegisteredError`. `subscribe` on an unregistered object throws it. `register` and `subscribe` throw `ConnectionIdInUseError` for any different holder; its constructor takes no argument, and its message carries no id. `disconnect` also accepts the connection object, owner-scoped |
| `handlerHooks` | yes | `onClose` passes the object; `onMessage` runs the app's hook only for the owner; `onOpen` is unchanged |
| `connectionCount` | yes | counts only registered connections |
| `Connection` contract (`types.ts`) | doc | same-object duty enforced; id-minting rule stated |
| Driver ports, wire, control plane, options, `websocket.ts` | no | — |
| Revocation, delivery, ownership readers, `revokeLocal` | no | read `connections` by id, byte for byte |
| Tests | yes | fixture migration first (449 tests in 44 files); new witness file and battery; `#361 W13`; 10 rows re-anchored (9 at the admission sites, plus `#361` N12), 1 re-verified |
| Docs | yes | ADR 010 amended; `docs/realtime.md` (items 20 and 21, item 17's bullet, the lifecycle section, `:24`, the § *Channels* snippet, the preamble); README bullet; `AGENTS.md`; JSDoc |

### Documentation (this feature)

```text
.specnaut/specs/270-register-only-admission/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| The migration weakens an assertion to get green | A2: the fixture commit must pass against the **unmodified** `manager.ts`, so no assertion can depend on the fix. Premise tests are rewritten after the fix, and listed |
| The probe's list goes stale before implement | FR-013 re-runs it on the branch first |
| A re-anchor lands off its line, and a row goes `DEAD` or changes meaning | §4 fixes every re-anchor; `deno task mutate realtime` is in the gate |
| A binding is compared to an object outside the deciders | Row 17; the `AGENTS.md` pitfall; `grep -n 'connections.get(.*) ===' manager.ts` finds only `#isOwner` |
| An app on a custom transport keyed by user id breaks on reconnect | Intended: it was the takeover. Item 21 says to mint per socket |
| **Residue (A1):** apps that call `disconnect(conn.id)` from their own close hook keep id-keyed teardown, so a refused socket's close still tears down the holder | Item 21 says to pass `conn`. The deprecation of the id form for app callers goes to the backlog |
| **Residue (A1):** two overlapping teardowns of one object mid-loop on a shared channel | It needs #361's retirement record restructured to one teardown per object. That is its own backlog item. W12 (ii) pins only the `finally` guard |
| **Residue (S1):** a custom transport that does not use `handlerHooks` can still run app code for a non-owner socket | Item 21 and the lifecycle section: gate on `disconnect(conn)`'s outcome and never call `unsubscribe(conn.id, …)` for a socket that was refused |
| **Residue:** a registered socket that is never disconnected still leaks | Duty 3; unchanged since #361 |
| **Residue:** an id is reusable once its teardown completes | By design. `Connection.id` forbids reuse, and `evict(id)` recovers a leaked binding (S2) |
| **Residue:** a cross-instance id collision is not detected | Out of scope; ids are minted per socket |
| **Residue:** ADR 010 §5 bullets 4–7 | Unchanged, as filed |

## 10. Architecture audit

*`architect-expert`, 2026-09-25, against this document before any code. Verdict: **fail**. Its
rulings are binding (hard rule #11).*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 HIGH (shared with S1) | `disconnect` is keyed by id. The refused socket's own close (`websocket.ts:240` → `onClose(B)` → `disconnect('c1')`) kills A. An evict followed by a fast reconnect lets the old socket's late close tear down the new holder, and a late `finally` deletes the new binding without retiring it: the second half of #363's title | Plan changed. `disconnect(target: string \| Connection)`: the object form acts only for the owner, and returns `'not-owned'` otherwise (FR-009a). The `finally` deletes only while the object still owns the id (FR-009b). `handlerHooks.onClose`, `docs/realtime.md:24` and duty 3 pass the object; `revokeLocal` keeps the id (FR-009c, FR-016). Row 16 is new, and row 10 no longer says "code unchanged". Witnesses W11 and W12; mutants M10, M11 and M13. Rejected: an `onClose`-only guard, an object-only `disconnect`, deferring (row 13 (f)–(h)). Residue: the id form in apps; overlapping teardowns (§9) |
| A2 MED (D1) | Commit order: the fixture migration must land first and pass against the unmodified `manager.ts`, or a weakened assertion is invisible | Plan changed. FR-013 and §7's commit order. Premise tests are rewritten after the fix, and listed. Row 15 reads "registered at the socket's open, with the manager that subscribes it" |
| A3 MED (D3) | W10 lived in the #370 file, but `#361` N4's battery runs only `disconnect_admission_361.test.ts` | Plan changed. W10 moves to that file as **`#361 W13`**, and N4 names it. The #370 number W10 is not reused |
| A4 MED | Single home: row 4 has no one home; row 6's no-base reason is spelled twice; row 7 mixes two orders; duty 3 has no JSDoc home | Plan changed. Row 4 → `#assertAdmissible`'s JSDoc. Row 6's reason → ADR 010 §7, which FR-004 links. Row 7 split into 7a (`subscribe`'s order) and 7b (`#assertBound`'s order, plus `register`'s unobservable admission-before-charset). Row 9: duty 3 → `disconnect`'s JSDoc |
| A5 (row 14) | M9 is genuinely equivalent. M8 is equivalent only once the conditional delete exists. The reason belongs in `#assertBound`'s JSDoc, and the battery row points to it | Plan changed. Row 14 names the condition, FR-003 homes the reasons, and M8's row cites FR-009b |
| A6 LOW | ADR 010 needs "amended by §7" pointers under §2's two headings and under §3 | Plan changed (FR-018) |
| A7 LOW (D5) | Keep `'unusable connection id'`, for the real reasons: no new client-visible text, and a distinct reason would leak whether an id is live | Plan changed. D5 rewritten; the anchor-cost argument dropped |
| A8 LOW | Factual: FR-002's grep; `onOpen` throws synchronously (W7, US5); §1's claim about the intro example | Plan changed. W7 uses `assertThrows`, and US5 says "throws synchronously". §1 and D7 say the intro example registers (`docs/realtime.md:22`). **FR-002's grep, measured:** `this.#retired` has **3** matches today and **2** after the change (clause 2 stops reading it), not 4. The plan records the measured numbers |

**Verdict** (as relayed): **fail**, with 1 HIGH, 3 MEDIUM and the LOWs above, all folded. The
design is confirmed, with owner-scoped teardown added in this feature. **Coverage** (as relayed):
this plan, the admission and teardown paths in `manager.ts`, `websocket.ts`'s close path, the test
and battery counts, and ADR 010. The per-file list was not itemised in the relay.

## 11. Security audit

*`security-expert`, 2026-09-25, in parallel. Verdict: **fail**. Kept separate on purpose.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 HIGH | **The same finding as A1.** A refused socket's close tears down the live holder. The seat proposed an `onClose`-only guard, which the `architect-expert` **rejected** in favour of owner-scoped `disconnect` (row 13 (f)). **Second route:** `userHooks.onMessage(B)` runs before B's close lands, and an app calling `unsubscribe(conn.id, …)` there strips A | Plan changed. The teardown half is folded into A1. **The `onMessage` gate:** `handlerHooks.onMessage` runs the app's hook only when the socket owns its id (FR-009c). A direct `connections.get(conn.id) === conn` in `handlerHooks` would be a binding read outside the deciders, which rows 3 and 17 forbid. So the gate asks a named decider, **`#isOwner`**, which `disconnect` also asks (FR-009, row 17). Witness W13, mutant M12. Custom transports without `handlerHooks` are residue (§9) |
| S2 LOW | The id-minting rule is under-stated | Plan changed. Item 21 and the `Connection.id` JSDoc say that the server mints the id per socket, never from client input or a user or session key. They name the consequences (lockout, and disclosure of who is online) and name `evict(id)` as the recovery for a leaked binding. One uniform close reason (D5); no entropy check in the manager (row 11) |
| S3 LOW | `safeForLog` encodes an id, it does not redact it. Both new messages carried the id | Plan changed. `ConnectionNotRegisteredError` and the widened `ConnectionIdInUseError` take no id and carry none (FR-004, FR-011). W4 asserts it. `ConnectionDisconnectedError` is unchanged |

**Checked clean** (as relayed):

- the authorizer sees only the owner's identity;
- nothing is written before a refusal;
- delivery, presence, `evict` and `revokeLocal` reach only the owner.

**Verdict** (as relayed): **fail**, with 1 HIGH and 2 LOW, all folded. No HIGH residue remains.
**Coverage** (as relayed): admission, teardown, the `handlerHooks` paths, error messages, and id
guidance. The per-file list was not itemised in the relay.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Accept the compatibility cost (a mandatory `register`; a live id refused)? | Yes. It is the maintainer's standing instruction: take the strictest security option, and accept the compatibility cost | 2026-09-25 |
| Any other product question? | None. The audits' choices change how, not what, and were ruled by the `architect-expert` | 2026-09-25 |
| Approve the architecture as audited (tasks → implement → review)? | _Asked at stop 1._ | — |

### Decided without asking

- The design is the 2026-09-25 disposition, as amended by the binding audit rulings A1–A8 and the
  folded security findings S1–S3.
- **The `onMessage` gate's decider is named `#isOwner`** (S1 routed through rows 3 and 17). The
  object form of `disconnect` and its `finally` ask the same method, so "owns its id" has one
  spelling.
- A frame from a non-owner is dropped **without a log line**. The socket was refused or retired,
  and one line per frame would be a flooding vector.
- `ConnectionIdInUseError`'s constructor drops its `id` parameter, rather than keeping an unused
  one. The change is named in item 21.
- W10's number is not reused. The witness became `#361 W13`, and the new witnesses are W11–W13.
- W12 (ii) states the ordering, not the harness. The implementer gates the two teardowns so that the
  first settles and A1 registers while the second is suspended.
- The new files are named for #370 (`register_only_admission_370.*`), with test names starting
  `#370 W<n> `.
- The migration keeps each file's own factory.
- ADR 010 §4's reversed bullet keeps its original text, with a closing line.
- No `CHANGELOG` file (FR-021).
