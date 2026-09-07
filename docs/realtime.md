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

### Two constraints on your connection ids

`manager.evict(id)` names a connection id in a frame that crosses the bus, so
**a connection id must be unguessable and never reused**. The framework's own
WebSocket upgrade generates one per connection; if you wire your own transport,
generate a fresh `crypto.randomUUID()` rather than passing a user id or a
session id. A stable, guessable id makes a captured eviction frame a repeatable
weapon against whoever currently holds it.

**It must also stay inside the charset the control plane can carry**: letters,
digits and `:` `.` `_` `-`, at most 200 characters. `crypto.randomUUID()`
satisfies it.

This is not a new requirement — the control plane has always dropped a frame
naming an id outside it — but it used to be enforced in only one of three
places. An id like `user@example.com` evicted correctly on its own instance, was
silently dropped by every other one, and was still recovered by the durable
reconcile. An application had no way to notice.

`register`, `subscribe` and `evict` now **throw `ConnectionIdError`** on such an
id, at the moment you supply it. If you are upgrading and you mint your own ids,
check them against that charset before you deploy: the failure moves from silent
and partial to immediate and obvious, which is the point, but it does move.

### The presence member id is bounded too — by length, not by charset

`PresenceMember.id` is the other id-shaped value that crosses the control plane.
It comes from your `authorize()` and becomes a field on the authoritative
presence roster, and `subscribe` **throws `PresenceMemberIdError`** when its
string form is empty or longer than 200 characters, or when a numeric id is not
finite.

**Its charset is deliberately unconstrained**, unlike a connection id. A member
id is your users' identity — an email, a username, an id from an external
provider — and the connection-id charset would reject `user@example.com` on the
`@`. It would also buy nothing: Redis commands are length-prefixed so no value
can forge one, control frames carry a MAC, and the roster's internal
`<channel> <member>` entries are parsed on the first space, and a channel name
cannot contain one — so a member id containing spaces is unambiguous. That last
clause was a convention until #314 and is now a refusal: `subscribe` throws
`ChannelNameError` on a channel outside the same charset.

### `PresenceMember.info` has a ceiling, and it is the whole control frame

`info` is the one presence field nothing bounds, and it is the field the docs
send you to for avatars and profile blobs. The limit is not on `info` itself: a
presence join is announced to other instances as a **signed control frame**
carrying the whole member, and the driver refuses to publish a frame over
`control.maxPayloadBytes` — **8192 bytes by default** — because every peer would
drop it on ingest anyway.

What a refusal costs is narrow and worth stating exactly, because it is easy to
over- or under-read:

- The join **succeeds**. `subscribe` returns `{ ok: true }`.
- The **authoritative roster is written and correct**. Anyone who reads it —
  including the snapshot handed back to the joiner — sees the member.
- What is lost is the live `joined` push to peers **already in the channel**.
  Their clients hold a stale roster until they resubscribe.
- `disconnect` removes the member on the ordinary path, so the staleness lasts
  the connection's lifetime and no longer.

