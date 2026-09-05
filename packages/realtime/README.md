# @lockness/realtime

Bidirectional real-time for Lockness — WebSockets and broadcasting over
authorized channels, with presence, on top of Hono's `upgradeWebSocket`.

```ts
import { createWebSocketHandler } from '@lockness/realtime'

app.get(
    '/ws',
    createWebSocketHandler({
        // Identity is resolved AT the upgrade from a verified credential —
        // never from a wire frame.
        resolveIdentity: (c) => c.get('user') ?? null,
        // Same-origin by default (from APP_URL); widen with `origins`.
        hooks: {
            onOpen: (conn) => console.log('open', conn.id, conn.identity),
            onMessage: (conn, data) => conn.send(`echo: ${data}`),
            onClose: (conn, code) => console.log('close', conn.id, code),
        },
    }),
)
```

## What ships

- **A WebSocket handler** over `upgradeWebSocket` with `onOpen` / `onMessage` /
  `onClose` / `onError` hooks, each receiving a typed `Connection` (stable id,
  `send`, `close`, a server-derived `identity`, free-form `metadata`).
- **A CSWSH origin guard** — fail-closed, exact origin triple, same-origin by
  default from `APP_URL`.
- **Channels** — public / private / presence, with an app authorizer, backed by
  a memory or Redis driver. The Redis driver runs across instances: broadcasts
  fan out over pub/sub, the presence `here` roster is authoritative in Redis,
  and `manager.evict(id)` revokes a connection wherever its socket lives. Build
  it with `RedisBroadcastDriver.fromConfig(config, { control: { secret } })` —
  the control plane and presence-identity frames are HMAC-authenticated, and the
  reserved `prefix` is not a security boundary on its own.
- **A broadcaster** that satisfies `@lockness/notification`'s `BroadcasterLike`
  — real-time is a drop-in notifications broadcast transport.
- **A JSON wire protocol** + an optional browser client helper.
- **An events bridge** — an event that implements `broadcastOn()` is forwarded
  to those channels (`@lockness/events` soft-loaded).

See [docs/realtime.md](../../docs/realtime.md) for the full guide.
