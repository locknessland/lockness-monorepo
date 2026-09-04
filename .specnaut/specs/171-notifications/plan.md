# Plan: Notifications (multi-channel)

**Branch**: `171-notifications` | **Date**: 2026-09-04 | **Backlog item**: [#206 — Notifications (multi-channel)](https://github.com/locknessland/lockness-monorepo/issues/206) (epic; children [#207](https://github.com/locknessland/lockness-monorepo/issues/207), [#208](https://github.com/locknessland/lockness-monorepo/issues/208), [#209](https://github.com/locknessland/lockness-monorepo/issues/209))

**This is the epic's one planning document** — one decision table, one stop, covering all three children.

---

## 1. Why this exists

Competitive gap #5. Lockness has `@lockness/mail` but **no notification abstraction** — no way to send one event to a user across mail + database + broadcast + SMS from a single class. Every SaaS needs "notify this user" fanning out to several channels, with some queued. Laravel Notifications, Rails Noticed, and Adonis all ship it; Lockness ships none. The concept is greenfield here (no `Notifiable`, no channel manager, no notifications table anywhere).

## 2. User scenarios

### US1 — Notify across channels from one class (P1)

**Given** a `Notification` declaring `via()` → `['mail', 'database']` and `toMail()`/`toDatabase()`
**When** the app calls `notify(user, new InvoicePaid(...))`
**Then** the notification is delivered to each declared channel, resolving the user's per-channel address via the `Notifiable`.

### US2 — Use the built-in channels (P1)

**Given** the mail / database / log / broadcast channels
**When** a notification routes to them
**Then** mail sends through `@lockness/mail`, database persists a row (into the app's table), log writes through `@lockness/logger`, broadcast pushes through `@lockness/sse` — each backing package loaded **only if that channel is used**. SMS and Slack exist as stubs that fail clearly until a provider is wired.

### US3 — Scaffold + queue (P2)

**Given** `nessy make:notification InvoicePaid`
**When** the developer runs it
**Then** a notification class is scaffolded; and a notification that opts into queuing is delivered through `@lockness/queue` (a job runs the send) rather than inline.

### Edge cases

- A channel whose backing package is not installed → a clear "install `@lockness/mail` to use the mail channel" error, never a raw module-resolution stack.
- An unknown channel name in `via()` → fail clearly, naming the registered set.
- A `Notifiable` with no address for a channel (`routeNotificationFor` returns null) → that channel is skipped (not an error), the others still deliver.
- The SMS/Slack stub channels → throw a typed "no provider configured" error (documented), never silently drop.
- A queued notification whose queue package is absent → the fail-clear rule (channel-not-installed) applies to `@lockness/queue` too.

## 3. Requirements

- **FR-001**: A `@lockness/notification` package provides `Notification` (abstract base: `via(notifiable): string[]` + optional per-channel payload builders), a `Notifiable` contract (`routeNotificationFor(channel): unknown | null`), and a `ChannelManager` that resolves a channel name to its driver and dispatches.
- **FR-002**: `notify(notifiable, notification)` (and a `Notifiable`-side `.notify()`), for each channel in `via()`: resolve the channel, resolve the notifiable's per-channel route, and deliver; a null route skips that channel; a delivery error on one channel does not abort the others (each is isolated + reported).
- **FR-003**: Built-in channels: **mail** (via `@lockness/mail`), **database** (persist a row), **log** (via `@lockness/logger`), **broadcast** (via `@lockness/sse`), plus **SMS** and **Slack** driver **stubs** that throw a typed "configure a provider" error.
  - **Broadcast is scoped to the notifiable's own connection (security S1).** `routeNotificationFor('broadcast')` returns a **per-notifiable** channel identity (e.g. `notifications:user:<id>`) or a specific `clientId`; the adapter uses `channel.send(clientId, …)` / a per-user channel and **never** `SSEChannel.broadcast()` on a shared channel — otherwise one user's notification reaches every connected client.
  - **The log channel logs a bounded summary, not the payload (security S3).** By default it logs `{ notification type, notifiable id, channels }` only; a `toLog()` builder lets the app opt a shape in. Any user-derived string is passed through `safeForLog` before interpolation (log-injection control; note it is not a PII redactor — the bounded shape is the classification control).
- **FR-004**: Each channel's backing package is **loaded on demand** (a notification-local optional-import via a **variable** specifier, so `deps:analyze` sees it as a `soft` edge, declared in `deps.policy.jsonc` and NOT in `notification/deno.json` — verified against `deps_analyzer.ts` checks B+C: a static or `import type` from a backing package would fail the gate). A notification app that uses only the log channel pulls neither mail, sse, queue, nor drizzle. A missing backing package fails with an actionable "install X for the Y channel" message (FR-004a), never a raw stack.
- **FR-004a**: The channel-not-installed message is a **fixed template** (`install @lockness/<pkg> for the <channel> channel`); any appended underlying error is passed through `renderError` (noting #261's message-carrier gap), and this message is operator-facing — it must **never** surface in an end-user HTTP response (security S4).
- **FR-005**: The **database** channel does not ship a fixed table (none can exist for an app's schema). The app supplies the persistence target via `configureNotifications({ databaseTable })` (one config home); the channel writes through the `Database` token **obtained from the soft-loaded `@lockness/drizzle` module — never a static `import { Database }`** (which would harden the edge), typed **dialect-agnostically** via a loose structural `{ insert }` (not pinned to `PostgresJsDatabase` — confirms #259). The persisted row **must carry the notifiable's identity as a mandatory column** (security S2), so a later "list my notifications" read can scope by owner; drizzle-not-configured is a fail-clear path alongside drizzle-not-installed.
- **FR-006**: `make:notification <Name>` scaffolds a `Notification` subclass under `./app/notification`, registered via `registerNotificationCommands(cli)` (the package-command pattern `loadPackageCommands` discovers), and the app adds `notification` to `lockness.packages`.
- **FR-007**: A notification opts into **queued delivery** (a `queue`/`shouldQueue` property); the manager then dispatches **one** job through `@lockness/queue` (soft) whose `handle()` runs the whole `via()` fan-out. The job serialises **identifiers only** — `{ notifiableId, notificationClass, constructorPayload }` — **never the rendered per-channel payloads**, and rehydrates the `Notifiable` + `Notification` and re-renders inside `handle()`. This is a single-homed decision (manager.ts) — a live `Notifiable` with methods cannot be JSON-serialised, and rendered payloads would put PII/secrets at rest in the queue store and forever in the DLQ (security S5 / architecture A-F1; confirms #247). *(this closes both the queued-serialization seam and the at-rest-PII finding)*
- **FR-008**: Every new exported symbol carries JSDoc (#7); no `any` in exported signatures (#3 — dynamically-loaded modules typed by minimal structural interfaces, `unknown` + guards at the boundary); JSR-bare specifiers pinned in `deno.json` (#2); no direct `hono` import (#1).

## 4. Success criteria

- **SC-001**: A notification with `via()` → two channels delivers to both (proven with fake channels); a null route on one channel skips only it; a throw on one channel still delivers the others (isolation).
- **SC-002**: The log channel works with **no** other backing package resolvable (proves per-channel soft loading — SC for FR-004); a missing backing package yields the actionable install message.
- **SC-003**: `make:notification Foo` scaffolds `./app/notification/foo_notification.ts` and the command is registered.
- **SC-004**: A queued notification enqueues **one** job carrying identifiers (fake queue) rather than sending inline, and the job's serialised payload contains **no rendered channel content** (no PII) — proven by asserting the enqueued payload holds only `{ notifiableId, notificationClass, … }`.
- **SC-006**: A broadcast to notifiable A is delivered only to A's own connection — a fake SSE channel proves notifiable B does **not** receive A's notification (security S1).
- **SC-005**: Full gate green (`deno fmt && deno lint && deno check && deno task test && deno task deps:analyze && deno task agents:brief --check && deno task publish:check`).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The notification abstraction (base, contract, dispatch) | `packages/notification/notification.ts` (`Notification`), `notifiable.ts` (`Notifiable`), `manager.ts` (`ChannelManager`, `notify`) | A second dispatch loop in a controller; a channel registry built ad-hoc per app |
| Which channels a notification uses | the app's `Notification` subclass `via()` | A controller deciding channels instead of the notification |
| A notifiable's per-channel address | the app's `Notifiable.routeNotificationFor(channel)` | A channel reading `user.email` directly instead of asking the notifiable |
| How a channel's backing package is loaded (on demand, fail-clear) | `packages/notification/optional.ts` (one `tryImport(name, channel)` helper) | A channel doing its own `import()` / a static `import`/`import type` from a backing package (would make the edge hard) |
| The channel→package soft edges | `deps.policy.jsonc` `notification.soft = [mail, queue, logger, sse, drizzle]` (hard: `contract`, `container`) | Declaring a backing package in `notification/deno.json` (makes it a hard edge, forcing install) |
| The database channel's persistence target | app-supplied via `configureNotifications({ databaseTable })` (`packages/notification/config.ts`) | The channel hard-coding a table; a second place deciding where notifications persist |
| Queued-vs-inline delivery | `packages/notification/manager.ts` (reads the notification's `queue` property, dispatches via soft queue) | A channel deciding to queue itself; a second queue dispatch path |
| **The queued-job serialization contract** — `{ notifiableId, notificationClass, constructorPayload }`, rehydrate + re-render in `handle()` | `packages/notification/manager.ts` (the one place that builds + rehydrates the job) | Serialising a live `Notifiable`/rendered payload into the job (unserialisable + PII-at-rest) — A-F1/S5 |
| **Where the broadcast is scoped** — per-notifiable channel/clientId | the app's `Notifiable.routeNotificationFor('broadcast')` + the broadcast adapter (`channel.send(clientId,…)`, never `broadcast()`) | An adapter broadcasting to a shared channel (cross-user disclosure) — S1 |
| The `make:notification` scaffold | `packages/notification/cli_commands.ts` (`registerNotificationCommands`) + `stubs/notification.stub` — **scaffold logic moves to a `generators/` module if a second `make:*` is ever added** (confirms #260) | Adding it to `cli/commands/make/` (that dir is cli built-ins; package scaffolds live in the package) |
| The channel-not-installed / unknown-channel error | `packages/notification/manager.ts` + `optional.ts` (one guard each; the `tryImport` "not found" heuristic **hoists to `@lockness/contract` on a third soft-loader** — A-F4) | A per-channel re-check of the same |

## 6. Technical context

**Language/Version**: Deno / TypeScript.
**Primary Dependencies**: hard — `@lockness/contract`, `@lockness/container`. Soft (per-channel, on demand) — `@lockness/mail`, `@lockness/queue`, `@lockness/logger`, `@lockness/sse`, `@lockness/drizzle`.
**Storage**: the database channel persists to an app-defined Drizzle table (no fixed schema shipped).
**Testing**: `Deno.test`. The manager + channels are tested with **fake channels / fake backing modules** (no live mail/DB/redis) — the soft-import seam is injectable.
**Target Platform**: Deno server.
**Project Type**: framework library (new package).
**Constraints**: strict acyclic DAG; hard rules #1–#9. No cycle (nothing imports `notification`).
**Scale/Scope**: three children; one new package (`notification`) + `lockness.packages` registration.

### Domain model

- **Bounded context**: multi-channel notification delivery.
- **Vocabulary**: *Notifiable* (a recipient — resolves its own per-channel address), *Notification* (what to send + which channels), *channel* (mail/database/log/broadcast/sms/slack), *ChannelManager* (resolves + dispatches), *route* (the notifiable's address for a channel).
- **Entities**: none shipped (the app's notification row is the app's entity).
- **Value objects**: a channel name, a resolved route, a per-channel payload (mail message / db row / log line / broadcast event).
- **Invariants**: a channel is delivered only if the notifiable has a route for it; one channel's failure never aborts the others; a channel's backing package loads only when that channel is used; the abstraction imports no backing package statically.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| #1 no direct hono | pass | broadcast channel types via `@lockness/sse`/structural, not raw hono |
| #2 JSR-only, per-package | pass | hard deps declared; soft deps in deps.policy only |
| #3 no `any` | pass | soft modules typed by minimal structural interfaces; `unknown` + guards |
| #4 Tailwind | pass (N/A) | no UI |
| #5 gate | pass | full gate per child |
| #6 deno.lock | pass | regenerated by deno |
| #7 JSDoc | pass | FR-008 |
| #8 MVC | pass | notification is infrastructure; channels are adapters; no DB in controllers |
| #9 commits | pass | one per child + `chore(deps)` for the package + soft edges |
| DDD | pass | pure abstraction (manager/base); channels are adapters over the soft packages |
| Domain Model gate | pass | §6 |

### Complexity tracking

No accepted violations. The all-soft channel edges are the notable design choice (justified §12 Q1: leanest footprint, matches core's soft pattern).

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/notification` (NEW, implementation) | yes | `Notification`, `Notifiable`, `ChannelManager`, `notify`, the built-in channels, `configureNotifications`, `make:notification` |
| `deps.policy.jsonc` | yes | new `notification` entry (hard: contract, container; soft: mail, queue, logger, sse, drizzle) — a `chore(deps)` commit |
| Root `deno.jsonc` | yes | `lockness.packages += "notification"` (so `make:notification` is discovered); workspace member added |
| `@lockness/mail`/`queue`/`logger`/`sse`/`drizzle` | no | reused via soft load; unchanged |
| Docs | yes | notifications doc + `make:notification` in the CLI reference |

### Documentation (this feature)

```text
.specnaut/specs/171-notifications/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A static/type import of a backing package silently makes a soft edge hard | FR-004 + a §5 row forbid it; `deps:analyze` catches a static edge not in `allow`; the soft-load goes through one `tryImport(name)` with a variable specifier |
| The database channel needs a table it cannot ship | FR-005: the app supplies the table via `configureNotifications`; the channel is a thin adapter over the resolved `Database` |
| One channel's failure aborts the fan-out | FR-002 isolates each channel; SC-001 proves a throw on one still delivers the others |
| Heavy transitive footprint via drizzle | drizzle is soft (only the database channel loads it); a log-only app pulls nothing extra (SC-002) |
| Typing dynamically-loaded modules invites `any` | minimal structural interfaces per channel (`{ send }`, `dispatch`, `info/error`, `broadcast`, `db.insert`); no `any` in exported signatures (#3) |
| **Structural-mirror drift (the priced cost of all-soft, A-F2)** | each soft channel mirrors its backing package's payload shape locally with **no compile-time link** — a backing-package shape change (e.g. mail's `MailMessage`) is invisible to `notification`'s typecheck and surfaces at runtime in the adapter cast. Legitimate boundary translation (DDD translate-at-the-edge), not a defect — but the **known blast site** is the per-channel structural interface; a mirror-vs-real assertion in one channel test flags drift early |
| SMS/Slack stubs read as working | they throw a typed "configure a provider" error, documented as stubs (out of scope: bundled provider credentials) |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Verdict: **needs_followup** — 0 critical/high, 3 MEDIUM, 2 LOW. Design confirmed sound: the soft-load seam is **self-enforcing** (verified against `deps_analyzer.ts` — a static/`import type`/literal-dynamic edge to a backing package fails checks B+C; only a variable specifier stays soft), blast radius is 5 soft + 2 hard edges, **0 existing-package churn, 0 cycle risk** (`notification` is a pure sink).*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A-F1 | MEDIUM — the queued-serialization seam had no §5 home | **Plan changed.** FR-007 rewritten + new §5 row: the job carries `{ notifiableId, notificationClass, constructorPayload }` and rehydrates/re-renders in `handle()`. Merges with security S5 |
| A-F2 | MEDIUM — all-soft's structural-mirror drift cost was unpriced | **Plan changed.** §9 risk row names the cost (runtime-only drift) and the blast site (per-channel structural interface); a mirror-vs-real test assertion flags drift |
| A-F3 | MEDIUM — the database channel is the acute edge-integrity + dialect-typing risk (confirms #259) | **Plan changed.** FR-005: `Database` token from the soft-loaded module (never static), typed dialect-agnostically via loose `{ insert }`; drizzle-not-configured fail-clear |
| A-F4 | LOW — the `tryImport` "not found" heuristic becomes a second copy of core's | **Recorded** in §5: hoist to `@lockness/contract` (a hard dep of both) on a third soft-loader |
| A-F5 | LOW — keep `notification/cli_commands.ts` thin (confirms #260) | **Recorded** in §5: scaffold logic moves to a `generators/` module if a second `make:*` is added |

**Verdict**: **needs_followup** → folded. Covered §5 completeness, home correctness (new package + all-soft both confirmed right; make-command pattern sound), a counted blast radius, and three-cycles-out findings (mirror drift, the database channel, the duplicated heuristic).

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel. Verdict: **fail** — 0 critical, 1 HIGH, 3 MEDIUM, 1 LOW. No request→send abuse path (notifications are app-triggered); the exposure is in the fan-out, and it is closed in the plan.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | **HIGH** — broadcast scoping undefined → `SSEChannel.broadcast()` fans one user's notification to every connected client (cross-user disclosure) | **Plan changed.** FR-003: `routeNotificationFor('broadcast')` is a per-notifiable channel/clientId; the adapter uses `send(clientId,…)`, never `broadcast()` on a shared channel; new SC-006 proves B does not receive A's |
| S2 | MEDIUM — the persisted DB row lacked a required owner column → read-side IDOR | **Plan changed.** FR-005: the row must carry the notifiable's identity as a mandatory column; reads scope by it |
| S3 | MEDIUM — the log channel logged the payload verbatim (no classification bound, bypassed `safeForLog`) | **Plan changed.** FR-003: log a bounded summary (type + notifiable id + channels) / `toLog()`; user-derived strings via `safeForLog` |
| S5 | MEDIUM — a queued notification serialised rendered payloads → PII at rest + DLQ forever (confirms #247) | **Plan changed.** FR-007: serialise identifiers only, re-render in `handle()` (same fix as architecture A-F1) |
| S4 | LOW — the channel-not-installed message could leak a resolver path (confirms #261) | **Plan changed.** FR-004a: fixed template, `renderError`'d, never surfaced to an end-user HTTP response |

**Verdict**: **fail** → resolved in-plan. The HIGH (broadcast cross-user disclosure) and the MEDIUMs are all data-model / adapter-behaviour decisions closed before code — the migration-vs-edit asymmetry the plan-time audit exists to catch.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — channel dep coupling.** All channel backing packages **soft** (recommended — a notification app installs only the channels it uses, matches core's soft pattern, keeps `@lockness/notification` foundation-light) vs. hard edges for the light ones (mail/logger/sse/queue) with only drizzle soft (simpler typing — real `import type` — but forces every notification app to pull mail+sse+queue+redis). | **All soft** — an app installs only the channels it uses; matches core's soft pattern; the per-channel structural-mirror cost is accepted (A-F2 drift test). | 2026-09-04 |
| **Q2 — database channel persistence.** The channel cannot ship a table. App supplies it via `configureNotifications({ databaseTable })` (recommended — one config home) vs. the `Notifiable` exposing a notifications store vs. an insert callback. | **`configureNotifications({ databaseTable })`** — one config home; the table carries the mandatory owner column (S2). | 2026-09-04 |
| **Q3 — queued delivery shape.** *(Resolved by the audits before the stop.)* One job per notification carrying `{ notifiableId, notificationClass, constructorPayload }`, rehydrated + re-rendered in `handle()`. Architecture A-F1 homed the serialization seam in §5 and security S5 forbade serialising rendered payloads (PII at rest / DLQ); the two converged on identifiers-only, which also settles the per-channel-vs-per-notification split at one job. | Identifiers-only, one job per notification | 2026-09-04 |

### Folded from the audits (not user decisions)

- **S1 (HIGH) is folded as spec, not a question.** Cross-user broadcast disclosure is a correctness defect with one right answer — a per-notifiable channel/clientId, never a shared `broadcast()`. Recorded in FR-003 + SC-006, not offered as an option.
- **S5 and A-F1 converged** on the queued identifiers-only contract above (Q3).
- **S2 / S3 / S4 / A-F2 / A-F3 / A-F4 / A-F5** are all folded into the FRs and §5 (see §10/§11). None reopens a design fork.

### Decided without asking

- **`@lockness/notification` is a new implementation-tier package** — the epic AC names it explicitly; no existing home fits a cross-channel abstraction.
- **`make:notification` follows the package-command pattern** (`registerNotificationCommands`, `lockness.packages`), like `make:model`/`make:seeder` in drizzle — not `cli/commands/make/` (cli built-ins only).
- **SMS/Slack are stubs** that throw a typed "configure a provider" error (bundled provider credentials are out of scope per the epic).
- **Child dependency order**: #207 (abstraction: base + Notifiable + manager + the soft-load seam) → #208 (the concrete channels) → #209 (make:notification + queued).
