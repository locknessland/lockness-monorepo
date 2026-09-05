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

**Revocation** — authorization is point-in-time at subscribe. Fan-out is not
re-authorized per message; it delivers to the subscription set the authorizer
approved at subscribe time. **Eviction is therefore the one revocation path.**
To act on a logout / kick / account-disable mid-connection:

```ts
// Leave one channel (a plain channel leave — the socket stays open).
await manager.unsubscribe(clientId, 'private-orders')

// Disconnect from every channel (still local; the socket is not force-closed).
await manager.disconnect(clientId)

// Server-only, cross-process eviction — hard-closes the socket wherever it
// lives, and stays revoked across a reconnect. Prefer this for a real revoke.
await manager.evict(clientId)
```

`unsubscribe` and `disconnect` are `async` (a presence leave now round-trips to
the authoritative roster). `evict` is a **server-only** entry point — it is
never reachable from a client frame — and on a multi-instance deployment it
reaches the instance that owns the socket over the Redis driver's control plane.
See [Running on more than one instance](#running-on-more-than-one-instance).

## Drivers

The memory driver is single-process. The Redis driver fans broadcasts across
processes: it publishes with a normal `PUBLISH` command and receives via a
subscribe-mode connection. Each receiving instance **re-applies its own
authorization** — a Redis message is delivered only to that instance's
authorized local subscribers.

For production, build the driver from a single Redis connection config with
`RedisBroadcastDriver.fromConfig` — it constructs both ends internally (a
serialized-command `RedisClient` for `PUBLISH` / roster state, and a dedicated
subscribe-mode `RedisSubscribeConnection` for the pub/sub socket), mirroring how
`@lockness/queue` builds its client. Both connections are lazy — nothing dials
until the first command or subscribe:

```ts
import { RedisBroadcastDriver } from '@lockness/realtime'

const driver = RedisBroadcastDriver.fromConfig(
    { hostname: 'localhost', port: 6379 },
    {
        prefix: 'myapp:rt',
        // Required for the control plane (eviction + cross-instance presence).
        control: { secret: Deno.env.get('REALTIME_SECRET')! },
    },
)

const manager = new ChannelManager({ driver })

// On shutdown — releases the subscribe socket then the command client:
await driver.close()
```

The public constructor `new RedisBroadcastDriver(command, subscriber, options)`
is preserved for tests: it takes an injected command client and subscribe-mode
connection (a fake bus), so unit tests need no live Redis. `fromConfig` is the
only path that opens real sockets, and it is the only one whose `close()` has
connections to release.

See [Running on more than one instance](#running-on-more-than-one-instance) for
the roster, eviction, and the control-plane security posture.

## Running on more than one instance

With the Redis driver, presence and eviction are **authoritative across every
instance** behind a load balancer — the gap that kept earlier releases
single-instance.

### The authoritative presence roster

The `here` set for a presence channel is owned by the driver in Redis (a
per-channel member store), not by any one instance's memory. When a client joins
`presence-lobby` on instance A and another joins on instance B, `subscribe`
returns the **cross-instance** roster (both members) and a `joined` frame
reaches presence subscribers on **both** instances. A leave — `unsubscribe`,
`disconnect`, or a socket close — removes the member from the authoritative
roster and fans a `left` to every instance.

Fan-out itself stays pure pub/sub: the roster is consulted on
subscribe/unsubscribe/evict only, never on the per-event delivery path.

**Ghost sweep.** Each instance carries an owner id on the roster entries it adds
and refreshes an instance-liveness key on a heartbeat. If an instance crashes
without cleanup, a surviving instance's periodic reconcile pass sweeps the dead
instance's members, so a crash leaves no permanent ghosts. Tune it with the
`presence` option:

```ts
RedisBroadcastDriver.fromConfig(config, {
    control: { secret },
    presence: {
        livenessTtlSeconds: 15, // a silent instance is "dead" after this
        heartbeatIntervalMs: 5000, // this instance refreshes its liveness key
        reconcileIntervalMs: 10000, // sweep dead instances + re-check revocations
    },
})
```

### Cross-process eviction

`manager.evict(clientId)` revokes a connection wherever its socket lives. It
first records a **durable revocation marker** in Redis, then either revokes the
socket locally (if this instance owns it) or publishes an authenticated `evict`
control message so the owning instance revokes it. A revocation-driven evict
**hard-closes** the socket (close code `4403`), so delivery stops immediately —
unlike a plain channel leave, which only unsubscribes.

The durable marker is what closes the reliability gap: if the `evict` control
message is lost while the owning socket is between reconnects, the marker keeps
the connection revoked and the owning instance recovers the missed evict. The
marker self-expires after `revocationTtlSeconds` (default `300`) so the
revocation set never grows without bound.

**Two triggers re-check the marker**, and every deployment gets both:

| Trigger                    | When it fires                                                                      | What it bounds                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Subscribe-socket reconnect | The instant the instance's pub/sub socket re-dials and re-issues its subscriptions | Recovery is immediate at the routine moment a frame is lost — a re-dial is precisely the window in which an `evict` goes missing |
| Periodic reconcile         | Every `reconcileIntervalMs` (default `10000`)                                      | The backstop for a frame lost some other way — dropped by the ingest guard, say — with no socket fault involved                  |

They invoke the **same** re-check, so nothing is recovered twice and nothing is
recovered only once. The reconnect trigger is additive: an integrator whose
subscriber does not expose a reconnect hook falls back to the periodic pass
alone, unchanged.

> **Operational note.** The subscribe socket currently re-dials on an idle bus
> even with no fault, because it reads with a 30s deadline and sends no
> keepalive — see
> [#274](https://github.com/locknessland/lockness-monorepo/issues/274). Each of
> those re-dials is a window in which a control frame can be lost, which is
> exactly what the reconnect trigger recovers from. A re-dial that fails to
> connect is not currently retried
> ([#275](https://github.com/locknessland/lockness-monorepo/issues/275)); the
> failure is logged at WARN and names that no further attempt will be made.

### Security posture: the bus is trusted, the `prefix` is not a boundary

Control messages (`evict`) **and** presence-identity announcements
(`presence-join` / `presence-leave`) are **HMAC-authenticated** with a
per-deployment shared secret (`RealtimeControlConfig`). The secret is set once,
identically on every instance, via the `control` option:

```ts
RedisBroadcastDriver.fromConfig(config, {
    control: { secret: Deno.env.get('REALTIME_SECRET')! },
})
```

Every control / presence-identity frame carries an HMAC over its payload,
verified **before** the message is actioned; a frame with an absent or failed
MAC is dropped with a warning and never obeyed — so a peer with bus `PUBLISH`
cannot forge an evict or spoof a presence member. Without a `control` secret
configured, the driver **refuses to publish** a control frame and **drops**
every inbound one (both with a warning): the control plane and cross-instance
presence announcements are effectively off, so the secret is **required** for
any app that uses presence or eviction across instances.

**The reserved `prefix` is NOT a security boundary on its own.** Redis pub/sub
has no per-topic ACL by default, so the prefix is isolation by convention only —
anyone with `PUBLISH` on the bus can write to a prefixed topic. On a shared or
multi-tenant Redis, the HMAC (which the framework provides) is what actually
authenticates the control plane; layer per-prefix Redis ACLs on top where your
Redis supports them, and hold the roster/pub-sub bus to the same TLS + AUTH
posture as any other credentialed connection.

The channel-event path keeps its existing defence in depth on top of all this:
every message off the bus is re-validated on ingest (channel/event names via
`isValidName`, bounded payload size), and the **receiving** instance re-applies
its own local authorization before delivering to a subscriber — a peer cannot
inject an out-of-charset name or reach an unauthorized local connection.

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
