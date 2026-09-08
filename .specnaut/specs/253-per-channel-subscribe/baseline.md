# #295 — baselines

Measured **before** any change, on `main` at `c7d3e761`, against a scratch
Redis 7 broker on port 6388. Every figure is read from the **broker**, never
sampled client-side: `PUBLISH` returns its receiver count as an integer, and
`INFO commandstats` counts `PSUBSCRIBE` calls. Neither can be satisfied by
timing, and both work identically against `FakeRedis`, whose `PUBLISH` returns
the same count (`tests/fake_redis.ts:538`).

> Port 6379 on the development machine belongs to an unrelated project's
> container. Scratch brokers bind 6388.

## Pre-flight (T001)

`LOCKNESS_REDIS_PORT=6388 deno task test:redis` → **377 passed, 0 failed**
(1 m 3 s). Every later red is this feature's.

## T003 — the quadratic, measured rather than asserted

N `psubscribe` calls on one `RedisSubscribeConnection`, counted broker-side
after the count stops moving.

| N | `PSUBSCRIBE` frames | N(N+1)/2 |
| ---: | ---: | ---: |
| 8 | **36** | 36 |
| 32 | **528** | 528 |
| 128 | **8 256** | 8 256 |

**Exact at all three values, not approximate.** `psubscribe` records the
pattern and re-issues the *whole* recorded set (`subscriber.ts:582` →
`#activate([...patterns.keys()])`), so watch #k writes k frames.

This is the arithmetic the architecture audit's first CRITICAL asserted, and it
had gone three plan revisions without anyone running it. Extrapolated to the
plan's N = 3 000: **4 501 500 frames** against 3 000 — the figure §10 C1 quotes,
now anchored to three measured points rather than to a formula.

**What it is not.** Today's realtime driver issues **one** glob at `onMessage`,
so a deployment does not pay this. It is what a per-channel implementation pays
if `#activate` is called per join without the delta — which is exactly what
FR-008 asks for and FR-009 makes possible. SC-005 is the criterion that keeps
it from coming back, and its construction is part of it: N calls started
without awaiting and settled with `Promise.all`, never `for (…) await`.

## T002 — fan-out today

One subscriber pattern-subscribing `${prefix}__event:*`, exactly as
`RedisBroadcastDriver.onMessage` does, hosting `alpha` only.

| Publish target | Receivers |
| :--- | ---: |
| `alpha` — hosted | 1 |
| `beta` — **not** hosted | **1** |
| `beta` under a *different* prefix | 0 |

**The middle row is the feature.** SC-001's claim is that it becomes **0** while
the first stays 1.

**The third row is the constraint.** #288's nested-prefix isolation already
holds, and this feature must not disturb it — R-1. It is recorded here so a
regression shows up as a changed number rather than as an argument.

## After — measured against the shipped tree (T052)

Same broker, same instruments, same run shape.

### T003 — the quadratic is gone, exactly

| N | before | after | N(N+1)/2 |
| ---: | ---: | ---: | ---: |
| 8 | 36 | **8** | 36 |
| 32 | 528 | **32** | 528 |
| 128 | 8 256 | **128** | 8 256 |

Exactly N at all three points, where it was exactly N(N+1)/2. At the plan's
N = 3 000 that is **3 000 frames instead of 4 501 500**.

### T002 — fan-out

| Publish target | before | after |
| :--- | ---: | ---: |
| `alpha` — hosted | 1 | 1 |
| `beta` — **not** hosted | 1 | **0** |
| `beta` under a *different* prefix | 0 | 0 |

The middle row is the feature: SC-001's claim, met. The third row is R-1's
constraint: #288's nested-prefix isolation is **unchanged**, which is what the
row was recorded for.

### One instrument changed, and the change is the point

The before column counted `PSUBSCRIBE` calls. The after column counts
`PSUBSCRIBE` **and** `SUBSCRIBE`, because an exact topic is now issued with
`SUBSCRIBE` — measured with `ACL DRYRUN` against Redis 7, a `&prefix__event:*`
rule authorizes `SUBSCRIBE prefix__event:alpha` by glob and refuses
`PSUBSCRIBE prefix__event:alpha` by literal match. Counting only the pattern
verb would have reported **zero frames** and read as a spectacular win.

## Where these figures are quoted

`docs/realtime.md`'s per-channel section quotes the fan-out table; the SC-005
witness in `packages/redis/tests/subscriber.test.ts` quotes the quadratic. Both
are quoted **from here**, and a change to either belongs here first.
