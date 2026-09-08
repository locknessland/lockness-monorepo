# Baseline — #278 + #322

Measured on 2026-09-08, on `254-drop-compat-shims`, against `main` at `0c1f65fa`.

## The reason the shims were removable

| Question | Command | Answer |
| :--- | :--- | :--- |
| Which releases are published? | `gh release list` | `v0.2.0` only (2026-08-31) |
| Is #276 in one? | `git tag --contains 5b13f0b2` | **empty** — unreleased |
| How much waits behind it? | `git rev-list --count v0.2.0..main` | 506 commits, ~155 issues |

Neither shim ever protected a real deployment: no published version wrote the
sorted set, and the WARN release whose only job was to collect channel counts
was never cut.

## Before → after

| Measure | Before | After |
| :--- | ---: | ---: |
| `listRevoked` commands, 0 revocations | 2 (`EVAL` + `SMEMBERS`) | **1** |
| `listRevoked` commands, 1 revocation | 3 | **1** |
| `listRevoked` commands, 50 revocations | **52** | **1** |
| `legacyRevoked` references in `packages/` + `docs/` | 24 | **2**, both explanatory |
| Stale "next release" promises in `packages/realtime/` | 11 | 0 |
| Derived names outside the `__` anchor | 2 | **0** |
| Registers of the anchoring exemption | 2 | **0** |
| `ChannelLimitError` raise sites | 0 | 3 |
| `#304` battery rows | 10 | 8 (2 retired with #278) |

The two surviving `legacyRevoked` mentions are why-comments naming what was
removed — one in `listRevoked`'s docstring, one in the `#304` battery. Neither
derives a name; both exist so the next reader does not re-derive the reasoning.

The 52 is the one that mattered: the reconcile runs unconditionally on a
dedicated timer for every deployment class, so the legacy read cost one round
trip per revoked connection on every tick, forever.

## Pinned by a criterion, not by this file

`#278/SC-001` in `tests/revocation_atomicity.test.ts` asserts the flat cost at
0, 1 and 50 revocations, with a positive control so a one-command read that
returns nothing cannot pass it. **Proven live**: reintroducing a second
`SMEMBERS` read makes it fail by name.

`FR-004 source` in `tests/prefix_anchoring.test.ts` is now unconditional — no
exemption list to add a name to. **Proven live**: spelling one getter
`${prefix}___instances` makes it fail with the third-underscore message.

## Found while building, not planned

`assertUsablePrefix` now refuses a prefix ending in `_`. `app` and `app_` never
collided and never cross-subscribed — #288's SC-002 proved that with this exact
pair — but the ACL grant this project documents for `app`, `~app__*`, matches
every name `app_` derives, because `app_` plus the separator is `app___`. Same
credential boundary, different prefix. Since `__` was already refused, one
trailing `_` was the only shape that could do it.

**The cost is recorded rather than hidden**: `ISOLATION_PAIRS` loses the pair
#288 called "the ONLY near-miss in the isolation proof", because it can no
longer be constructed. That is a stronger guarantee proven by a weaker-looking
table, and `SC-005` is where the hard half now lives.

## Gates

| Gate | Result |
| :--- | :--- |
| `deno fmt && deno lint && deno check` | green |
| `deno task test` | **2162 passed, 0 failed** |
| `deno task deps:analyze` | no cycles, every edge permitted |
| Live broker (`LOCKNESS_REDIS_PORT=6388`) | **21 passed, 0 failed** |
| `#304` mutation battery | 8 killed, **0 unexpected survivors** |

Port 6379 hosts an unrelated container and was never touched.
