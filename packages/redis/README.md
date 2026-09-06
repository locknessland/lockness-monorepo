# @lockness/redis

A minimal, dependency-light Redis client for Lockness — the raw
[RESP](https://redis.io/docs/reference/protocol-spec/) wire codec, a shared
authenticated-socket primitive both connection kinds dial through, a reusable
`RedisClient` that owns one self-healing, command-serialized connection, and a
`RedisSubscribeConnection` that owns an exclusive subscribe-mode socket.

This is a **foundation** package: it depends only on `@lockness/contract` and is
consumed by the framework's durability-critical Redis features — session storage
(`@lockness/session`), the distributed scheduler lock (`@lockness/scheduler`),
the durable queue driver (`@lockness/queue`), and the cross-process pub/sub
fan-out in `@lockness/realtime`. It owns its socket (via `Deno.connect` /
`Deno.connectTls`) rather than wrapping an app-supplied client, so connection
lifetime, single-flight connect, and lifecycle-drain close are handled the same
way everywhere.

## What it provides

- **RESP codec** — `encodeCommand`, `writeFrame`, `readReply`, the `RespReply`
  union and `RespServerError` / `RespFramingError`.
- **`AuthenticatedConnection`** — the one home for a Redis socket's dial + TLS
  wrap + `AUTH` / `SELECT` handshake + one-time cleartext-AUTH warning +
  self-heal. Both `RedisClient` and `RedisSubscribeConnection` consume it, so a
  fix to Redis auth or TLS has a single home rather than two. It is a socket,
  not a client: `connect()` hands back a live authenticated `Deno.Conn`;
  `discard()` closes a desynced one so the next `connect()` reconnects clean.
  The `exchange` helper runs one request/reply on an open socket.
- **`RedisClient`** — one connection with lazy single-flight connect, command
  serialization, self-heal on failure, and `registerDisposable` close on
  lifecycle drain. Config: `{ hostname, port?, password?, db?, tls? }`.
- **`RedisSubscribeConnection`** — an **exclusive subscribe-mode** socket. After
  `PSUBSCRIBE` a Redis connection only accepts (P)SUBSCRIBE/(P)UNSUBSCRIBE/PING/
  QUIT and receives push frames unbidden — the opposite of `RedisClient`'s
  one-request/one-reply discipline, so it cannot share that socket and opens its
  own (through the same `AuthenticatedConnection`).
  `psubscribe(pattern, handler)` calls `handler(topic, payload)` per pushed
  message using the bounded RESP reader; on a wire fault it reconnects and
  re-issues **every** active pattern, logged at WARN, never silently.
  `onReconnect(handler)` registers a nullary callback fired once that re-issue
  succeeds — the routine moment a pub/sub frame is lost, so a consumer can
  reconcile whatever the lost frames would have carried. It never fires on the
  first connect or on a failed re-dial, and a handler that throws is contained
  and warned without disarming the seam. Both methods structurally satisfy
  `@lockness/realtime`'s `RedisSubscriber` port.
- **TLS** — set `tls: true` (or use a `rediss` endpoint) to wrap the socket with
  `Deno.connectTls`; certificate validation is **on** by default (no trust-all).
- **Memo key** — `redisMemoKey` / `credentialFingerprint` / `hmacSha256Hex` /
  `sha256Hex` fold the password through a keyed HMAC so a connection cache key
  is never the cleartext password.
- **A shared live-broker test harness** (`tests/live_broker.ts`) — the gate,
  connection contract, preflight, run namespace, `SCAN`-scoped teardown and
  `waitFor` that any package's integration suite uses to run against a **real
  Redis**. It lives here, not beside its first consumer, because every Redis
  consumer can import this package and they cannot all import each other.
  `@lockness/realtime` uses it today. Excluded from the published package — it
  is for contributors, not for consumers. See [`AGENTS.md`](AGENTS.md) for the
  API and [`docs/testing.md`](../../docs/testing.md) for running the suites.

## Usage

```ts
import { RedisClient, RedisSubscribeConnection } from '@lockness/redis'

// Serialized command client — one request, one reply.
const client = new RedisClient({ hostname: '127.0.0.1', port: 6379 })
const pong = await client.command('PING')

// Subscribe-mode connection — its own socket, push frames delivered per pattern.
const sub = new RedisSubscribeConnection({ hostname: '127.0.0.1', port: 6379 })
sub.onReconnect(() => {
    // the socket was deaf for a moment — reconcile what the lost frames carried
})
sub.psubscribe('lockness:realtime:*', (topic, payload) => {
    // deliver `payload` for `topic`
})
// …later
await sub.close()
```

Consumers build their own commands on `client.command(...)`. See
[`AGENTS.md`](AGENTS.md) for the agent-facing brief.

## Keeping the subscribe socket alive

A subscribe socket idles by design, so silence proves nothing on its own. The
connection keeps one **liveness clock**: it writes a `PING` at a short cadence,
and treats a longer silence — from any cause — as a dead peer. Any inbound frame
resets it, whether that is a delivered message, a subscribe confirmation, or the
keepalive's own pong.

A failed activation is **retried, never abandoned**. Going deaf is the failure
being prevented, so there is no exhaustion state: retries slow down, they do not
stop. Backoff carries full jitter, so a fleet that loses a broker at the same
instant does not re-dial it in lockstep.

Four knobs, on `RedisSubscribeConnectionConfig` (which
`RedisSubscribeConnection` takes) and, through `RedisBroadcastConnectionConfig`,
on `RedisBroadcastDriver.fromConfig`:

| Option        | Default  | What it decides                                                                                                                 |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `keepaliveMs` | `15_000` | How often a `PING` is written on an idle socket                                                                                 |
| `livenessMs`  | `45_000` | The longest silence tolerated before the socket is declared dead. Bounds the **whole activation**, `AUTH` and `SELECT` included |
| `retryBaseMs` | `250`    | The first retry delay after a failed activation                                                                                 |
| `retryMaxMs`  | `30_000` | The backoff ceiling. Retries are unbounded in count, bounded in interval                                                        |

`livenessMs` must be **at least twice** `keepaliveMs`, every value must be
positive and finite, and `retryMaxMs` must not be below `retryBaseMs`. A set
that breaks any of those throws a `RangeError` at construction rather than
degrading in production — at `keepaliveMs + 1` the pong can never arrive in
time, which turns the liveness window back into the churn it exists to remove.

```ts
const sub = new RedisSubscribeConnection({
    hostname: '127.0.0.1',
    port: 6379,
    keepaliveMs: 10_000,
    livenessMs: 30_000,
})
```

**What the window actually bounds.** `livenessMs` covers the **whole
activation** — the dial, the `AUTH`/`SELECT` handshake, and the read loop. That
was not true at first: `AUTH` and `SELECT` inherited the command path's
30-second default, and the dial itself was unbounded, so a peer that completed
TCP and then stalled the TLS handshake wedged the socket permanently and
silently. Set `handshakeTimeoutMs` explicitly to give the dial and handshake a
different budget from the read loop; left unset, it follows `livenessMs`.

**Reply size bounds.** Three, and all of them are size checks rather than
timeouts, because a bound that rides on a deadline gets weaker every time the
deadline grows — silently:

| Constant                   | Bounds                                              |
| -------------------------- | --------------------------------------------------- |
| `MAX_BULK_BYTES` (10 MiB)  | one bulk body                                       |
| `MAX_LINE_BYTES` (64 KiB)  | one CRLF-terminated line                            |
| `MAX_REPLY_BYTES` (32 MiB) | the **total** one `readReply` may pull off the wire |

The third exists because the first two bound the parts and not the sum: a
multi-bulk reply of individually-legal elements aggregated without limit, and
the parsed form is far larger than the wire that produced it — 4 MB of wire
measured at 81.5 MB of heap.

**Operational notes.** Every failed attempt logs at WARN with its attempt number
and the delay before the next one, and a recovery logs once with how many
attempts it took — an outage that ends is as visible as one that starts. When
`tls` is off and a password is set, the retry line also says that `AUTH` is
being re-sent in cleartext (never the value): the constructor's one-time warning
has long scrolled away by the time a retry loop is running, and a client that
never gives up knocks on that address indefinitely.
