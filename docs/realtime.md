# Real-time (WebSockets + broadcasting)

`@lockness/realtime` adds bidirectional real-time to Lockness — a WebSocket
handler over Hono's `upgradeWebSocket`, authorized public/private/presence
channels with presence, a memory/Redis broadcast driver, a JSON wire protocol,
and an events → broadcast bridge. The broadcaster is a drop-in transport for
`@lockness/notification`'s broadcast channel.

## The connection

```ts
import { createWebSocketHandler } from '@lockness/realtime'

app.get(
    '/ws',
    createWebSocketHandler({
        // Identity is resolved AT the upgrade from a verified credential —
        // NEVER from a wire frame.
        resolveIdentity: (c) => c.get('user') ?? null,
        origins: ['https://app.example.com'], // same-origin by default (APP_URL)
        hooks: {
            onOpen: (conn) => manager.register(conn),
            onMessage: (conn, data) => handleFrame(conn, data),
            onClose: (conn) => manager.disconnect(conn.id),
        },
    }),
)
```

The origin guard is **fail-closed**: exact origin triple, same-origin by default
from `APP_URL`, and an absent / `null` / substring-lookalike origin is rejected.

## Channels

Channel kind is derived from the name: `presence-*`, `private-*`, else public.

```ts
import { ChannelManager } from '@lockness/realtime'

const manager = new ChannelManager({
    // Enforced at subscribe over the connection's server-derived identity.
    authorize: (identity, channel) => {
        if (channel.startsWith('presence-')) {
            return identity
                ? { id: identity.id, info: { name: identity.name } }
                : false
        }
        return identity != null // private: allow authenticated
    },
})

await manager.subscribe(conn, 'private-orders') // rejected if unauthorized
manager.broadcast('private-orders', 'created', { id: 1 })
```

A private/presence subscribe is confirmed **only after** the authorizer
approves; an unauthorized connection never receives that channel's events. A
presence channel returns the current member roster and emits join/leave to
members only.

**Revocation** — authorization is point-in-time at subscribe. To act on a logout
/ kick / account-disable mid-connection, call the eviction primitive:

```ts
manager.unsubscribe(clientId, 'private-orders')
manager.disconnect(clientId)
```

> Eviction is **single-process** in this release: it removes the connection from
> the local instance only. Cross-process eviction (propagating a revoke over the
> Redis driver so it reaches the instance owning the socket) ships with the
> cross-process presence follow-up — until then, revocation on a multi-instance
> deployment is enforced per-instance.

## Drivers

The memory driver is single-process. The Redis driver fans broadcasts across
processes: it publishes with a normal `PUBLISH` command and receives via a
subscribe-mode connection. Each receiving instance **re-applies its own
authorization** — a Redis message is delivered only to that instance's
authorized local subscribers.

```ts
import { RedisBroadcastDriver } from '@lockness/realtime'

const manager = new ChannelManager({
    driver: new RedisBroadcastDriver(redisClient, pubsubConnection, {
        prefix: 'myapp:rt',
    }),
})
```

> **Presence is single-process authoritative** in this release: the Redis driver
> fans join/leave notifications, but the authoritative `here` roster is
> per-instance. Full cross-process presence (a Redis-owned member set) is a
> tracked follow-up. The subscribe-mode Redis connection is likewise a
> `@lockness/redis` follow-up — its serialized command client cannot subscribe.

## As a notifications broadcaster

`ChannelManager.send(clientId, event, data)` satisfies
`@lockness/notification`'s `BroadcasterLike`, so real-time delivers the
notification broadcast channel:

```ts
import { registerBuiltInChannels } from '@lockness/notification'
registerBuiltInChannels(defaultManager, { broadcaster: realtimeManager })
```

## Broadcasting events

An event that implements `broadcastOn()` is forwarded to those channels. Only
`broadcastWith()` leaves the server — never the whole event:

```ts
import { startBroadcasting } from '@lockness/realtime'

class InvoicePaid {
    constructor(readonly invoiceId: number) {}
    broadcastOn() {
        return ['private-billing']
    }
    broadcastWith() {
        return { invoiceId: this.invoiceId } // the ONLY data broadcast
    }
}

const controller = new AbortController()
await startBroadcasting(realtimeManager, { signal: controller.signal })
// on shutdown: controller.abort()
```

`@lockness/events` is soft-loaded; a realtime app that does not use events pulls
nothing.

## The client

```ts
import { RealtimeClient } from '@lockness/realtime/client'

const client = RealtimeClient.connect('wss://app.example.com/ws')
client.on('message.created', (data) => render(data)) // render must escape!
client.subscribe('private-room.1')
```

The client hands server-relayed names and payloads to your handler **verbatim**
— they are attacker-influenced, so your handler must output-encode them.

## Building it

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze
deno test -A packages/realtime/
```
