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

§10 and §11 are placeholders. The two plan audits are dispatched separately.

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
    `eviction_durable`, `eviction_reconnect`, `leave_outcome_332` and `log_encoding_291`. Each
    registers one object and subscribes another, or an unregistered one.
  - **Measured by a probe.** The disposition's three edits were applied to a scratch copy of
    `manager.ts`, with a plain `Error` standing in for the new class. The realtime suite then ran,
    and the file was restored. The baseline is **988 passed, 0 failed, 37 ignored**. The probe
    gives **449 failing tests in 44 files**, all from a subscribe that is refused as unregistered
    (the per-file list is in §4).
  - **The fresh-object calls are 206 in 24 files, not 27.** That is the single-line
    `subscribe(conn(` count. Counted across lines, it is **215** in 24 files. Across every
    factory spelling (`conn` 215, `connection` 15, `identified` 10, `fakeConn` 4, `tab` 2) it is
    **246 calls in 28 files**. §4 migrates by the failing list, not by either grep.
- **D2 — the battery anchors.** Counted by a stub-harness dump of every battery (34 of 38; the other
  4 were read by hand), not "20 anchors in 6 batteries": **18 rows in 8 batteries** anchor in or
  beside an edit site, and 3 more `handlerHooks` rows (`connection_id_304` ×2, `#361` N12) sit on
  lines this feature does not touch. Of the 18: **9 are re-anchored, 1 is re-verified, and 8 stay
  as they are** (§4). #370's own "restore `connections.set`" mutant never existed as a row; it is
  recorded as an equivalent row (M9).
- **D3 — the #361 witness file breaks too.** 12 tests in `disconnect_admission_361.test.ts` go red:
  W1, W2, W4, W5 and the eight W6 cases. Their fixtures subscribe an object they never registered.
  They are migrated like every other file: register first. Their assertions do not change. W3, W7,
  W8, W9, W10, W11 and W12 stay green. `#361` N4 loses **both** of its anchors, and is rewritten
  (§4).
- **D4 — ADR 010 §4 rejected this design.** Its bullet "Making `register` mandatory" is listed as
  rejected: "it still misses window (a) unless `disconnect` deletes at entry". The amendment
  **reverses** that bullet rather than appending to it. Retirement by object already covers window
  (a), so `register`-only admission no longer needs a delete at entry. Also, **§5's first three
  bullets are closed by this feature**:
  - the unregistered first subscribe racing `disconnect`;
  - the fresh object per call;
  - the different object under a live id.

  The disposition's "ADR 010 §5 residue is unchanged" holds for the remaining four bullets.
- **D5 — the 1011 close reason.** `handlerHooks.onOpen` closes with
  `conn.close(1011, 'unusable connection id')` for **every** `register` refusal. After this change
  that includes `ConnectionIdInUseError`. The text is kept byte-identical: `connection_id_304` ×2
  anchor on that line, and "unusable" is true of an id already in use.
- **D6 — the "escapes" claim has three homes, not two.** These are:
  - the lifecycle section, `docs/realtime.md:522–525`: "It reaches only what the three duties make
    reachable. A connection first seen by a `subscribe` racing its own `disconnect`, or a fresh
    object built per call after the teardown, escapes it";
  - the `Connection` JSDoc, `packages/realtime/types.ts:118–120`: "a fresh object built after the
    teardown is unknown to the manager and escapes that refusal";
  - `register`'s JSDoc, `manager.ts:1436–1438`: "was never registered, so there is nothing to retire
    and its membership is stranded".

  All three become false, and all three are rewritten (FR-014).
- **D7 — two standalone examples would throw.** `docs/realtime.md:74–91` (§ *Channels*) and the
  `ChannelManager` class `@example` (`manager.ts:970–974`) call `subscribe` on a `conn` that nothing
  registered. They gain `manager.register(conn)`. The other 11 `manager.subscribe(` examples are
  catch fragments or sit under hooks that register. The search is
  `git grep -n 'manager.subscribe(' -- docs/realtime.md 'packages/realtime/*.ts' packages/realtime/README.md`.
- **D8 — the upgrade section's preamble counts.** `docs/realtime.md:2198–2213` reads "Nineteen
  items. Thirteen are breaking…" and lists the items to read. Those numbers become 21 and 15, and
  items 20 and 21 join the read list.

---

## 1. Why this exists

`ChannelManager` admits a connection **object** under its id at two points
(`packages/realtime/manager.ts`):

- `register` (`:1448–1451`) runs `#assertAdmissible` and `#assertUsableId`, then
  `this.connections.set(connection.id, connection)`;
- `subscribe` (`:1600`) does the same `connections.set` **implicitly** at `:1699`, after its
  post-check and `#checkChannelCaps`.

Neither asks whether the id is already held by a **different, live** object. #361's
`#assertAdmissible` refuses only an object that was retired, or a different object under an id
still bound to a retired one (clause 2, `:1422–1425`).

Two defects follow.

**#370: a zombie no disconnect will reach (availability, `security`).** Take a connection an app
never registered, whose first `subscribe` is waiting on its authorizer when its socket closes:

1. `disconnect(id)` finds nothing in `connections`, reports `'not-owned'` and retires nothing;
2. the authorizer resolves, and `subscribe` registers, joins, watches the channel and takes cap slots
   (`maxWatchedChannels`, and the anonymous share when there is no identity);
3. the close path has already run, so the binding lives for the life of the process, and
   `connectionCount` counts it.

A client that repeats this exhausts the instance's watched-channel caps for every other client.
`handlerHooks` cannot reach it, because its `onOpen` registers synchronously. **Every app that wires
the manager by hand can**, and that is most callers: 38 of the 53 realtime test files that call
`subscribe` never register, and neither does the intro example of `docs/realtime.md`.

