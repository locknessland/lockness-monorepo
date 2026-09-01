# Tasks: RESP arguments length-prefixed in UTF-8 bytes

**Input**: `.specnaut/specs/007-resp-byte-length/plan.md` (the only design document).
**Branch**: `007-resp-byte-length` | **Backlog**: [#141](https://github.com/locknessland/lockness-monorepo/issues/141)

**Tests**: included and written first — the plan's methodology check requires TDD, and the whole
risk of this feature (plan §9) is test falsifiability, so the tests are the deliverable as much as
the encoder is.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different file, no dependency on an incomplete task).
- **[Story]**: US1–US4 from plan §2. Setup / Foundational / Polish carry no story label.

## 🔒 Decision-table homes carried forward (plan §5)

Every task below that touches one of these names it, and may not spell the decision anywhere else:

| Decision | Home |
| :--- | :--- |
| Bytes an argument occupies on the wire | `packages/session/drivers/resp.ts` — `encodeCommand` |
| A frame is fully on the wire before a reply is read | `packages/session/drivers/resp.ts` — `writeFrame` |
| A failed partial write discards the connection | `packages/session/drivers/redis.ts` — the `sendCommand` catch (FR-004a) |
| Argument content is never inspected/escaped | `resp.ts` — documented on `encodeCommand`, pinned by a test |
| What a conforming frame looks like, per a test | `packages/session/tests/resp_server.ts` — one verifying fake |
| What `@lockness/session` exports | `packages/session/mod.ts` — unchanged; nothing new re-exported |
| Reply read + parse | `redis.ts` `sendCommand`/`parseResponse` — **untouched here** (#139's) |

---

## Phase 1: Setup

- [ ] T001 [P] Create `packages/session/drivers/resp.ts` with `@fileoverview`/`@module`, and the two exported signatures as stubs that `throw new Error('unimplemented')`: `encodeCommand(args: string[]): Uint8Array` and `writeFrame(conn: Deno.Conn, frame: Uint8Array): Promise<void>`. Full JSDoc, including the FR-005 non-rule on `encodeCommand` (content is never inspected or escaped). No re-export from `mod.ts` (FR-006).

## Phase 2: Foundational — the shared test oracle (blocks US1, US2, US3)

- [ ] T002 Create `packages/session/tests/resp_server.ts`: a fake RESP server on `Deno.listen({ hostname: '127.0.0.1', port: 0 })` that (a) captures the exact bytes received, (b) parses multibulk frames **by the declared bulk length**, verifying each `$N` against the bytes it consumes, (c) counts how many complete commands it parsed, (d) reports any trailing unparsed bytes, and (e) can reply with a scripted line (`+OK\r\n`). It closes its listener and every accepted conn in a `finally`. This is the one oracle for FR-008/FR-009 (plan §5 row 6); it MUST assert on bytes-and-commands, never re-derive Redis semantics, and MUST NOT import `encodeCommand`.

## Phase 3: US1 — a non-ASCII session value round-trips (P1)

**Independent test:** a value containing `é` writes and reads back intact, one command → one reply.

- [ ] T003 [US1] In `packages/session/tests/resp.test.ts`, write the FR-007 unit test: drive `['SETEX', 'session:'+'a'.repeat(56), '3600', JSON.stringify({name:'Renée'})]` through `encodeCommand` and assert the **exact byte array** — written as a literal, never derived from the encoder (plan §5 row 6). Include the `$17` bulk length for the 17-byte / 16-unit value. Run it; it fails against the T001 stub. Record the failure.
- [ ] T004 [US1] Implement `encodeCommand` in `packages/session/drivers/resp.ts`: assemble the frame from `Uint8Array` chunks, each `$N` = `TextEncoder().encode(arg).byteLength` (FR-001/FR-002/FR-003). No string carries argument data; no `string.length` is a wire length. T003 now passes.
- [ ] T005 [US1] Route `redis.ts:74-79`'s `sendCommand` frame-building through `encodeCommand` (replace the string concat). Leave `parseResponse` and the reply read (`:82-87`) untouched (plan §5 row 5 / row "Reply read + parse"). `deno check` the file.
- [ ] T006 [P] [US1] In `resp.test.ts`, an edge test: the empty-string argument encodes to `$0\r\n\r\n`, and a surrogate-pair (`🔒`, 2 units / 4 bytes) encodes with `$4`. Literals, not derived.

## Phase 4: US2 — a non-ASCII AUTH password connects (P1)

**Independent test:** a driver with a non-ASCII password connects to the verifying fake and the AUTH frame's declared length equals the bytes sent.

- [ ] T007 [US2] In `packages/session/tests/redis_wire.test.ts`, stand up the T002 fake, construct `RedisSessionDriver({ hostname, port, password: 'pÿ' })`, trigger a command (which forces `connect()` → AUTH), and assert the fake accepted the AUTH frame with `$N` == bytes received and parsed exactly one command. It fails today (the current encoder under-declares). Record the failure, then confirm T004+T005 make it pass.

## Phase 5: US3 — the injection frame no longer injects (P1)

**Independent test:** the live-Redis payload, driven through the fixed driver, is parsed as exactly one command with no leftover.

- [ ] T008 [US3] In `redis_wire.test.ts`, write a session value carrying the injection payload (`'é'.repeat(13) + 'SET pwned 1'` shape, adapted for the JSON value path), drive it through `driver.write(...)` against the T002 fake, and assert the fake parsed **exactly one** command **and consumed the frame to its last byte, with no trailing unparsed bytes** (FR-009). Negative-check it against the pre-fix encoder in the same test file (a helper that builds the broken frame) and assert the fake reports a second, injected command there — proving the test can tell the two apart.

## Phase 6: US4 — the fix cannot silently regress (P2)

- [ ] T009 [US4] Implement `writeFrame` in `resp.ts`: loop `conn.write(frame.subarray(offset))` until the whole frame is written; a write returning 0 raises (FR-004, no infinite loop). Route `redis.ts:79`'s single `conn.write` through it (the only `.write(` on a `Deno.Conn` in the package).
- [ ] T010 [US4] Implement FR-004a in `redis.ts` `sendCommand`: on any write failure after partial progress, set `this.connection = null` before rethrowing, so no later command inherits a desynced socket. Do NOT add a `catch { return null }` swallow — that stays #139's to remove. Add a test in `redis_wire.test.ts` using a fake that accepts N bytes then drops: assert the error propagates and the next `sendCommand` reconnects.
- [ ] T011 [US4] Execute SC-004: apply the mutation `byteLength → String.length` in `resp.ts`, run the suite, and confirm **every** test from T003, T007 and T008 fails. Record each failing test name and its output in a comment block at the top of `resp.test.ts`. Revert the mutation. Any test that stayed green is rewritten, not weakened.

## Phase 7: Polish & cross-cutting

- [ ] T012 [P] Run the full gate: `deno fmt && deno lint && deno check packages/session/**/*.ts && deno task test`. All green.
- [ ] T013 [P] Run `deno task deps:analyze` and confirm **no new package edge** for `session` (plan §7 rule 2) and that `deno.lock` is unchanged (rule 6).
- [ ] T014 [P] Run `deno task agents:brief` and confirm `packages/session/AGENTS.md`'s public-surface table is **byte-identical** — `encodeCommand`/`writeFrame` must not appear (FR-006/FR-011, SC-005). If the brief drifts, the surface leaked; fix the leak, don't accept the drift.
- [ ] T015 Invoke `review` on the frozen tree.

---

## Dependencies

```
T001 ─┬─ T002 ─┬─ US1 (T003→T004→T005, T006∥)
      │        ├─ US2 (T007, after T004+T005)
      │        └─ US3 (T008, after T004+T005)
      └──────────── US4 (T009→T010→T011, after US1)
                         └─ Polish (T012‥T015)
```

- **T002 blocks every driver-level test** (US2, US3, US4-T010) — it is the oracle.
- **T004+T005 (the encoder + wiring)** are the prerequisite for US2 and US3 passing.
- **T011 (the mutation gate) runs last of the story work** — it needs T003/T007/T008 present.

## Parallel opportunities

- T001 and T002 skeletons are independent files.
- T006, T012, T013, T014 are `[P]` — different files / read-only checks.

## MVP

**US1 (T001–T005)** is the checkpoint that closes the P0 for the common case — a non-ASCII session
value stops desyncing the connection. US2/US3 close the AUTH-password and injection vectors; US4 is
what proves the whole thing can fail. Ship the full path — the size was known at the plan stop.
