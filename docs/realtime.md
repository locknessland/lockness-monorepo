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

### What a `joined` frame promises — and what it does not

**A `joined` frame emitted by the instance the member joined on follows a
successful authoritative roster write.** The join writes the roster first and
announces second, so no subscriber is ever told about a member the roster
refused. If that write fails the subscribe rejects, nothing was announced, and
the attempt leaves no trace — the same connection can retry the same channel and
produces exactly one member.

**A `joined` frame on any OTHER instance reflects an announcement, not a roster
read.** Cross-instance presence travels the control plane, and a receiving
instance re-emits the frame it was handed without consulting the roster. A lost
or refused control frame therefore costs the announcement on those instances,
never the roster — a member missing from someone's view is still `here` to
anyone who reads the roster.

**A join and a leave racing on one socket cannot corrupt the roster.** Nothing
serializes the verbs a client sends, so a `subscribe` and an `unsubscribe` for
the same channel can be in flight together. Every authoritative roster write is
issued as a projection of what this instance holds locally, one slot at a time,
so the later verb wins and the earlier one becomes a no-op rather than a write
arriving out of order. A join that loses that race also announces nothing — it
has no membership to announce. See
[ADR 003](adr/003-realtime-roster-write-ownership.md).

**A re-subscribe to a channel the connection already holds produces NO `joined`
frame at all** — not locally, not on any other instance. A `joined` records a
transition, and a connection already in the room transitions nothing. It is
answered with the roster, exactly as a first join is. See
[What a re-join does](#what-a-re-join-does--and-what-the-framework-does-not-meter)
for the payload it discards and for what the framework does not rate-limit.

**Presence is an announcement channel, not an authorization source.** Do not
grant an action because a presence frame or a `here` snapshot says a member is
in a room; re-authorize the action itself. Presence tells you who is _believed_
present, promptly and usually correctly. Authorization is a different question,
and the two diverge exactly when it matters — during a partition, an eviction,
or a control frame that did not arrive.

**Revocation** — authorization is point-in-time at subscribe. Fan-out is not
re-authorized per message; it delivers to the subscription set the authorizer
approved at subscribe time. **Eviction is therefore the one revocation path.**

**A denial does not revoke, and this is the case most likely to surprise you.**
Your authorizer runs on every subscribe, re-subscribes included. When one that
previously approved now returns `false` — revoked role, expired entitlement, ban
— that frame is refused and **nothing else happens**: the connection keeps its
subscription, keeps its roster entry, and keeps receiving every broadcast on
that channel. It is told no and carries on listening.

So an application that revokes access and waits for the next subscribe frame to
enforce it will wait forever. Revocation is something the server does, with the
calls below.

The alternative was considered and rejected: `false` already means "refuse this
attempt", and in a deployment that includes "not this fast" and "the database
blipped and I could not confirm". Giving it the force of an eviction would turn
a transient failure into a removal, silently. See
[#331](https://github.com/locknessland/lockness-monorepo/issues/331). To act on
a logout / kick / account-disable mid-connection:

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

### `PresenceMember.info` is bounded, and the bound is checked at admission

`info` is the presence field the docs send you to for display names and avatars,
and it is the one an end user typically controls through an ordinary profile
edit. **`subscribe` throws `PresenceMemberSizeError` when the whole serialized
member exceeds `maxPresenceMemberBytes` — 4096 bytes by default** — before any
local join, roster write or announcement exists. A refusal therefore leaves
nothing behind: no roster entry, no `joined` frame, no control publish.

**Why the bound is not simply the control ceiling.** A join is announced to
other instances as a signed control frame carrying the whole member, and the
driver refuses to publish a frame over `control.maxPayloadBytes` — 8192 bytes by
default — because every peer would drop it on ingest. The member bound is half
that, and the gap is deliberate: the frame also carries the kind, the target,
the channel, the origin instance id, a timestamp, a nonce and a MAC, so the
member's own share must leave room for all of it. **A member admitted at
subscribe can always be announced.** That is the invariant, and the numbers
exist to hold it.

Both are options, and they move together or not at all:

```ts
new ChannelManager({ driver, maxPresenceMemberBytes: 16 * 1024 })
// …and on EVERY instance's driver:
new RedisBroadcastDriver(conn, sub, {
    control: { secret, maxPayloadBytes: 32 * 1024 },
})
```

Raise one without the other and you admit members you cannot announce, which is
the exact state the bound exists to prevent.

**It is measured in bytes, not characters.** A single emoji is four bytes where
`String.length` counts two, so a member of "200 characters" can be 800 bytes.
The number it has to fit under is a payload limit, and payload limits are in
bytes.

**This used to be a warning, and it was a presence cloak.** Before the bound, an
oversized member was written to the authoritative roster, announced locally, and
then the control frame was dropped with a `console.warn` while `subscribe`
answered `{ ok: true }`. The member was present in the room and invisible to
every peer instance — including a moderator connected to another one — and any
member could arrange it for themselves by pasting a long enough bio. The roster
write happens before the control publish, so a check on the publish is always
too late; only the admission bound removes the state. See
[#326](https://github.com/locknessland/lockness-monorepo/issues/326).

The driver's publish-side check remains as defence in depth for a member that
predates the bound, and it now **rejects** rather than returning: a publish
reported as successful when the frame was never sent is a lie to `unsubscribe`
and `evict` as much as to a join.

**Keep `info` to identity-shaped values** — a display name, an avatar **URL** —
and put the blob behind that URL. The bound is a backstop, not a budget to
spend.

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

## Running on more than one instance

With the Redis driver, presence and eviction are **authoritative across every
instance** behind a load balancer — the gap that kept earlier releases
single-instance.

### An instance receives only the channels it hosts

Until [#295](https://github.com/locknessland/lockness-monorepo/issues/295) every
instance subscribed **one prefix-wide pattern** and discarded what it did not
host. A deployment with 3 000 channels delivered all 3 000 channels' traffic to
every instance, which parsed each payload before looking up a set that was
usually empty. The cost scaled with the deployment rather than with the
instance.

The driver now subscribes **one exact topic per hosted channel**, created when a
channel's local subscriber count goes 0→1 and removed when it goes 1→0. A custom
`BroadcastDriver` opts in by implementing **`watchChannel(channel)` and
`unwatchChannel(channel)`** — detected as a pair, never one at a time, for the
reason below. Measured on a live broker with the broker's own receiver count:

| Publish to                       | Receivers, before | Receivers, now |
| :------------------------------- | ----------------: | -------------: |
| a channel this instance hosts    |                 1 |              1 |
| a channel another instance hosts |                 1 |          **0** |
| a channel nobody hosts           |    1 per instance |          **0** |

Nothing to configure. A driver whose subscriber cannot unsubscribe per channel
keeps the old behaviour rather than half the new one — a subscription set that
grows and never shrinks is worse than the glob it would replace, and invisible,
because delivery stays correct.

**Two guarantees changed, and both are worth knowing before you rely on them.**

- **A join now has a window.** `subscribe` resolves once the subscribe frame is
  on the wire — never that delivery has started, which no driver can promise
  without waiting on the broker's own acknowledgement. A client joining a
  channel this instance does not yet host can miss a message published in that
  window; the prefix-wide subscription had no such gap. Nothing the framework
  itself sends travels this path — `evict` and every presence frame go over the
  MAC-signed control plane, which is subscribed unconditionally.
- **A watch the broker refuses keeps the membership.** The driver records the
  channel and re-issues it on its next successful activation, so delivery
  resumes; the refusal is logged at WARN rather than failing the join. Dropping
  the membership would turn a transient write failure into permanent local
  deafness.

#### Watched-channel limits

An instance hosts at most **1 000** channels by default and one connection at
most **100** — `MAX_WATCHED_CHANNELS` and `MAX_CHANNELS_PER_CONNECTION`,
exported from `@lockness/realtime`. **A breach raises `ChannelLimitError` and
mutates nothing**: the connection is not registered, no presence member is
added, and no broker subscription is issued. It throws rather than answering
`{ ok: false }` because `{ ok: false }` is what an authorization denial returns,
and an application cannot act on resource exhaustion it cannot tell apart from a
refusal.

Each hosted channel is a broker subscription re-issued on every reconnect, so
the set is bounded deliberately rather than left to whatever clients ask for.

**Only a join that GROWS a set is charged.** A second client on an
already-hosted channel adds no subscription, and a connection re-joining a
channel it already holds adds nothing either; both are admitted at and above
every cap.

#### What a re-join does — and what the framework does not meter

**A re-subscribe to a presence channel the connection already holds is a roster
read, not a join.** It writes nothing, announces nothing to anyone, and
publishes nothing to the other instances — and it returns the same authoritative
`members` snapshot a first join returns, so a client re-subscribing after a
network blip cannot tell the difference and is never refused.

**A roster read is not free, and the word "nothing" above is exhaustive only
about writes.** The read is one `HGETALL` on the Redis driver and its reply is
**every member in the room, cluster-wide, with their `info`** — so a re-join's
cost in bytes scales with the room's population, once per inbound frame, metered
by nothing. Zero writes; not zero cost. The numbers are in the table below.

That is a correctness rule before it is a cost one. `joined` records a
_transition_, and membership is a set: a connection already in the room
transitions nothing. Announcing it told every subscriber in that room, on every
instance, that a member already present had arrived — for as many times as the
client sent the frame.

**One consequence to know about:** a re-join's `member` payload is
**discarded**. If your authorizer returns different `info` on the second call,
the entry the first join wrote still stands and nothing is broadcast. There is
no "member updated" event in this protocol, and `joined` is not one — comparing
payloads would mean deep-equality over unbounded application data on every
inbound frame. If you need to publish a change of `info`, unsubscribe and
subscribe again.

#### The framework does not meter the verb rate — and that is a decision

**The channel caps bound how many channels are held, never how often they are
asked for.** A `subscribe -> unsubscribe -> subscribe` loop returns the owned
set to exactly where it started, so every cap charges it nothing — by
construction, not by oversight.

Nothing in `@lockness/realtime` bounds that. The decision is recorded in
`ChannelManager.handlerHooks`' docstring, beside the line that implements it,
and the short version is: **the framework has no charge target a reconnect does
not rotate.** `Connection.id` is minted per socket and never reused, so a budget
large enough to let a legitimate client re-issue its whole channel set as one
burst is a budget the next reconnect hands back for free. The only key that
survives a reconnect is `Connection.identity` — your type, not ours.

The decisive reason is not that arithmetic, though. A budget covering the whole
cycle must sit on `unsubscribe`, and **six paths reach that method, of which one
comes from a client**: socket close, a local `evict`, an evict arriving from
another instance, the durable revocation reconcile, and your own direct calls.
Refusing there charges six and means one — a client that spends its budget makes
its own eviction leave permanent roster ghosts. An unreliable revoke is worse
than the amplification it was meant to bound.

##### ⚠️ `authorize` is NOT where a verb budget goes

Earlier versions of this page said it was. **That advice was wrong**, and it is
worth knowing why, because the reasons are structural rather than incidental:

| Why the hook cannot carry it                                                                                                                                 | Where to see it                              |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------- |
| A **public** channel runs no authorizer at all — `subscribe` skips the whole block for it                                                                    | `manager.ts`, the `kind !== 'public'` branch |
| **`unsubscribe` runs no authorizer**, so half the cycle is invisible even on presence channels                                                               | `ChannelManager.unsubscribe`                 |
| A **denial never revokes** a standing membership, so an authorizer-as-limiter can refuse a first join and a re-join and can never refuse the expensive leave | `AuthorizeResult`                            |
| It runs **ahead of every cap**, so it is not merely blind to the churn — it is the largest per-frame charge in the package                                   | see below                                    |

That last row is the one to act on. `authorize` runs before the channel caps, so
a **denied** subscribe naming any invented `private-*` channel still buys one
full authorizer invocation — a database read, an audit write — for one ~30-byte
frame, charged by nothing. Since the channel need not exist, it also answers
"does this channel exist" for anyone who watches the timing or the audit trail.
An authorizer is still the right place for a rate-limit increment on
**admission**; it is not a verb budget, and it cannot be made into one.

##### What a frame costs

Worst case per inbound frame, on the Redis driver, in a fleet of `N` instances.
**Derived from `packages/realtime/tests/churn_cost_329.test.ts`**, which is
where these numbers live and which fails if they change; the per-operation atoms
are owned by `channel_watch_295.test.ts`, `roster_atomicity_323.test.ts` and
`presence_rejoin_327.test.ts`.

| Frame                                   | Driver commands | Control publishes | Fleet verifications | Authorizer calls |
| :-------------------------------------- | --------------: | ----------------: | ------------------: | ---------------: |
| `subscribe` public                      |             0–1 |                 0 |                   0 |                0 |
| `subscribe` private                     |             0–1 |                 0 |                   0 |                1 |
| `subscribe` private, **denied**         |               0 |                 0 |                   0 |                1 |
| `subscribe` presence, first join        |             2–3 |                 1 |                 N−1 |                1 |
| `subscribe` presence, **re-join**       |               1 |                 0 |                   0 |                1 |
| `unsubscribe` public / private          |             0–1 |                 0 |                   0 |                0 |
| `unsubscribe` presence, member          |             1–2 |                 1 |                 N−1 |                0 |
| `unsubscribe`, not a member / not owned |               0 |                 0 |                   0 |                0 |

**A churn pair on a presence channel, sole holder: 5 driver commands, 2 control
publishes, 2(N−1) fleet verifications, 1 authorizer call — for 2 inbound
frames.**

Reading the table:

- **The ranges are not a hedge, and you must size against the top of them.** The
  low end is "the channel was already hosted"; the high end includes the 0→1
  `SUBSCRIBE` or the 1→0 `UNSUBSCRIBE`. A budget running in your `onMessage`
  sees the verb and the channel name and **cannot tell which case it is in** —
  the hosting state lives in the manager's private maps. Size on the worst.
- **Driver commands** map one-to-one onto wire commands: `SUBSCRIBE` /
  `UNSUBSCRIBE` on the subscribe connection, `EVAL` for a roster write and
  `HGETALL` for the roster read on the command connection. A **control publish
  is a `PUBLISH`** on the command connection too — it has its own column here
  rather than being folded into this one, because its cost is paid by the whole
  fleet rather than by the publisher.
- **The table is the SUCCESSFUL path, and two things sit outside it.** A
  presence first join whose roster write **fails** pays more than the ceiling
  above: the compensation issues the local leave — which may `UNSUBSCRIBE` — and
  a second roster `EVAL` to reclaim a possibly-committed entry. And the Redis
  driver starts its ghost sweep on the first roster write of a process, a
  once-per-process cost that no per-frame row can carry. Neither is a path a
  client chooses, but a budget sized on the table alone is sized on the happy
  path.
- **Fleet verifications** are the term nobody counts. A control frame goes to
  one shared topic every instance subscribes to, and the publisher's own
  loopback is dropped **before** the MAC — so every _other_ instance pays a
  length gate, a `JSON.parse`, field validation, a synchronous HMAC, a
  timing-safe compare and a replay-window admit, whether or not it hosts the
  channel. It scales with **fleet** size, not with the room. It is CPU, not
  memory: the replay window is bounded at 10 000 entries with a per-origin fair
  share.
- **The re-join's single command is an `HGETALL` whose reply is the whole
  room.** A frame-rate budget bounds how many such replies arrive; it never
  bounds how large one is.
- **Collapse axes.** A driver with no roster capability has no `EVAL` and no
  `HGETALL`. A driver with no control plane has no publishes and no
  verifications. `MemoryBroadcastDriver` is single-process: both columns go to
  zero.

No throughput figure appears in this table on purpose. Counts are a property of
the framework; a rate is a property of somebody's hardware.

##### Where a verb budget belongs

In your own `onMessage`, which `handlerHooks` passes through untouched.

**Read the four notes under the example before you copy it.** Three of them are
about state that has to live somewhere other than where it looks like it should,
and one is a type error you will hit on the first line.

```ts
// `spend` is YOURS — this page does not ship a rate limiter, and the clock and
// refill arithmetic are deliberately left where you can see them.
interface Bucket {
    tokens: number
    updated: number
}

function spend(
    buckets: Map<string, Bucket>,
    key: string,
    cost: number,
    burst: number,
    perSecond: number,
): boolean {
    const now = Date.now()
    const bucket = buckets.get(key) ?? { tokens: burst, updated: now }
    // Refill, CLAMPED at the burst — an idle client must not bank tokens.
    const refilled = Math.min(
        burst,
        bucket.tokens + ((now - bucket.updated) / 1000) * perSecond,
    )
    if (refilled < cost) {
        // Still record the refill, or a client held at zero never recovers.
        buckets.set(key, { tokens: refilled, updated: now })
        return false
    }
    buckets.set(key, { tokens: refilled - cost, updated: now })
    return true
}

const buckets = new Map<string, Bucket>()

// The burst must clear the largest re-issue the framework itself permits, or
// you refuse your own reconnecting clients. Read the EFFECTIVE cap — the
// default constant is wrong for any deployment that configured one.
const BURST = manager.maxChannelsPerConnection
const REFILL_PER_SECOND = 5

function keyFor(conn: Connection<User>): string | null {
    // `null` is NOT a bucket key. Every anonymous socket would share it, so one
    // attacker drains it and denies service to every other anonymous client.
    // Refuse, or fall back to a per-connection bucket knowing a reconnect
    // resets it — but never pool them.
    if (conn.identity === null) return null
    // A STABLE STRING, never the identity object. `Identity` is `unknown`, so
    // an object keys a Map by reference: the meter would miss every time and
    // fail OPEN, silently, with no type error and no failing test.
    const id = conn.identity.id
    // And CHECK it. `user:${undefined}` is a perfectly good Map key, and it
    // pools every authenticated user into one bucket — the anonymous failure
    // above, arriving through a typo in your identity shape.
    if (id === undefined || id === null || id === '') return null
    return `user:${id}`
}

const hooks = manager.handlerHooks({
    onMessage: async (conn, data) => {
        // `WSMessageReceive` includes `Blob`, which `decodeClientMessage` does
        // not take — reading a Blob is asynchronous, so it cannot. Normalise
        // first; passing `data` straight through does not type-check.
        const raw = data instanceof Blob ? await data.arrayBuffer() : data
        let frame: ClientMessage
        try {
            frame = decodeClientMessage(raw)
        } catch (error) {
            // Do NOT discard this. A malformed-frame flood is one of the
            // unmetered paths listed below, and an error you dropped is one
            // you cannot alert on.
            log.warn('ws: rejected frame', { id: conn.id, error })
            conn.send(
                encodeServerMessage({ type: 'error', message: 'bad frame' }),
            )
            return
        }
        if (frame.type === 'subscribe' || frame.type === 'unsubscribe') {
            const key = keyFor(conn)
            if (key === null) {
                conn.send(encodeServerMessage({
                    type: 'error',
                    message: 'authenticate before subscribing',
                }))
                return
            }
            // Weight by kind — `channelKind` is the only cost axis visible from
            // here. See the note on the ratio below; 3 is not the whole story.
            const weight = channelKind(frame.channel) === 'presence' ? 3 : 1
            if (!spend(buckets, key, weight, BURST, REFILL_PER_SECOND)) {
                conn.send(
                    encodeServerMessage({
                        type: 'error',
                        message: 'slow down',
                    }),
                )
                return
            }
        }
        await dispatch(conn, frame)
    },
    // Install this. Without it every malformed frame prints one line through
    // the framework's default sink, at whatever rate the client chooses.
    onError: (conn, error) => log.warn('ws', { id: conn.id, error }),
})
```

**1. That `Map` is per-process, and you are reading the multi-instance
chapter.** One identity spread across `N` instances gets `N` full buckets, so
the effective budget is `N × BURST`. Worse, it compounds with the table above:
each token buys `N−1` HMAC verifications, so at `N` instances one identity's
spend costs the fleet `N × (N−1)` verifications per burst. If that matters to
you, the bucket belongs in shared storage — and then read note 2, because moving
it there is what creates the next problem.

**2. Shared storage makes the check-then-act a race.** `onMessage` is dispatched
un-awaited, so nothing serializes the frames one socket sends. With a local
`Map` the read and the write are in one synchronous turn and the race cannot
open. The moment `spend` awaits a round-trip, `K` pipelined frames all read the
same token count and all pass. Use an atomic decrement — a Redis Lua script or
`INCRBY` on a windowed key — rather than a read followed by a write. **Fix notes
1 and 2 together; the natural remedy for the first is what opens the second.**

**3. Evict the buckets on a timer, NOT on disconnect.** The `Map` grows with
distinct identities and nothing here removes an entry. It is tempting to clear a
bucket in `onClose` — do not: the whole point of keying on identity rather than
on `connection.id` is that the counter must **outlive the socket**, or a
reconnect resets it and you are back to a meter with a documented bypass. Drop
entries whose `updated` is older than the time it takes to refill a full burst.

**4. The weight of 3 is a single-instance figure.** A presence frame costs three
driver commands against a public frame's one — but it also costs a control
publish and `N−1` fleet verifications, which the public frame does not. At a
fleet of ten the real ratio is closer to 13:1. Pick the weight from the table's
columns that your deployment actually pays for.

Three more things that are easy to get wrong, and each fails quietly:

- **Throttle the upgrade route as well.** The budget above bounds a socket's
  verbs; nothing bounds how many sockets one client opens. `@Throttle` is
  **opt-in** — see the accepted residue below for what it does and does not give
  you.
- **If your signup is unauthenticated, the identity meter is not your last
  line.** An attacker mints accounts at signup cost, and the bucket scales with
  account count. Put a second key above it.
- **Naming is the access control.** A channel's kind is derived from its name
  and the default is **public**: `orders-private` matches neither `private-` nor
  `presence-`, so it runs no authorizer and is readable by any anonymous socket.
  One transposed word is the whole difference.

##### What is not metered, exhaustively

Every non-zero cell in the table above that no cap charges — which is all of
them, plus what the table does not have a row for:

- **The verb rate itself**, on every channel kind.
- **`ping` and your own application frames.** Neither is bounded here.
- **A churn loop on unique PUBLIC channel names.** It flips `SUBSCRIBE` /
  `UNSUBSCRIBE` on the shared subscribe connection once per pair, forever, with
  no authorizer anywhere in the path and no identity required. Every frame on
  that one connection is serialized, so this delays event delivery, presence
  fan-out **and inbound eviction frames** for every other connection on the
  instance.
- **One authorizer invocation per private/presence subscribe frame, denials
  included**, ahead of every cap.
- **The decode-rejection path.** An oversized frame is measured by encoding the
  whole received text _before_ the size check, so the cost is proportional to
  what was sent rather than to the cap. Install `onError`, or each rejected
  frame also prints a log line.
- **An empty per-channel presence entry.** A presence channel this instance
  hosted retains an empty map after the last member leaves, so a churn loop on
  unique presence names is not quite cost-neutral at rest. Tracked; it is
  bounded by the verb budget above and by nothing else.
- **The reconnect**, which resets any per-connection counter you keep.
- **Server-side revocation** — `evict`, `revokeChannel`, and a reconcile pass
  applying a durable record. These are not client frames, so nothing above
  charges them and nothing should: they are yours to call, and their rate is
  whatever your moderation code does. They matter to this section only because
  they reach the **same leave path** a client `unsubscribe` does, so a burst of
  them costs what the table's `unsubscribe` row costs, per call, on top of
  whatever the clients are doing.

##### Accepted, not solved

Two things this page names rather than fixes, because a stated gap is worth more
than an implied guarantee.

**A `null` identity has no non-rotatable charge target inside this package, and
nothing bounds the reconnect by default.** The bound people reach for is
`@lockness/core`'s HTTP-upgrade throttle, and all three of its legs are
conditional:

- **Nothing applies it for you.** `@Throttle` is opt-in, and neither the
  WebSocket handler nor this page installs one on your upgrade route.
- **`by: 'ip'` trusts forwarded headers.** It reads `cf-connecting-ip`,
  `x-real-ip` and `x-forwarded-for` as given; behind a proxy that does not strip
  inbound copies, a client sets its own.
- **With no proxy at all it degrades to one global bucket.** The address
  resolves to the literal `unknown` for every request, so the throttle you
  installed rate-limits the entire internet as one client — and then it refuses
  whoever arrives next rather than whoever is abusing it.

An anonymous deployment carries this knowingly. Authenticating the socket in
`resolveIdentity` is what actually closes it.

**`unsubscribe` and public-channel `subscribe` have no authorization seam at
all.** If you need an audit trail of leaves, it goes in your `onMessage` beside
the budget; there is no framework hook for it, and adding one is not planned.

#### Moving the limits

All three are options on `ChannelManagerOptions`, validated at **construction**
— a cap discovered when it first bites is a misconfiguration discovered in
production.

```ts
const manager = new ChannelManager({
    driver,
    maxWatchedChannels: 5_000,
    maxChannelsPerConnection: 200,
    anonymousHostingShare: 0.8,
})
```

| Option                     | Default | Refused at construction                                          |
| :------------------------- | :------ | :--------------------------------------------------------------- |
| `maxWatchedChannels`       | `1_000` | not a positive integer                                           |
| `maxChannelsPerConnection` | `100`   | not a positive integer, **or greater than `maxWatchedChannels`** |
| `anonymousHostingShare`    | `0.8`   | not a number in `(0, 1]`                                         |

The cross-check is not pedantry: a per-connection cap above the instance cap
lets **one** connection consume the whole instance budget. It also means a small
custom `maxWatchedChannels` must be paired with a smaller
`maxChannelsPerConnection` — the default 100 above an instance cap of 10 is
refused, deliberately.

**Raising `maxWatchedChannels` is not free, and the cost is a reconnect.** The
default is also the N at which #295 proved a full reconnect re-issue, and the
bound #276 put on the post-outage revocation window. At 5 000, a reconnect storm
re-issues 5 000 `SUBSCRIBE`s per instance and the revocation window widens with
the set. That is a legitimate trade; it is not an unmeasured one.

#### The anonymous reservation

`subscribe` runs **no authorizer for a public channel** — the identity and
authorize block is skipped entirely — so an anonymous socket can drive the
hosted set on its own. With the caps merely warning that was unbounded growth;
with them refusing it would be a **denial of all new channel hosting** for every
connection on the instance, authenticated ones included, reachable from about
ten sockets.

`anonymousHostingShare` bounds it. A connection with no identity may cause a 0 →
1 hosted-channel transition only while the instance holds fewer than
`floor(maxWatchedChannels × anonymousHostingShare)` channels; the remainder
stays reachable by identified connections. **An anonymous connection may always
JOIN an already-hosted channel**, at any size — the reservation bounds only the
transitions that cost the broker a new subscription.

A breach of the reserved share carries `scope: 'instance-anonymous'`, distinct
from `'instance'`, because the two call for different responses. Set the share
to `1` to disable the reservation — a deployment that authenticates nobody
should, and then an anonymous breach reports `'instance'`, since the cap is
genuinely what refused it.

```ts
try {
    await manager.subscribe(connection, 'public-feed')
} catch (error) {
    if (error instanceof ChannelLimitError) {
        // `count` and `limit` are properties, deliberately NOT in the message.
        log.warn('cap breach', { scope: error.scope, count: error.count })
    }
}
```

**Do not forward `ChannelLimitError.message` to a client.** The numbers are on
the error for your logs; the message omits them because the caller that triggers
an instance-scope breach on a public channel ran no authorizer, and the
instance-wide count is a live load signal for the whole deployment.

**Treat `scope` as an open set.** Its type is `ChannelLimitScope`, exported from
`@lockness/realtime` and deliberately an alias for `string` rather than a union
of the three values `CHANNEL_LIMIT_SCOPES` names. An exhaustive `switch`
therefore cannot be written against it — it gained `'instance-anonymous'` once
already, and the next addition must not break every catch site. Annotate with
`ChannelLimitScope` where you need the type; read `CHANNEL_LIMIT_SCOPES` where
you need the values.

### The authoritative presence roster

The `here` set for a presence channel is owned by the driver in Redis (a
per-channel member store), not by any one instance's memory. When a client joins
`presence-lobby` on instance A and another joins on instance B, `subscribe`
returns the **cross-instance** roster (both members) and a `joined` frame
reaches presence subscribers on **both** instances.

**When that read fails, the snapshot narrows — and says so.** If the driver
cannot answer the closing roster read, `subscribe` still returns `{ ok: true }`
— the join committed, on the roster and on every instance, so reporting a
failure would be a lie — but `members` then holds **only this instance's own
members**, and a `WARN` is emitted naming the channel.

**`result.rosterSource` says which you got**: `'authoritative'` for every
instance's roster, `'local'` for this instance's members alone. Check it before
treating `members` as a count of everybody present — a fragment and a whole
roster are otherwise indistinguishable to the caller that has to act on them. A
driver with no roster capability is single-process, so its local view _is_ the
authority and reports `'authoritative'`.

```ts
const { members, rosterSource } = await manager.subscribe(
    conn,
    'presence-lobby',
)
if (rosterSource === 'local') {
    // A partial view: render it, but do not assert on its size. The join/leave
    // frames that follow are what bring it current.
}
```

A leave — `unsubscribe`, `disconnect`, or a socket close — removes the member
from the authoritative roster and fans a `left` to every instance.

Fan-out itself stays pure pub/sub: the roster is consulted on
subscribe/unsubscribe/evict only, never on the per-event delivery path.

**Ghost sweep.** Each instance records the roster entries it adds in an
instance-scoped _owned set_, and refreshes an instance-liveness key on a
heartbeat. If an instance crashes without cleanup, a surviving instance's
periodic reconcile pass sweeps what that dead instance's owned set names, so a
crash leaves no permanent ghosts.

**Know what it reaches.** The sweep enumerates the owned set and nothing else,
and it only ever runs against an instance whose liveness key has expired — a
live instance never reclaims its own entries. Two consequences worth holding on
to:

- A roster entry that is in **no** owned set is invisible to the sweep, by every
  instance, forever. Adding a member is therefore one atomic operation: the
  roster field and the owned-set entry are written together or not at all, so
  the pair cannot be created half-formed.
- The sweep `HDEL`s whatever a dead instance's owned set names **without
  checking the entry's owner**. So a stale owned entry — one naming a member
  this instance no longer holds — makes the sweep delete a member that is
  genuinely present and owned by somebody else. Removing a member is one atomic
  operation for that reason, and it is the sharper of the two: an orphaned field
  is invisible, a stale owned entry is actively destructive.
- The sweep is a **crash** recovery mechanism. It is not a repair for a
  divergence on a running instance, and nothing should be designed to lean on it
  as one.

Tune it with the `presence` option:

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

### Cross-process revocation

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

The methods behind it are `markRevocation(revocation)`, `listRevocations()` and
`clearRevocation(revocation)` — optional members of the `BroadcastDriver` port,
alongside `onRevocationReconcile(handler)` which says _when_ the re-check runs.
They are detected **as a set**: a driver either has all three or has none, and
one with two of them is treated as having none. A driver that omits them falls
back to fire-and-forget revocation, with no recovery from a lost frame.

> **A driver written against `markRevoked` / `listRevoked` now throws at
> construction.** That pair no longer exists. See
> [Upgrading to v0.4.0](#upgrading-to-v040).

### Revocation scopes — pick by the consequence, not by the name

Two verbs, and the difference that matters is **what happens to the socket**:

| You want                                                 | Verb                               | The socket          | Everything else the connection holds |
| -------------------------------------------------------- | ---------------------------------- | ------------------- | ------------------------------------ |
| This connection is gone — revoked token, ban, admin kick | `evict(clientId)`                  | **closed** (`4403`) | dropped, and re-joined on reconnect  |
| This connection is out of **one room**                   | `revokeChannel(clientId, channel)` | **stays open**      | untouched — no churn, no re-join     |

Reach for `evict` when the _identity_ is no longer welcome, and `revokeChannel`
when one _room_ is. Using `evict` for a per-room moderation action is not a
narrower revoke; it is a louder one — it drops every other room the connection
holds, and the bundled browser client implements no reconnect at all, so for
that client it ends the realtime session outright. At fleet scale, one kick per
user per room is a socket storm.

```ts
// Remove one member from one room, on whichever instance holds the socket.
const outcome = await manager.revokeChannel(connectionId, 'presence-orders')
// 'revoked'        — the membership was removed here
// 'not-subscribed' — this instance owns the socket; it was not in that room
// 'not-owned'      — the socket lives elsewhere; the record is written and the
//                    frame published, and the owner applies it
```

The revoked client receives `{ "type": "unsubscribed", "channel": "..." }` — it
would otherwise learn nothing, since it is removed from the channel's subscriber
set before the `left` fans out and so does not even receive its own departure. A
**client-initiated** `unsubscribe` sends no such frame; your application owns
that reply.

**A revocation is not a ban.** The connection may re-subscribe immediately if
your `authorize` admits it: this framework owns no deny list, and `subscribe`
never consults the revocation index. That is deliberate — a stale entry would
otherwise refuse a join your application has re-authorized, and the framework
would own a policy it cannot explain. If you need the room closed to that
identity, say so in `authorize`.

**Channel-scoped records are cleared when applied**; connection-scoped ones are
left to expire. The asymmetry is not an inconsistency: after an `evict` the
socket is gone, so its record is moot the instant it is applied, whereas a
channel-scoped record has a live socket to act on for the whole TTL — and an
uncleared one would re-apply the leave at every reconcile tick, kicking a client
that has legitimately re-subscribed, once per tick, until it expires.

### The local tier reports what it did

`unsubscribe` and `disconnect` take a **connection id**, which makes them look
like they reach across the fleet. They do not: they act only on sockets _this_
instance owns. They now say so rather than resolving silently.

```ts
await manager.unsubscribe(clientId, channel)
// 'left'           — a membership was removed here
// 'not-subscribed' — this instance owns the socket; it was not in that channel
// 'not-owned'      — the socket lives on another instance. Nothing was removed
//                    and nothing was announced; use revokeChannel

await manager.disconnect(clientId) // 'disconnected' | 'not-owned'
```

> **These are server-side values.** Do not relay them to a client, and do not
> take `clientId` from a client frame — pass `connection.id` from a socket you
> own. The three states together would otherwise tell whoever receives them
> whether an arbitrary connection id is live somewhere in the fleet, whether
> this instance owns it, and whether it is in a given room.

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

> **The compatibility read is gone**
> ([#278](https://github.com/locknessland/lockness-monorepo/issues/278)). For
> one unreleased cycle the driver also _read_ the previous layout
> (`{prefix}:revoked` plus per-target markers) so a revocation written by a
> not-yet-upgraded instance was still honoured. Nothing ever wrote that layout
> in a published version, so `listRevoked` is now a single `EVAL` again — one
> round trip whatever the number of revocations, rather than one plus one per
> legacy member. If a real Redis still holds `{prefix}:revoked` or any
> `{prefix}:revoked:*` marker, **delete them by hand**: the index SET has no TTL
> and nothing reads it.

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

Control messages (`evict`, `revoke-channel`) **and** presence-identity
announcements (`presence-join` / `presence-leave`) are **HMAC-authenticated**
with a per-deployment shared secret (`RealtimeControlConfig`). The secret is set
once, identically on every instance, via the `control` option:

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
  ~app__* \
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
- **Channel patterns must be spelled EXACTLY as the driver subscribes them — and
  which verb it uses decides how they are matched.** Redis matches a `&` rule
  **literally** for `PSUBSCRIBE` and by **glob** for `SUBSCRIBE`. So `&app__*`
  does **not** authorize `PSUBSCRIBE app__event:*` — it returns `NOPERM`, and
  the usual reaction to that is `allchannels`, which grants everything.

  **The ACL above is unchanged by per-channel subscribe, and that is not luck.**
  Since [#295](https://github.com/locknessland/lockness-monorepo/issues/295) the
  driver subscribes one **exact topic per hosted channel** rather than one
  prefix-wide glob, and it issues them with `SUBSCRIBE` precisely so the rule
  you already have keeps working. Verified with `ACL DRYRUN` against Redis 7,
  for a user holding `&app__event:*` and `&app__control`:

  ```
  PSUBSCRIBE app__event:*         -> OK      (the pre-#295 subscription)
  PSUBSCRIBE app__event:alpha     -> NOPERM  (literal match: no rule equals it)
  SUBSCRIBE  app__event:alpha     -> OK      (glob match against &app__event:*)
  SUBSCRIBE  app__event:eu:orders -> OK
  SUBSCRIBE  app__control         -> OK
  ```

  Had the driver issued exact topics as **patterns**, every deployment holding
  this ACL would have gone deaf on events while its control plane kept working —
  a partial failure, and the hardest kind to read from a log. **Nothing to
  migrate: keep `&app__event:*` and `&app__control`.**

**One glob, and that is the whole keyspace.** Every name the driver derives sits
behind `__`, which no accepted prefix may contain, so `~app__*` covers all of
them with nothing left over. An ACL that still grants `~app:revoked` and
`~app:revoked:*` — the shape this document recommended before #278 — should
**drop both**: the keys are gone, but the globs are not narrow, and
`~app:revoked:*` matches every key of a second deployment using the accepted
prefix `app:revoked:eu`. Deleting the key while keeping the grant keeps the
reach.

Hold the bus to the same TLS + AUTH posture as any other credentialed
connection.

**A prefix must match `[A-Za-z0-9:._-]`, be 1–64 characters, and must neither
contain `__` nor end with `_`.** Five checks, each with its own message. The
glob metacharacters `*` `?` `[` `]` and `\` are named individually because they
reach `PSUBSCRIBE` as a pattern and would widen the subscription — `app\` worst
of all, since Redis reads `app\:*` as the literal `app:*`, so that deployment
reads another's whole stream while its own traffic stays invisible to the
deployment it is reading. `__` is refused because it is the lead-in every
reserved separator begins with; a prefix carrying it can reach another
deployment's names.

**A trailing `_` is refused for a different reason, and it is about the ACL
rather than the driver**
([#278](https://github.com/locknessland/lockness-monorepo/issues/278)). `app`
and `app_` collide on nothing and cross-subscribe to nothing — their event
patterns are `app__event:*` and `app___event:*`, which do not match each other.
What they share is a **credential boundary**: the grant recommended above for
`app` is `~app__*`, and every name `app_` derives begins `app___`, which that
glob matches. So the `app` credential could read the whole `app_` deployment
while both looked perfectly isolated at the protocol level. Since `__` is
already refused, a single trailing `_` is the only shape that can do this, and
refusing it makes the containment argument exact instead of conditional.

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

**There is no exception left.** Two revocation key names — `<prefix>:revoked`
and `<prefix>:revoked:<id>` — used to keep their old shape, because they existed
only to read what a pre-#276 instance wrote at those exact names.
[#278](https://github.com/locknessland/lockness-monorepo/issues/278) deleted the
reader, and with it the exemption: every name the driver derives now sits behind
the reserved lead-in, and the test that proves it has no list to add a name to
in order to make it pass.

The channel-event path keeps its existing defence in depth on top of all this:
every message off the bus is re-validated on ingest (channel/event names via
`isValidName`, bounded payload size), and the **receiving** instance re-applies
its own local authorization before delivering to a subscriber — a peer cannot
inject an out-of-charset name or reach an unauthorized local connection.

## Upgrading to v0.4.0

One breaking seam change, two widened return types, one new control kind. **No
Redis migration**, and nothing to do before you deploy except read item 1.

### 1. Upgrade every instance before you rely on `revokeChannel`

An instance running `0.3.0` **ignores** the new `revoke-channel` control frame —
it verifies it, admits it, and does nothing, which is what makes a rolling
deploy safe in the first place. The consequence is that a revoke aimed at a
socket a `0.3.0` instance owns **does not land**, and the durable record does
not rescue it: a record is only ever applied by the instance that owns the
socket, and that instance is precisely the one that cannot read it.

This is bounded by the deploy. When the old instance drains, its sockets close
and the reconnecting client is re-admitted through your `authorize` on an
upgraded instance.

> **If you need certainty mid-deploy, use `evict`.** Every version obeys it.

### 2. The driver revocation seam is replaced, and the old one throws

| Before (`0.3.0`)  | After (`0.4.0`)                         |
| ----------------- | --------------------------------------- |
| `markRevoked(id)` | `markRevocation({ target, channel? })`  |
| `listRevoked()`   | `listRevocations(): Revocation[]`       |
| —                 | `clearRevocation({ target, channel? })` |

**Only if you wrote your own `BroadcastDriver`.** The bundled Redis and memory
drivers are already migrated, and nothing in your application code changes.

```ts
// Before                            // After
markRevoked(target: string) {        markRevocation(r: Revocation) {
    this.index.add(target)               this.index.add(this.encode(r))
}                                    }
listRevoked(): string[] {            listRevocations(): Revocation[] {
    return [...this.index]               return [...this.index]
}                                            .map((m) => this.decode(m))
                                             .filter((r) => r !== undefined)
                                     }
                                     clearRevocation(r: Revocation) {
                                         this.index.delete(this.encode(r))
                                     }
```

A driver still presenting the old pair **throws at construction**, naming the
migration. That is deliberate rather than strict: the alternative is being
narrowed to "no revocation store", which loses `evict`'s durability silently on
a driver that plainly implements revocation — nothing logged, every same-version
test green.

**Your `listRevocations` must fail closed.** Drop any record you cannot fully
decode; never return one with a missing `channel`. A channel-scoped record that
comes back without its channel is applied as a **whole-connection** revocation
and hard-closes a socket that should only have left one room. The revocation
index is the one cross-instance channel with no authenticity tag, so what your
decoder refuses is the boundary.

> **Third-party realtime drivers are not a supported extension point before
> `1.0`.** At `0.x` the bundled drivers are the contract, and a seam like this
> one changes without a deprecation window. If you maintain a driver, track
> `main` — you will get a construction-time error naming the change, never a
> silent behaviour loss.

### 3. No Redis migration

The revocation index is read-compatible in both directions and there is no new
key, no dual-write and nothing to backfill. A channel-scoped record is a
composite member; the delimiter is a **space**, which is outside the connection
id charset, so a `0.3.0` reader finds no such connection and skips it — inert
rather than wrong, and it does not delete it either, so the record survives for
the upgraded owner.

> **Do not "tidy" that delimiter to a `:` or a `.`.** Both are inside the
> charset, and a composite would then collide with a real connection id — at
> which point a `0.3.0` instance applies a room revocation as a `4403` kill of
> the whole session. Every same-version test passes either way; only the
> mixed-fleet witness fails.

### 4. `unsubscribe` and `disconnect` return values

`Promise<void>` became `Promise<LeaveOutcome>` and `Promise<DisconnectOutcome>`.
**Not a compile error** for callers that ignore the value. It **is** one for a
subclass that overrides either method with `Promise<void>`, and for an `encode`
hook annotated with the old `OutboundFrame` union — which gained
`{ type: 'unsubscribed' }`, because that frame goes through your encoder like
every other. See
[The local tier reports what it did](#the-local-tier-reports-what-it-did).

`'not-owned'` means _use `revokeChannel`_.

### 5. The new control kind needs no coordination

`revoke-channel` adds no wire field, so the MAC covers exactly the same bytes in
both directions. No shared-secret rotation, no coordinated restart.

## Upgrading to v0.3.0

Two behaviour changes in `@lockness/realtime`. Neither needs a data migration;
both can be met before you deploy.

### 0. Read this even if you change nothing

**The guidance about where a per-call budget belongs was wrong and has been
corrected.** If you followed it and put a rate limit in your `authorize`
callback, that limiter cannot see a public channel, cannot see `unsubscribe` at
all, and cannot refuse a member already in the room. It is not doing what you
think it is doing. Nothing breaks and no consumer action is required, but the
budget you believe you have is smaller than you believe — see
[The framework does not meter the verb rate](#the-framework-does-not-meter-the-verb-rate--and-that-is-a-decision).

`ChannelManager` also gained one read-only getter, `maxChannelsPerConnection`,
which reports the **effective** cap rather than the default constant. Additive
only.

### 1. The watched-channel caps now refuse

They warned and admitted before. A subscribe past a cap now raises
`ChannelLimitError` — see [Watched-channel limits](#watched-channel-limits) for
the options that move them.

**Before deploying**, decide three things:

1. **Are you near 1 000 hosted channels per instance?** If you were running the
   previous version, `#checkChannelCaps` logged the actual count on every
   breach. Raise `maxWatchedChannels` if so — and read what a raised cap costs a
   reconnect first.
2. **Do you accept anonymous sockets?** `subscribe` runs no authorizer for a
   public channel, so anonymous connections are bounded to
   `anonymousHostingShare` (default `0.8`) of the instance budget for **new**
   channel hosting. A deployment that authenticates nobody sets it to `1`.
3. **Does anything forward the error text to a client?** It no longer carries
   the count or the limit; read `error.count` and `error.limit` instead. Do not
   put either on the wire.

`ChannelLimitError.scope` is typed `string`, not a union — an exhaustive
`switch` will not compile against it, by design. Compare against
`CHANNEL_LIMIT_SCOPES` and handle an unrecognised value generically.

### 3. `PresenceMember` is bounded, and an oversized one now throws

`PresenceMember.info` was bounded by nothing. `subscribe` now throws
`PresenceMemberSizeError` when the whole serialized member exceeds
`maxPresenceMemberBytes` (**4096 bytes** by default) — see
[`PresenceMember.info` is bounded](#presencememberinfo-is-bounded-and-the-bound-is-checked-at-admission).

**Before deploying**, ask what your `authorize()` puts in `info`. A deployment
that returns a display name and an avatar URL is nowhere near the bound. One
that returns a whole profile document, a base64 avatar, or anything an end user
can grow without limit, has joins that will now throw where they previously
succeeded — and, before this release, succeeded while being invisible to every
other instance, which is the defect the bound closes.

Two smaller changes ride with it:

1. **The driver's oversize control publish now rejects** instead of warning and
   returning. `unsubscribe` and `evict` await `publishControl` and previously
   could not learn their frame was never sent. The presence-join path still
   catches and warns, deliberately: with the admission bound in place, the only
   failures left there are transient ones the roster survives.
2. **`maxPresenceMemberBytes` and `control.maxPayloadBytes` move together.**
   Raising the member bound without raising the control ceiling on every
   instance admits members that cannot be announced.

### 2. The legacy revocation read is gone

`RedisBroadcastDriver.listRevoked` no longer reads `{prefix}:revoked` and its
per-target markers. Nothing in a published version ever wrote them, so there is
nothing to migrate — but two housekeeping items follow:

- **Delete `{prefix}:revoked` and any `{prefix}:revoked:*` keys** from a real
  Redis. The index SET has no TTL and nothing reads it, so it lingers forever.
- **Narrow your Redis ACL.** If it grants `~app:revoked` and `~app:revoked:*` —
  the shape this guide recommended — drop both. `~app__*` alone covers every
  name the driver derives, and `~app:revoked:*` is wide enough to reach a second
  deployment whose prefix begins `app:revoked:`.

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