**#363: a silent takeover, then a cross-teardown (confidentiality).** When a different object B
is admitted under the id of a live object A:

1. membership, delivery and presence are keyed by id and resolved through `connections.get(id)`, so
   every channel A holds, including private and presence channels, is delivered to B. B's own
   `authorize()` never ran for them;
2. when A's socket closes, A's `disconnect(id)` tears down B's memberships and forgets B, while B's
   socket is still open.

The `Connection.id` contract forbids reuse, and `handlerHooks` mints `crypto.randomUUID()` per
socket, so the framework path cannot reach this. An app that passes a user or session id through a
custom transport and reconnects before the old close lands hits both effects. That is the shape
`types.ts` records apps actually use.

**One cause, one fix.** Both defects exist because `connections` has two writers and no owner rule.
The disposition gives every id **one owner object**: `register` is the only way in, `subscribe`
admits only the object currently registered under its id, and `register` refuses an id held by a
different object, whether that object is live or retiring.

**Who is affected by the fix:**

- every app that calls `subscribe` without `register`: it now throws `ConnectionNotRegisteredError`;
- every custom transport that reuses ids and reconnects before the old close lands: it now gets
  `ConnectionIdInUseError`, or a `1011` close from `handlerHooks.onOpen`;
- every app on `handlerHooks` with framework-minted ids: **nothing changes**.

## 2. User scenarios

### US1 — an unregistered connection is refused before it costs anything (P1)

**Given** an app that never calls `register`, and a private channel with a slow authorizer
**When** the connection subscribes and its socket closes while the subscribe would be waiting
**Then** the subscribe rejects with `ConnectionNotRegisteredError`, the authorizer is **called 0
times**, and no connection, membership, cap slot, anonymous share, broker watch or roster entry
exists afterwards. `connectionCount` is 0.

### US2 — a second object under a live id is refused (P1)

**Given** a live connection A holding a private and a presence channel
**When** a different object B, carrying A's id and a different identity, is registered, or subscribes
to either channel
**Then** each call throws `ConnectionIdInUseError`, the authorizer is called 0 times, and B receives
no frame and no presence frame. A keeps receiving both channels.

### US3 — the old socket's close tears down only its own state (P1)

**Given** the refused B from US2
**When** A's socket closes and `disconnect(id)` runs
**Then** A's memberships are torn down, and B, which was never admitted, loses nothing. Once the
teardown settles, B can register and its own authorized subscribe delivers.

### US4 — the framework path, and same-object re-registration, behave as today (P2)

**Given** an app on `handlerHooks`, or a transport that calls `register` twice with the same object
**When** it opens, subscribes and closes
**Then** everything behaves as before: the second `register` is a no-op, and `connectionCount`
is 1.

### US5 — a custom transport that reuses ids and drives `handlerHooks` hears about it (P2)

**Given** a custom transport driving `manager.handlerHooks()` with its own ids
**When** it opens a second socket under the id of one that is still open
**Then** the second socket is closed with `1011 'unusable connection id'`, the open rejects with
`ConnectionIdInUseError`, the app's own `onOpen` is not called for it, and the first socket is
untouched.

### Edge cases

- **A retired object whose id is no longer bound** gets `ConnectionDisconnectedError`, not
  `ConnectionNotRegisteredError`. `#assertBound` asks admissibility first, and "drop the frame" is
  the right remediation for a closed socket.
- **The post-authorizer unregistered clause is unreachable.** At the pre-site, the id was bound to
  this very object. Only `disconnect` deletes from `connections`, and it retires the bound object
  first, so clause 1 fires. If another object registered under the id after the teardown, clause 2
  fires. The row is `expectSurvival` (M8).
- **Order of defects:** an out-of-charset id → `ConnectionIdError`, and a bad channel →
  `ChannelNameError`, both before any admission refusal, as today.
- **An anonymous connection on a private channel that is unregistered** throws
  `ConnectionNotRegisteredError`. The pre-site runs before the `identity === null` denial, as #361's
  pre-check does.
- **A denial is still a denial.** A registered connection whose authorizer denies gets
  `{ ok: false }`. Only a refusal at admission throws.
