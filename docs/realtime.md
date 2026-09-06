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

### Keeping the subscribe socket alive

The subscribe socket is how every cross-process event and every control frame
reaches an instance, and it idles by design — on a quiet bus, nothing arrives
for minutes at a time. So silence alone cannot be read as a fault, and it cannot
be ignored either: a broker that stops answering has to be noticed.

The connection keeps one **liveness clock**. It writes a `PING` at a short
cadence, and treats a longer silence — from any cause — as a dead peer. Any
inbound frame resets it. A failed re-dial is retried with jittered backoff and
**never abandoned**: an instance that goes deaf stays deaf until it is
restarted, which is a worse outcome than retrying forever against a broker that
is down.

The cadences are operator-tunable through the same config object, typed as
`RedisBroadcastConnectionConfig`:

```ts
const driver = RedisBroadcastDriver.fromConfig(
    {
        hostname: 'localhost',
        port: 6379,
        // Defaults: 15s / 45s / 250ms / 30s.
        keepaliveMs: 10_000,
        livenessMs: 30_000,
        retryBaseMs: 250,
        retryMaxMs: 30_000,
    },
    {
        prefix: 'myapp:rt',
        control: { secret: Deno.env.get('REALTIME_SECRET')! },
    },
)
```

`livenessMs` must be at least **twice** `keepaliveMs`, or the keepalive cannot
arrive before the window closes and the connection churns permanently. That, and
every other cadence constraint, throws a `RangeError` at construction rather
than degrading in production. The full table is in
[`@lockness/redis`'s README](../packages/redis/README.md).

See [Running on more than one instance](#running-on-more-than-one-instance) for
the roster, eviction, and the control-plane security posture.

## Control-plane replay protection

Control frames — eviction, and cross-instance presence join/leave — are HMAC
signed with your `control.secret`. Since #272 they also carry a timestamp and a
nonce **inside** the signed payload, and a receiving instance refuses a frame it
has already seen or one issued outside a freshness window.

That closes a gap where signing alone was not enough: a signature says _this
came from someone holding the secret_, not _this is happening now_. Anyone able
to read the bus could capture a valid frame and publish it again later, without
the secret and without forging anything.

```ts
control: {
    secret: Deno.env.get('REALTIME_SECRET')!,
    // How long a frame stays obeyable, and how long its nonce is remembered.
    // Default: 30_000 (30s).
    windowMs: 30_000,
    // The largest control payload published or accepted, in bytes.
    // Default: 8192.
    maxPayloadBytes: 8192,
    // The most frame nonces one instance remembers at a time.
    // Default: 10_000.
    maxEntries: 10_000,
},
```

**`maxPayloadBytes` is enforced at both ends.** A publisher refuses to send
above its own limit and each receiver enforces its own, so raise it on **every**
instance at once — a fleet running mixed values silently loses the frames that
fall between them. If your own instance logs
`refusing to publish an oversized
control message`, a `PresenceMember.info`
payload has outgrown the ceiling: shrink it, or raise the option fleet-wide.

**Widen the window only for a fleet whose clocks genuinely drift.** A longer
window is a longer period in which a captured frame remains replayable against
an instance that restarted, and a proportionally larger nonce store. It is not a
robustness dial to turn up "just in case".

**`maxEntries` is reached by ordinary load, not only by attack.** A client
reconnecting produces **two** presence control frames per channel — a `leave` as
the old socket drops and a `join` as the new one lands — so a rolling deploy or
a load-balancer failover puts roughly `clients x channels x 2` frames inside one
window. For 5 000 clients across two presence channels that is about 20 000,
well past the 10 000 default. At the cap every instance is guaranteed an equal
share of it — `maxEntries` divided by the number of instances currently in the
store — and what is dropped is the oldest nonce belonging to an instance
**above** its share. An instance under its share is never evicted to make room
for another's traffic. When the cap divides evenly and nobody is over their
share, the instance asking for the slot pays with its own oldest nonce rather
than a bystander's — except on its very first frame, when it holds nothing to
pay with and the oldest nonce in the store goes instead. That is one nonce,
once, per instance joining a perfectly-divided cap. The surplus above the shares
goes to whoever sent most recently. The cost of any eviction is that a frame
older than the evicted entry but still inside the window could be replayed once.
That is deliberate: refusing new entries instead would fail the control plane
closed, which is worse than the replay it prevents.

**Size `maxEntries` against your fleet, not just your traffic.** The guarantee
is an equal share, and an equal share of a cap that is too small is still small:
500 instances sharing the 10 000 default get 20 nonces each, which at a busy
moment is a fraction of one window. No allocation rule can do better — there are
only 10 000 slots — so the number to change is the cap. The at-cap WARN names
both the cap and how many instances are currently sharing it, which is exactly
the pair you need to size it.

**Raise `maxEntries` before you widen `windowMs`.** A bigger store costs memory;
a longer window costs replayability. The WARN names both the cap and how many
instances are sharing it, and it repeats at most once a minute while frames keep
arriving — so a single line means a brief burst, and a repeating one means you
are living at the cap. It is raised on admission, not on a timer, so a store
that fills and then goes quiet logs once and stops.

### Reading the drop logs

Every rejection says which check refused it, because they mean different things:

| WARN contains        | What it means                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oversized`          | A payload above `maxPayloadBytes` (default 8192), refused before it was even parsed. Usually bus abuse — but see the note above if it is your OWN instance refusing to publish. |
| `invalid shape`      | A field missing or of the wrong type. Usually a version mismatch or a bug.                                                                                                      |
| `absent/invalid MAC` | The signature did not verify. A forgery attempt, or a secret mismatch between instances.                                                                                        |
| `invalid name`       | A routing name outside the permitted charset.                                                                                                                                   |
| `STALE`              | Outside the freshness window. **The message names the observed delta** — a large or negative value is clock skew between your instances, not a dead bus.                        |
| `DUPLICATE`          | This exact frame was already delivered inside the window. A replay.                                                                                                             |
| `at its ... cap`     | The nonce store is full and is now evicting to make room. Not a rejection — the frames still flow. Raise `maxEntries`, or reduce the reconnect storm producing them.            |

If control frames stop flowing after an upgrade and the logs are full of `STALE`
with a large delta, the fault is NTP, not the bus.

### Upgrading

The signed payload changed, so **a frame from a pre-#272 instance is rejected by
an upgraded one, and vice versa**. During a rolling deploy, control frames do
not cross between old and new instances. This is deliberate — the alternative
was accepting unversioned frames, which would leave every frame captured during
the rollout replayable for as long as that acceptance stayed switched on, and
such switches outlive their rollouts.

The degradation is bounded and self-healing: presence re-reads the authoritative
Redis roster on every subscribe, and a missed eviction is recovered by the
durable revocation record. Nothing is permanently lost; some cross-instance
presence events are simply not delivered while both versions are running.

### One constraint on your connection ids

`manager.evict(id)` names a connection id in a frame that crosses the bus, so
**a connection id must be unguessable and never reused**. The framework's own
WebSocket upgrade generates one per connection; if you wire your own transport,
generate a fresh `crypto.randomUUID()` rather than passing a user id or a
session id. A stable, guessable id makes a captured eviction frame a repeatable
weapon against whoever currently holds it.

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

The durable record is what closes the reliability gap: if the `evict` control
message is lost while the owning socket is between reconnects, the record keeps
the connection revoked and the owning instance recovers the missed evict. It
self-expires after `revocationTtlSeconds` (default `300`) so the revocation set
never grows without bound.

The two methods behind it are `markRevoked(id)` and `listRevoked()` — optional
members of the `BroadcastDriver` port, alongside
`onRevocationReconcile(handler)` which says _when_ the re-check runs. A custom
driver that implements all three gets the same durability guarantees as the
Redis one; a driver that omits them falls back to fire-and-forget eviction, with
no recovery from a lost frame.

The Redis driver stores it as a **single sorted set** at `{prefix}:revocations`,
whose score is the second the revocation expires. One structure rather than two
matters for correctness, not tidiness: reaping expired entries and listing live
ones happen in one server-side operation against one `now` read from Redis's own
clock, so a revocation that is live cannot be removed by a concurrent pass, and
no instance's wall clock takes part in the decision.

> **Requires Redis 7.0+.** Every write is extend-only and each needs to be:
> `ZADD … GT` stops a re-eviction shortening one revocation, `EXPIRE … NX` arms
> the index key's own TTL, and `EXPIRE … GT` stops an instance with a shorter
> `revocationTtlSeconds` shrinking that key and taking every live revocation in
> it down. `GT` alone cannot arm a TTL — Redis reads a key with none as having
> an infinite one.

> **Rolling upgrade.** For one release the driver also _reads_ the previous
> layout (`{prefix}:revoked` plus per-target markers) so a revocation written by
> a not-yet-upgraded instance is still honoured. It never writes it, and no key
> changes Redis type under a name an old instance still uses. Removal is tracked
> in [#278](https://github.com/locknessland/lockness-monorepo/issues/278); after
> it lands, the abandoned `{prefix}:revoked` key can be deleted by hand — it has
> no TTL of its own.

**Two triggers re-check the marker**, and every deployment gets both:

| Trigger                    | When it fires                                                                      | What it bounds                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Subscribe-socket reconnect | The instant the instance's pub/sub socket re-dials and re-issues its subscriptions | Recovery is immediate at the routine moment a frame is lost — a re-dial is precisely the window in which an `evict` goes missing |
| Periodic reconcile         | Every `reconcileIntervalMs` (default `10000`)                                      | The backstop for a frame lost some other way — dropped by the ingest guard, say — with no socket fault involved                  |

They invoke the **same** re-check, so nothing is recovered twice and nothing is
recovered only once. The reconnect trigger is additive: an integrator whose
subscriber does not expose a reconnect hook falls back to the periodic pass
alone, unchanged.

The hook is `onReconnect(handler)` — an **optional** member of the
`RedisSubscriber` port. `@lockness/redis`'s `RedisSubscribeConnection`
implements it; a custom subscriber that wants the reconnect trigger implements
it too, and one that omits it keeps working.

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
    control: {
        secret: Deno.env.get('REALTIME_SECRET')!,
        // Anti-replay and cost bounds, both optional — see
        // "Control-plane replay protection" above for what these cost.
        windowMs: 30_000,
        maxPayloadBytes: 8192,
        maxEntries: 10_000,
    },
})
```

Every control / presence-identity frame carries an HMAC over its payload,
verified **before** the message is actioned; a frame with an absent or failed
MAC is dropped with a warning and never obeyed — so a peer with bus `PUBLISH`
cannot forge an evict or spoof a presence member.

**Authentication alone is not enough, which is why there is also anti-replay.**
A MAC says _this came from someone holding the secret_, not _this is happening
now_: a peer who can also SUBSCRIBE could capture a valid frame and publish it
again later, with no secret and nothing forged. Frames therefore carry a
timestamp and a nonce inside the signed payload, and a receiver refuses one that
is stale or that it has already seen — see
[Control-plane replay protection](#control-plane-replay-protection) for the
window, the payload ceiling, what each drop warning means, and the rolling-
upgrade consequence. Without a `control` secret configured, the driver **refuses
to publish** a control frame and **drops** every inbound one (both with a
warning): the control plane and cross-instance presence announcements are
effectively off, so the secret is **required** for any app that uses presence or
eviction across instances.

**The reserved `prefix` is NOT a security boundary, in either direction.** Redis
pub/sub has no per-topic ACL by default, so the prefix is isolation by
convention only — anyone with `PUBLISH` on the bus can write to a prefixed
topic.

**And it does not isolate outbound either. Do not nest one deployment's prefix
under another's.** The driver subscribes with `${prefix}:*`, and a Redis glob
matches `:` like any other character, so a deployment at `app` receives the
events of one at `app:eu`
([#288](https://github.com/locknessland/lockness-monorepo/issues/288), open).
The control topic is unaffected — a control frame carries no `event` field and
is dropped on ingest, so the HMAC is not bypassed — but the event payloads are
disclosed. Give sibling deployments sibling prefixes (`app:eu`, `app:us`), never
a parent and a child.

**A prefix containing a Redis glob metacharacter is refused at construction.**
`*` `?` `[` `]` and `\` all reach `PSUBSCRIBE` as a pattern, where they would
widen the subscription to traffic the deployment does not own — and `app\` is
the worst of them, because Redis reads `app\:*` as the literal `app:*`, so that
deployment reads another's whole stream while its own traffic stays invisible to
the deployment it is reading. On a shared or multi-tenant Redis, the HMAC (which
the framework provides) is what actually authenticates the control plane; layer
per-prefix Redis ACLs on top where your Redis supports them, and hold the
roster/pub-sub bus to the same TLS + AUTH posture as any other credentialed
connection.

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
