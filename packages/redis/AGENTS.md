# `@lockness/redis` — agent brief

A raw-RESP Redis client that **owns its connections** (via `Deno.connect` /
`Deno.connectTls`, never wrapping an app-supplied client): a serialized-command
`RedisClient`, an exclusive subscribe-mode `RedisSubscribeConnection`, and the
shared `AuthenticatedConnection` primitive both dial through. The constraints
that shape it: certificate validation is always ON (no trust-all), the password
is never logged nor used as a cleartext cache key, and the connect discipline
has exactly one home so a future auth/TLS fix is not a two-place edit.

## Invariants

- **The dependency contract above is binding.** Importing anything outside it
  fails `deno task deps:analyze`, and the failure is a design question, not a
  lint to silence.

- **A serialized-command socket is never a subscribe-mode socket.**
  `RedisClient` enforces one-request/one-reply on its shared socket; after
  `PSUBSCRIBE` a connection accepts only (P)SUBSCRIBE/(P)UNSUBSCRIBE/PING/QUIT
  and receives push frames unbidden. The two cannot share a socket, so
  `RedisSubscribeConnection` opens its own. Adding a `SUBSCRIBE` branch to
  `RedisClient.command` breaks this.
- **The dial + TLS + `AUTH`/`SELECT` + cleartext-AUTH warning + self-heal have
  one home** (`connection.ts` / `AuthenticatedConnection`). Both clients consume
  it; neither re-implements it. Copying `connect()` into `subscriber.ts` reopens
  the `shotgun-surgery` this extraction closed.
- **TLS certificate validation is always ON** — there is no trust-all escape
  hatch. TLS off with a password set raises a one-time cleartext-AUTH warning.
- **The password never appears in cleartext** — not in a log line, not in a memo
  key. `memo.ts` folds it through a keyed HMAC (`credentialFingerprint`), never
  a bare SHA-256 and never the raw secret.
- **RESP framing and command encoding live only in `resp.ts`.** No second
  parser, no hand-rolled push-frame reader — the reader is bounded (max bulk
  length + per-reply deadline) so an oversized payload is rejected before
  dispatch.
- **A wire fault self-heals and is never silent.** A desync discards the socket
  and reconnects (the subscribe connection re-issues every active pattern),
  logged at WARN.

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                                                                                                                                                                                                 |
| :--------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports (static)                               | `contract`                                                                                                                                                                                                               |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                                                                                                                                                                        |
| Imported by                                    | `core`, `queue`, `realtime`, `session`                                                                                                                                                                                   |
| **Must never import**                          | `auth`, `auth-provider`, `cli`, `core`, `devtools`, `drizzle`, `init`, `mail`, `notification`, `openapi`, `queue`, `realtime`, `session`, `testing` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                       |
| :-------- | :---------------------------------------------------------------------------------------------------------------------------- |
| class     | `AuthenticatedConnection`, `RedisClient`, `RedisSubscribeConnection`, `RespError`, `RespFramingError`, `RespServerError`      |
| function  | `credentialFingerprint`, `encodeCommand`, `exchange`, `hmacSha256Hex`, `readReply`, `redisMemoKey`, `sha256Hex`, `writeFrame` |
| interface | `AuthenticatedConnectionConfig`, `RedisClientConfig`, `RedisSubscribeConnectionConfig`                                        |
| typeAlias | `RespReply`                                                                                                                   |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Intent                                                                       | File            |
| :--------------------------------------------------------------------------- | :-------------- |
| Serialized-command client (`command`, single-flight, QUIT-drain close)       | `client.ts`     |
| Subscribe-mode connection (`psubscribe`, read loop, reconnect re-subscribe)  | `subscriber.ts` |
| Shared socket discipline (dial, TLS, `AUTH`/`SELECT`, self-heal, `exchange`) | `connection.ts` |
| RESP wire codec (`encodeCommand`, `writeFrame`, bounded `readReply`, errors) | `resp.ts`       |
| Credential fingerprint / memo-key discipline (HMAC, never cleartext)         | `memo.ts`       |
| Public surface                                                               | `mod.ts`        |

## Pitfalls

- **The subscribe socket re-dials every ~30s on an idle bus.** `subscriber.ts`'s
  read loop calls `readReply(conn)` with the **default** `READ_TIMEOUT_MS`
  (`resp.ts`, 30s), and `ReplyReader` fixes its deadline at construction — so
  the deadline bounds even the wait for the _first_ byte. There is no
  subscribe-mode `PING` keepalive, and a subscribe socket idles by design, so
  the timeout is taken as a wire fault and the connection tears down and
  reconnects. It is the only caller using the default deadline; `RedisClient`
  passes its own. Invisible to the whole test suite, because the fake-server
  tests finish well under 30s. Discovered 2026-09-05 via the #271 plan audit;
  tracked as
  [#274](https://github.com/locknessland/lockness-monorepo/issues/274).
- **A failed re-dial is never retried.** `#activate`'s catch logs a WARN and
  returns without scheduling anything, and nothing else calls it again — so one
  transient connect blip leaves the connection permanently deaf. The WARN now
  says so explicitly. Tracked as
  [#275](https://github.com/locknessland/lockness-monorepo/issues/275).

## Tests

<!-- generated:tests -->

5 test files for 7 source files:

- `packages/redis/tests/client.test.ts`
- `packages/redis/tests/connection.test.ts`
- `packages/redis/tests/memo.test.ts`
- `packages/redis/tests/resp.test.ts`
- `packages/redis/tests/subscriber.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 5 test files directly —

```bash
deno test -A packages/redis/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface, tests and closing gate are generated by
`deno task agents:brief` from the code itself — fix the code, not those blocks.
Everything else is hand-written and preserved._
