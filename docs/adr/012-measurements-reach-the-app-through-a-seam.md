# ADR 012 — A package's measurements reach the application through a seam

**Status:** Accepted **Date:** 2026-09-24 **Owner:** architect **Affects:**
`packages/realtime/drivers/redis.ts`, `packages/telemetry/meter.ts`,
`docs/observability-and-crypto.md`, `docs/realtime.md`,
`packages/realtime/AGENTS.md`, `packages/telemetry/AGENTS.md`

---

## 1. The question

Two background passes keep a Redis-backed realtime fleet correct: the ghost
sweep and the revocation re-check. Both are bounded by how long one pass takes,
and two recorded revisit triggers were written in that quantity — ADR
[008](008-realtime-sweep-reads-owned-set-in-pages.md) §5 (a sweep longer than
the liveness TTL) and ADR
[009](009-realtime-revocation-recheck-reads-index-in-pages.md) (a revocation
pass above 10% of `reconcileIntervalMs`). Nothing measured it, so neither
trigger could be seen approaching until it had already fired
([#360](https://github.com/locknessland/lockness-monorepo/issues/360)).

The general question under it: **how does a Lockness package that measures
something get that measurement to a metrics backend**, when the package cannot
depend on the telemetry package?

## 2. The decision — the rule, for any package

1. **The package hands the application a value, through a seam** — a
   registration method taking one handler, called with a frozen value object.
   The package never imports a metrics API.
2. **The application wires the seam to its backend**, through `getMeter` from
   `@lockness/telemetry` — the one route to the OpenTelemetry meter, and the
   no-op meter while `OTEL_DENO` is unset.
3. **Instrument names, kinds, units, attributes and bucket boundaries live in
   one place**:
   [Framework instruments](../observability-and-crypto.md#framework-instruments),
   with the recipe that wires them. Code, JSDoc, READMEs and ADRs link it.
4. **The library records and never judges.** No threshold, no slow-pass WARN, no
   default alert: a continuous quantity turned into a log line fires on every
   pass at scale, and the right threshold belongs to the operator (the S2 ruling
   recorded in ADR 009).

**Why the application is the composition root.** `realtime` is a pure sink in
`deps.policy.jsonc` — it may reach `contract`, `hono` and `redis`, and nothing
else. The application is the one place that already holds both the driver and
its telemetry, so it is where the two meet.

**The seam's own guarantees.** The handler is never awaited, so an observer
never stretches what it observes; a throw or a rejection is one WARN in the #369
shape, so it never breaks what it observes; a closed producer reports nothing.

## 3. Rejected, and what each would have cost

- **A hard dependency on `@lockness/telemetry`.** A new edge from every
  measuring package into an npm-backed package (the one OpenTelemetry API
  exception), breaking realtime's pure-sink tier and shipping the OTel API to
  every consumer who never enables it.
- **A contract-level recorder** (`MetricsRecorder` in `@lockness/contract`). A
  second metrics vocabulary to keep in step with OpenTelemetry's, and the
  foundation package owning instrument semantics it cannot test.
- **A soft-load of `@lockness/telemetry`**, as the events bridge does. Names and
  units would then be decided inside the library, the application could not
  choose its meter or rename anything, and the edge stays invisible to the
  dependency check.
- **A meter port injected into the driver.** An options-shape change on every
  driver, a mock meter in every test, and still the names in library code; the
  seam gives the same reach with one method and no option.
- **A manager-side seam, or a new hook, for the per-unit counts** (#384). Two
  samples an operator must join, and the enforcement deadline could see neither.
  The counts ride the revocation re-check's resolved value instead.
- **A counter argument passed to the re-check handler** (#384). Third-party
  drivers call `handler()` with no argument, so the counts would silently never
  arrive.

## 4. The first instance — the realtime passes

- **The seam**: `RedisBroadcastDriver.onPassComplete(handler)`, one handler,
  replaced on re-registration and dropped by `close()`.
- **The value**: `PassSample` — which pass, its trigger, its outcome, its
  duration on the monotonic pass clock of ADR
  [011](011-realtime-revocation-bound-is-checked.md), and its pages. What each
  field means is stated once, on the type in
  `packages/realtime/drivers/redis.ts`. Since #384 it also counts the units the
  pass attempted and how many failed.
- **One sample per completed pass**, taken at the pass's one end site from its
  start site's closure.
- **Off `BroadcastDriver`**: the memory driver runs no background pass, so the
  seam is a Redis-driver method, not an interface member.

ADR [006](006-realtime-sweep-writes-only-while-dead.md) is the
one-pass-at-a-time rule this measures.

## 5. What this does not solve

1. **Two applications can name the metric differently.** The documented names
   are a convention, not enforced.
2. **A stalled pass produces no sample.** The sample is taken at the end; for
   the revocation pass the enforcement deadline (ADR 011) reports the stall, and
   for the sweep the backend sees an absence of samples.
3. **`durationMs` is the whole pass**, apply and tail wait included, so it is
   not the round-trip-only term of the revocation bound.
4. **Revocation pages can include a lapse re-check's pages** that ran on the
   manager's serial tail ahead of the pass's own handler.
5. **The sweep's `SMEMBERS` and `EXISTS` are timed but not paged.** Paging the
   instance set is a separate item.
6. **Samples are not buffered.** A handler registered late misses the passes
   before it.
7. **The revisit triggers become observable, not acted upon.** Neither ADR 008's
   nor ADR 009's escalation is implemented.
8. **A failure is what threw, per unit** (#384). A sample counts how many units
   its pass attempted and how many failed (`attempts`, `failures`); what a unit
   and a failure are — and what a failure does **not** mean: an apply that
   resolved without effect, a record that could not be cleared, a sweep cut
   short or renewed — is stated once, on `PassSample`. A revocation sample
   carries no counts when its handler reported none.
9. **A failure that moves between instances trips no deadline** (#384). A
   failing record whose client reconnects to another instance on every interval
   never breaks one instance's window, so no per-instance deadline fires. The
   rate of `failures` across the fleet is the signal
   ([the recipe](../observability-and-crypto.md#framework-instruments) alerts on
   it); the only full fix is a durable per-record failure streak, a
   record-format change.

## 6. Related

- ADR [006](006-realtime-sweep-writes-only-while-dead.md), ADR
  [008](008-realtime-sweep-reads-owned-set-in-pages.md), ADR
  [009](009-realtime-revocation-recheck-reads-index-in-pages.md) and ADR
  [011](011-realtime-revocation-bound-is-checked.md).
- [Framework instruments](../observability-and-crypto.md#framework-instruments),
  the one list of names.