- **`register` of a different object while the holder is retiring** still throws
  `ConnectionIdInUseError` (#361 W8, green). The clause now also covers a live holder.
- **`disconnect` of an id nobody registered** retires nothing and reports `'not-owned'`, as today.
  Nothing can now be admitted under that id by `subscribe`, so there is no race left to strand.
- **An id reused after the teardown settles** is admitted. This is named residue (§9).
- **The same object registered twice** is a no-op. Clause 2 compares objects, not ids.

## 3. Requirements

**Admission: one writer, one owner, three askers**

- **FR-001**: **`register` is the only writer of a binding.** The implicit
  `this.connections.set(connection.id, connection)` in `subscribe` (`manager.ts:1699`) is deleted,
  with no replacement. After the change,
  `grep -n 'connections.set' packages/realtime/manager.ts` finds exactly **one** line, in
  `register`.
- **FR-002**: **`#assertAdmissible`'s clause 2 widens** from
  `bound !== undefined && this.#retired.has(bound)` to `bound !== undefined && bound !== connection`.
  It still throws `new ConnectionIdInUseError(connection.id)`. Clause 1
  (`this.#retired.has(connection)` → `ConnectionDisconnectedError`) is unchanged and stays first.
  `#assertAdmissible` stays **the only reader of `#retired`**:
  `grep -n '#retired' manager.ts` finds the declaration, `disconnect`'s `add` and clause 1's `has`.
  Its JSDoc says "a different object bound under this id, live or retiring", names its askers, and
  says that the same object re-registering passes.
- **FR-003**: **`#assertBound(connection)`**, a new private method directly below
  `#assertAdmissible`. It calls `this.#assertAdmissible(connection)`, then throws
  `new ConnectionNotRegisteredError(connection.id)` when `!this.connections.has(connection.id)`.
  **Admissibility is asked first** (edge case 1). The JSDoc says:
  - that it is `subscribe`'s decider;
  - that it adds exactly one question to `#assertAdmissible`;
  - that its post-site clause is unreachable, and why.
- **FR-004**: **`ConnectionNotRegisteredError`**, a new exported class in `manager.ts` directly after
  `ConnectionIdInUseError`. It is shaped like its siblings, with **no shared base class**, because
  the remediation differs:
  - `override readonly name = 'ConnectionNotRegisteredError'`, and an `id` rendered through
    `safeForLog`;
  - a constant message: this connection was never registered, so nothing was subscribed; call
    `register` from the transport's open hook. It **must not contain** either sibling's message
    text (FR-012);
  - full JSDoc covering:
    - why a named type and not `{ ok: false }` (#331);
    - why not a shared base class;
    - `handlerHooks` as the zero-work path;
    - an `@example` that registers in `onOpen`.
- **FR-005**: **`register` keeps `#assertAdmissible`** as its first statement, unchanged
  (`#361` N5's anchor stays byte-identical). It does **not** call `#assertBound`, because
  `register` is how an id becomes bound. `@throws {ConnectionIdInUseError}` widens to "a different
  object holds this id, live or being disconnected".
- **FR-006**: **`subscribe` asks `#assertBound` at both of #361's sites**, and nowhere else:
  - **the pre-site** is the statement directly after `const kind = channelKind(channel)`, before the
    `identity === null` denial and the authorizer;
  - **the post-site** is between the #347 invariant's closing `}` and the
    `// BEFORE any membership mutation` comment. Its two comment lines above stay byte-identical;
    only the called method changes.

  After the change, `grep -c '#assertBound(connection)' manager.ts` is 2, and
  `grep -c '#assertAdmissible(connection)' manager.ts` is 2: `register`, and `#assertBound`'s body.
- **FR-007**: **Statement order and precedence are #361's, extended.** `subscribe`'s order is:
  1. id and channel assertions;
  2. the pre-site;
  3. the authorizer, the deny `return`, classification, member admission and the #347 invariant;
  4. the post-site;
  5. `#checkChannelCaps`;
  6. the join.

  A refused subscribe writes nothing and undoes nothing. The authorizer's own outcome, whether a
  denial or a defect, is reported as produced. `subscribe` never resolves `{ ok: true }` for an
  object that is not the one registered under its id.
- **FR-008**: The comments `subscribe` carries about the deleted write are corrected. The #353
  invariant's comment ("Checked HERE, above the caps and `connections.set` … a refusal after the
  write would leave a `connections` entry behind") and any other comment naming the implicit
  registration now say what is true: `subscribe` writes no binding. A comment may not quote an
  anchored line (FR-012).
- **FR-009**: **Nothing else changes.** These keep reading `connections` byte for byte:
  - ownership: `unsubscribe`'s `owned`, `evict`, `revokeLocal`, `#recheckRevocations` and `owns`;
  - delivery: `deliverLocal` and `emitPresence`;
  - `disconnect`'s retirement.

  `handlerHooks` keeps its code (D5). `websocket.ts` is not touched.

**Surface and contract**

- **FR-010**: `ConnectionNotRegisteredError` is exported from `packages/realtime/mod.ts` in the error
  block beside `ConnectionIdInUseError` (`:88–90`). The block's comment names all three lifecycle
  refusals.
- **FR-011**: **`ConnectionIdInUseError` widens in message and JSDoc, not in name.**
  - The message no longer says "still bound to a connection being disconnected". It says that the id
    is held by another connection object, and that ids must never be reused. It still goes through
    `safeForLog`.
  - The JSDoc drops "#363 may widen it", states the live-or-retiring rule, and recommends a fresh
    `crypto.randomUUID()` per socket.
  - The `@example` is kept.
- **FR-012**: **Anchor hygiene.** No new comment, docstring or message quotes, verbatim, a line a
  battery row anchors on. That covers:
  - `this.connections.set(connection.id, connection)`;
  - `const kind = channelKind(channel)`;
  - `this.#assertUsableId(connection.id)`;
  - `conn.close(1011, 'unusable connection id')`;
  - the #353 invariant's `throw` text;
  - either sibling's message text.

  A second match makes a row `DEAD`.

**Tests**

- **FR-013**: **Witnesses W1–W10** go in a new
  `packages/realtime/tests/register_only_admission_370.test.ts` (§4). They are committed **red on
  `main` first**, except the pins W6, W9 and W10. Test names start `#370 W<n> ` with a trailing
  space, so `W1 ` is not a prefix of `W10`.
- **FR-014**: **Migration of the existing suite**, test by test:
  - **Scope.** It covers the 449 failing tests in 44 files that the probe measured (§4). Re-run the
    probe on the implementation branch before migrating, because the list is a measurement, not
    a grep.
  - **The shape**: each connection object is built **once**, registered with the manager that
    subscribes it, and reused for every later call on that socket.
  - **Fresh objects.** A fresh object per call, such as `subscribe(conn('c1'), …)` used twice, becomes
    one object held in a local.
  - **The rules.** A test's assertions are never weakened. No test stays red. No test is deleted to
    get green.
  - **Where the change lives.** Each file keeps its own factory, since the 35 local `conn` factories
    have different shapes. Registration goes where the object is built. No new shared helper module.
  - **Reporting.** A test whose **premise** was the implicit registration (it asserts
    `connectionCount` grew from a `subscribe`, or a membership for an unregistered object) is
    rewritten to the new outcome, and listed by name in the implement phase's report.
- **FR-015**: **Mutation batteries.**
  - **The new battery** is `packages/realtime/tests/mutations/register_only_admission_370.ts`, rows
    M1–M9 (§4). SUITES is the new test file, plus `disconnect_admission_361.test.ts` for the rows it
    kills. Each killed row is proven live. M8 and M9 are `expectSurvival` with the #341 sentinel
    `killedBy: '(none — equivalent)'`.
  - **The re-anchor list** in §4 is applied: 9 rows are re-anchored and re-proven live, and
    `#361` N9 is re-verified.
  - **The whole run.** Then `deno task mutate realtime` runs. Any other `DEAD MUTANT` is repaired,
    never deleted.

**Docs**

- **FR-016**: **`docs/realtime.md`**:
  - **item 20, "`subscribe` requires `register`"**:
    - a before/after: `subscribe` without `register` used to resolve and register implicitly. Now
      it throws `ConnectionNotRegisteredError` before the authorizer;
    - the fix is to call `manager.register(conn)` from your open hook;
    - **`handlerHooks` is the zero-work path**, since it already registers;
    - `connectionCount` counts only registered connections;
    - no wire change, and no migration step;
  - **item 21, "An id held by a live connection is refused"**:
    - a before/after: a second object under a live id used to take over the holder's channels.
      Now `register` and `subscribe` throw `ConnectionIdInUseError`, and `handlerHooks.onOpen`
      closes that socket with `1011`;
    - it recommends a fresh `crypto.randomUUID()` per socket;
    - a transport that keys sockets by user id must wait for the old close, or mint per socket;
  - **item 17's `ConnectionIdInUseError` bullet** is corrected to "an id held by a different
    object, live or being torn down";
  - **the lifecycle section** (`:503–551`): the "reaches only what the three duties make reachable …
    escapes it" sentences (D6) are replaced. Duty 1 is now **enforced** by
    `ConnectionNotRegisteredError`, and duty 2 by `ConnectionIdInUseError` and
    `ConnectionDisconnectedError`. The paragraph on a different object "while a teardown is still
    running" widens to any holder. The section stays **the one home** of the duties;
  - **the two standalone examples** gain `register` (D7);
  - **the section preamble** says 21 items and 15 breaking, and its read list gains 20 and 21 (D8).
- **FR-017**: **JSDoc** on:
  - `Connection` (`types.ts`): the "escapes" sentence is replaced by the enforced rule;
  - `register`: its lifecycle paragraph (D6), and `@throws` (FR-005);
  - `subscribe`: `@throws {ConnectionNotRegisteredError}`, raised at the pre-site and always before
    the authorizer, and `@throws {ConnectionIdInUseError}` widened;
  - `#assertAdmissible` and `#assertBound`;
  - the three error classes;
  - the `ChannelManager` class `@example` (D7);
  - `disconnect`'s paragraph naming `ConnectionIdInUseError` "while the teardown runs", which now
    reads "for any holder".
- **FR-018**: **ADR 010 is amended**, as its header reserves:
  - **the header**: "Amended by" names #370 and #363 with the date, and **Affects** keeps its list;
  - **a new §7, "Amendment — `register` is the only way in"**, recording:
    - the owner rule;
    - clause 2 widened;
    - `#assertBound` and its order;
    - the third class and why it has no base;
    - the rejected options with their costs (§5 row 13);
    - what this does not solve;
  - **§4's "Making `register` mandatory" bullet** gains a closing line saying that #370 reverses it,
    and why its objection no longer holds (D4). The original text is kept, because the ADR is
    history;
  - **§5**: bullets 1–3 are marked **resolved by #370 / #363**; bullets 4–7 are unchanged;
  - **§6's standing constraint** gains: "`register` is the only writer of `connections`; never
    re-add a binding in `subscribe` or anywhere else."
- **FR-019**: **`packages/realtime/README.md`**: the "A disconnected connection is refused at
  admission" bullet (`:131–137`) keeps its first sentence. Its `ConnectionIdInUseError` sentence
  widens, and it gains one sentence: `subscribe` requires `register`
  (`ConnectionNotRegisteredError`), with a link to item 20. The README gets no second bullet.
- **FR-020**: **`packages/realtime/AGENTS.md`**:
  - `ConnectionNotRegisteredError` joins the *Public surface* class row (`:56`);
  - the pitfall "**Retirement is never an ownership reader's business**" (`:603–611`) gains the
    owner rule: `register` is the only writer of `connections`. The things never to do:
    - re-add a `connections.set` elsewhere;
    - narrow clause 2 back to the retired set;
    - call `#assertAdmissible` from `subscribe`, or `#assertBound` from `register`;
  - its witness and battery lists gain the #370 files;
  - the *Tests* list is regenerated with `deno task agents:brief`.
- **FR-021**: **No `CHANGELOG` file.** The GitHub Release is the only changelog since #364, and its
  notes are generated from items 20 and 21. None is created.

## 4. Success criteria

- **SC-001**: A connection the app never registered can hold nothing: no membership, cap slot,
  anonymous share, broker watch, roster entry or count, whatever its authorizer or socket does.
- **SC-002**: A connection receives a private or presence frame only for a channel its **own**
  object's subscribe was authorized for. A second object presenting a live id receives nothing.
- **SC-003**: Closing one socket never tears down another socket's state.
- **SC-004**: A refused call has no side effect, and a refusal at the pre-site runs no authorizer.
- **SC-005**: Apps on `handlerHooks` with framework ids see no behaviour change: the full suite is
  green after migration, and no migrated assertion is weakened.
- **SC-006**: An app that must change learns what to do from one upgrade item, each with a
  before/after.

**Witnesses** (FR-013), in `tests/register_only_admission_370.test.ts`. "Red" means it fails on
`main` at `150755df`.

| # | Setup → assertion |
| :--- | :--- |
| W1 (red), #370's S1 | App never registers. `subscribe(c1, 'private-x')` with a **gated** spy authorizer; `disconnect('c1')` → `'not-owned'`; then the gate is opened. The subscribe rejects with **`ConnectionNotRegisteredError`**, and the authorizer was **called 0 times**. After settle: `connections`, `#channelsByClient`, `subscriptions` and the roster name `c1` nowhere; `connectionCount === 0`; the driver never watched `private-x`; with `maxWatchedChannels: 2`, a registered `c2` then takes two fresh channels without `ChannelLimitError` |
| W2 (red), public + anonymous | `maxWatchedChannels: 2`, `anonymousHostingShare: 0.5`. Unregistered anonymous `a`: `subscribe(a, 'news')` throws `ConnectionNotRegisteredError`; no watch of `news`; a registered anonymous `b` then gets `{ ok: true }` on `feed` (the share is unspent); `connectionCount === 1` |
| W3 (red), fresh object per call | `register(conn('c1'))`, then `subscribe(conn('c1'), 'private-x')`, a **different** object: it throws `ConnectionIdInUseError`, and the spy authorizer is called 0 times |
| W4 (red), #363 no unauthorized delivery | Live A (`c1`, identity alice) holds `private-x` and presence `ROOM`, with observer `o` in `ROOM`. B (`c1`, identity mallory): `register(B)`, `subscribe(B, 'private-x')` and `subscribe(B, ROOM)` each throw `ConnectionIdInUseError`, with the authorizer called 0 times for B, and the message not containing `disconnect`. `connections.get('c1') === A`. `broadcast('private-x', …)` and a presence change by `o` reach B with **no** frame; A receives both (the positive control) |
| W5 (red), #363 no cross-teardown | After W4: `disconnect('c1')` → `'disconnected'`, and A is torn down. B was never admitted, and `connectionCount === 0`. Then `register(B)` succeeds, and B's own authorized `subscribe(B, 'private-x')` receives the next broadcast (the positive control) |
| W6 (pin), same object | `register(A)` twice → no throw, `connectionCount === 1`; A's memberships are intact and it still receives. Green before and after |
| W7 (red), `handlerHooks` with a reused id | A custom transport drives `manager.handlerHooks({ onOpen: spy })`: `onOpen(A)`, then `onOpen(B)` with A's id. B's `close` is called with `(1011, 'unusable connection id')`; the open rejects with `ConnectionIdInUseError`; `spy` was called once (for A); A is still in `connections` and still receives |
| W8 (red), the registered identity is the authorized one | Live A (identity alice) holds nothing. B (`c1`, identity mallory) subscribes `private-x` with an authorizer that admits only mallory: it throws `ConnectionIdInUseError`, and the authorizer never saw mallory. On `main`, B is admitted and A's binding is replaced |
| W9 (pin), precedence of clause 1 | `register(A)`, `await disconnect('c1')` (the id is now unbound), then `subscribe(A, 'news')` throws **`ConnectionDisconnectedError`**, not `ConnectionNotRegisteredError`. Green before and after (#361 W4 (i)'s shape, restated for #370's order) |
| W10 (pin), the post-site before the caps | `maxWatchedChannels: 1`, filled by a registered `c2`. Registered `c1`'s `subscribe(c1, 'private-y')` waits on a gated authorizer; `await disconnect('c1')`; admit → `ConnectionDisconnectedError`, **not** `ChannelLimitError`. Green before and after |
| — | Every existing realtime test is green after FR-014's migration, with no assertion weakened. `#361` W8 (a different object during a teardown) stays green unmodified |

**Mutants** (FR-015), battery `tests/mutations/register_only_admission_370.ts`, each proven live:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| M1 | `#assertBound`'s unregistered throw removed (the body becomes `#assertAdmissible` alone) | W1 (the authorizer call count), W2 |
| M2 | the pre-site calls `#assertAdmissible` instead of `#assertBound` | W1 (the authorizer was called) |
| M3 | clause 2 narrowed back to `bound !== undefined && this.#retired.has(bound)` | W4, W3 |
| M4 | clause 2 removed from `#assertAdmissible` | W4 |
| M5 | clause 2 over-widened to `bound !== undefined` (the same object refused) | W6 |
| M6 | clause 1 removed from `#assertAdmissible` | `#361` W5 (`register` of a retired object after its teardown now succeeds) |
| M7 | `#assertBound` asks the binding before `#assertAdmissible` | W9 |
| M8 (`expectSurvival`) | the post-site calls `#assertAdmissible` instead of `#assertBound` | `'(none — equivalent)'`. Reason: *the unregistered clause is unreachable after the authorizer. At the pre-site, the id was bound to this object. Only `disconnect` deletes from `connections`, and it retires the bound object first, so clause 1 fires; another object registered after the teardown trips clause 2.* |
| M9 (`expectSurvival`) | `subscribe`'s `this.connections.set(connection.id, connection)` restored after `#checkChannelCaps` (#370's own AC mutant) | `'(none — equivalent)'`. Reason: *past the post-site, `#assertBound` proved `connections.get(id) === connection`, so the write rewrites the same value. It becomes observable only if M1, M2 or M8's premise breaks.* |

`register`'s own check (`#361` N5) and the split of the two classes (`#361` N9) keep their #361 rows.

**Re-anchor and repair list.** This was counted on `main` at `150755df`. Every battery under
`tests/mutations/` (38) was covered:

- 34 were dumped with a stub harness;
- `presence_member_frozen_354`, `live_conformance_285`, `self_skip_310` and `sweep_parse_316` were
  read by hand. None anchors near an edit site.

Each anchor was located in `manager.ts`, `types.ts` and `mod.ts`. *Adjacent rows: **18 in 8
batteries**.*

- **Re-anchored, because the anchor includes the deleted `connections.set` (5):**
  - `authorize_result_347` M7 ("the caps and the `connections` write moved ahead of the
    classification"): its from and to become the `#checkChannelCaps(…)` block alone. The label drops
    "and the `connections` write".
  - `authorize_result_357` M5 ("the private admission below `#checkChannelCaps` / `connections.set`"):
    its third edit anchors on `connection.identity !== null,\n        )\n` plus the blank line and
    `// \`member\` is set`.
  - `presence_member_admission_350` M10: the same re-anchor.
  - `manager_debt_353` M1 ("the member invariant back BELOW `connections.set`"): it is re-anchored
    below `#checkChannelCaps`, and its label is updated. Its killer ("whatever a presence subscribe
    throws") is unchanged, because the mutant forces the invariant to fire.
  - `disconnect_admission_361` N4 ("the post-check moved below `connections.set`"): **both** anchors
    are gone (D3). It is rewritten as "the post-site moved below `#checkChannelCaps`", killed by
    **W10**.
- **Re-anchored, because the subscribe call becomes `#assertBound` (3):** `disconnect_admission_361`
  N1, N2 and N10. Their from and to strings change only the method name, and their killers are
  unchanged: `#361` W1, W4 and W3 (ii). They are re-proven live: after migration, W1 and W4
  register first (D3).
- **Re-anchored, because clause 2's text changes (1):** `disconnect_admission_361` N8. The new
  anchor is `if (bound !== undefined && bound !== connection) {` plus its `throw`. It is still
  killed by `#361` W8.
- **Re-verified (1):** `disconnect_admission_361` N9. `throw new ConnectionIdInUseError(connection.id)`
  still occurs once, and W8 still expects that class during a teardown.
- **Unchanged (8):**
  - `authorize_result_357` M1 and M7;
  - `presence_member_306`;
  - `channel_name_314` ×2, which end at `const kind` and precede the pre-site;
  - `connection_id_304`'s `register()` guard, since `register` is unchanged, and its `subscribe()`
    guard;
  - `disconnect_admission_361` N5, since `register`'s first two lines are unchanged.
- **Not adjacent (3):** `connection_id_304` ×2 on `onOpen`'s close line (D5) and `#361` N12 on
  `onClose`.

**Tests to migrate** (FR-014). The probe measured these failures per file at `150755df`, 449 in
44 files (`.test.ts` omitted):

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

`driver_redis_live` has tests that run without a broker, and its broker-only tests are migrated the
same way, then run under the live gate.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| 1. **One owner object per id; `register` is the only writer of a binding** | `register`, `packages/realtime/manager.ts` (the one `connections.set`) | `subscribe`'s `connections.set` restored; a lazy register in `handlerHooks.onMessage` or `websocket.ts`; an "upsert" helper; a set inside `#joinLocal` / `#joinPresence` |
| 2. **What admissible means**: not retired (clause 1), and no *different* object bound under the id, live or retiring (clause 2, `bound !== undefined && bound !== connection`) | `#assertAdmissible`, `packages/realtime/manager.ts`, still the only reader of `#retired` | `#retired` read anywhere else; clause 2 split into a live and a retiring clause; an inline `bound === connection` in `register` or `subscribe`; an id-keyed tombstone or generation |
| 3. **What bound means for `subscribe`**: admissible, **then** registered | `#assertBound`, `packages/realtime/manager.ts` (delegates to `#assertAdmissible`, adds one question) | `connections.has` inlined in `subscribe`; the registration test inside `#assertAdmissible` (which would make `register` refuse itself); a check in `#checkChannelCaps`, `#joinLocal` or `websocket.ts`; the order reversed |
| 4. **Who asks what**: `register` asks `#assertAdmissible` (first statement); `subscribe` asks `#assertBound` at the pre-site (after `const kind`) and at the post-site (after the #347 invariant) | the three call sites, `packages/realtime/manager.ts` (three askers, two layered deciders) | `register` calling `#assertBound`; `subscribe` calling `#assertAdmissible` at either site; a fourth site in `unsubscribe`, `evict` or `deliverLocal`; a post-site below `#checkChannelCaps` |
| 5. **Same-object re-registration is a no-op** | clause 2's `bound !== connection`, `packages/realtime/manager.ts` | an early `return` in `register`; an "already registered" error; an id comparison instead of an object comparison |
| 6. **Three refusal classes, one per remediation, no shared base**: `ConnectionDisconnectedError` (drop the frame), `ConnectionIdInUseError` (mint a fresh id per socket), `ConnectionNotRegisteredError` (register at open) | the three classes in `packages/realtime/manager.ts`, exported from `packages/realtime/mod.ts`; the choice in `#assertAdmissible` / `#assertBound` | a `ConnectionAdmissionError` base; one class with a `reason` field; reusing `ConnectionIdError`; `{ ok: false }` or a `SubscribeResult` field; a class in `websocket.ts`; a message carrying the raw id |
| 7. **Precedence**: id and channel defects first; the admission refusal before the authorizer; the post-site below the deny `return` and every result check, and above the caps; clause 1 before the registration test | `subscribe`'s statement order and `#assertBound`'s body, `packages/realtime/manager.ts` | a post-site above the deny `return`; a caps check above the post-site; `NotRegistered` raised for a retired object; the id assertion moved below the pre-site |
| 8. **A refusal writes nothing and undoes nothing** | `subscribe`'s statement order, `packages/realtime/manager.ts` | refuse-and-undo; a check after a write; an `unsubscribe` from `subscribe` |
| 9. **The transport lifecycle duties are enforced, and stated once**: duty 1 by `ConnectionNotRegisteredError`, duty 2 by `ConnectionIdInUseError` / `ConnectionDisconnectedError` | user-facing statement: `docs/realtime.md` § *Your connection ids and your transport's lifecycle*; same-object duty: the `Connection` JSDoc, `packages/realtime/types.ts`; open-hook duty: `register`'s JSDoc | the duties restated in items 20 and 21, the README or `AGENTS.md`; a surviving "escapes it" sentence anywhere (D6) |
| 10. **`handlerHooks.onOpen` answers any `register` refusal with `1011 'unusable connection id'`, skips the app's `onOpen`, and re-throws** | `handlerHooks.onOpen`, `packages/realtime/manager.ts` (unchanged) | a catch that distinguishes `ConnectionIdInUseError`; a retry that disconnects the holder (the rejected #363(b)); a new close reason (D5) |
| 11. **What an app does about each refusal** | items 20 and 21 (plus item 17's corrected bullet), `docs/realtime.md` | a `CHANGELOG` file (none exists, FR-021); guidance restated beyond one README bullet; a wrapper that swallows a refusal |
| 12. **Why `register`-only admission is right now, and what it does not solve** | ADR 010 §7 (the amendment), `docs/adr/010-realtime-disconnect-retires-the-connection-object.md`, with §4's reversed bullet pointing to it | the rationale kept only in this plan, or restated in `AGENTS.md` |
| 13. **Rejected options, with their costs**: (a) #370(b), implicit registration under the same checks: `disconnect` of a never-registered id has no object to retire, so it needs an id tombstone, which ADR 010 §4 rejects, and it keeps two entry points; (b) #370(c), deprecate first: keeps an availability hole open in a published package that v0.4.0 already breaks; (c) #363(b), last registration wins: forces an async `register`, and lets anyone who knows a stable id kill that socket; (d) a no-op old `disconnect`: B still receives A's channels; (e) `subscribe(id, channel)`: replaces an unforgeable object with a forgeable string | ADR 010 §7, `docs/adr/010-realtime-disconnect-retires-the-connection-object.md` | the list restated in `docs/realtime.md` or `AGENTS.md` |
| 14. **The post-site's unregistered clause is unreachable; restoring `subscribe`'s write is equivalent** | M8's and M9's `expectSurvival` reasons, `packages/realtime/tests/mutations/register_only_admission_370.ts` | a witness pretending to reach either; the reason restated in the test file; the rows deleted |
| 15. **Test fixture shape**: one object per socket, registered where it is built, reused for every call | each migrated test file's own factory (no shared module) | a new shared `conn` helper for 35 different shapes; a manager test-mode flag that re-enables implicit registration; a weakened assertion |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary Dependencies**: `@lockness/realtime` only; no
new import · **Storage**: none; no new state (the `WeakSet` and `connections` are #361's) ·
**Testing**: `deno test`; `MemoryBroadcastDriver` with a spy and gated authorizer; `handlerHooks`
driven directly for W7; the shared mutation harness · **Target**: server library · **Project
type**: framework package · **Performance**: per `subscribe`, one extra `Map.has` per site (two);
one less `Map.set`; no retained memory · **Constraints**: no wire, driver-port, control-frame or
option change. One new public error class and one widened message. A breaking change on the
unregistered path, accepted by the maintainer's standing instruction · **Scale**: unchanged.

### Domain model

- **Bounded context**: realtime (`ChannelManager`'s connection lifecycle and channel admission).
- **Vocabulary**:
  - **binding**: the `connections` entry that maps an id to one object;
  - **owner**: the one object bound under an id;
  - **registered**: bound by `register`, the only writer;
  - **admissible**: not retired, and no different object bound under its id;
  - **bound**, for `subscribe`: admissible and registered — the presented object is the owner;
  - **retired** (#361), **owned** (present in `connections`), **zombie** (a binding no disconnect
    will reach);
  - **takeover**: a different object replacing a live binding. It can no longer happen.
- **Entities**:
  - `ChannelManager`, the aggregate root: it owns `connections`, `subscriptions`,
    `#channelsByClient`, `presence`, the caps and `#retired`;
  - `Connection`: identified by its object for admission and retirement, and by its id for
    ownership and delivery.
- **Value objects**: the three refusals `ConnectionDisconnectedError(id)`,
  `ConnectionIdInUseError(id)` and `ConnectionNotRegisteredError(id)`. They are lifecycle
  refusals, never denials.
- **Invariants**:
  - every binding in `connections` was written by `register`;
  - an id has at most one owner object, and a different object is refused while the owner is bound;
  - every membership names an id whose owner's own subscribe was authorized, so the authorized
    identity is always the registered socket's;
  - a refusal lands before any write;
  - ownership is read only from `connections`, and `#retired` only through `#assertAdmissible`.
- **Out of scope**:
  - `websocket.ts`;
  - driver contracts;
  - revocation (#359, #362);
  - the ADR 010 §5 bullets 4–7;
  - cross-instance id collision;
  - id reuse after teardown.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | the new class takes `id: string` |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | per task, plus `deno task mutate realtime` |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-004, FR-011 and FR-017 list every block |
| MVC layering | pass | not applicable (library aggregate) |
| Commit discipline | pass | test (red witnesses) / fix (`manager.ts`, `mod.ts`, `types.ts` JSDoc) / test (suite migration) / test (battery and re-anchors) / docs (ADR 010, `realtime.md`, README, `AGENTS.md`) |
| No environment detail in versioned files | pass | none |
| Design decisions go to architect-expert | pass | the 2026-09-25 disposition is binding |
| Act, don't recommend | pass | residue is named in §9, and filed where it is new |
| TDD, red first | pass | W1–W5, W7 and W8 are red on `main`; W6, W9 and W10 are pins |
| No silent catches | pass | no catch is added; `handlerHooks.onOpen` re-throws, as today |
| Domain Model gate | pass | §6 |
| #323 synchronous turn | pass | the post-site adds no await |
| #331: a denial never revokes, and a refusal is not a denial | pass | FR-007 |

### Complexity tracking

No violation. Added:

- one private method;
- one exported error class;
- one widened clause;
- one deleted line;
- two call-site renames;
- one ADR amendment.

The migration is large (449 tests in 44 files) but mechanical. It is the compatibility cost the
maintainer accepted. The rejected alternatives are row 13.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | yes, **breaking** | new export `ConnectionNotRegisteredError`. `subscribe` on an unregistered object throws it, where it used to register implicitly. `register` and `subscribe` throw `ConnectionIdInUseError` for a different object under a **live** id, where they used to take it over. `ConnectionIdInUseError`'s message widens |
| `handlerHooks` | behaviour only for a custom transport that reuses ids | `onOpen` closes that socket with `1011` and re-throws; the code is unchanged |
| `connectionCount` | yes | counts only registered connections, never an implicit or zombie binding |
| `Connection` contract (`types.ts`) | doc | the same-object duty is now enforced, not only stated |
| Driver ports, wire, control plane, options, `websocket.ts` | no | — |
| Revocation, delivery, ownership readers | no | read `connections` byte for byte |
| Tests | yes | new witness file and battery; 449 tests in 44 files migrated; 9 rows re-anchored, 1 re-verified |
| Docs | yes | ADR 010 amended (header, §4, §5, §6, new §7); `docs/realtime.md` (items 20 and 21, item 17's bullet, the lifecycle section, the two examples, the preamble); README bullet; `AGENTS.md` (the class row, the pitfall, the generated tests list); JSDoc |

### Documentation (this feature)

```text
.specnaut/specs/270-register-only-admission/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| The migration weakens an assertion to get green, and hides a regression | FR-014 forbids it. A test whose premise was implicit registration is rewritten to the new outcome and listed by name. The review diffs assertions, not only fixtures |
| The probe's list goes stale before implement | FR-014 re-runs the probe on the implementation branch first. The list is a measurement |
| A re-anchor lands off its line and a 347, 350, 353, 357 or 361 row goes `DEAD` or changes meaning | §4 fixes every re-anchor; `deno task mutate realtime` is in the gate |
| A new comment quotes an anchor line | FR-012; the harness reports `DEAD` |
| An app on a custom transport keyed by user id breaks on reconnect | Intended: it was the takeover. Item 21 says to mint per socket, or wait for the old close |
| An app that never called `register` breaks on its first subscribe | Intended, and loud: the error names the fix. Item 20 names `handlerHooks` as the zero-work path |
| Someone re-adds a binding outside `register` to "fix" a failing test | Row 1; the `AGENTS.md` pitfall; ADR 010 §6; `grep -n 'connections.set'` finds exactly one line (FR-001) |
| **Residue:** a registered socket that is never disconnected still leaks its binding | The transport's duty 3; unchanged since #361 |
| **Residue:** an id can be reused once its teardown completes | By design. The `Connection.id` contract forbids it; an object-keyed rule retains nothing after teardown (ADR 010 §4) |
| **Residue:** a cross-instance id collision is not detected | Out of scope. Each manager owns its own bindings; ids are minted per socket |
| **Residue:** ADR 010 §5 bullets 4–7 (the #323 compensation's reclaim, a failed roster release, a failed unwatch, and #369, already resolved) | Unchanged, as filed |

## 10. Architecture audit

*Placeholder. The `architect-expert` run against this document is dispatched separately, before any
code.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | _pending_ | _pending_ |

**Verdict**: _pending._

## 11. Security audit

*Placeholder. The `security-expert` run against this document is dispatched separately, in
parallel. It is kept separate on purpose.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | _pending_ | _pending_ |

**Verdict**: _pending._

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Accept the compatibility cost (a mandatory `register`; a live id refused)? | Yes. It is the maintainer's standing instruction: take the strictest security option, and accept the compatibility cost | 2026-09-25 |
| Any other product question? | None. Every remaining choice changes how, not what, and the disposition settled it | 2026-09-25 |
| Approve the architecture as audited (tasks → implement → review)? | _Asked at stop 1, once §10 and §11 are folded._ | — |

### Decided without asking

- The design is the 2026-09-25 `architect-expert` disposition, posted on #370 and #363.
- **D5:** the `1011` close reason stays `'unusable connection id'` for every `register` refusal.
  Two rows anchor on it, and a new reason would be new vocabulary visible to the client.
- The new files are named for #370 (`register_only_admission_370.*`), because #370 is the item that
  removes the second writer; #363's witnesses (W4, W5, W7, W8) live beside them. Test names start
  `#370 W<n> `.
- M8 and M9 are `expectSurvival` rows with the #341 sentinel, not omitted: an equivalence is
  recorded, not assumed.
- `#361` N4 is rewritten, not deleted, and W10 is added to kill it. The order it pinned (refuse
  before anything else counts) still matters, against the caps.
- The migration keeps each file's own factory. The 35 `conn` factories differ in shape, and a shared
  module would be a second home for fixture behaviour.
- `ConnectionIdInUseError` keeps its name. Its meaning widens from "retiring holder" to "any
  holder"; the class was always "a different object presented this id".
- ADR 010 §4's reversed bullet keeps its original text, with a closing line, because the ADR is
  history.
- No `CHANGELOG` file (FR-021).