That behaviour is deliberate (#312): rolling the roster write back would trade a
lost notification for a real state divergence — the member locally subscribed
and absent from the authoritative store.

**Budget `info` against the frame, not against 8192.** The frame also carries
the kind, the target, the channel, the origin instance id, a timestamp, a nonce
and a MAC, so the member's own share is a few hundred bytes less than the
ceiling. Keep `info` to identity-shaped values — a display name, an avatar
**URL** — and put the blob behind that URL.

#### Seeing it happen

A refusal is a `console.warn` on the single instance that refused, which is
nobody's alert. Register the driver seam to get it somewhere an operator can act
on:

```ts
import type { ControlRefusal } from '@lockness/realtime'

driver.onControlRefused((refusal: ControlRefusal) => {
    // reason — 'oversize' | 'no-secret'
    // kind, channel, and for an oversize refusal: bytes and limit
    metrics.increment('realtime.control_refused', {
        reason: refusal.reason,
        channel: refusal.channel ?? '-',
    })
})
```

`ControlRefusal` is exported from `@lockness/realtime`, and `onControlRefused`
is optional on `BroadcastDriver` — a custom driver that omits it is unaffected.

The two reasons have different fixes — shrink the member, or configure a control
secret — which is why `reason` is an enum rather than a message. A handler that
throws is contained and logged: this seam reports on a path whose whole point is
that the failure is already being swallowed, so it must never make publishing
more fragile than it was without it.

### The channel name is bounded too, by the same charset as a connection id

`subscribe` throws `ChannelNameError` on a channel outside
`[A-Za-z0-9:._-]{1,200}` — the same charset a connection id must match, and the
same one the WebSocket wire has always enforced.

**Only the programmatic API changes.** A client subscribing over a socket was
already refused by the frame decoder; what was missing was the check on
`manager.subscribe`, which server code calls directly. So the framework's own
socket path refused a name the public API accepted.

Two things broke because of it, both reachable with a channel containing a
space, and both silently:

- **Cross-instance presence stopped working for that channel.** The
  `presence-join` control frame carries the channel and every receiving instance
  drops it on ingest for exactly this charset. The join succeeded locally,
  `subscribe` returned `{ ok: true }`, and no peer ever learned.
- **The ghost sweep stopped reclaiming that channel's members.** A roster
  owned-entry is `<channel> <member>` split on the first space, so
  `presence-my room` + `u1` split to channel `presence-my` and the cleanup
  deleted from a key that does not exist.

**If you are upgrading and you build channel names from data** — a tenant slug,
a room title, anything user-supplied — check them against that charset before
you deploy. `subscribe` now throws where it previously succeeded locally and
failed everywhere else; the failure moves from silent and partial to immediate,
which is the point, but it does move. `unsubscribe` is deliberately _not_
refused, so anything already subscribed can still be cleaned up.

Length is the part nothing below bounds, and it is not cosmetic. The roster
write happens _before_ the frame that announces it, and an oversized frame is
dropped with a warning — so without this the member reached the authoritative
roster, was never **announced** to any other instance, and `subscribe` still
returned success. What that costs is the live `joined` push to peers already in
the channel: the roster itself is shared and correct, so anyone who reads it —
including the snapshot handed back to the joiner — still sees the member, and
`disconnect` removes it on the ordinary path. That is the behaviour Lockness
accepts deliberately, settled in #312. Both error types are exported from
`@lockness/realtime`, so an `onError` handler can tell "a bug in my own code
that no retry will fix" from a dead socket:

```ts
import {
    ChannelNameError,
    ConnectionIdError,
    PresenceMemberIdError,
} from '@lockness/realtime'

if (error instanceof PresenceMemberIdError) {
    // The authorizer returned an id the roster cannot carry — fix the
    // authorizer, do not retry.
}
```

**One thing to do before a rolling upgrade.** A durable revocation already
recorded against an out-of-charset id is dropped by the reconcile on an upgraded
instance, so such a connection would come back un-revoked while both versions
are running — the same silent failure, for exactly the deployments this note is
addressed to. Re-issue those revocations against in-charset ids first, or drain
them by waiting out `revocationTtlSeconds` before you deploy.

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

**The first two are one setting with two numbers.** The heartbeat is what keeps
this instance's own liveness key alive, and that key's TTL is
`livenessTtlSeconds` — so the constructor **refuses** a configuration where
`heartbeatIntervalMs * 2 > livenessTtlSeconds * 1000`. Beat any slower and a
perfectly healthy instance lets its own key lapse between beats: every peer's
reconcile then treats it as dead and sweeps its presence members out of the
roster, repeatedly, while its sockets stay open and nothing in the log looks
wrong.

The factor of two is a margin, not bookkeeping. One beat per TTL window lands on
the boundary and races the expiry, losing whenever the round-trip is slower than
the slack — which is exactly when the broker is under load. The defaults above
leave three beats per window.

Tightening `livenessTtlSeconds` therefore means revisiting `heartbeatIntervalMs`
in the same edit: dropping the TTL to `5` while leaving the heartbeat at `5000`
now throws at construction rather than degrading silently in production.

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

**What happens when a re-check FAILS is not the same for both.** The WARN names
which trigger it was, because the two want different responses:

| Trigger   | On failure                                                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reconnect | Retried once, an order of magnitude inside `reconcileIntervalMs`. The reconnect fires once per outage, so without that retry a failed pass is retried by nothing and enforcement silently falls back to the periodic timer |
| Periodic  | Not retried. Its next pass is already scheduled, so retrying would double its rate for as long as the broker is unhealthy — a load spike at exactly the wrong moment                                                       |

The retry does not retry itself: a broker that keeps refusing costs one extra
round-trip per outage, not a loop.

**The re-check runs concurrently with delivery, and that is the shipped
contract.** The subscribe socket's read loop is started before the reconnect
handler is invoked, so a message can be delivered while the re-check is still in
flight — a window of roughly one round-trip on the Redis command connection,
after each socket fault. A connection revoked during that window can receive
broadcasts until the re-check lands.

This is a deliberate trade, not an oversight. Firing the handler before delivery
resumes would let an application-supplied handler gate **all** delivery for as
long as it runs, turning a bounded authorization window into an unbounded
availability one. The periodic pass bounds the exposure either way, which is why
`reconcileIntervalMs` is an enforcement bound and should not be lengthened.

Two consequences worth stating plainly:

- **A fired reconnect handler is not proof that frames are flowing.** An
  activation waits only for its `PSUBSCRIBE` to reach the socket, never for the
  broker to acknowledge it.
- **If your application cannot tolerate that window**, gate delivery yourself
  for the duration of your re-check — with a timeout, so a stuck re-check
  degrades to delivery-without-a-gate rather than to silence.

The hook is `onReconnect(handler)` — an **optional** member of the
`RedisSubscriber` port. `@lockness/redis`'s `RedisSubscribeConnection`
implements it; a custom subscriber that wants the reconnect trigger implements
it too, and one that omits it keeps working.

> **Operational note — this describes history, not current behaviour.** The
> subscribe socket used to re-dial on an idle bus with no fault at all, because
> it read with a 30s deadline and sent no keepalive, so every quiet window was a
> window in which a control frame could be lost.
> [#274](https://github.com/locknessland/lockness-monorepo/issues/274) removed
> that: a keepalive `PING` holds an idle socket up, and its test asserts a
> single socket across eight windows of silence. A re-dial that fails to connect
> used to be abandoned with a WARN saying so;
> [#275](https://github.com/locknessland/lockness-monorepo/issues/275) put it
> behind the same bounded backoff every other re-dial uses, so it is retried
> rather than given up on.
>
> **Reconnects are therefore fault-only.** That matters for reading the
> concurrency window above: it opens after a socket fault, not on a timer, and
> not thousands of times a day on a quiet bus.

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

### What the reserved `prefix` guarantees

**Outbound: no deployment receives another deployment's frames.** Nested
prefixes included — `app` and `app:eu` on one broker are isolated from each
other. This is structural, not a convention: every topic and key the driver
derives sits behind a `__`-leading separator (`app__event:orders`,
`app__control`, `app__presence:room`), and no accepted prefix may contain `__`,
so no pattern one deployment subscribes can match anything another derives.

**Inbound: the prefix guarantees nothing, and that has not changed.** Redis
pub/sub has no per-topic ACL by default. Any client on the broker can `PUBLISH`
into `app__event:<channel>` — exactly as guessable as the old name — and can
also **read**: `PSUBSCRIBE app__control` returns every control frame in clear
(connection ids, presence `member.info`, instance ids), and the presence
rosters, instance set and revocation index are readable at their derived key
names. The HMAC protects **integrity, not confidentiality**.

**The compensating control is a Redis ACL, and it is a condition rather than a
suggestion.** Without one, "isolated" means only that the _drivers_ do not cross
— not that a third party cannot read both.

```
ACL SETUSER app-realtime on '>...' \
  ~app__*  ~app:revoked  ~app:revoked:* \
  &app__event:*  &app__control \
  +@all
```

Two details, both verified against Redis 7 rather than inferred — get either
wrong and the ACL undoes the isolation it was added for:

- **Key patterns must be `~<prefix>__*`, never `~<prefix>*`.** The wider form
  matches a _nested_ deployment's keys: with `app` and `app:eu` on one broker,
  `~app*` lets the `app` credential `GET app:eu__presence:<channel>` and read
  the other deployment's roster. That is the disclosure this section exists to
  describe, handed back by the ACL.
- **Channel patterns must be spelled EXACTLY as the driver subscribes them.**
  Redis matches a `PSUBSCRIBE` pattern against `&` patterns **literally**, not
  by containment, so `&app__*` does **not** authorize `PSUBSCRIBE app__event:*`
  — it returns `NOPERM`, and the usual reaction to that is `allchannels`, which
  grants everything. `&app__event:*` and `&app__control` are the two the driver
  actually issues.

The two `~app:revoked` grants cover the legacy revocation names described below;
drop them once
[#278](https://github.com/locknessland/lockness-monorepo/issues/278) removes the
dual-read path. Hold the bus to the same TLS + AUTH posture as any other
credentialed connection.

**A prefix must match `[A-Za-z0-9:._-]` and be 1–64 characters, and must not
contain `__`.** Four checks, each with its own message. The glob metacharacters
`*` `?` `[` `]` and `\` are named individually because they reach `PSUBSCRIBE`
as a pattern and would widen the subscription — `app\` worst of all, since Redis
reads `app\:*` as the literal `app:*`, so that deployment reads another's whole
stream while its own traffic stays invisible to the deployment it is reading.
`__` is refused because it is the lead-in every reserved separator begins with;
a prefix carrying it can reach another deployment's names.

#### Upgrading a running fleet

The event topic changed from `<prefix>:<channel>` to `<prefix>__event:<channel>`
and five keys moved to `<prefix>__presence:` / `__owned:` / `__alive:` /
`__instances` / `__revocations`. **Pre- and post-change instances do not
exchange events**, and they do not see each other's rosters.

Restart the fleet together rather than rolling one instance at a time. Nothing
is queued and nothing is lost beyond the in-flight window — pub/sub is not
durable, and rosters and liveness keys are runtime state that rebuilds as
clients reconnect. There is no compatibility shim: `@lockness/realtime` had not
been published when this landed, so no deployment could exist to need one, and
this change is required to land in or before the first release that publishes
the package.

Two revocation key names — `<prefix>:revoked` and `<prefix>:revoked:<id>` — keep
their old shape on purpose. They exist only to read what a pre-#276 instance
wrote at those exact names, so anchoring them would address a key nothing has
ever written.
[#278](https://github.com/locknessland/lockness-monorepo/issues/278) removes
them.

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
