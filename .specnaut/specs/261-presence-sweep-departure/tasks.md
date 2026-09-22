# Tasks: announce a crashed instance's swept presence members as left

**Plan**: `.specnaut/specs/261-presence-sweep-departure/plan.md` (approved 2026-09-23) | **Backlog item**:
[#348 — Realtime: a crashed instance's swept presence members are never announced as left](https://github.com/locknessland/lockness-monorepo/issues/348)

TDD is mandatory (constitution): every behaviour task starts with a witness proven red on the
current code. Every task that touches a rule in the plan's 🔒 decision table names that rule's home —
the decision may not land anywhere else. Witness and mutant ids are the disposition's (W1–W7,
M1–M7) plus the plan audits' (W8, M8–M10).

## Phase 1: Setup — test infrastructure

- [X] T001 [P] Serializing command wrapper for FakeRedis in `packages/realtime/tests/fake_redis.ts` (or a sibling helper): a `CommandFn` that chains every command on one tail exactly as `RedisClient`'s `commandTail` does (`packages/redis/client.ts:257-262`), with a gate that can hold a command in flight. Row in `fake_redis_conformance.test.ts`: two commands issued back to back complete in issue order, and the second does not start until the first settles.

## Phase 2: Foundational — witnesses red, then the seam

- [X] T002 Witnesses in `packages/realtime/tests/presence_sweep_departure_348.test.ts` (FakeRedis), each red ones proven red on the current tree first (save the red run to the scratchpad):
  - W1 (**red**): two managers, member 7 held only on A, observer on B; A's driver closes without releasing, liveness lapses, B reconciles → the observer receives exactly one `left`, member = A's last entry; B's bus carries exactly one `presence-leave`.
  - W2 (guard): 7 on A and B, A swept → zero `left`, zero `presence-leave`.
  - W3 (**red**): three managers, B and C both sweep A (precondition: at least two `SMEMBERS` of A's owned set, as #345 W4) → each observer exactly one `left`.
  - W4 (guard): a driver without `onRosterDeparture` builds, sweep stays silent; a driver with the method but a manager with no roster never registers (spy).
  - W5 (**red**): A lapses while alive and is swept → one `left`; A's later release sends nothing; A's next hold sends one `joined`.
  - W6 (guard): an ordinary leave → one `left`; the departure handler is never called.
  - W7 (guard): each of — a throwing handler; an unparseable entry; an entry whose member id is not its slot (A2/S1); an owned entry whose channel fails `isValidName` (S1) → exactly one WARN naming the channel only, no frame, the sweep continues to the next entry, the release stays committed. The WARN text never contains the entry bytes or the member id (S2 sentinel).
  - W8 (guard, A1): on the T001 wrapper, B holds 7 while the sweep's release of A's 7 is in flight so the hold commits after it → B's observer receives `left` then `joined`; the bus carries `presence-leave` before `presence-join`. Record what 7's own connection on B receives in a comment citing #349.
  - Manager-side drop (S3): a fake driver calling the handler with a bad channel, a `null` id, or an array `info` → one WARN, no emit, no publish, never throws.
- [X] T003 The seam in `packages/realtime/driver.ts` (home of the seam's shape and the handler lifecycle contract): `RosterDeparture { readonly channel: string; readonly member: PresenceMember }` and `onRosterDeparture?(handler): void` on `BroadcastDriver`, full JSDoc + `@example`: called only for a slot the driver emptied while releasing another process's hold; never for `releaseMember`; one handler, replaced on re-registration, dropped by `close()`. Amend `ControlMessage.target` JSDoc (home of what `target` means): acted on only for `evict` / `revoke-channel`, informational on `presence-join` / `presence-leave` (A3, S4). Export `RosterDeparture` from `packages/realtime/mod.ts`.

## Phase 3: US1 + US2 + US3 — the release reply and the sweep (P1)

- [X] T004 [US1] `packages/realtime/drivers/redis.ts`: `RELEASE_MEMBER_SCRIPT` (home of "gone, and which entry left") — the `n == 0` branch's `return 1` becomes `return mine`; key legend JSDoc updated. New `decodeReleaseReply(reply): string | undefined` beside the hold decoder (home of the reply's meaning): `0` → `undefined`, non-empty bulk → entry, everything else throws. `decodeTransitionReply` → `decodeHoldReply(reply)`, `script` parameter removed, JSDoc hold-only (A7). FR-004a rows in `roster_holders_345.test.ts`: release decoder rejects integer 1, nil, array, empty bulk; update its release-message assertion.
- [X] T005 [US1] `#release` returns `Promise<string | undefined>`; `releaseMember` maps to `{ gone: released !== undefined }` and never touches the handler (FR-003). `#release` @returns and `releaseMember` @throws JSDoc updated.
- [X] T006 [US1] `packages/realtime/drivers/redis.ts` `#parseRosterValue` catch: fixed-reason WARN (`not valid JSON`) instead of `renderError(error)` (S2, home of "a decode failure never logs entry bytes"). Row: a malformed entry's bytes never appear in the WARN on the `readRoster` path too.
- [X] T007 [US1] [US2] [US3] `#sweepInstance` in `packages/realtime/drivers/redis.ts` (the only caller of the handler; home of "a departure names the slot it emptied, on a valid channel"): keep the reply as `released` (not `entry` — `sweep_parse_316` anchors); for each: drop with one WARN (channel only) if the owned-entry channel fails `isValidName`, if `#parseRosterValue` yields nothing, or if `!sameMemberId(member.id, field)`; otherwise call the handler with **no I/O await in between**, await it, contain a throw as one WARN (channel only). `onRosterDeparture` stores one handler (replaced on re-registration), `close()` drops it (the `onRevocationReconcile` precedent). JSDoc: "Its return is ignored — a sweep announces nothing (#348)" rewritten. `RedisCommandClient` JSDoc states one exchange in flight at a time (FR-007b).
- [X] T008 [US1] `packages/realtime/manager.ts`: `#announcePresence(action, channel, member, target: string)` — `origin: PresenceOrigin` → `target`; its two existing callers pass `origin.clientId`; JSDoc "called only from `#syncRosterMember`" → names the departure handler as the second caller. Constructor registers `this.driver.onRosterDeparture?.(…)` **only when `roster` is defined**; the handler (home of "a reported departure is well-formed") drops with one WARN (channel only, never throws) on `!isValidName(channel)` or a member failing the #346 id predicate + plain-object `info`, then calls `#announcePresence('left', channel, member, channel)` with no await before it and **not** on `#rosterTails` (comment: why — ordering with an in-flight hold, W8). Turns W1, W3, W5 green; W2, W4, W6, W7, W8 stay green.

## Phase 4: US4 + conformance

- [X] T009 [P] [US4] Gated live rows (`LOCKNESS_REDIS_INTEGRATION=1`) in `packages/realtime/tests/live_fake_conformance.test.ts`: the release reply is a bulk equal to the released entry when the slot is gone and integer `0` otherwise, fake and live (FR-010).

## Phase 5: Batteries

- [X] T010 New battery `packages/realtime/tests/mutations/presence_sweep_departure_348.ts`, each anchor asserted present and each mutant proven live and killed by its named witness: M1 the sweep discards the `#release` result (W1); M2 the script's final `return 0` → `return mine` (W2); M3 `releaseMember` also calls the handler (W6); M4 departure decided from an `HGET` before the release (W3 — add a #333-style barrier if FakeRedis serialises the sweeps); M5 registration drops `?.` (W4); M6 departure `target` is `''` (W3, observer on the non-winning sweeper); M7 decoder accepts any bulk incl. `''` (FR-004a); M8 departure chained on `#rosterTails` (W8); M9 an extra `await this.command.command('PING')` before the handler (W8); M10 the `sameMemberId(member.id, field)` check dropped (W7).
- [X] T011 Re-anchor and re-prove live: `presence_member_holds_345.ts` (two rows on `await this.#release(channel, field, deadId)`); `presence_member_transitions_344.ts` M4 (reason comment: now dies because the decoder throws on nil), M7 and M11 (the `origin` → `target` change). Confirm `sweep_parse_316.ts` anchors still match. Run every realtime battery; all exit 0.

## Phase 6: Polish — ADR and docs

- [X] T012 [P] `docs/adr/005-realtime-swept-departures-announced.md`: the decision, the rejected shapes (from the disposition), the residue, and that a swept `presence-leave` carries broker-sourced bytes; amend `docs/adr/004-*` §2, §5, §6 with inline "Amended by ADR 005" callouts and the Status line (ADR 003 convention).
- [X] T013 [P] `docs/realtime.md`: "Ghost sweep" (what the room receives after a crash; latency up to liveness TTL + reconcile interval, ~25 s default; the burst and replay-window note for large crashes); "Writing a presence driver" (the optional callback and its lifecycle); the `joined`-frame promises (a crash is a second cause of a `left` with no `joined`); "Upgrading to v0.4.0" item 8 ("What your application sees": a crash now sends `left`).
- [X] T014 [P] `packages/realtime/AGENTS.md`: rewrite the pitfalls "one strict decoder (1 / 0 / throw)", "return ignored", "`#syncRosterMember` is the only caller"; regenerate the brief (`deno task agents:brief`) so the new test and battery are listed.
- [X] T015 Full gate: `deno fmt && deno lint && deno check <changed files> && deno task test` (exit status only), plus `deno task agents:brief --check`.

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 / T010 → T011 → T012–T014 → T015.
T012, T013, T014 are parallel with each other. US1–US3 share one code path, so they land together;
US4 (W5) is exercised by the same code and needs no separate implementation.

## Implementation strategy

One branch, commits split by category: `test(348)` for the red witnesses and infrastructure,
`feat(348)` for the seam + script + sweep + manager, `test(348)` for the battery and re-anchors,
`docs(348)` for ADR 005 and the docs. MVP = W1 green (T001–T008); everything after completes the
approved scope, not an option.
