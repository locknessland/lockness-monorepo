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
  re-issues **every** active pattern, logged at WARN, never silently. It
  structurally satisfies `@lockness/realtime`'s `RedisSubscriber` port.
- **TLS** — set `tls: true` (or use a `rediss` endpoint) to wrap the socket with
  `Deno.connectTls`; certificate validation is **on** by default (no trust-all).
- **Memo key** — `redisMemoKey` / `credentialFingerprint` / `hmacSha256Hex` /
  `sha256Hex` fold the password through a keyed HMAC so a connection cache key
  is never the cleartext password.

## Usage

```ts
import { RedisClient, RedisSubscribeConnection } from '@lockness/redis'

// Serialized command client — one request, one reply.
const client = new RedisClient({ hostname: '127.0.0.1', port: 6379 })
const pong = await client.command('PING')

// Subscribe-mode connection — its own socket, push frames delivered per pattern.
const sub = new RedisSubscribeConnection({ hostname: '127.0.0.1', port: 6379 })
sub.psubscribe('lockness:realtime:*', (topic, payload) => {
    // deliver `payload` for `topic`
})
// …later
await sub.close()
```

Consumers build their own commands on `client.command(...)`. See
[`AGENTS.md`](AGENTS.md) for the agent-facing brief.
