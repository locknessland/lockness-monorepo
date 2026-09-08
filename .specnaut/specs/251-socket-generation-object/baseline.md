# Baseline — before the socket-generation refactor

Recorded on branch `251-socket-generation-object`, base commit `7568163b`, 2026-09-07.

FR-007 ("no expectation edited") and SC-006 ("every suite passes") are claims about a **difference**.
This file is the other half of each. SC-009 additionally needs today's `onReconnect` fire counts
measured *before* the change, because a count reconstructed afterwards is not evidence.

> Scratch brokers use ports 6388 / 6389 / 6390 and are removed after each run. **Port 6379 on this
> machine belongs to an unrelated project's container and is never touched.**

## T001 — unit suite (`deno task test`)

```
ok | 2128 passed (764 steps) | 0 failed | 23 ignored (50s)
```

Exit 0. The 23 ignored are the live-broker suite, which skips without
`LOCKNESS_REDIS_INTEGRATION` — measured separately as T003.

## T002 — mutation batteries, no broker

| Battery | Result | Exit |
| :--- | :--- | ---: |
| `subscribe_hardening_248.ts` | **0 unexpected survivors** over 16 rows | 2 |
| `reconnect_intent_290.ts` | **0 unexpected survivors** | 0 |

Exit **2** on 248 is the per-row broker gate added under
[#319](https://github.com/locknessland/lockness-monorepo/issues/319), not a failure: four `#296`
rows mutate code whose suite needs a live broker and are skipped rather than counted as passing.
They are re-run with the broker below, because one of them — `#296 the per-generation fault counter
never resets` (`:307`) — anchors on the exact line FR-005 governs and is one of the three rows
FR-008 expects to survive this refactor untouched.

The 290 battery carries two recorded `SURVIVED*` rows whose survival is the finding; both are
`expectSurvival` and neither is unexpected.

## T002 (completed) — the 248 battery WITH a broker

Scratch Redis on **6388**. All 20 rows ran:

```
16 KILLED · 4 SURVIVED* (all recorded `expectSurvival`) · 0 unexpected survivor(s) · EXIT=0
```

The four recorded survivors are `#286 no rebase on a generation change`, `#286 the discard clear is
made unconditional`, `#297 the post-write budget guard removed` and `#296 the per-generation fault
counter never resets`. Two of them are the rows FR-008 subsumes; the last is the row FR-008 expects
to survive untouched.

## T003 — live-broker suite

```
ok | 370 passed | 0 failed (32s)     EXIT=0
```

`LOCKNESS_REDIS_HOST=127.0.0.1 LOCKNESS_REDIS_PORT=6388 deno task test:redis -- --trace-leaks`.

## T004 — `onReconnect` fire counts, TODAY

Measured by the SC-009 test itself rather than reconstructed, so the "before" and the "after" are
the same instrument. Written early (it is T022 in the breakdown) because T004 needs the number and a
count taken after the change is not evidence.

| Path | Fires today |
| :--- | ---: |
| The first dial never lands | **0** |
| The dial lands, its `PSUBSCRIBE` fails | **0** |
| A fault after delivery began | **1** |

The middle path is the one nothing covered. The suite already pinned the other two
(`FR-007: a retried FIRST connect fires nothing`, `FR-007/SC-005`), and neither reaches a dial that
**succeeds** and then fails its subscribe — which is exactly where A11's inversion would have flipped
`false` to `true` and fired the revocation seam on a connection that never had a subscriber.

## T012 — every witness proven LIVE, against its own mutant

Not against the unchanged file. This is a refactor: today's code is **correct**, so all four
witnesses pass before the change and must. What proves them live is going red against the mutation
each exists to catch.

| Witness | Mutation | Result |
| :--- | :--- | :--- |
| SC-001 | `#discardSocket`'s keepalive clear made unconditional | 🔴 → killed |
| SC-002 | `this.conn.discard(conn)` gated behind the ownership check | 🔴 → killed |
| SC-012 | `clearInterval` removed from `#clearKeepalive` | 🔴 → killed |
| SC-009 | `wasDelivering` made `true` on a failed dial (A11's shape) | 🔴 → killed |

**Two of them were DEAD on the first attempt and had to be repaired**, which is the whole reason
this step is a task rather than an assumption:

- **SC-001** used a fast `retryBaseMs`. The keepalive's stall path discards *and* schedules, so the
  retry re-dialled the cached socket and re-armed the very keepalive the mutant had just disarmed —
  the evidence was restored before it could be read. Generation 2 is now brought up by a second
  `psubscribe()` with retries switched off.
- **SC-012** counted writes on the dead socket. A leaked interval produces **no** writes, because
  `#write` refuses a frame whose generation is gone — so the count would have stayed flat while the
  interval ran forever. It now counts the `keepalive PING failed` WARN line, and the scripted socket
  fails its writes once closed, as a real one does with `BadResource`.

---

# After the refactor

| Measure | Before | After |
| :--- | :--- | :--- |
| Unit suite | 2128 passed / 0 failed | **2135 / 0** (+7 witnesses) |
| Live-broker suite | 370 / 0 | **377 / 0** (+7) |
| 248 battery | 20 rows · 16 killed · **4** recorded survivors | **23 rows · 21 killed · 2** recorded survivors |
| 290 battery | 0 unexpected survivors | unchanged |
| `subscriber.test.ts` diff | — | **+632 insertions, 0 deletions** — FR-007 holds, no expectation edited |
| `connection.ts` / `connection.test.ts` | — | **absent from the diff** — SC-011 holds |

**The branch's return, measured.** Two of the 248 battery's four recorded
survivors were the per-field ownership guards, and both are now killed rows
rather than documented gaps — including the one that battery had been carrying
since #286 as *"the highest-value uncovered guard in the branch"*. The two that
remain (`#297 the post-write budget guard removed`, `#296 the per-generation
fault counter never resets`) are unrelated to this work and were survivors
before it.

## Every witness proven live, and three of seven were DEAD first

| Witness | Killed by mutating | First attempt |
| :--- | :--- | :--- |
| SC-001 | the single ownership check | **DEAD ×3** |
| SC-002 | gating `this.conn.discard(conn)` | live |
| SC-003 | the install guard (a generation per activation) | live |
| SC-004 | `close()` awaiting the generation's loop | **RED against correct code** |
| SC-009 | `wasDelivering` inverted on a failed dial | live |
| SC-012 | `release()` no longer clearing the interval | **DEAD** |
| SC-013 | interpolating a generation into a log line | **DEAD** |

Each failure was found by running the mutant, never by reading the test. In
every case the test was green, the reasoning read correctly, and the witness
proved nothing:

- **SC-001, three times.** A fast retry re-armed the keepalive the mutant had
  just disarmed, restoring the evidence before it could be read; then the growth
  assertion was satisfied by generation 2's *second* `PSUBSCRIBE` landing after
  the baseline, so the keepalive never had to be alive at all.
- **SC-012.** It counted writes on the dead socket — but a leaked interval
  produces **no** writes, because `#write` refuses a frame whose generation is
  gone. The count stayed flat while the interval ran forever.
- **SC-013.** A runtime capture of `console.*` passed against a deliberate
  `${this.#generation}` interpolation, because at every point this file logs the
  generation has just been released and renders as `"null"`. Moved to a source
  check, which covers lines nobody has written yet.
- **SC-004** failed against *correct* code: it compared resolution order against
  a `setTimeout(0)`, and an already-resolved promise settles before a macrotask.
  The socket now unwinds late, so `close()` has something real to wait for.
