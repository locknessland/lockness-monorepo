# @lockness/redis

A minimal, dependency-light Redis client for Lockness — the raw
[RESP](https://redis.io/docs/reference/protocol-spec/) wire codec plus a
reusable `RedisClient` that owns one self-healing, command-serialized
connection.

This is a **foundation** package: it depends only on `@lockness/contract` and is
consumed by the framework's durability-critical Redis features — session storage
(`@lockness/session`), the distributed scheduler lock (`@lockness/scheduler`),
and the durable queue driver (`@lockness/queue`). It owns its socket (via
`Deno.connect` / `Deno.connectTls`) rather than wrapping an app-supplied client,
so connection lifetime, single-flight connect, and lifecycle-drain close are
handled the same way everywhere.

## What it provides

- **RESP codec** — `encodeCommand`, `writeFrame`, `readReply`, the `RespReply`
  union and `RespServerError` / `RespFramingError`.
- **`RedisClient`** — one connection with lazy single-flight connect, the `AUTH`
  / `SELECT` handshake, command serialization, self-heal on failure, and
  `registerDisposable` close on lifecycle drain. Config:
  `{ hostname, port?, password?, db?, tls? }`.
- **TLS** — set `tls: true` (or use a `rediss` endpoint) to wrap the socket with
  `Deno.connectTls`; certificate validation is **on** by default.
- **Memo key** — `redisMemoKey` / `sha256Hex` fold the password through a
  SHA-256 digest so a connection cache key is never the cleartext password.

## Usage

```ts
import { RedisClient } from '@lockness/redis'

const client = new RedisClient({ hostname: '127.0.0.1', port: 6379 })
const pong = await client.command('PING')
```

Consumers build their own commands on `client.command(...)`. See
[`AGENTS.md`](AGENTS.md) for the agent-facing brief.
