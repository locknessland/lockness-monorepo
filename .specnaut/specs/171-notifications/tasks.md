# Tasks: Notifications (multi-channel)

**Feature**: `171-notifications` | **Epic**: [#206](https://github.com/locknessland/lockness-monorepo/issues/206) | **Children**: [#207](https://github.com/locknessland/lockness-monorepo/issues/207), [#208](https://github.com/locknessland/lockness-monorepo/issues/208), [#209](https://github.com/locknessland/lockness-monorepo/issues/209)

**One `tasks.md`, one branch, one flat merge.** Each child is one commit
(`type(T<NN>): subject (#child)` + `Epic: #206` trailer). The `T00N` counter
below is the task counter, **not** the commit scope position — see
`phases/epic-loop.md`. Tests are TDD: written first inside each child, red then
green, full gate before the child's commit.

---

## Phase 1: Setup — new package (child #207)

- [ ] T001 [US1] Create `packages/notification/deno.json` (name `@lockness/notification`, exports `./mod.ts`, hard deps `@lockness/contract` + `@lockness/container` pinned JSR-bare; JSX N/A) and register the workspace member + `lockness.packages += "notification"` in root `deno.jsonc`
- [ ] T002 [US1] Add the `notification` entry to `deps.policy.jsonc` — tier implementation, `allow: [contract, container]`, `soft: [mail, queue, logger, sse, drizzle]` — committed on its own as `chore(deps)`
- [ ] T003 [US1] Add `notification` to `tests/package_structure.test.ts` PACKAGES list so the structure test recognises the new package

## Phase 2: Foundational — the abstraction + soft-load seam (child #207, US1)

**Goal (US1)**: notify across channels from one class. **Independent test**: a
notification with `via()` → two fake channels delivers to both; a null route
skips one; a throw on one still delivers the other.

- [ ] T004 [P] [US1] Write `packages/notification/tests/manager.test.ts` — SC-001: two fake channels both receive; null `routeNotificationFor` skips only that channel; a throwing channel is isolated and reported, others still deliver (red first)
- [ ] T005 [P] [US1] Write `packages/notification/tests/optional.test.ts` — SC-002 seam: `tryImport` resolves an injected fake module; a missing package yields the fixed `install @lockness/<pkg> for the <channel> channel` template (FR-004a), never a raw stack
- [ ] T006 [US1] Implement `packages/notification/notification.ts` — `Notification` abstract base: `via(notifiable): string[]` + optional per-channel builder hooks; `queue`/`shouldQueue` opt-in property (FR-001, FR-007 read-side); JSDoc + no `any`
- [ ] T007 [US1] Implement `packages/notification/notifiable.ts` — `Notifiable` contract: `routeNotificationFor(channel): unknown | null` (FR-001); JSDoc
- [ ] T008 [US1] Implement `packages/notification/optional.ts` — one `tryImport(name, channel)` helper, **variable** specifier only (soft edge; §5 home; hoist-to-contract note A-F4), fixed install-message template (FR-004, FR-004a) via `renderError`
- [ ] T009 [US1] Implement `packages/notification/config.ts` — `configureNotifications({ databaseTable })` single config home (FR-005 read-side; the target is consumed by the database channel in #208)
- [ ] T010 [US1] Implement `packages/notification/manager.ts` — `ChannelManager` (resolve name → driver, dispatch), `notify(notifiable, notification)` fan-out with per-channel isolation (FR-002), unknown-channel guard naming the registered set, queued-vs-inline branch reading the notification's `queue` property + the identifiers-only serialization contract `{ notifiableId, notificationClass, constructorPayload }` (FR-007, single home; #208/#209 wire the concrete queue/channels)
- [ ] T011 [US1] Create `packages/notification/mod.ts` — export the public surface (Notification, Notifiable, ChannelManager, notify, configureNotifications, channel-registration seam); `@fileoverview`/`@module`; write `packages/notification/AGENTS.md` + `README.md`
- [ ] T012 [US1] Full gate for #207 (`run-gate.sh full`), then commit `feat(T01): notification abstraction + soft-load seam (#207)` with `Epic: #206`

## Phase 3: Built-in channels (child #208, US2)

**Goal (US2)**: the mail/database/log/broadcast channels + SMS/Slack stubs, each
backing package soft-loaded. **Independent test**: log channel works with no
other backing package resolvable; broadcast to A does not reach B; database row
carries the owner column.

- [ ] T013 [P] [US2] Write `packages/notification/tests/channels/log.test.ts` — S3: logs a bounded summary `{ type, notifiable id, channels }` / `toLog()`, user-derived strings via `safeForLog`, never the raw payload; works with only the logger fake resolvable (SC-002)
- [ ] T014 [P] [US2] Write `packages/notification/tests/channels/broadcast.test.ts` — SC-006/S1: a fake SSE channel proves B does **not** receive A's notification (per-notifiable `send(clientId,…)`, never shared `broadcast()`)
- [ ] T015 [P] [US2] Write `packages/notification/tests/channels/database.test.ts` — S2: the persisted row carries the notifiable's identity as a mandatory column; drizzle-not-configured and drizzle-not-installed are distinct fail-clear paths
- [ ] T016 [P] [US2] Write `packages/notification/tests/channels/mail.test.ts` + `stubs.test.ts` — mail delivers through a fake `@lockness/mail`; SMS/Slack stubs throw the typed "configure a provider" error
- [ ] T017 [US2] Implement `packages/notification/channels/log.ts` — bounded summary + `safeForLog` (FR-003, S3), soft `@lockness/logger` via `tryImport`; minimal structural `{ info/error }` interface
- [ ] T018 [US2] Implement `packages/notification/channels/broadcast.ts` — per-notifiable channel/clientId via `routeNotificationFor('broadcast')`, `channel.send(clientId,…)`, never `broadcast()` (FR-003, S1); soft `@lockness/sse`; structural `{ send }` interface
- [ ] T019 [US2] Implement `packages/notification/channels/database.ts` — `Database` token from the **soft-loaded** `@lockness/drizzle` module (never static), dialect-agnostic loose `{ insert }`, writes the app table from `configureNotifications` with the mandatory owner column (FR-005, S2, A-F3)
- [ ] T020 [US2] Implement `packages/notification/channels/mail.ts` (soft `@lockness/mail`, structural mail-message interface — A-F2 mirror; one mirror-vs-real assertion in the mail test flags drift) and `channels/stubs.ts` (SMS/Slack typed "configure a provider" error)
- [ ] T021 [US2] Register the built-in channels with the `ChannelManager` and export them via `mod.ts`; update `AGENTS.md`/`README.md` channel list
- [ ] T022 [US2] Full gate for #208, then commit `feat(T02): built-in notification channels (#208)` with `Epic: #206`

## Phase 4: Scaffold + queued delivery (child #209, US3)

**Goal (US3)**: `make:notification` + queued delivery. **Independent test**:
`make:notification Foo` scaffolds the class and registers the command; a queued
notification enqueues one identifiers-only job (fake queue) instead of sending
inline.

- [ ] T023 [P] [US3] Write `packages/notification/tests/cli_commands.test.ts` — SC-003: `make:notification Foo` scaffolds `./app/notification/foo_notification.ts` and the command registers via `registerNotificationCommands`
- [ ] T024 [P] [US3] Write `packages/notification/tests/queued.test.ts` — SC-004: a queued notification enqueues **one** job through a fake queue (not inline); assert the serialised payload holds only `{ notifiableId, notificationClass, constructorPayload }` and **no rendered channel content** (S5); the job's `handle()` rehydrates + re-renders + fans out
- [ ] T025 [US3] Implement `packages/notification/cli_commands.ts` — `registerNotificationCommands(cli)` (package-command pattern, `loadPackageCommands`-discovered) + `stubs/notification.stub` importing `Stub` from `../../stubs.ts` (thin; scaffold logic → `generators/` only if a 2nd `make:*` is added — A-F5/#260)
- [ ] T026 [US3] Implement the queued job in `packages/notification/manager.ts`'s queued branch — build the identifiers-only job, dispatch through soft `@lockness/queue`, `handle()` rehydrates the `Notifiable` + `Notification` and re-renders the fan-out (FR-007 concrete; single home)
- [ ] T027 [US3] Full gate for #209, then commit `feat(T03): make:notification scaffold + queued delivery (#209)` with `Epic: #206`

## Phase 5: Polish & cross-cutting

- [ ] T028 Add `docs/notifications.md` (channels, soft-load, `configureNotifications`, queued contract, broadcast scoping) + `make:notification` in the CLI reference; link from the AGENTS.md doc index
- [ ] T029 `deno task agents:brief` regenerate the notification brief; final full gate on the whole branch before the review handoff

---

## Dependencies & order

- **#207 → #208 → #209** (strict): channels need the manager + seam; queued needs the manager's queue branch; scaffold is independent of channels but ships in #209.
- Within a child, `[P]` test tasks are written together (different files), then implementation.

## Parallel opportunities

- #207: T004 ∥ T005 (separate test files).
- #208: T013 ∥ T014 ∥ T015 ∥ T016 (one test file per channel).
- #209: T023 ∥ T024.

## MVP

**US1 (#207)** alone is the MVP checkpoint — the abstraction + seam deliver
"notify across channels from one class" against fake channels. US2/US3 are the
full path and ship in the same branch.

## Independent test criteria

- **US1**: two fake channels both deliver; null route skips one; a throw isolates.
- **US2**: log works with only logger resolvable; broadcast A ↛ B; DB row owner-scoped.
- **US3**: `make:notification` scaffolds + registers; queued enqueues one identifiers-only job.
