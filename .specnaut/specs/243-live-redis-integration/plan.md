# Plan: Live-Redis integration coverage for the realtime bus

**Branch**: `243-live-redis-integration` | **Date**: 2026-09-05 | **Backlog item**: [#273 — Realtime: live-Redis integration test for cross-process delivery (SC-001)](https://github.com/locknessland/lockness-monorepo/issues/273)

**This is the feature's one planning document.**

---

## 1. Why this exists

`@lockness/realtime`'s Redis driver is the framework's only cross-process fan-out, and
almost none of it has ever spoken to a Redis.

Counted from the source, not from memory:

| | Commands |
| :--- | :--- |
| Issued on the driver's **command** connection (`packages/realtime/drivers/redis.ts`) | `DEL` `EVAL` `EXISTS` `HDEL` `HGETALL` `HSET` `PUBLISH` `SADD` `SET` `SMEMBERS` `SREM` — plus `TIME` `ZADD` `EXPIRE` `ZREMRANGEBYSCORE` `ZRANGEBYSCORE` inside two Lua scripts |
| Answerable by the real-socket fake (`packages/redis/tests/fake_server.ts`) | `AUTH` `SELECT` `QUIT` `PING` `GET` `SET` `SETEX` `DEL` `PSUBSCRIBE` `PUNSUBSCRIBE` |
| Overlap | **`SET`, `DEL`** |

The driver's *subscribe* connection issues `PSUBSCRIBE`, which the fake does model — that is
precisely the one path `driver_redis_live.test.ts` covers, and the reason the table above counts the
command connection separately.

`driver_redis_live.test.ts` is named for a live *socket*, not a live *broker*. It proves the
subscribe-mode push path end-to-end over TCP and nothing else. Every other behaviour — the
authoritative presence roster, the ghost sweep, cross-process eviction, the durable revocation
index — is proven only against `packages/realtime/tests/fake_redis.ts`, a hand-written in-process
model of Redis written by the same author as the code it validates.

**The cost is measured, not hypothetical.** During #276 the revocation index's `EXPIRE` line was
wrong twice in a row. The first version deleted every live revocation whenever a shorter-TTL
instance wrote; the second (`EXPIRE … GT` alone) was inert, because Redis reads a key with no TTL
as infinite and `GT` can therefore never arm one. Both times the full suite was green, because
`FakeRedis` modelled the option flags wrongly in exactly the same place. A test double that models
Redis *incorrectly* produces a green suite over a broken security control, and nothing in the gate
can see it.

Probed against a real Redis 7.4.9 while writing this plan — the first time any of it has been
checked against a broker rather than against the model:

| Probe | Real Redis |
| :--- | :--- |
| `EXPIRE k 60 GT` on a key with **no TTL** | `0`, TTL stays `-1` — the inert version shipped mid-#276, reproduced |
| `EXPIRE k 60 NX` | `1`, TTL `60` — `NX` is what *arms* it |
| `EXPIRE k 120 GT` / `EXPIRE k 30 GT` | `1` (extends) / `0` (refuses to shrink) |
| `EXPIRE k 999 NX` on a key that already has a TTL | `0` — so `NX`+`GT` compose exactly as the fix intends |
| `ZADD k GT 50` then `GT 150` after `100` | `100` → `150` — never lowers |

The shipped #276 implementation is correct. Nothing in the repository proves that.

Plan §6 of #268 assigned live-Redis integration to `qa-tester`. It was never written.

## 2. User scenarios

The actor throughout is **a Lockness maintainer changing the realtime Redis driver**, who needs to
know whether the change survives contact with a real broker.

### US1 — Cross-process delivery against a live broker (P1)

**Given** two `ChannelManager`s, each on its own `RedisBroadcastDriver` built through `fromConfig`
against a live Redis, and a client subscribed to a channel on instance B
**When** instance A broadcasts to that channel
**Then** B's client receives the event, and a connection on B that its own authorizer rejects
receives nothing.

### US2 — Authoritative presence across two instances (P1)

**Given** a client on A and a client on B, both joined to the same presence channel
**When** either instance is asked who is here
**Then** the roster read back from Redis lists both members — with no instance's in-process map
consulted — and each client observed a `joined` for the other.

### US3 — Cross-process eviction (P1)

**Given** a client whose socket is owned by instance A
**When** instance B evicts that client id
**Then** the socket on A is closed, the member is absent from the authoritative roster, and
presence subscribers on both instances observed a `left`.

### US4 — The durable revocation index under real Redis semantics (P1)

**Given** a live broker
**When** the driver marks a client revoked and lists revocations
**Then** the sorted-set index carries a TTL that is armed on first write and only ever extended,
expired entries are reaped, and live ones are returned — asserted against the real `ZADD … GT`,
`EXPIRE … NX`, `EXPIRE … GT` and `TIME` semantics rather than against a model of them.

### Edge cases

- **No broker configured** — the suite is skipped in full and the default `deno task test` stays
  hermetic and offline.
- **The gate is on but no broker answers** — this must **fail loudly**, never skip. A gated suite
  that skips silently is how "we have live coverage" becomes untrue while every check stays green.
- **Broker older than Redis 7.0** — the driver's `EXPIRE` option flags do not exist before 7.0, so
  the run fails naming the version it found, rather than failing somewhere obscure downstream.
- **A password aimed at a remote broker with TLS off** — refused, not warned.
- **A shared or in-use broker** — a run must not read, overwrite, or delete a key it did not
  create, must not subscribe to a topic it does not own, and must leave none of its own behind.
- **A test fails mid-run** — the teardown still runs. The failing path is the one this suite exists
  to produce.
- **Two runs at once** (a developer and CI on one broker) — they must not collide.

## 3. Requirements

- **FR-001**: The integration suite runs only when `LOCKNESS_REDIS_INTEGRATION=1`. Absent or any
  other value, every test in it is skipped via `Deno.test`'s `ignore`, matching the existing
  precedent in `packages/vite/tests/css.test.ts`.
- **FR-002**: Connection settings come from `LOCKNESS_REDIS_HOST` (default `127.0.0.1`),
  `LOCKNESS_REDIS_PORT` (default `6379`), `LOCKNESS_REDIS_PASSWORD`, `LOCKNESS_REDIS_DB`
  (default `0`) and `LOCKNESS_REDIS_TLS` (default `false`). **The preflight fails when
  `LOCKNESS_REDIS_PASSWORD` is set, `LOCKNESS_REDIS_TLS` is not, and the host is not a loopback
  address** — a password to a remote broker over plaintext is a misconfiguration the suite refuses
  rather than warns about, consistent with FR-003. The names are broker-scoped, not
  realtime-scoped, so a later suite in `@lockness/session` or `@lockness/queue` reuses them.
- **FR-003**: With the gate on, an unreachable broker **fails** the suite with a message naming the
  host and port it tried **and nothing else from the resolved config**. `BrokerConfig` is never
  stringified into a message, and the password is never interpolated into any assertion, failure or
  log line. The failure never degrades to a skip.
- **FR-004**: With the gate on, the suite asserts the server reports Redis **7.0 or newer** (read
  from `INFO server`) and fails naming the version found otherwise.
- **FR-005**: Every run owns a namespace unique to that run — `lockness-it:<random>`, where
  `<random>` is drawn from `crypto.getRandomValues` over a fixed `[a-z0-9]` alphabet so it can
  contain no Redis glob metacharacter (`*` `?` `[` `]` `\`). **Every key AND every pub/sub topic or
  pattern the suite addresses is under that namespace.** This quantifies over a set: no command and
  no subscription may address a key or a topic outside the run's own namespace, and in particular no
  `PSUBSCRIBE` pattern may be broader than `<namespace>*`. The enumerating search covers **both**
  connections, because a topic is not a key and the subscribe path does not go through the command
  client:
  `grep -nE "\.command\(|psubscribe\(" packages/redis/tests/live_broker.ts packages/realtime/tests/live_realtime.ts packages/realtime/tests/redis_broker_integration.test.ts`
- **FR-006**: The suite deletes its own keys on the way out **from a `finally` (or a `using`
  disposable), so a failed assertion or a thrown command still runs the teardown**, discovering them
  with `SCAN … MATCH` over its own namespace. It never issues `FLUSHDB`, `FLUSHALL` or `KEYS`.
  Cleanup covers the keys the driver creates that carry no TTL of their own — `{prefix}:instances`,
  `{prefix}:owned:<id>`, and the legacy `{prefix}:revoked` SET noted by #278.
- **FR-007**: Every driver, socket and manager the suite opens is closed before the test ends, so
  the run is clean under Deno's resource and op sanitizers. CI runs `deno task test:leaks`
  (`.github/workflows/test.yml:68`), so a leak is a red build, not a warning.
- **FR-008**: Every cross-process assertion reads state back through **a raw Redis client the suite
  owns** — never through a method of the type under test. `driver.listMembers()` and
  `driver.listRevoked()` read from Redis and so would satisfy a weaker wording, while routing the
  assertion back through the very parsing and semantics layer this suite exists to backstop. A suite
  that asserts through them is a unit test with a real socket attached.
- **FR-009**: Every key the suite asserts the **absence** of, it also asserts the **presence** of at
  some point in the same test. An absence assertion against a mistyped key name passes vacuously,
  which is the same false-green class this whole feature is aimed at.
- **FR-010**: The control secret is minted per run from `crypto.getRandomValues` (32 bytes, hex).
  **No control-secret literal exists in any tracked file**, and the documentation shows the secret's
  *provenance* (`openssl rand -hex 32`, read from the environment) rather than any value — a literal
  in a framework README is a value an integrator ships, and it cannot be recalled once copied.
- **FR-011**: How to run the suite is documented where an integrator and a maintainer each look:
  `docs/testing.md` and `packages/realtime/README.md`, including a copy-pasteable throwaway broker
  command.
- **FR-012**: A root task runs the suite with the gate set, so the documented invocation is one
  command and cannot drift from the env-var contract.
- **FR-013**: `.github/workflows/test.yml` gains a job that runs the gated suite against a `redis:7`
  service container. `LOCKNESS_REDIS_HOST` and every other `LOCKNESS_REDIS_*` value come from the
  workflow file, never from anything a fork's pull request can influence. Without this the gate is
  never on and FR-003 is unreachable — the circularity A8 named.

## 4. Success criteria

- **SC-001**: A maintainer with a Redis available runs one documented command and sees the
  cross-process delivery, presence, eviction and revocation behaviours exercised against it.
- **SC-002**: A maintainer with no Redis available runs the ordinary test command and sees the
  suite skipped, with no network attempt and no failure.
- **SC-003**: A maintainer who points the suite at a broker that is unreachable, older than the
  version the driver requires, or reachable only with a plaintext password, learns which of those
  three things is wrong from the failure message alone.
- **SC-004**: Running the suite against a broker that already holds unrelated data leaves that data
  byte-identical and leaves no key of the suite's own behind — **including after a failing run**.
- **SC-005**: Each of the three behaviours #273 names — cross-process delivery, authoritative
  presence, cross-process eviction — is asserted from bytes read back out of Redis by a client the
  suite owns.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Whether the integration suite runs at all | `packages/redis/tests/live_broker.ts` (one exported gate constant) | A second `Deno.env.get('LOCKNESS_REDIS_INTEGRATION')` in any `.test.ts`; a bare `ignore:` expression that re-reads the env. **Sanctioned second occurrence: the root `deno.jsonc` task (FR-012), which sets the variable rather than reading it.** |
| Where the live broker's connection settings come from | `packages/redis/tests/live_broker.ts` (one config builder) | Per-test `Deno.env.get('LOCKNESS_REDIS_*')`; a hard-coded `127.0.0.1` or `6379` in a test body |
| What the preflight refuses — unreachable, below 7.0, or password-without-TLS-off-loopback | `packages/redis/tests/live_broker.ts` (one preflight) | A per-test `try/catch` that swallows a connect error and returns early; a prose-only "requires 7.0+" with no check behind it; a second version floor beside the driver |
| The namespace a run owns, for **keys and topics alike** | `packages/redis/tests/live_broker.ts` (one namespace factory) | A literal prefix in a test body; two tests each minting their own; a `PSUBSCRIBE` pattern built from anything but the namespace |
| What "clean up after a run" means | `packages/redis/tests/live_broker.ts` (one `finally`-bound teardown) | A per-test `DEL` list; any `FLUSHDB`/`FLUSHALL`/`KEYS` anywhere |
| Poll-until-true with a deadline | `packages/redis/tests/live_broker.ts` (one `waitFor`) | The third hand-rolled copy — `driver_redis_live.test.ts:46` and `subscriber.test.ts` already carry one each |
| The Redis key layout the suite reads back | `packages/realtime/tests/live_realtime.ts` (one `keys(namespace)` factory) | A hand-derived `` `${prefix}:presence:${channel}` `` in a test body — the shape already at `revocation_atomicity.test.ts:27`; the driver's own getters are `private` (`redis.ts:427-452`), so this second home is forced and must be named |
| What counts as an authoritative read-back | `packages/realtime/tests/live_realtime.ts` (raw `HGETALL`/`ZRANGEBYSCORE` readers on the suite's own client) | Any assertion routed through `driver.listMembers()` or `driver.listRevoked()` |
| Where the control secret comes from | `packages/realtime/tests/live_realtime.ts` (one generator) | A literal in a test body, a doc block, a README, or a `.env.example` |
| How an instance is created and disposed | `packages/realtime/tests/live_realtime.ts` (one `withInstances(n, body)` factory) | Any test calling `RedisBroadcastDriver.fromConfig` directly and hand-rolling its own `close()` |

**The home is split across two packages, deliberately.** The broker-generic half —
gate, config, preflight, namespace, teardown, `waitFor` — lives in `packages/redis/tests/`, because
`packages/session/deno.json` and `packages/queue/deno.json` both declare `@lockness/redis` and
**neither declares `@lockness/realtime`**; a `LOCKNESS_REDIS_*` contract homed under
`packages/realtime/tests/` is one the promised consumers cannot import, so the next one would copy
it. The realtime-specific half — key layout, read-backs, control secret, instance lifecycle — stays
in `packages/realtime/tests/`. The two halves change for different reasons, which is the line the
split follows.

Neither file is a `.test.ts`, so `deno test` does not collect them — the same arrangement as the
existing `fake_redis.ts`, `lua_eval.ts` and `fake_server.ts` helpers beside them. The cross-package
test import is established precedent (`driver_redis_live.test.ts:34-37`).

## 6. Technical context

**Language/Version**: TypeScript on Deno (repo-pinned).
**Primary Dependencies**: `@lockness/realtime`, `@lockness/redis` (existing, granted edge), `@std/assert`. No new dependency.
**Storage**: A live Redis 7.0+, supplied by the operator; nothing persisted by the repo.
**Testing**: `Deno.test`, gated with `ignore`.
**Target Platform**: Developer machine and CI runner.
**Project Type**: Library monorepo — test infrastructure.
**Performance Goals**: The whole gated suite completes in under 30 s on a loopback broker.
**Constraints**: Default `deno task test` stays hermetic and offline; no new public API on any package; no change to production code.
**Scale/Scope**: Two `ChannelManager` instances per scenario, four scenarios, one broker.

### Domain model

No new entities. The harness introduces two value objects:

- **Bounded context**: the realtime broadcast bus, observed from outside.
- **Vocabulary**: *instance* (one driver + manager pair with its own id and sockets), *run
  namespace* (the key **and topic** prefix one execution owns), *gate* (the env flag), *preflight*
  (reachability + version + transport check), *read-back* (a raw command issued by the suite's own
  client).
- **Value objects**: **RunNamespace** — an opaque prefix with no identity beyond the run;
  **BrokerConfig** — the resolved `RedisClientConfig` for this run.
- **Invariants**:
  - a `RunNamespace` matches `/^lockness-it:[a-z0-9]+$/`;
  - every key and every topic the suite addresses starts with its `RunNamespace`;
  - the suite holds no Redis connection after its last test returns;
  - a `BrokerConfig` is never stringified.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1 — No direct `hono` import | pass | Not touched. |
| 2 — JSR-only specifiers | pass | `@std/assert` only, already declared. No new dependency edge — `realtime → redis` is granted and live; `scripts/deps_analyzer.ts:112` skips `tests/`, so the graph is unchanged. |
| 3 — No `any` in exported APIs | pass | RESP replies narrowed via `unknown` + guards, as the driver does. |
| 4 — Tailwind v4 syntax | pass | No CSS. |
| 5 — Pre-completion gate | pass | `deno fmt && deno lint && deno check && deno task test`, **plus the gated suite run green against a real broker** — a gate that only proves the suite skips proves nothing. |
| 6 — Never edit `deno.lock` | pass | No dependency change. |
| 7 — JSDoc on public APIs | pass | Test modules, not published surface (`packages/realtime/deno.json` excludes `tests/`); still carry `@fileoverview`/`@module` and per-export JSDoc, matching the helpers beside them. |
| 8 — MVC layering | pass | No application code. |
| 9 — Commit discipline | pass | `test` for the harness and suite, `chore` for the root task and the regenerated AGENTS.md briefs, `docs` for the guides. |
| TDD | pass, with a caveat | The deliverable *is* tests. What replaces red-first here is **mutation verification**: each assertion is proved to fail when the behaviour it guards is broken. FR-009 is the structural half of the same discipline. |
| Domain Model gate | pass | Section 6. |
| No silent catches | pass | FR-003 makes the one plausible catch — the connect preflight — a loud failure, and bounds what its message may contain. |

### Complexity tracking

No violations.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| Public API of any package | **no** | Zero production files change. |
| `packages/redis/tests/` | yes | New `live_broker.ts` — gate, config, preflight, namespace, teardown, `waitFor`. |
| `packages/realtime/tests/` | yes | New `live_realtime.ts` harness + `redis_broker_integration.test.ts` suite. |
| `packages/redis/AGENTS.md` | yes | Regenerated — `scripts/agents_brief.ts:184-185` files a non-`.test.ts` file into the package's **source** inventory, and `.github/workflows/test.yml:59` runs `agents:brief --check` as a hard step. |
| `packages/realtime/AGENTS.md` | yes | Same, for both new files. |
| Root `deno.jsonc` tasks | yes | One task that runs the suite with the gate set (FR-012). |
| `docs/testing.md` | yes | How to run it, and the throwaway-broker command. |
| `packages/realtime/README.md` | yes | A pointer from the package a maintainer is standing in. |
| CI (`.github/workflows/test.yml`) | yes | A new job with a `redis:7` service container and the gate set (FR-013, Q1). This is what makes FR-003's loud failure reachable. |
| Default `deno task test` behaviour | **no** | Still hermetic, offline, same duration. Verified: `coverage_floor.ts:48`, `docs_coverage.ts:29` and `deps_analyzer.ts:112` all exclude `tests/`; `packages/realtime/deno.json` uses `publish.exclude`, not an allowlist; `coverage-floors.json` holds no `realtime` or `redis` key. |

### What this feature does NOT close

**#280's conformance item stays open.** #280 asks for a suite that runs the *same command sequences*
against `fake_redis.ts` and a real Redis and diffs the answers. This feature builds the live half
and the harness that makes the other half cheap; it does not build the differential itself. Saying
so here is the point — a plan that let #280 be marked done on the strength of this one would
reintroduce the exact false-confidence this feature exists to remove.

**#274 stays invisible.** That issue reports the subscribe socket re-dialling on an idle bus; §6's
"under 30 s" budget means this suite will not surface it either.

### Documentation (this feature)

```text
.specnaut/specs/243-live-redis-integration/
├── plan.md
└── tasks.md
```

### Visual Prototyping with Claude Artifacts

Not applicable — this feature renders nothing. There is no screen or state to prototype.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| The suite destroys or reads data on a broker shared with other work | FR-005 namespace over **keys and topics**, FR-006 `finally`-bound `SCAN`-scoped cleanup; `FLUSHDB`/`FLUSHALL`/`KEYS` banned outright and greppable |
| The suite silently skips forever and nobody notices the coverage is fictional | FR-013's CI job turns the gate on for every push, so FR-003's loud failure is reachable; FR-012's task makes a local run one command |
| The tests pass for the wrong reason — asserting through the type under test | FR-008 |
| An absence assertion passes vacuously against a mistyped key | FR-009 |
| Timing flakiness — pub/sub is asynchronous | One shared `waitFor` with a deadline, never a fixed `setTimeout` |
| Two concurrent runs collide | FR-005's namespace is random per run; instance ids are already `crypto.randomUUID()` |
| Leaked sockets/timers make CI flaky | FR-007 + the shared `withInstances` factory, so disposal has one home rather than four |
| A control-secret literal reaches a README an integrator copies | FR-010 — no literal exists anywhere to copy |
| A broker password reaches CI output or a pasted transcript | FR-003 bounds the message; `connection.ts:210-221` already keeps it out of connect errors |
| The suite is written against the same misunderstanding of Redis that produced the #276 defects | It asserts against the **broker's** answers, and each assertion is mutation-verified |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | INFO — §1's command count re-derived independently and correct: 11 distinct verbs across 19 call sites, 5 more inside the two Lua scripts, 10 answered by `fake_server.ts`, overlap `{SET, DEL}`. | **No change needed.** Recorded because a plan that justifies itself with a miscount is exactly what bit the previous feature, and this one was checked rather than trusted. |
| A2 | LOW — the §1 row label said "issued by the driver" while counting only the command connection; `PSUBSCRIBE` is a third overlapping verb. | **Plan changed** — row relabelled to the command connection, with a note that `PSUBSCRIBE` is the covered path. |
| A3 | **HIGH** — FR-008 forbade reading "in-process fields", but `driver.listMembers()`/`listRevoked()` read from Redis and so satisfied its letter while routing every assertion back through the parsing layer #280 distrusts. The suite would have been a unit test with a real socket. | **Plan changed** — FR-008 rewritten to require a raw client the suite owns, never a method of the type under test; new §5 row for "what counts as an authoritative read-back". |
| A4 | **HIGH** — satisfying FR-008 forces a second home for the driver's key schema, whose getters are `private` (`redis.ts:427-452`); a drifted key name makes US3's *absence* assertion pass vacuously. | **Plan changed** — new §5 row homing the key layout in `live_realtime.ts`, and new **FR-009** requiring a positive read on every key the suite also asserts absence on. |
| A5 | **HIGH** — `LOCKNESS_REDIS_*` was homed in `packages/realtime/tests/`, which `session` and `queue` cannot import; verified: both declare `@lockness/redis`, neither declares `@lockness/realtime`, and realtime excludes `tests/` from publish. FR-002's reuse promise was unreachable. | **Plan changed** — home split by reason-to-change: broker-generic half to `packages/redis/tests/live_broker.ts`, realtime-specific half to `packages/realtime/tests/live_realtime.ts`. |
| A6 | MEDIUM — FR-007 (disposal) had no §5 row, and 8 instance lifecycles hand-rolled across 4 scenarios is a flaky-CI shape under `test:leaks`. | **Plan changed** — new §5 row for `withInstances(n, body)`. |
| A7 | MEDIUM — §8 omitted `packages/realtime/AGENTS.md`; `agents_brief.ts:184-185` files non-`.test.ts` files into the source inventory and `test.yml:59` runs `agents:brief --check`. Verified — CI would have gone red. | **Plan changed** — both `AGENTS.md` files added to §8 and to the §7 commit split. |
| A8 | MEDIUM — the "silent skip" risk is mitigated circularly: FR-003 only fires once the gate is on, and nothing turns it on. §1 documents this exact outcome one cycle earlier. | **Escalated to the user** as Q1, and **answered: the CI job is added in this feature** (FR-013). It is the difference between coverage and the appearance of it. |
| A9 | LOW — §5 row 1 banned a second `LOCKNESS_REDIS_INTEGRATION` spelling that FR-012's root task then requires. | **Plan changed** — the root task named as the one sanctioned second occurrence. |
| A10 | LOW — `waitFor` reaches its third copy at this feature with no home named. | **Plan changed** — homed in `live_broker.ts`. |
| A11 | INFO — blast radius counted: `coverage_floor.ts`, `docs_coverage.ts`, `deps_analyzer.ts`, `publish_check.ts` and `coverage-floors.json` are all verified no-ops; `AGENTS.md` and the root task are the only hits. | **Recorded in §8**, including the note that `realtime` and `redis` are currently outside the coverage ratchet — the plan must not claim protection it does not have. |
| A12 | INFO — three-cycle prediction: (i) the suite never runs in CI and the driver drifts, which is #273's own history repeating and is what Q1 decides; (ii) `live_broker.ts` becomes a divergent-change module. | **Plan changed** for (ii) — the A5 split already separates the four reasons to change. (i) is Q1. |

**Verdict** (`architect-expert`, plan-time, read-only): **needs_followup** — 0 CRITICAL, 3 HIGH, 3
MEDIUM, 3 LOW. **Covered**: `plan.md` in full; the §1 count re-derived from source; §5 completeness
against every FR; the home question against `packages/session/deno.json`, `packages/queue/deno.json`
and `packages/realtime/deno.json`; blast radius against seven gate scripts and configs plus
`.github/workflows/test.yml`; the open backlog for `domain:realtime` and `domain:redis`. **Not
covered**: `fake_redis.ts`'s `#exec` arms, so the #280 correspondence in A3 is argued from the driver
and the plan rather than from the fake; `packages/vite/tests/css.test.ts` beyond the `ignore:` line;
§11; §2's scenarios against #273's acceptance criteria one by one.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel with the architecture
audit. Kept separate on purpose — the two answer different questions.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | MEDIUM — the control secret had no stated provenance, while FR-011 commits to a copy-pasteable block in the two files integrators read. Verified: `redis.ts:350-358` enforces ≥32 bytes and `publishControl` refuses without one, so the harness *must* mint one. A test-grade secret published in a framework README and copied into a deployment cannot be recalled. | **Plan changed** — new **FR-010**: minted per run from `crypto.getRandomValues`, no literal in any tracked file, documentation shows provenance not value. New §5 row. |
| S2 | MEDIUM — FR-005 quantified over *keys*; `PUBLISH`/`PSUBSCRIBE` topics fell outside it, and the subscribe path does not go through the command client, so the enumerating grep missed it too. This is precisely where #272's future replay test ("capture a signed frame, re-publish it") will reach for a broad subscribe. | **Plan changed** — FR-005 now binds keys **and** topics, caps any pattern at `<namespace>*`, and its search covers both connections. Recorded in §12 that the harness should expose a namespace-bounded signed-frame seam so #272 inherits the boundary. |
| S3 | MEDIUM — FR-006's cleanup was not bound to a `finally`, so SC-004 was unachievable on the failing run that matters most; and some driver keys carry no TTL (confirms #278). | **Plan changed** — FR-006 is `finally`-bound and names the no-TTL keys; SC-004 now says "including after a failing run". |
| S4 | MEDIUM — `LOCKNESS_REDIS_TLS` was the one env var with no stated default and it pairs with `LOCKNESS_REDIS_PASSWORD`. Verified: `connection.ts:139` defaults `tls:false`; the existing one-time cleartext warning (`connection.ts:145-153`) is a real compensating control, which is why this is MEDIUM. | **Plan changed** — FR-002's preflight refuses password + no TLS + non-loopback host, rather than warning. |
| S5 | LOW — FR-003's message risked being built by interpolating `BrokerConfig`, which carries the password. The connection layer is already clean here; the new harness is the one place that would not inherit it. | **Plan changed** — FR-003 bounds the message to host and port and forbids stringifying `BrokerConfig`; §6 carries it as an invariant. |
| S6 | LOW — the namespace generator's alphabet was unpinned, and the namespace becomes both a `SCAN … MATCH` glob and the driver's unvalidated `prefix`. Explicitly **not** reported as injection: the value is not attacker-controlled, so the realistic damage is a concurrent run deleting a peer run's keys — a flake, not third-party data loss. | **Plan changed** — FR-005 pins `[a-z0-9]`; §6 carries `/^lockness-it:[a-z0-9]+$/` as an invariant. |
| S7 | INFO — `secret-scan.yml` triggers on `main`/`develop` and PRs to them, not on a feature branch; `/specnaut merge` opens no PR by default, so the first scan of this feature's commits happens *after* they are on `main`. Detection, not prevention. | **Objection accepted, and it changes how FR-010 is justified**: the fix is "no literal exists", never "the scanner will catch it". No workflow change in this feature. |
| S8 | INFO — `LOCKNESS_REDIS_DB` defaults to `0`, the database most likely to hold real data. That is the right default, because it exercises the namespace rule under the realistic condition rather than a comfortable one; the risk is a later reader inferring the opposite. | **Plan changed** — recorded in §12 that the DB index is not a containment boundary and may never be used to justify relaxing FR-005. |

**Explicitly not findings**, with what was checked: an unvalidated `LOCKNESS_REDIS_HOST` is not an
SSRF primitive here — CI sets no `LOCKNESS_*` variable and declares no redis service, so the suite
skips and makes no network attempt; setting the host requires already controlling the shell.
FR-012's root task is not a permission widening — the existing `"test": "deno test -A"` is already
fully permissioned. And on "what an authenticated stranger gets against someone else's account":
**nothing**, and here is what was checked — zero production files change, no route, handler, guard,
session path, identifier or serialization surface is added, and `RedisBroadcastDriver`'s
authorization posture is unchanged (it performs none by design; `ChannelManager.deliverLocal`
remains the single home for local re-authorization, which US1 asserts rather than alters). The
strongest true statement available is a *test-time* one: S2's over-broad-subscribe path would have
read another **deployment's** traffic on a shared broker — operator-to-operator, not user-to-user.

**Verdict** (`security-expert`, plan-time, read-only): **needs_followup / approve with changes** — 0
CRITICAL, 0 HIGH, 4 MEDIUM, 2 LOW. The containment design (namespace + scoped cleanup + the outright
`FLUSHDB`/`FLUSHALL`/`KEYS` ban) was judged sound in shape; every finding is an under-specified edge,
fixed by editing an FR before any code exists. **Covered**: `plan.md`; `drivers/redis.ts`;
`redis/connection.ts`, `client.ts`, `subscriber.ts`; `realtime/protocol.ts`;
`driver_redis_live.test.ts`; `secret-scan.yml`; `test.yml`; `deno.jsonc`; the constitution; the open
backlog for `domain:realtime`, `domain:redis` and `security`. **Not covered**: the access-control,
supply-chain, logging, design/business-logic and language-footgun knowledge-base files were not
loaded this run (budget) — S2's least-privilege reasoning cites the configuration-hardening file as
a substitute and says so.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Q1 — Does this feature add a CI job with a `redis:7` service so the gate is actually turned on somewhere? (A8) | **Yes — added in this feature.** A suite nothing ever runs is the failure mode #273 was filed for; shipping it unexercised would repeat the pattern in the same breath as describing it. `.github/workflows/test.yml` gains a job with a `redis:7` service container and the gate set. | 2026-09-05 |
| Q2 — Does US4 (the durable revocation index against real `ZADD GT` / `EXPIRE NX\|GT` / `TIME`) stay in scope? #273's acceptance criteria name SC-001/002/003 only. | **Yes — kept in.** It is the highest-value live coverage available: that code was wrong twice and green both times, and the probe recorded in §1 shows the shipped fix is correct while nothing in the repository proves it. The harness is the same either way. | 2026-09-05 |

### Decided without asking

- **Two managers in one Deno process, not two OS processes.** Each gets its own driver, its own
  `instanceId` and its own pair of sockets, so every assertion still travels through the broker.
  Real subprocesses would prove nothing further and would be far harder to keep sanitizer-clean.
  `driver_redis_live.test.ts` already does this.
- **Discrete env vars, not a `redis://` URL.** A URL needs a parser, and a parser in a test is
  either duplicated logic or a new public export on `@lockness/redis` — scope this feature has no
  reason to open.
- **Namespace + targeted cleanup, never `FLUSHDB`.** A test that can wipe a developer's broker is a
  test nobody runs twice.
- **`SCAN`, not `KEYS`.** `KEYS` blocks the server, and the suite may run against a broker with
  someone else's working set on it.
- **The harness exposes a raw signed-frame publish/observe seam, scoped to the run namespace.**
  #272 will add anti-replay to the control-frame wire format, and the assertion that a duplicate is
  rejected needs to publish an attacker-chosen payload onto *this run's* control topic and observe
  the drop. Providing that seam now, namespace-bounded, is what keeps #272's test from reaching for
  an unbounded subscribe.
- **The DB index is not a containment boundary.** `LOCKNESS_REDIS_DB` defaults to `0` deliberately,
  so FR-005's namespace is the only thing separating the run from the operator's data and is
  exercised under the realistic condition. No future relaxation of FR-005 may be justified by the DB
  selection.
- **CI's `LOCKNESS_REDIS_HOST` comes from the workflow file**, never from anything a fork's pull
  request can influence. Binding as of Q1's answer, not hypothetical.
