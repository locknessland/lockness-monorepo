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
            onClose: (conn) => manager.disconnect(conn),
        },
    }),
)
```

The origin guard is **fail-closed**: exact origin triple, same-origin by default
from `APP_URL`, and an absent / `null` / substring-lookalike origin is rejected.

If you wire your own transport instead of `handlerHooks`, it owes the manager
three lifecycle duties and your ids owe it two rules — see
[Your connection ids and your transport's lifecycle](#your-connection-ids-and-your-transports-lifecycle).

### A failing hook is reported, never fatal

A synchronous throw or an async rejection from `onOpen`, `onMessage` **or
`onClose`** goes to your `onError` hook, exactly once, with the connection. With
no `onError`, it is one `console.error` line:
`realtime: unhandled websocket error: <error>`. The socket is not closed for
you, and nothing is sent to the client.

The close path matters most. Deno terminates the process on an unhandled
rejection, so one rejected close used to take the whole server down with every
other socket on it
([#369](https://github.com/locknessland/lockness-monorepo/issues/369)). With
`manager.handlerHooks(...)`, the close awaits `manager.disconnect`, which
re-throws a teardown failure such as a broker unwatch or a roster release that
did not complete. That failure now reaches `onError` like any other. The
connection is still forgotten, and the manager keeps serving.

`onError` is covered as well. If your `onError` throws or rejects, the handler
writes one fallback line that carries both errors:

```text
realtime: unhandled websocket error (the onError hook failed too): <error>; hook failure: <failure>
```

The marker `(the onError hook failed too)` sits in the fixed prefix, before any
error text. An error message can carry client-controlled text, so a marker
placed after it could be forged by a client. Both halves are rendered and
escaped the same way as the default line, so neither can break the line or
inject control characters. Nothing escapes, but a broken `onError` is a bug in
your application, and the line names it so you can fix it.

When `onError` works, the handler writes nothing: your hook is the report.

Neither line can escape on its own either
([#391](https://github.com/locknessland/lockness-monorepo/issues/391)). If
`console.error` throws (a patched console, a logger transport that refuses the
line), the handler writes the same line to stderr instead. It drops the line
only when stderr refuses it too. The package's other last-resort lines work the
same way: the Redis driver's pass and sweep failures, the enforcement deadline,
and a control-frame revocation.

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

manager.register(conn) // once, from the socket's open hook
await manager.subscribe(conn, 'private-orders') // rejected if unauthorized
manager.broadcast('private-orders', 'created', { id: 1 })
```

A private/presence subscribe is confirmed **only after** the authorizer
approves; an unauthorized connection never receives that channel's events. A
presence channel returns the current member roster and emits join/leave to
members only.

### What your authorizer may return

Exactly three things
([#347](https://github.com/locknessland/lockness-monorepo/issues/347)):

| The authorizer returns                                                  | `subscribe`                                                                                                                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false`                                                                 | denies — `{ ok: false }`                                                                                                                                                              |
| `true`                                                                  | admits; on a presence channel the member is `{ id: connection.id }`                                                                                                                   |
| a `PresenceMember` — exactly `{ id, info? }` with a valid `id`          | admits; on a presence channel as that member — a private channel runs the same check, then discards the member ([#357](https://github.com/locknessland/lockness-monorepo/issues/357)) |
| any other object — a Deno KV entry, a pg `QueryResult`, `{}`, a raw row | **throws `PresenceMemberShapeError`, `PresenceMemberIdError` or `PresenceMemberSizeError`**, on either kind — nothing is written, published or delivered                              |
| **anything else**                                                       | **throws `AuthorizeResultError`** — nothing is written, published or delivered                                                                                                        |

"Anything else" is `undefined` from a missing `return`, `null` or `undefined`
from a query that found nothing, `0`, `''`, `'yes'`, `1`, an array, a boxed
primitive such as `new Boolean(false)`. The `AuthorizeResult` type already says
`boolean | PresenceMember`, but the type does not reach every authorizer:
`(await db.select()...)[0]` under the default `noUncheckedIndexedAccess: false`,
an `any`-typed row, a cast or a plain-JS app all compile and hand the manager a
value the type does not name. Until #347 every such value except `false`
**admitted** a private channel — an authenticated stranger on someone else's
`private-*` channel. (On a presence channel `null` and `undefined` failed with a
raw `TypeError` instead, closed only by accident.)

**Lockness deliberately does not treat a falsy value as a quiet deny**, unlike
Laravel. A forgotten `return` is a bug, and read as `false` it would be a
deny-all that looks exactly like policy. It throws instead, so the bug is
visible: the error reaches your `onError` hook through the WebSocket handler,
and names the channel and the value's **type** only — never the value, which is
your data. Nothing is sent to the client; your `onMessage` owns any reply, as
for `ChannelLimitError`. On a channel the connection already holds it throws and
removes nothing, exactly like a denial (see below).

Write the authorizer so every path ends in one of the three:

```ts
new ChannelManager({
    authorize: async (identity, channel) => {
        const row = identity
            ? await findMembership(identity.id, channel)
            : undefined
        // Never `return row`: a found row would ship every column to the room,
        // and a missing one throws.
        return row ? { id: row.userId, info: { name: row.displayName } } : false
    },
})
```

`?? false` closes the gap wherever the value may be absent.

An object is checked next, as a presence member, **on either channel kind**
([#357](https://github.com/locknessland/lockness-monorepo/issues/357)): its own
keys must be `id` and `info` only, its `id` must be a string or a finite number,
and it must fit `maxPresenceMemberBytes` — or `subscribe` throws
`PresenceMemberShapeError`, `PresenceMemberIdError` or `PresenceMemberSizeError`
— see
[The presence member id is bounded too](#the-presence-member-id-is-bounded-too--by-length-not-by-charset)
and [What reaches the room](#what-reaches-the-room-exactly--id-info-). A
`row.userId` that can be `null` needs the same `: false` branch.

A private channel runs the same check and then **discards** the member: it has
no roster, so the object carries no meaning there. That is why the check runs at
all. A lookup that found nothing is usually still an object — Deno KV's
`kv.get()` resolves to `{ key, value: null, versionstamp: null }`, a pg query to
a `QueryResult` with `rows: []` — and before #357 any object admitted a private
channel, so an authorizer returning its lookup put every authenticated user on
someone else's channel. On a private channel, answer with a boolean:

```ts
const entry = await kv.get(['member', channel, identity.id])
return entry.value !== null // not `return entry`
```

The member errors end with that advice, since the same error class now reaches a
private-channel authorizer. The rule is the same on both kinds, so one
authorizer returning `identity ? { id: identity.id } : false` serves both with
the same outcome.

### What reaches the room: exactly `{ id, info }`

A presence member is **exactly `{ id, info? }`**
([#350](https://github.com/locknessland/lockness-monorepo/issues/350)). The room
never receives the object your authorizer returned — it receives a copy made
once, at admission:

- **Only `id` and `info` may be own keys.** Any other key — the `email`,
  `passwordHash` or `isAdmin` column of a raw row — makes `subscribe` throw
  `PresenceMemberShapeError` before anything is written. The error names up to
  three of the offending keys and their count, never a value. It refuses rather
  than silently dropping the key, so a top-level `name` does not just vanish
  from your UI.
- **`info` must serialize to a JSON object**, or be absent. `null`, an array, a
  `Date` (which serializes to a string) or a `toJSON` returning a non-object
  throw `PresenceMemberShapeError`, naming the type only: every other instance
  would drop such a member, so it would be visible here and nowhere else. An
  `info` that serializes to nothing — a function, a symbol, or a `toJSON`
  returning `undefined` — throws too, rather than joining as a bare `{ id }`
  with its `info` silently lost.
- **`id` and `info` are each read once.** The pair is serialized once and parsed
  back, and that parsed copy is what the roster, the `here` snapshot and every
  `joined` frame carry — on this instance and on every other one. A getter, a
  Proxy or a `toJSON` on your object cannot make a later read ship something the
  checks never saw, and changing the object after `subscribe` changes nothing in
  the room.
- **`info` follows JSON rules**: a `Map` or `Set` becomes `{}`, `undefined`
  values vanish, a nested `Date` becomes a string — the same for every
  subscriber.

**What Lockness does not decide: what you put inside `info`.** `info: row` still
ships the whole row, every column, to everyone in the room. Lockness guarantees
the envelope; the contents are your declaration of what the room may see. Pick
the fields:

```ts
return row ? { id: row.id, info: { name: row.displayName } } : false
```

### What a `joined` frame promises — and what it does not

**`joined` and `left` are announced per member, not per connection**
([#344](https://github.com/locknessland/lockness-monorepo/issues/344)). A
member's first connection anywhere in the fleet sends one `joined`; its last
connection closing sends one `left`. A second tab — on the same instance or on
another — sends nothing, and closing one of two tabs sends nothing: the member
is still here. That holds on the memory and Redis drivers, whose roster is
authoritative; a custom driver with a control plane and no roster decides per
instance. It is only as truthful as your member ids: return one id **per
identity** from your authorizer (see
[The authoritative presence roster](#the-authoritative-presence-roster)).

**A `joined` frame emitted by the instance the member joined on follows a
successful authoritative roster write that filled the member's slot.** The write
that observes the slot go from no holder to one is the one that announces, so no
subscriber is ever told about a member the roster refused. If that write fails
the subscribe rejects, nothing was announced, and the attempt leaves no trace —
the same connection can retry the same channel and produces exactly one member.
**One exception:** when the write committed but its reply was lost, the rollback
releases the slot it cannot see, and that release sends a truthful `left` for a
member no `joined` was sent for. **That release runs whether or not the
rollback's own local leave also fails** — the same broker fault that loses the
write's reply can just as easily fail the leave's `unwatchChannel`, and neither
failure changes what the subscribe rejects with: the original roster error,
always, with each failure logged at WARN rather than thrown or swallowed
([#373](https://github.com/locknessland/lockness-monorepo/issues/373)). **A
crash is the second cause**: an instance that committed a hold and died before
announcing it leaves a slot the ghost sweep later empties, and that sweep
announces a `left` for a member nobody was told had arrived (see
[the ghost sweep](#the-authoritative-presence-roster)). Treat an unknown `left`
as a no-op. A connection never receives `joined` **or `left`** for its own
member id
([#349](https://github.com/locknessland/lockness-monorepo/issues/349)).

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
arriving out of order. A join that loses that race announces nothing, and
neither does the leave that overtook it — no `left` without a `joined`. See
[ADR 003](adr/003-realtime-roster-write-ownership.md) and
[ADR 004](adr/004-realtime-roster-slots-held-per-instance.md).

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

### Your connection ids and your transport's lifecycle

`handlerHooks` meets everything in this section for you. Read it if you mint
your own ids or wire your own transport.

**Your transport owes the manager three lifecycle duties**
([#361](https://github.com/locknessland/lockness-monorepo/issues/361)):

1. **Call `register` with the connection object from the socket's open hook** —
   not lazily, and not from the first `subscribe`.
2. **Present that same object for the socket's whole life.** Do not build a
   fresh `Connection` per frame.
3. **Call `disconnect(conn)` when the socket closes, with the object you
   registered** — not `disconnect(conn.id)`. `disconnect`'s JSDoc is the
   reference.

**The manager enforces all three**
([#370](https://github.com/locknessland/lockness-monorepo/issues/370),
[#363](https://github.com/locknessland/lockness-monorepo/issues/363)). Each
refusal lands before the authorizer runs and before anything is written — no
membership, cap slot, broker watch or roster entry is left for a teardown to
miss:

- `subscribe` refuses an object `register` never bound with
  `ConnectionNotRegisteredError`. `register` is the only way a connection is
  bound, so a first `subscribe` racing its own close can no longer strand a
  connection nothing will disconnect.
- A `disconnect` retires the connection **object** it was given: from then on
  `register` and `subscribe` refuse that object with
  `ConnectionDisconnectedError`.
- While one object holds an id — live, or still being torn down — `register` and
  `subscribe` refuse a **different** object under that id with
  `ConnectionIdInUseError`. That is the first id rule below being broken, not a
  race to wait out. The same object registered twice is a no-op.
- `disconnect(conn)` acts only when `conn` is the object that owns its id; any
  other object gets `'not-owned'` and touches nothing. A teardown also forgets
  the binding only while its own object still owns it, so a late close after an
  evict and a fast reconnect leaves the new socket alone.

**If you wire your own transport without `handlerHooks`**, one gap is yours to
close: never run application code for a socket whose `register` was refused — in
particular never call `unsubscribe(conn.id, …)` for it, which acts on the id and
so on whoever holds it. `handlerHooks` closes that gap for your `onMessage` and
`onClose`: `onMessage` runs your hook only for the socket that owns its id, and
**your `onClose` runs exactly once for each socket whose `onOpen` ran — evicted
ones included, refused ones never.** "Ran" means the framework admitted the
socket and called your hook: an `onOpen` of yours that throws, or that closes
the socket itself, still gets its `onClose`. So a counter kept across the two
must be incremented **first**, as the first line of `onOpen`, or it can drop
below zero. If your transport reuses ids, an evicted socket's id may already be
someone else's, so still never act on `conn.id` there. Your `onError` still
hears a refused socket, by design — it reports; it must not act on the id
either. Why the manager enforces these rules the way it does is
[ADR 010](adr/010-realtime-disconnect-retires-the-connection-object.md).

**Your ids owe it two rules.** `manager.evict(id)` names a connection id in a
frame that crosses the bus, so **a connection id must be unguessable and never
reused**. The framework's own WebSocket upgrade generates one per connection; if
you wire your own transport, generate a fresh `crypto.randomUUID()` rather than
passing a user id or a session id. A stable, guessable id makes a captured
eviction frame a repeatable weapon against whoever currently holds it — and, now
that a held id is refused, lets whoever registers it first lock its owner out
(item 21).

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
presence roster, and `subscribe` **throws `PresenceMemberIdError`** unless it is
**a string or a finite number** whose string form is 1 to 200 characters.

**The type is checked first**
([#346](https://github.com/locknessland/lockness-monorepo/issues/346)).
`PresenceMember.id` is typed `string | number`, but the type does not reach an
authorizer written in plain JavaScript, behind a cast, or returning a nullable
column: `{ id: user.id }` with a `null` `user.id` compiles. Every presence
consumer keys a member by `String(id)`, and `String(null)`, `String(undefined)`
and `String({})` are ordinary short keys — so before 0.4.0 two different people
whose authorizer returned such an id **merged into one presence entry**, and on
Redis every other instance dropped the frame announcing the join while
`subscribe` answered `{ ok: true }`. Now `null`, `undefined`, booleans, a
`bigint`, a symbol, a function, an array, a boxed primitive and every object
throw, as do `NaN` and `±Infinity`. Every finite number is accepted — integers,
fractions, negatives, and a large integer such as `1e21`; `-0` is the same
member as `0`, and `1` is the same member as `'1'`. Nothing is coerced: Lockness
never replaces a malformed id (with the connection id, say), because that would
hide your authorizer's bug.

The same rule decides what a Redis instance accepts from another — on a
`presence-join` frame and on a roster read — so an id one instance admits is one
every instance admits. The error message names a string or number id (encoded
for the log) and names any other value **by its type only** (`of type null`,
`of type object`…): an object id may be a whole user record, and the message
reaches your logs. Like `AuthorizeResultError`, it is thrown before anything is
written, published or delivered, and it reaches your `onError` hook.

Two consequences for how you write `authorize()`:

- **Deny when the id is absent**:
  `return user?.id == null ? false : { id: user.id }`.
- **Send a 64-bit key as a string.** A number above `2 ** 53` has already lost
  precision in your code before Lockness sees it, and is accepted as the
  imprecise value it became.

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
import { getMeter } from '@lockness/telemetry'

// Your application's own counter: name it in your own namespace.
const refused = getMeter('my-app').createCounter('my_app.control_refused')

driver.onControlRefused((refusal: ControlRefusal) => {
    // reason — 'oversize' | 'no-secret'
    // kind, channel, and for an oversize refusal: bytes and limit
    refused.add(1, {
        reason: refusal.reason,
        channel: refusal.channel ?? '-',
    })
})
```

`getMeter` returns the no-op meter while `OTEL_DENO` is unset (see
[Observability](observability-and-crypto.md#opentelemetry)).

`ControlRefusal` is exported from `@lockness/realtime`, and `onControlRefused`
is optional on `BroadcastDriver` — a custom driver that omits it is unaffected.
The Redis driver's `close()` drops the handler: a closed driver reports nothing
([#349](https://github.com/locknessland/lockness-monorepo/issues/349)).

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
    AuthorizeResultError,
    ChannelNameError,
    ConnectionIdError,
    PresenceMemberIdError,
    PresenceMemberShapeError,
    RevocationScopeError,
} from '@lockness/realtime'

if (error instanceof AuthorizeResultError) {
    // The authorizer returned something other than true, false or a member —
    // usually a missing `return` or a raw query row. Fix it; do not retry.
}

if (error instanceof PresenceMemberIdError) {
    // The authorizer returned an id the roster cannot carry — not a string
    // or a finite number, empty, or over 200 characters. Fix the
    // authorizer, do not retry.
}

if (error instanceof PresenceMemberShapeError) {
    // The member carried a key other than `id` and `info` — usually a raw
    // query row — or an `info` that is not a JSON object. Return
    // `{ id, info }` explicitly; do not retry.
}

if (error instanceof RevocationScopeError) {
    // `revokeChannel` on a driver that can ROUTE the frame but cannot RECORD
    // it durably. Not retryable and not a transient fault: the driver is
    // missing the revocation trio. Use `evict`, which every driver obeys, or
    // implement markRevocation / listRevocations / clearRevocation.
}
```

`RevocationScopeError` refuses rather than degrades on purpose. A driver with a
control plane and no revocation store _could_ publish the frame — and that is
exactly the undurable path: a lost or MAC-refused frame would be a revocation
that reported success and did nothing. A **single-process** driver (no control
plane, no store) is a different case and is allowed, because there is no bus on
which to lose a frame.

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
publishes nothing to the other instances — and it returns the same bounded
`here` snapshot a first join returns, so a client re-subscribing after a network
blip cannot tell the difference and is never refused.

**A roster read is not free, and the word "nothing" above is exhaustive only
about writes.** The read is one `EVAL` on the Redis driver, and since `0.4.0`
its reply is **bounded**: at most `maxPresenceSnapshotMembers` members, plus the
own entries of the callers the read serves, with their `info` — however large
the room ([#341](https://github.com/locknessland/lockness-monorepo/issues/341)).
Zero writes; not zero cost — but the cost no longer grows with the room's
population. The numbers are in the table below.

**Concurrent subscribes to one channel share a read.** At most one authoritative
read per channel is in flight at a time on an instance; callers that arrive
while one is running are answered by the next read, issued the moment the
current one settles. So a burst of K simultaneous subscribes to one room costs
**two** reads rather than K, and the bound is one read per channel per driver
round-trip, independent of how fast frames arrive.

They are answered by the _next_ read and never by the one already running, and
that is deliberate: the snapshot you receive was always read at an instant no
earlier than the moment you asked for it, and sharing an already-running read
would break that — a joiner whose own roster write had just committed could be
handed a roster it is not in. The extra read per burst is what buys that back.

**The figures in the table below are the unconcurrent case** — one subscribe,
nothing else in flight. They are the worst case per frame, and concurrency only
ever lowers the total. Sharing bounds how **often** the roster is read, not how
**large** it is. Since `0.4.0` what a subscribe **returns** has a ceiling — at
most `maxPresenceSnapshotMembers` members — `MAX_PRESENCE_SNAPSHOT_MEMBERS`
(100) by default — so at most K·(M+1)+1 bytes of member JSON, 409 701 at the
defaults — see
[The authoritative presence roster](#the-authoritative-presence-roster). What
the instance **reads** is bounded too
([#341](https://github.com/locknessland/lockness-monorepo/issues/341)): the
driver returns at most K members plus the entries of the callers that read
serves, so a room of ten thousand costs the same ingest per read as a room of a
thousand. A shared read fetches every caller's own member, deduplicated by id
and capped at `MAX_ROSTER_READ_SELF_IDS` (1 000) distinct ids; a burst of more
distinct members than that queues further reads, still one in flight at a time,
each bounded.

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
| `subscribe` presence, first join        |             2–3 |               0–1 |             0 / N−1 |                1 |
| `subscribe` presence, **re-join**       |               1 |                 0 |                   0 |                1 |
| `unsubscribe` public / private          |             0–1 |                 0 |                   0 |                0 |
| `unsubscribe` presence, member          |             1–2 |               0–1 |             0 / N−1 |                0 |
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
  `UNSUBSCRIBE` on the subscribe connection, `EVAL` for a roster write and one
  read-only `EVAL` for the roster read on the command connection. A **control
  publish is a `PUBLISH`** on the command connection too — it has its own column
  here rather than being folded into this one, because its cost is paid by the
  whole fleet rather than by the publisher.
- **The table is the SUCCESSFUL path, and two things sit outside it.** A
  presence first join whose roster write **fails** pays more than the ceiling
  above: the compensation issues the local leave — which may `UNSUBSCRIBE` — and
  a second roster `EVAL` to release a possibly-committed hold. When that hold
  had in fact committed and no other instance holds the slot, the release
  empties it and publishes one `presence-leave`, though no `presence-join` went
  out. And the Redis driver starts its ghost sweep on the first roster write of
  a process, a once-per-process cost that no per-frame row can carry. Neither is
  a path a client chooses, but a budget sized on the table alone is sized on the
  happy path.
- **The control publish is per member, not per frame.** A first join publishes
  only when it fills the member's slot, and a presence leave only when it
  empties it; a second tab and a leave while another holder remains publish
  nothing. The upper figure is the one to size on: a client controls how many
  identities it presents only as far as your authorizer lets it.
- **Fleet verifications** are the term nobody counts. A control frame goes to
  one shared topic every instance subscribes to, and the publisher's own
  loopback is dropped **before** the MAC — so every _other_ instance pays a
  length gate, a `JSON.parse`, field validation, a synchronous HMAC, a
  timing-safe compare and a replay-window admit, whether or not it hosts the
  channel. It scales with **fleet** size, not with the room. It is CPU, not
  memory: the replay window is bounded at 10 000 entries with a per-origin fair
  share.
- **The re-join's single command is a bounded roster read.** Its reply is at
  most K members plus the own entries of the callers that read serves — the
  joiner's alone when nothing else is in flight, and up to
  `MAX_ROSTER_READ_SELF_IDS` (1 000) when concurrent subscribes share the read —
  whatever the room's size. A frame-rate budget bounds how many such replies
  arrive; K and that cap bound how large one is.
- **Collapse axes.** A driver with no roster capability has no roster `EVAL` at
  all. A driver with no control plane has no publishes and no verifications.
  `MemoryBroadcastDriver` is single-process: both columns go to zero.

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
        try {
            await dispatch(conn, frame)
        } catch (error) {
            // The `await` above lets the socket close before `subscribe` runs,
            // and a disconnected connection is refused at admission. No client
            // is left to answer, so drop the frame — and let anything else
            // reach `onError`. Import it from `@lockness/realtime`.
            if (error instanceof ConnectionDisconnectedError) return
            throw error
        }
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

**One slot per member, held per instance**
([#345](https://github.com/locknessland/lockness-monorepo/issues/345)). Each
member id is one slot in the roster, and the driver records **which instances
hold it**. Every instance with a connection for that member holds the slot; the
slot leaves the roster only when its last holder releases it. So while at least
one live instance holds a member, every `here` snapshot on every instance lists
it and counts it in `total`, and no instance leaving or dying removes a member
another instance still holds. The member's shown `info` is always a current
holder's: when the holder whose entry is shown releases, another holder's entry
takes its place.

**What a subscribe returns is a bounded snapshot, `here`**
([#339](https://github.com/locknessland/lockness-monorepo/issues/339)). A room's
population has no ceiling, so the reply cannot be the room:

- `here.members` holds at most `maxPresenceSnapshotMembers` members (a
  `ChannelManagerOptions` option, default `MAX_PRESENCE_SNAPSHOT_MEMBERS`, a
  positive integer validated at construction). A room that fits is returned
  whole and unchanged.
- **The joiner is always in its own snapshot** when the roster holds it. The
  read fetches the joiner's own entry beside the window, so a joiner outside the
  window takes the last slot of a full window, or is appended to a short one.
- `here.total` is how many entries the roster held at the instant of the read.
  `here.members.length < here.total` means the snapshot is partial. Counting
  costs no extra driver command: the driver counts inside the same read.
- Cutting is silent — no log, no metric, no error — and changes neither `ok` nor
  the number of reads.

**`total` is a snapshot-time number.** The `joined` and `left` frames that
follow never carry it, and they keep flowing for members outside your snapshot:
a client building its list from those frames can see `left` for a member it was
never shown. Treat an unknown `left` as a no-op.

**The snapshot is a UI hint, not an access list.** Authorization never reads it.
Which members fill the window is the driver's choice. On the memory driver it is
**join order**, so the first K joiners hold the visible slots for as long as
they stay. On Redis a room that fits is returned whole, and a room larger than K
returns a **random sample of K members, a different one on every subscribe**,
re-joins included — no member holds a slot, and none is hidden for good. Return
a member id **per identity** from your authorizer — not a per-socket id, and not
`true` — so one account holds one slot however many tabs it opens.

**When that read fails, the snapshot narrows — and says so.** If the driver
cannot answer the closing roster read, `subscribe` still returns `{ ok: true }`
— the join committed, on the roster and on every instance, so reporting a
failure would be a lie — but `here.members` is then cut from **only this
instance's own members**, by the same rule, and a `WARN` is emitted naming the
channel.

**Entries are per member on every path**
([#343](https://github.com/locknessland/lockness-monorepo/issues/343)). A member
with two tabs on one instance takes one slot and counts once in `total`, whether
the snapshot is authoritative, the local fallback, or a driver with no roster
capability — ids compare as `String(id)`, so `1` and `'1'` are one member. Its
`info` is the **earliest-joined connection still subscribed** on that instance,
which is the same entry that instance holds the slot with; when that connection
leaves, the next one takes over on both views. A member on several instances
shows one holder's `info` — any of them, and on Redis with three or more holders
which one takes over is random. Announcements are per member too: a second tab
sends no `joined`, and closing one of two tabs sends no `left` (#344).

**One id per identity is what makes this true.** Two identities your authorizer
maps to the same `id` are one member: the roster shows one entry for both, the
second one's arrival is never announced, and neither is a departure while the
other is still connected
([#346](https://github.com/locknessland/lockness-monorepo/issues/346)).

**`here.source` says which you got**: `'authoritative'` for every instance's
roster, `'local'` for this instance's members alone. A driver with no roster
capability is single-process, so its local view _is_ the authority and reports
`'authoritative'`.

```ts
const { here } = await manager.subscribe(conn, 'presence-lobby')
if (here) {
    conn.send(encodeServerMessage({
        type: 'subscribed',
        channel: 'presence-lobby',
        members: here.members,
        total: here.total,
    }))
    const hidden = here.total - here.members.length // "and 240 others"
    if (here.source === 'local') {
        // A partial view: render it, but do not assert on its size. The
        // join/leave frames that follow are what bring it current.
    }
}
```

**The members in `here` are read-only; `here` and its array are yours**
([#354](https://github.com/locknessland/lockness-monorepo/issues/354)). Every
`PresenceMember` the framework hands out is deep-frozen where it was minted, and
the same object may be in another caller's snapshot at the same moment — that
sharing is what keeps a roster read's cost per read rather than per caller
(#333). A write to a member throws `TypeError`, and `id` / `info` are `readonly`
in the types. Sort, filter or push on `here.members` freely. To decorate a
member, copy it first:

```ts
const view = here.members.map((m) => ({
    ...m,
    info: { ...m.info, isYou: m.id === me },
}))
// or: structuredClone(m), which returns a writable deep copy
```

Do not use object identity to detect a change: on the memory driver, a
roster-less driver and the local fallback two snapshots can hold the same object
(`===`), while on Redis every read returns fresh ones. The members a custom
`encode` receives in a presence frame are frozen too.

A leave — `unsubscribe`, `disconnect`, or a socket close — releases this
instance's hold on the member's slot once its last local connection for that
member is gone. If that empties the slot, one `left` fans to every instance; if
another instance still holds it, nothing is sent.

Fan-out itself stays pure pub/sub: the roster is consulted on
subscribe/unsubscribe/evict only, never on the per-event delivery path.

**Ghost sweep.** Each instance records the slots it holds in an instance-scoped
_owned set_, and refreshes an instance-liveness key on a heartbeat. If an
instance crashes without cleanup, a surviving instance's periodic reconcile pass
releases every hold that dead instance's owned set names — one release `EVAL`
per entry, exactly the release a leave runs, on the dead instance's behalf — so
a crash leaves no permanent ghosts and never removes a member a live instance
still holds.

**The owned set is read in pages**
([#358](https://github.com/locknessland/lockness-monorepo/issues/358), ADR 008):
`SSCAN … COUNT 100`, each page released before the next is read, one full scan
per instance per pass. No reply grows with the number of holds the dead instance
had, so an instance that crashed holding tens of thousands of slots is swept in
one pass without a reply over the command client's cap — and without costing the
surviving instance its connection. A hold the dead instance's owned set gains
behind the scan's position is left for the next pass, and the instance stays
registered until then.

**One pass at a time, and only while the target is dead**
([#355](https://github.com/locknessland/lockness-monorepo/issues/355), ADR 006).
An instance never has two reconcile passes in flight: the next one is scheduled
`reconcileIntervalMs` after the current one **ends**, so a slow broker delays
the sweep rather than piling passes onto it. Every sweep write re-checks, inside
the write itself, that the instance it sweeps is still dead: if its liveness key
came back — it had only lapsed, not crashed — the release is refused and the
sweep of that instance stops, keeping every hold not yet released. An instance
is deregistered only while it is dead **and** holds nothing, so a hold it takes
mid-sweep stays reachable by the next pass.

The sweep logs at most **one WARN per swept instance**:

| Line                                                                                                                        | Means                                                                                                                                                                                                                                                                                                                                                                                                                  |
| :-------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `released N hold(s) of dead instance <id> (E emptied their slot)`                                                           | N holds were actually removed; E of them emptied their slot and were announced `left` (the rest are still held by a live instance). None at N = 0. The line ends `— unfinished: it stays registered and a later pass resumes it` when work is left behind: `close()` cut the sweep short, or its owned set still held an entry after the full scan (a hold that landed behind the scan, or one the sweep cannot parse) |
| `instance <id> renewed its liveness while being swept — a lapse, not a crash; N hold(s) released (E emptied) before it did` | The instance is alive again: its sweep stopped, it stays registered, and what was released before the renewal stays released                                                                                                                                                                                                                                                                                           |
| `sweep of dead instance <id> failed after N hold(s) released (E emptied): <error>`                                          | That instance could not be swept (a page of its owned set could not be read, the broker failed): it stays registered and is retried next pass, and the other dead instances are still swept in the same pass                                                                                                                                                                                                           |

A sweep that removed nothing — every entry already released by another sweeper —
logs nothing.

**What the room receives after a crash**
([#348](https://github.com/locknessland/lockness-monorepo/issues/348)). When a
sweep's release empties a slot — the dead instance was that member's last holder
— the sweeping instance announces the member as `left`, exactly as a leave
would: its own subscribers get a `left` frame carrying the dead instance's last
stored entry, and every other instance gets it through a `presence-leave`
control frame. A member another live instance still holds is not announced. Two
instances sweeping the same dead one produce **one** `left`: the release hands
the departed entry to whichever sweep runs it first.

- **Latency.** The `left` arrives up to the liveness TTL plus the reconcile
  interval **plus one pass** after the crash — about 25 s with the defaults
  below, on a healthy broker. Tighten both options to shorten it; the heartbeat
  must stay well inside the TTL.
- **Shutting down mid-sweep.** `close()` waits for a pass in flight: the pass
  stops at its next write, and a release already sent still has its departure
  announced. The wait is bounded by the command client — up to two broker round
  trips plus one departure-handler call, about a minute at `fromConfig`'s 30 s
  command timeout.
- **A large crash is a burst.** Each such member costs the sweeping instance one
  release `EVAL` and one `PUBLISH` on its shared command connection, so its
  other commands queue behind them. Past a peer's per-origin share of the replay
  window (10 000 nonces in all), that peer WARNs and evicts that origin's oldest
  nonces; a replayed one would be a duplicate `left`.
- **What it does not cover.** If the sweeping instance crashes, or its publish
  fails, after the release, nobody announces — clients heal on resubscribe. A
  `0.3.0` sweeper announces nothing, and a crashed `0.3.0` instance wrote no
  holders entry to announce from: during a mixed-version deploy expect at most
  one `left`, not exactly one. A `0.3.0` sweeper also has no liveness check: it
  keeps releasing an instance that renewed, and deregisters it regardless. And a
  `0.3.0` sweeper still reads a dead instance's whole owned set in one reply:
  past the reply cap it fails that sweep every pass and costs its own command
  client the connection.
- **The bytes are the broker's.** The announced entry is read back from Redis.
  An entry whose member id is not the slot it was stored under, or whose channel
  is not a valid name, is dropped with one WARN naming the channel only.

**Know what it reaches.** The sweep enumerates the owned set and nothing else,
and it only ever runs against an instance whose liveness key has expired — a
live instance never reclaims its own holds. Consequences worth holding on to:

- A hold that is in **no** owned set is invisible to the sweep, by every
  instance, forever. A hold is therefore one atomic operation that writes the
  roster field, the slot's holders entry and the owned-set entry together, and
  registers the instance in the same step, so no hold exists on an instance the
  sweep cannot find.
- A release — a leave or a sweep — drops only the releaser's own hold. It
  deletes the roster field only when no holder is left, so a stale owned entry
  can no longer delete a member somebody else holds.
- The sweep never deletes the owned set wholesale: each release removes its own
  entry, so a hold landing mid-sweep stays sweepable.
- An owned entry the sweep cannot parse keeps its dead instance registered —
  re-read every pass, never removed.
- The sweep is a **crash** recovery mechanism. An instance whose heartbeat
  lapsed while it stayed up — a stalled event loop, a long GC pause, a partition
  to Redis — loses the holds a peer's sweep released **before it renewed** (the
  sweep stops there), and the room hears those members `left`. **The lapsed
  instance repairs itself**
  ([#349](https://github.com/locknessland/lockness-monorepo/issues/349),
  [ADR 007](adr/007-realtime-lapsed-instance-reasserts.md)): its heartbeat's
  liveness write is `SET … EX … GET`, whose nil reply says the key had lapsed,
  and once it has held anything that reply — or any successful beat after a
  failed one — makes it re-check durable revocations, then write every local
  slot again, one at a time. A swept member comes back with one `joined`; a
  member nobody swept, or one another instance still holds, costs no frame. A
  member revoked during the lapse stays out. The member's own tabs hear neither
  the `left` nor the `joined` (no connection hears presence about its own member
  id).
  - **Latency.** One heartbeat interval after the instance can reach the broker
    again, plus one revocation re-check, plus the re-assert's own writes.
  - **Cost.** K hold `EVAL`s, where K is the number of distinct (channel,
    member) slots the instance holds, plus one `PUBLISH` per member that comes
    back. Once it holds anything, **every failed beat costs one full re-assert**
    on the next successful one, with no frame — a broker backoff that fails
    beats costs each surviving instance its K holds per recovery (an owned-set
    read past the reply cap was one such backoff, on every pass, until
    [#358](https://github.com/locknessland/lockness-monorepo/issues/358) paged
    it). The upgrade path, if that ever shows: suspect a lapse only when the
    next successful reply arrives at least one TTL after the last successful
    beat was issued.
  - **A foreign value at the alive key no longer heals.** A non-string written
    there by another client makes `SET … GET` answer `WRONGTYPE` without
    overwriting it, so every beat fails until the key is removed; deleting the
    alive key forces a re-assert.
  - **Shutting down.** `close()` stops a re-assert before its next slot and
    waits for the slot in flight: at most one slot write plus what is queued
    ahead of it, or the revocation re-check in flight — 30 s per command at
    `fromConfig`'s timeout.
  - An instance that **stays** stalled stays missing: from the fleet's side, it
    is down.

Tune the sweep with the `presence` option:

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

<a id="heartbeat-timing"></a>

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

**The interval also has a ceiling: 2 147 483 647 ms**, about 24.8 days, the
longest delay one timer can hold
([#381](https://github.com/locknessland/lockness-monorepo/issues/381)). The
relation above bounds the interval only by the TTL, and `livenessTtlSeconds` has
no upper bound, so a large TTL used to admit a longer interval. A longer delay
does not wait longer: Deno fires it after 1 ms, and the heartbeat then renewed
the liveness key every millisecond against the broker. The constructor
**refuses** an interval above the ceiling, naming the interval, the TTL and the
ceiling; lower the interval.

<a id="revocation-timing"></a>

**`reconcileIntervalMs` and `revocationTtlSeconds` are bound the same way**
([#362](https://github.com/locknessland/lockness-monorepo/issues/362)). The
interval also paces the revocation re-check, and a durable revocation record
lives `revocationTtlSeconds`. The constructor refuses:

- **a timing out of range**: the interval must be a finite number of at least 1
  ms (a fractional one is fine), and the TTL a whole number of seconds from 1 to
  2 147 483, the largest a single timer can wait. An unset environment variable
  read through `Number(...)` is `NaN`, and before #362 that ran the revocation
  pass and the ghost sweep back to back against the broker;
- **`reconcileIntervalMs * 2 > revocationTtlSeconds * 1000`**: at any wider
  interval, one failed pass lets a revocation whose control frame was lost
  expire before the next pass applies it.

The fix, for either refusal, is to **lower the interval or raise the TTL**. The
defaults (`10000` ms against `300` s) pass both. This paragraph is the one
statement of both relations; other sections link here.

**A record lives at least `revocationTtlSeconds`, and up to the fleet's longest
live TTL**
([#380](https://github.com/locknessland/lockness-monorepo/issues/380)). Each
Redis instance keeps an entry for its own TTL in a small broker key,
`<prefix>__revocation-floor`: it writes the entry once at startup, when its
revocation re-check is first registered (the announce, retried until it lands),
and refreshes it on every revocation pass. A durable revocation record is then
kept for the longest TTL among the instances that have announced or run a pass
within their own TTL — so one instance configured with a shorter TTL can no
longer shorten the records a longer-interval peer still needs, and lowering one
instance's TTL no longer shortens records while a longer-TTL peer is running.
When that key cannot be read, a record is kept for the maximum TTL (2 147 483 s)
instead, with one WARN. The design, and what it does not cover, are in
[ADR 013](adr/013-realtime-revocation-ttl-floor.md). This paragraph is the one
operator statement of it; other sections link here.

<a id="what-the-roster-asks-of-redis"></a>

**What the roster asks of Redis:**

- **Roster keys carry no TTL, so Redis must not evict them.** Run the realtime
  Redis with `maxmemory-policy noeviction`, or a `volatile-*` policy, which only
  evicts keys that have a TTL. An `allkeys-*` policy can evict a slot's holders
  hash on its own, and a release then sees no holder and deletes a member
  another instance still holds.
- **Memory is `1 + k` stored entries per member held on k instances**: the
  roster field plus one holders entry per holding instance, each carrying that
  instance's member JSON (bounded by `maxPresenceMemberBytes`). The owned sets
  add their one short entry per holding instance, as before.
- **Each hold and each release is one `EVAL`** (over four keys and three keys),
  so the commands per subscribe and unsubscribe are unchanged. Those keys hash
  to different slots: Redis Cluster is not supported.

### Writing a presence driver

**Only if you wrote your own `BroadcastDriver`.** The bundled Redis and memory
drivers already implement this, and the rules below are what a third one must
keep ([#341](https://github.com/locknessland/lockness-monorepo/issues/341),
[#345](https://github.com/locknessland/lockness-monorepo/issues/345)).

A driver owns a cross-instance roster when it implements **all three** of
`holdMember(channel, member)`, `releaseMember(channel, memberId)` and
`readRoster(channel, limit, selfIds)` — `PresenceCapableDriver`. With fewer, the
manager treats it as single-process and answers from its local view. A driver
that still has any pre-`0.4.0` roster method — the whole-room read or the
add/remove pair — is **refused at construction**, once, naming every one it
found. See
[The driver roster seam is replaced, and the old names throw](#7-the-driver-roster-seam-is-replaced-and-the-old-names-throw).

**A slot is held per process.** Several processes may hold one member's slot at
once, each with its own entry, and the slot stays in the roster while any holder
remains:

| Method                             | Means                                                      | Returns                                                                                                |
| :--------------------------------- | :--------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| `holdMember(channel, member)`      | This process holds `String(member.id)` with this entry.    | `RosterHold { arrived }` — `true` only if **no process** held the slot before. Holding again: `false`. |
| `releaseMember(channel, memberId)` | This process drops its hold; other holders stay untouched. | `RosterRelease { gone }` — `true` only if **this process held it** and no holder is left.              |

Either may return the value or a `Promise` of it. **Neither bit may be faked.**
The manager announces `joined` from `arrived` and `left` from `gone`, so a
driver that reports `arrived` for a slot another holder fills sends a duplicate
`joined` to the room, and one that reports `gone` while a holder remains removes
a present member from every client's list. A release by a process that held
nothing is `gone: false`, even when it leaves the slot empty. On a shared store
both bits must be decided atomically with the write — a count read in a second
command races another process's hold.

`readRoster` returns a `RosterWindow`, read **at one instant**:

| Field     | The contract                                                                                                                                              |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `members` | `min(limit, total)` members, one per `String(id)`, in the driver's order. An unreadable stored entry may be skipped, with a WARN.                         |
| `total`   | The roster's population at the same instant — counted **inside** the read, never as `members.length` and never by a second command.                       |
| `selves`  | The `PresenceMember`s among `selfIds` the roster holds, accepted only when the entry under that id's own slot carries that **same id**. No stored extras. |

**The cost contract is what the method is for.** A driver should transfer and
parse O(`limit` + `selfIds.length`) entries per call, whatever the room's size.
The types cannot enforce it: a driver that reads the whole room and slices it
compiles, passes every functional test, and makes every presence subscribe cost
the room again. Do not add an unbounded fallback for a "small room" either — a
room that is small today is the one a client grows.

**Refuse bad input before any work.** Throw unless `limit` is a positive integer
and `selfIds.length ≤ MAX_ROSTER_READ_SELF_IDS` (1 000, exported). The seam is
public, and on Redis a negative `HRANDFIELD` count returns entries **with
repeats**. `selfIds` may be empty — a read that serves no member is valid, and a
Redis `HMGET` with no field is an arity error, so pad it.

**Reporting a departure you caused for someone else — optional.** A driver that
can empty a slot on **another process's** behalf (the Redis ghost sweep releases
a crashed instance's holds) implements `onRosterDeparture(handler)`. The manager
registers the handler at construction, and only when the driver owns a roster.
Call it with a `RosterDeparture` (`{ channel, member }`, exported) for each slot
such a release emptied, and the manager announces the member as `left` — locally
and over the control plane, through the same path as a leave. The contract:

- **Never for `releaseMember`.** Its caller announces `gone` itself; a report
  there is a second `left`.
- **One handler.** Registering again replaces it; `close()` drops it.
- **Only well-formed departures are announced.** A channel that is not a valid
  name, or a member every peer would refuse at ingest (an id that is not a
  string or finite number, a non-object `info`, more than `id` and `info`), is
  dropped by the manager with one WARN.
- **Order.** Do no I/O between learning the slot emptied and calling the
  handler, and await the handler: a hold of the same slot committed right behind
  your release must be announced after this `left`, not before.

A driver without the method keeps a silent sweep; nothing else changes.

**Reporting that your own holds may be gone — optional.** A driver whose holds a
peer can release while this process is still alive (the Redis driver's liveness
key lapses, and a peer's sweep takes it for a crash) implements
`onRosterLapse(handler)`
([#349](https://github.com/locknessland/lockness-monorepo/issues/349)). The
manager registers it at construction, only when the driver owns a roster, and
its handler re-checks durable revocations, then writes every local slot again
through its normal write path — announcing only what `holdMember` reports
`arrived`. The contract:

- **Call it only after this process has issued a hold**, when you find its holds
  may have been released on its behalf. Never await it from the path that
  detected the lapse: K slot writes queued there would cause the next one.
- **At most one run in flight.** Lapses reported during a run coalesce into
  exactly one trailing run. A run that throws or rejects is logged once, and the
  next detection retries it — there is no timer.
- **The handler takes an `AbortSignal`.** Abort it when you shut down, then wait
  for the run in flight before you close your connections; the manager stops
  between two slots.

A driver without the method keeps today's behaviour: a swept process's members
stay missing until their next write.

**Retrying a roster write you could not commit — optional.** A driver whose
`releaseMember` (a presence leave's own release, or the #323/#373 join
compensation's reclaim) can reject implements `onRosterMaintenance(handler)`
([#371](https://github.com/locknessland/lockness-monorepo/issues/371)). The
manager registers it at construction, only when the driver owns a roster, and
its handler drains a small internal ledger of slots whose last release attempt
failed — re-issuing each through the manager's normal write path, which
re-derives what to write from its local state at drain time (never from anything
the ledger itself remembers). The contract:

- **Fire it unconditionally, after a tick that proves your connection healthy**
  — never gated on a detected fault, and never merely reusing
  `onRevocationReconcile`'s pass: an owed release has nothing to do with
  revocations, and folding it into that pass's own deadline-measured duration
  would corrupt an unrelated enforcement bound. Never awaited from the path that
  fired it, on `onRosterLapse`'s own reasoning.
- **At most one run in flight.** Ticks reported during a run coalesce into
  exactly one trailing run. A run that throws or rejects is logged once; the
  next tick tries again — there is no timer.
- **The handler takes no argument.** Unlike `onRosterLapse`'s signal, there is
  nothing to abort mid-run: `close()` simply refuses a new run and waits for one
  already in flight before it closes your connections.

A driver without the method keeps a release failure's only backstop the ghost
sweep — exactly today's behaviour, unchanged.

**Every optional hook shares one lifecycle.** `onControlRefused`,
`onRevocationReconcile`, `onRosterDeparture`, `onRosterLapse` and
`onRosterMaintenance` have **one owner per driver**: registering again replaces
the handler, and the driver's own shutdown drops it — a shut-down driver calls
nothing. `onControl` is the exception: its lifetime is its subscription. The
Redis driver's `close()` therefore drops the refusal handler too, since #349.
The Redis driver's `onPassComplete` ([measuring the passes](#measuring-passes))
shares the same lifecycle; it is Redis-only, not a `BroadcastDriver` member,
because the memory driver runs no background pass.

**Members are read-only on both sides of the seam**
([#354](https://github.com/locknessland/lockness-monorepo/issues/354)). The
member `holdMember` receives is deep-frozen: to store extra fields beside it,
build a new object — a write to it throws. What `readRoster` returns is handed
to the application, and to every caller sharing one read, **without being
copied**, so return members that nothing mutates afterwards. The bundled drivers
return deep-frozen ones. The manager does not freeze a driver's output: a driver
that decodes its own members instead of storing the object `holdMember` gave it
should freeze what it returns, or its callers can write into each other's
snapshots — and into its own state, if it returns objects it keeps.

The manager decides everything else: K, the self rule, and how concurrent reads
share. The Redis driver's read is one `EVAL` of `HLEN`,
`HRANDFIELD … WITHVALUES` and `HMGET`, which needs no Redis version beyond the
[7.0 the driver already requires](#redis-minimum-version).

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
self-expires after at least `revocationTtlSeconds` (default `300`; see
[the revocation timing](#revocation-timing) for how long exactly) so the
revocation set never grows without bound.

The methods behind it are `markRevocation(revocation)`, `listRevocations()` and
`clearRevocation(revocation)` — optional members of the `BroadcastDriver` port,
alongside `onRevocationReconcile(handler)` which says _when_ the re-check runs.
They are detected **as a set**: a driver either has all three or has none, and
one with two of them is treated as having none. A driver that omits them falls
back to fire-and-forget revocation, with no recovery from a lost frame.

**A custom driver and `owns`.** The re-check calls
`listRevocations((target) => …)`: the argument says which targets this instance
owns, so a store can drop every other instance's records while it enumerates
rather than hand them all back. Apply it if you can — the manager filters again,
so ignoring it is correct, only unbounded in your own store. It is called
synchronously, and a throw from it fails the call. What an implementation must
return is stated once, in the `listRevocations` JSDoc of
[`packages/realtime/driver.ts`](../packages/realtime/driver.ts). The zero-
argument call still returns every record, so an existing driver needs no change.

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
would otherwise learn nothing: it is removed from the channel's subscriber set
before any `left` fans out, and on a presence channel a `left` goes out at all
only when that connection was the member's last hold in the fleet. A
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

`unsubscribe` takes a **connection id**, and `disconnect` takes the **connection
object** you registered or an id, which makes them look like they reach across
the fleet. They do not: they act only on sockets _this_ instance owns. They now
say so rather than resolving silently.

```ts
await manager.unsubscribe(clientId, channel)
// 'left'           — a membership was removed here
// 'not-subscribed' — this instance owns the socket; it was not in that channel
// 'not-owned'      — the socket lives on another instance. Nothing was removed
//                    and nothing was announced; use revokeChannel

await manager.disconnect(conn) // 'disconnected' | 'not-owned'
// 'not-owned' from the object form also means: this object does not own its
//              id here — a socket `register` refused, or one torn down and
//              replaced under the same id. Nothing was retired or removed.
await manager.disconnect(clientId) // the id form, for server code such as evict
```

Pass the object from a socket's close hook. The id form acts on whoever holds
the id when it runs, which is what server-side revocation needs and what a
socket's own close must not do (item 21).

> **These are server-side values.** Do not relay them to a client, and do not
> take `clientId` from a client frame — pass `connection.id` from a socket you
> own. The three states together would otherwise tell whoever receives them
> whether an arbitrary connection id is live somewhere in the fleet, whether
> this instance owns it, and whether it is in a given room.

The Redis driver stores it as a **single sorted set** at `{prefix}:revocations`,
whose score is the second the revocation expires. A re-check is **one reap, then
pages** ([#359](https://github.com/locknessland/lockness-monorepo/issues/359),
[ADR 009](adr/009-realtime-revocation-recheck-reads-index-in-pages.md)):

- **The reap** is one server-side script. It reads Redis's own `TIME`, removes
  every record at or below that second, and answers that second, `now`. It is
  the only thing that ever deletes from the index, so a revocation that is live
  cannot be removed by a concurrent pass.
- **The read** walks the index with `ZSCAN … COUNT REVOCATION_SCAN_COUNT` pages,
  from cursor `0` back to cursor `0`, and deletes nothing. A record is live when
  its score is above the reap's `now` — the same `now` for every page, never
  re-read, and no instance's wall clock takes part in the decision. No reply
  grows with the index: an instance holds one page of other instances' records
  at a time.
- **Nothing is applied until the last page is read.** Two records of one pair
  that land on different pages still give one leave.

<a id="redis-minimum-version"></a>

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
> in a published version, so the re-check no longer spends one command per
> legacy member: since #359 it is one reap plus pages — never one command per
> member. If a real Redis still holds `{prefix}:revoked` or any
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

**One pass at a time** (#359). A driver runs one revocation pass at a time,
whichever trigger asked. The periodic timer is armed from the **end** of the
pass that consumed it, so a slow pass delays the next one rather than running
beside it. A reconnect — or its retry — that arrives while a pass is running is
not dropped: however many arrive, **one** trailing pass follows the running one.
The manager also runs one re-check at a time, whoever calls it — the driver's
pass or the re-check a lapsed instance runs before it re-asserts its slots — so
a pair one re-check left is never kicked again by another's older view.

**What happens when a re-check FAILS is not the same for both.** The WARN names
which trigger it was, because the two want different responses:

| Trigger   | On failure                                                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reconnect | Retried once, an order of magnitude inside `reconcileIntervalMs`. The reconnect fires once per outage, so without that retry a failed pass is retried by nothing and enforcement silently falls back to the periodic timer |
| Periodic  | Not retried. Its next pass is already scheduled, so retrying would double its rate for as long as the broker is unhealthy — a load spike at exactly the wrong moment                                                       |

The retry does not retry itself: a broker that keeps refusing costs one extra
round-trip per outage, not a loop.

A failed pass is one that did not read the whole index: a page read or the reap
refused, a reply that is not the shape expected, or a driver whose `close()` has
begun. It applies **nothing** — not even the matches of pages already read — and
never reads as "nobody is revoked". One more line can appear on a pass that
**succeeded**:

| Line                                                                                        | What it means                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `the revocation index returned pairs that are not revocations … Pairs skipped this pass: N` | The index held N entries whose score is not whole epoch seconds, and they were skipped; every other record was applied. Logged once per pass while they remain. If N covers every record, the broker formats scores differently from Redis and **no revocation is being enforced** |

**The re-check runs concurrently with delivery, and that is the shipped
contract.** The subscribe socket's read loop is started before the reconnect
handler is invoked, so a message can be delivered while the re-check is still in
flight — a window of one revocation pass on the Redis command connection, after
each socket fault. A connection revoked during that window can receive
broadcasts until the re-check lands.

This is a deliberate trade, not an oversight. Firing the handler before delivery
resumes would let an application-supplied handler gate **all** delivery for as
long as it runs, turning a bounded authorization window into an unbounded
availability one. The periodic pass bounds the exposure either way, which is why
`reconcileIntervalMs` is an enforcement bound and should not be lengthened. The
bound also counts the time a pass takes, which grows with the index; its exact
form, and when it holds, is stated once in the `onRevocationReconcile` JSDoc of
[`packages/realtime/drivers/redis.ts`](../packages/realtime/drivers/redis.ts).
Since #362 the bound is checked at boot (see
[the revocation timing](#revocation-timing)) and watched at runtime: one WARN
per episode — `STALLED`, `MISSED` or `SKEWED` — when no pass completes without
failures within `revocationTtlSeconds` of the last clean pass's start. A **clean
pass** is one whose re-check reported no failed apply and no malformed tally
(#384); every other pass that ends leaves the deadline armed, and tells it so
(`passEnded`), so an expiry after it is `MISSED` — see
[item 23](#23-only-a-clean-revocation-pass-re-arms-the-deadline). Across the
fleet, the longest live `revocationTtlSeconds` is **enforced**, not assumed: a
peer configured with a shorter one no longer writes records that expire before
this instance's pass (see [the revocation timing](#revocation-timing), and ADR
[013](adr/013-realtime-revocation-ttl-floor.md)). That holds once every writer
runs this release; an older writer's records still live for its own TTL. An
injected command port must settle every command, as the `RedisCommandClient`
JSDoc in the same file states; one that never settles stalls the re-check, which
is then reported, not recovered.

<a id="measuring-passes"></a>**Measuring the passes** (#360). Register
`driver.onPassComplete(handler)` on the Redis driver and it hands you one frozen
`PassSample` per completed ghost sweep and revocation pass: which pass, what
triggered it, how it ended, how long it took, how many pages it read, and —
since #384 — how many units it attempted and how many failed (`attempts`,
`failures`; a revocation sample carries them when its re-check reported a
`RevocationTally`). An `ok` pass can still carry failures. What each field means
is stated once, in the `PassSample` JSDoc of
[`packages/realtime/drivers/redis.ts`](../packages/realtime/drivers/redis.ts);
the instrument names and the recipe that forwards samples to OpenTelemetry live
in [Framework instruments](observability-and-crypto.md#framework-instruments).
`durationMs` is the whole pass, apply and tail wait included, so it is not
comparable to the round-trip-only term of the bound above. A pass that stalls
records nothing — the sample is taken at its end, and for the revocation pass
the enforcement deadline is what reports a stall. Samples are not buffered: a
pass that ends with no handler registered reports to no one. The driver records
and never judges; alerting on the ADR 008 and ADR 009 revisit triggers is the
backend's job ([ADR 012](adr/012-measurements-reach-the-app-through-a-seam.md)).

**A mixed `0.3.0` / `0.4.0` fleet.** A `0.3.0` instance still reads the whole
index in one reply, on its own command client, until it is upgraded — so a large
index can still refuse that instance's client while the upgraded ones page
through it.

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

Twenty-six items. Eighteen are breaking changes — the driver revocation seam,
the presence snapshot a subscribe returns, the driver roster seam, presence
frames announced per member rather than per connection, an authorizer result
outside its contract now throwing, a presence member id that is not a string or
a finite number now throwing, a presence member that is not exactly
`{ id, info }` now throwing, presence members now read-only, an object result on
a private channel now checked as a presence member, no connection receiving
`joined` or `left` for its own member id, a presence member over its byte bound
now throwing, a disconnected connection now refused at admission, a Redis
revocation timing the driver cannot enforce now refused at boot, `subscribe` now
requiring `register`, an id held by a live connection now refused, a refused
socket no longer getting your `onClose`, a revocation re-check handler type a
driver's narrowly typed slot no longer holds, and a Redis heartbeat interval no
timer can hold now refused at boot — plus two widened return types, one new
control kind, one additive wire field and one additive getter. Item 16 changes
no behaviour: it corrects earlier guidance. Items 19, 24 and 26 are observable,
not breaking: a malformed sweep reply now logs a WARN, a revocation record now
lives up to the fleet's longest live TTL, and a failed unwatch now reconnects
the Redis subscribe socket. Item 23 also changes what the deadline reports: a
revocation pass with a failed apply no longer re-arms it. The release also adds
`onPassComplete` and its `PassSample` — additive, no item of its own — which
reports the duration and page count of every ghost sweep and revocation pass;
see [Measuring the passes](#measuring-passes). **No migration step, and two new
Redis keys.** Before you deploy, read items 1, 3, 5, 6, 8, 9, 10, 11, 12, 13,
14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25 and 26 — and items 2 and 7 if you
wrote your own driver.

### 1. Upgrade every instance before you rely on `revokeChannel`

An instance running `0.3.0` **drops** the new `revoke-channel` control frame.
The frame carries a `revocationId` field that the `0.3.0` MAC does not cover, so
that instance computes a different MAC and discards the frame with a WARN before
acting on anything. It never acted on that kind, so it loses nothing it had, and
the rolling deploy stays inert rather than wrong. The consequence is that a
revoke aimed at a socket a `0.3.0` instance owns **does not land**, and the
durable record does not rescue it: a record is only ever applied by the instance
that owns the socket, and that instance is precisely the one that cannot read
it.

This is bounded by the deploy. When the old instance drains, its sockets close
and the reconnecting client is re-admitted through your `authorize` on an
upgraded instance.

> **If you need certainty mid-deploy, use `evict`.** Every version obeys it.

### 2. The driver revocation seam is replaced, and the old one throws

| Before (`0.3.0`)  | After (`0.4.0`)                                          |
| ----------------- | -------------------------------------------------------- |
| `markRevoked(id)` | `markRevocation(r: Revocation)`                          |
| `listRevoked()`   | `listRevocations(): Revocation[]`                        |
| —                 | `clearRevocation(r: ChannelRevocation)` — exactly one id |

`Revocation` is `ConnectionRevocation | ChannelRevocation`: `{ target }` for a
whole connection, `{ target, channel, id }` for one channel. The manager mints
`id` (`crypto.randomUUID()`) once per `revokeChannel` call, so **two revocations
of the same pair are two records**. Store the id and return it unchanged.
`clearRevocation` must remove **only** the record with that id. A record for the
same pair with another id was written after the one being cleared, and if its
control frame was lost, nothing else will enforce it
([#337](https://github.com/locknessland/lockness-monorepo/issues/337)). Only a
channel revocation is ever cleared, and the type says so.

The same id rides the `revoke-channel` control frame as `revocationId`. Drivers
pass `revocationId` through unchanged and include it in any MAC they compute
over the frame. A frame that arrives without it is ignored with a WARN naming
the channel, logged only by the instance that owns the revoked connection — the
others had nothing to enforce, so look for it on that node. The revocation then
waits for the reconcile tick, and a driver that does not implement
`onRevocationReconcile` never enforces it while the socket stays open
([#340](https://github.com/locknessland/lockness-monorepo/issues/340)).

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
                                     clearRevocation(r: ChannelRevocation) {
                                         // encode() includes r.id: one record
                                         this.index.delete(this.encode(r))
                                     }
```

**Three driver states, and they fail differently on purpose:**

| The driver has                                 | `evict`                                          | `revokeChannel`                               |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| the new trio                                   | durable                                          | durable                                       |
| the old pair                                   | **throws at construction**, naming the migration | —                                             |
| neither, **and** a control plane               | fire-and-forget                                  | **throws `RevocationScopeError`** at the call |
| neither, and no control plane (single-process) | local                                            | local; no durability is owed                  |

Row three is the one most easily missed: it is not a construction failure and
not a silent degradation. A driver that never implemented revocation keeps
working for `evict` exactly as before, and only the new verb refuses — because
only the new verb has something to lose.

A driver still presenting the old pair **throws at construction**, naming the
migration. That is deliberate rather than strict: the alternative is being
narrowed to "no revocation store", which loses `evict`'s durability silently on
a driver that plainly implements revocation — nothing logged, every same-version
test green.

**Your `listRevocations` must fail closed.** Drop any record you cannot fully
decode; never return one with a missing `channel` or `id`. A channel-scoped
record that comes back without its channel is applied as a **whole-connection**
revocation and hard-closes a socket that should only have left one room. The
revocation index is the one cross-instance channel with no authenticity tag, so
what your decoder refuses is the boundary.

> **Third-party realtime drivers are not a supported extension point before
> `1.0`.** At `0.x` the bundled drivers are the contract, and a seam like this
> one changes without a deprecation window. If you maintain a driver, track
> `main`. A seam change **between published releases** gives you a
> construction-time error naming it, never a silent behaviour loss. A change
> made inside one unreleased window does not: #337 narrowed `clearRevocation`
> and added `id` to the `#332` methods before either was published, and a driver
> written against those unreleased signatures is caught by the type checker
> only.

### 3. No migration step; one new key family

**Nothing to run before or after the deploy, and nothing to backfill.** One key
family is new: `<prefix>__holders:<channel> <memberId>`, one hash per presence
slot recording which instances hold it (see
[The authoritative presence roster](#the-authoritative-presence-roster)). It
fills as members join and empties as they leave.

**Check your Redis eviction policy first.** Roster keys carry no TTL, so the
realtime Redis must run `noeviction` or a `volatile-*` policy — see
[What the roster asks of Redis](#what-the-roster-asks-of-redis), which also
sizes the new family at `1 + k` stored entries per member held on k instances.

The revocation index is read-compatible in both directions, with no dual-write.
A whole-connection record is the bare connection id, byte-identical to `0.3.0`.
A channel-scoped record is the three-part member `"<target> <channel> <id>"`.
The delimiter is a **space**, which is outside the connection id charset, so a
`0.3.0` reader finds no such connection and skips it. That reader is inert
rather than wrong, and it does not delete the record either, so it survives for
the upgraded owner.

The bounded roster read (item 7) adds no key: it reads the same presence hash
with a new read-only script. The presence hash itself keeps its layout.

One more key, `<prefix>__revocation-floor`, carries its own TTL and needs no
step either — see
[item 24](#24-a-revocation-record-now-outlives-the-fleets-longest-live-ttl).

**A roster slot `0.3.0` wrote, with no holders hash, needs nothing either.** A
`0.4.0` release or sweep deletes it without announcing a `left`; a `0.4.0` hold
on it announces a `joined`. Until the last `0.3.0` instance is gone, a member on
two instances can still lose its slot to a `0.3.0` leave — the defect this
release fixes stays live for the length of the deploy.

#### Rolling back to `0.3.0`, then upgrading again

`0.3.0` neither reads nor writes the holders family, so a rollback leaves it
behind. **Before you upgrade again, delete it.** Otherwise a `0.4.0` instance
that crashed and was swept by a `0.3.0` peer leaves a holders entry no sweep can
reach, and that member stays in the roster for good — its old `info` in every
`here`, and every later `joined` / `left` for it suppressed.

Delete the family with `SCAN MATCH` and `UNLINK`, **never `KEYS`** (it blocks
the server for the whole keyspace) and **never a shell pipeline that splits on
whitespace** such as `redis-cli --scan | xargs redis-cli unlink`: a member id
may contain spaces, and a split key deletes the wrong thing or nothing. Handle
each key as one opaque value, as this script does:

```ts
import { RedisClient } from '@lockness/redis'

const prefix = '<prefix>' // the driver's `prefix` option
const client = new RedisClient({ hostname: '<host>', port: 6379 })
let cursor = '0'
do {
    const reply = await client.command(
        'SCAN',
        cursor,
        'MATCH',
        `${prefix}__holders:*`,
        'COUNT',
        '500',
    )
    if (reply.type !== 'array') throw new Error('unexpected SCAN reply')
    const [next, batch] = reply.value
    if (next?.type !== 'bulk' || batch?.type !== 'array') {
        throw new Error('unexpected SCAN reply')
    }
    cursor = next.value
    const keys = batch.value.flatMap((k) => k.type === 'bulk' ? [k.value] : [])
    // Each key is its own argument: nothing is split, joined or re-parsed.
    if (keys.length > 0) await client.command('UNLINK', ...keys)
} while (cursor !== '0')
await client.close()
```

Run it with every instance stopped or still on `0.3.0`, then deploy `0.4.0`. The
prefix is glob-safe — the driver refuses one containing a glob metacharacter —
so the pattern matches that family and nothing else.

A two-part `"<target> <channel>"` member was only ever written by unreleased
builds of `main`. `0.4.0` drops it on read and it expires on its score within
the revocation TTL.

> **Do not "tidy" that delimiter to a `:` or a `.`.** Both are inside the
> charset, and a composite would then collide with a real connection id — at
> which point a `0.3.0` instance applies a room revocation as a `4403` kill of
> the whole session. Every same-version test passes either way; only the
> mixed-fleet witness fails.

### 4. `unsubscribe` and `disconnect` return values

`Promise<void>` became `Promise<LeaveOutcome>` and `Promise<DisconnectOutcome>`,
and `revokeChannel` reports `RevokeChannelOutcome`. **Not a compile error** for
callers that ignore the value. It **is** one for a subclass that overrides
either method with `Promise<void>`, and for an `encode` hook annotated with the
old `OutboundFrame` union — which gained `{ type: 'unsubscribed' }`, because
that frame goes through your encoder like every other. See
[The local tier reports what it did](#the-local-tier-reports-what-it-did).

`'not-owned'` from `unsubscribe` or the id form of `disconnect` means _the
socket lives elsewhere — use `revokeChannel`_. From `disconnect(conn)`, the
object form added by item 21, it can also mean _this object does not own its id
here_; nothing was touched, and nothing needs revoking.

### 5. Expect a MAC WARN from `0.3.0` instances during the deploy

`revoke-channel` carries one field, `revocationId`, and the MAC covers it. It is
appended **last** to the canonical form and omitted when absent, so `evict` and
the presence frames keep the exact bytes of `0.3.0` and verify in both
directions. No shared-secret rotation and no coordinated restart are needed.

A `0.3.0` instance, however, logs
`dropped a control message with an absent/invalid MAC — never obeyed (FR-015)`
for every `revoke-channel` frame it receives until it is upgraded. **This is not
forgery.** If you alert on that line, expect it for the length of the deploy,
and only on instances still running `0.3.0`.

### 6. A presence subscribe returns a bounded `here`, and `members` is gone

`SubscribeResult.members` and `SubscribeResult.rosterSource` are **removed**,
not deprecated. Every place that read them is a **compile error**, and that is
the migration signal: `members` used to be the whole room, and code counting
`members.length` as "everyone present" would otherwise keep compiling while
silently reading a list of at most `MAX_PRESENCE_SNAPSHOT_MEMBERS` (100).

```ts
// 0.3.0
const { members, rosterSource } = await manager.subscribe(conn, channel)
render(members, { count: members?.length, partial: rosterSource === 'local' })

// 0.4.0
const { here } = await manager.subscribe(conn, channel)
render(here?.members, {
    count: here?.total,
    partial: here?.source === 'local',
})
```

On the wire nothing is renamed or removed: `members` keeps its place on the
`subscribed` and `here` frames, and an optional `total` is added beside it. A
client that ignores presence needs no change.

**Browser clients already deployed render K members as everyone** until they
read `total`. If that matters during the rollout, raise
`maxPresenceSnapshotMembers` to a **finite** interim value sized to your rooms,
knowing its cost: one reply is at most **K·(M+1)+1 bytes** of member JSON, where
M is `maxPresenceMemberBytes` (4 096 by default) — K = 1 000 is 4 097 001 bytes,
about 3.9 MiB, per subscribe. **Lower it again once your clients read `total`.**
Do not set it "above the largest room": that is the unbounded reply this change
removes, back under another name.

A fleet mixing `0.3.0` and `0.4.0` during the deploy answers from whichever
instance a client lands on: whole room from the old ones, bounded snapshot from
the new.

**On `source: 'local'` and on a driver with no roster capability, `members` and
`total` now count members, not connections**
([#343](https://github.com/locknessland/lockness-monorepo/issues/343)). In
`0.3.0` a member with two tabs on this instance appeared twice in `members`
(`total` is new in this release, and counts the same unit as `members` on every
path). The authoritative path already counted members and is unchanged.

### 7. The driver roster seam is replaced, and the old names throw

**Only if you wrote your own `BroadcastDriver`.** The bundled drivers are
migrated, and nothing in your application code changes for this item — what
applications see is item 8. The whole roster seam changes: the read is bounded
([#341](https://github.com/locknessland/lockness-monorepo/issues/341)), and the
write pair becomes hold / release with a return value
([#345](https://github.com/locknessland/lockness-monorepo/issues/345)). The
contract is in [Writing a presence driver](#writing-a-presence-driver).

| Before (`0.3.0`)                                                                   | After (`0.4.0`)                                                                                                             |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `listMembers(channel: string): PresenceMember[] \| Promise<PresenceMember[]>`      | `readRoster(channel: string, limit: number, selfIds: readonly (string \| number)[]): RosterWindow \| Promise<RosterWindow>` |
| —                                                                                  | `MAX_ROSTER_READ_SELF_IDS` (1 000), exported: the most `selfIds` taken                                                      |
| `addMember(channel: string, member: PresenceMember): void \| Promise<void>`        | `holdMember(channel: string, member: PresenceMember): RosterHold \| Promise<RosterHold>` — `{ arrived: boolean }`           |
| `removeMember(channel: string, memberId: string \| number): void \| Promise<void>` | `releaseMember(channel: string, memberId: string \| number): RosterRelease \| Promise<RosterRelease>` — `{ gone: boolean }` |

**The rename is not cosmetic: the meaning changed.** `addMember` wrote _the_
slot; `holdMember` records that _this process_ holds it, beside any other
process that also does. `removeMember` deleted the slot; `releaseMember` drops
only this process's hold, and the slot leaves the roster with its last holder.
`arrived` is `true` only if no process held the slot; `gone` only if this
process held it and none is left. The manager announces `joined` and `left` from
those two bits, so **a driver may not fake either** — a driver that keeps
last-writer-wins semantics under the new names sends duplicate `joined` frames
and removes present members. `RosterHold` and `RosterRelease` are exported.

**`new ChannelManager({ driver })` throws for a driver that still has any of
`listMembers`, `addMember` or `removeMember`** — whether or not it also has the
new methods. It throws **once**, naming every retired member it found and this
section by its title, so a `0.3.0` driver carrying all three is sent through one
migration, not three. Narrowing such a driver to "no roster" would silently turn
every presence room into this instance's local view; keeping `listMembers`
beside `readRoster` keeps the unbounded read public; and an old add method left
to run would fail later, inside a join's rollback, instead of at construction.

**A fleet mixing `0.3.0` and `0.4.0` Redis instances** keeps `0.3.0`'s slot
defect until the last `0.3.0` instance is gone: a `0.3.0` leave or sweep still
deletes a slot a `0.4.0` instance holds, and that member is missing from `here`
until its next hold or its last release. Releases and sweeps are idempotent, so
nothing else carries past the deploy — see item 3 for the one case that does, a
rollback followed by a re-upgrade.

**Redis version.** The bounded read's `HRANDFIELD`, and the one the release uses
to show another holder's entry, are covered by the
[Redis 7.0 minimum](#redis-minimum-version) the driver already requires.

### 8. Presence frames are per member, and a failed leave announcement no longer rejects

**What your application sees** from item 7's change — no code change is
required, but read this if a client or server builds anything from presence
frames ([#344](https://github.com/locknessland/lockness-monorepo/issues/344)).

- **`joined` and `left` are announced per member, not per connection.** A
  member's first connection anywhere in the fleet sends one `joined`; its last
  connection closing sends one `left`. A second tab — on this instance or
  another — sends nothing, and closing one of two tabs sends nothing. In `0.3.0`
  a second tab announced a join for a member already listed, and closing one of
  two tabs removed a member still present from every client's list until the
  next snapshot. See
  [What a `joined` frame promises](#what-a-joined-frame-promises--and-what-it-does-not).
- **If you counted tabs from frames, that signal is gone.** Code that tallied
  `joined` minus `left` per member to know how many connections it has will now
  read at most one. Nothing in the protocol reports a connection count; keep one
  on the server if you need it.
- **A `left` can arrive for a member no `joined` was sent for**, when a join's
  roster write committed but its reply was lost, or when an instance crashed
  after committing a hold it never announced. Treat an unknown `left` as a
  no-op, as you already should for members outside your snapshot.
- **A crash now sends `left`.** On Redis, when an instance dies, the members
  only it held are announced as `left` to every surviving instance's subscribers
  once a peer's ghost sweep releases them — up to the liveness TTL plus the
  reconcile interval later (~25 s by default). In `0.3.0` they stayed in every
  client's list until it resubscribed. See
  [The authoritative presence roster](#the-authoritative-presence-roster)
  ([#348](https://github.com/locknessland/lockness-monorepo/issues/348)).
- **`unsubscribe` no longer rejects when its `presence-leave` publish fails.**
  The membership was removed and the roster released, so it logs one WARN —
  naming the channel, never the member — and resolves `'left'`. A failed roster
  **release** still rejects, as before. `'left'` means "a membership was removed
  here", not "a frame was sent"; see item 4 for the outcomes. A failed
  `presence-join` publish was already a WARN, and still is.

**On Redis, a room larger than K shows a random sample** (from item 7's bounded
read). Each subscribe, re-joins included, returns a different K members of a
room larger than `maxPresenceSnapshotMembers`; `total` and the joiner's own
entry are unchanged, and a room that fits is returned whole. The memory driver
keeps join order. This is a deliberate trade, accepted on 2026-09-14: a stable
window would cost a scan inside the script, or an index key every existing room
would have to be backfilled into.

### 9. `authorize` must return `true`, `false` or a `PresenceMember`

**Before**, `subscribe` denied only on exactly `false`. `undefined`, `null`, `0`
and `''` admitted to private channels, and `'yes'`, `1` and arrays admitted to
both kinds — a falsy presence "member" joined with no roster entry, receiving
events while invisible to the room
([#347](https://github.com/locknessland/lockness-monorepo/issues/347)).

**After**, any other value makes `subscribe` throw `AuthorizeResultError`,
before anything is written, published or delivered. The error reaches your
`onError` hook and the client gets no reply unless your `onMessage` sends one.

- **An app that allowed with `1` or `'yes'`** now refuses those users until the
  authorizer returns `true`.
- **An app that denied with `null` or `undefined`** — the Laravel habit — now
  throws where it used to admit. Lockness deliberately does not treat a falsy
  value as a quiet deny: a missing `return` must stay visible.
- **An authorizer returning a raw query row** throws on both kinds: the member
  errors when it is found (items 11, 13), `AuthorizeResultError` when it is not.
  Return an explicit member instead — `return row ? { id: row.id } : false` —
  or, on a private channel, a boolean.
- **An object that throws when inspected**
  ([#353](https://github.com/locknessland/lockness-monorepo/issues/353)) — a
  Proxy whose `getPrototypeOf` trap throws — now throws `AuthorizeResultError`
  naming `uninspectable object`, where it used to throw the trap's own error. A
  member whose `id` is a revoked Proxy now throws `PresenceMemberIdError` where
  it used to throw a `TypeError`. A result whose `then` cannot be read still
  rejects with the error that read raised, because `await` reads `then` before
  Lockness holds the value: a revoked Proxy rejects with the engine's
  `TypeError`, and a Proxy whose `get` trap throws, or an object whose `then`
  getter throws, rejects with that trap's or getter's own error. The same goes
  for an object result whose `ownKeys` or `get` trap throws while `subscribe`
  reads its `id` and `info`, on either kind (item 13). None of these is wrapped
  in a Lockness error, and nothing is written in any of these cases.

`AuthorizeResultError` is exported from `@lockness/realtime`. See
[What your authorizer may return](#what-your-authorizer-may-return).

### 10. A presence member id must be a string or a finite number

**Before**, `subscribe` checked a presence member id's length and refused a
non-finite number, but never its type. An authorizer returning `{ id: null }`,
`{ id: undefined }` or an object id joined, and every user whose id stringified
the same way — every `null`-id user, say — **shared one presence entry**. On
Redis, every other instance dropped the frame announcing such a join, so peers
never saw the member at all
([#346](https://github.com/locknessland/lockness-monorepo/issues/346)).

**After**, `subscribe` throws `PresenceMemberIdError` for any id that is not a
string or a finite number — before the size check, the caps and every write,
publish and delivery — on either channel kind: since item 13 a private
`{ id: null }` throws too. It is checked after item 9's result rule, so an
authorizer's result is judged first, then the member's id.

- **An app whose `authorize()` can return a null or undefined id** now has those
  joins refused where they were silently merged. Deny instead:
  `return user?.id == null ? false : { id: user.id }`.
- **A `bigint` id changes error class**: it used to surface as
  `PresenceMemberSizeError` (it cannot be serialized), and is now
  `PresenceMemberIdError`. Send a 64-bit key as a string — a number above
  `2 ** 53` has already lost precision before Lockness sees it.
- **Roster entries a misconfigured `0.3.0` app already wrote** with such an id
  are skipped on read, as they already were on Redis, and removed when their
  owner leaves. No migration step.

See
[The presence member id is bounded too](#the-presence-member-id-is-bounded-too--by-length-not-by-charset).

### 11. A presence member is exactly `{ id, info }`

**Before**, the object `authorize()` returned was stored and shipped as-is
([#350](https://github.com/locknessland/lockness-monorepo/issues/350)):

- Every own key of a raw row reached subscribers on the same instance, and was
  written to the Redis roster at rest.
- With exactly one extra key and no `info`, it reached every other instance too.
- A `toJSON` on the object decided what shipped.
- An `info` that serialized to a non-object joined locally and was dropped by
  every other instance.
- A getter `id` could pass the checks with one value and be stored as another.

**After**:

- On a presence channel, `subscribe` throws `PresenceMemberShapeError` before
  anything is written if the member has an own key other than `id` / `info`, or
  an `info` that is not a JSON object once serialized — including one that
  serializes to nothing (a function, a symbol, a `toJSON` returning
  `undefined`), which used to join as a bare `{ id }`.
- The room receives a copy of `{ id, info }` made once at admission; later
  changes to the returned object are not seen.
- A frame from another instance whose member has any other key is dropped.
- Roster entries with a non-object `info` are skipped on read (a `0.3.0`
  instance may have written them); entries with extra keys are read back reduced
  to `{ id, info }`. They leave with their owner — no migration step.
- Private channels run the same check and discard the member (item 13).

Return the pair explicitly:

```ts
return row ? { id: row.id, info: { name: row.displayName } } : false
```

`PresenceMemberShapeError` is exported from `@lockness/realtime`. See
[What reaches the room](#what-reaches-the-room-exactly--id-info-).

### 12. Presence members are read-only

**Before**
([#354](https://github.com/locknessland/lockness-monorepo/issues/354)):

- On the memory driver, a roster-less driver and the `source: 'local'` fallback,
  a member in `here` was the stored presence entry. A write to it changed every
  later `here` and the `left` frame on that instance, and never reached other
  instances.
- On Redis, subscribers whose reads were shared received the same member
  objects, so one caller's write appeared in another caller's reply.
- A custom `encode` could change stored state through `frame.member`.

**After**:

- Every `PresenceMember` the framework hands out is deep-frozen: in `here`, in
  the frames your `encode` receives, and in what a driver receives. A write
  throws `TypeError`, because ES modules are strict.
- `PresenceMember.id` and `.info` are `readonly`, so a direct write is also a
  compile error.
- `here` and `here.members` are still yours to change — sort, filter, push.
- An encoder that writes to `frame.member` now throws: on a local announcement
  that is the existing WARN and a lost local frame.

Copy before decorating:

```ts
here.members.map((m) => ({ ...m, info: { ...m.info, isYou: m.id === me } }))
// or structuredClone(m)
```

**If you wrote your own driver:** `holdMember` now receives a frozen member, so
build a new object for what you store. `readRoster` should return members that
nothing mutates afterwards. See
[Writing a presence driver](#writing-a-presence-driver).

No wire change, and no migration step.

### 13. On a private channel, an object result must be a `PresenceMember`

**Before**, any non-null, non-array object `authorize()` returned admitted a
**private** channel — purely for being an object
([#357](https://github.com/locknessland/lockness-monorepo/issues/357)). That
included a lookup that found nothing:

- Deno KV's `{ key, value: null, versionstamp: null }`;
- a pg `QueryResult` with `rows: []`;
- `{}`;
- a `Response`.

An authorizer that returned its lookup instead of a boolean therefore let every
authenticated user read someone else's private channel.

**After**, an object result is checked exactly as on a presence channel, then
discarded. Anything but `{ id, info? }` with a valid `id` throws
`PresenceMemberShapeError`, `PresenceMemberIdError` or `PresenceMemberSizeError`
before anything is written. This affects:

- a lookup wrapper, whether it found something or not;
- a found raw row;
- returning the identity object to mean "allow".

A shared authorizer that returns `{ id, info }` on both kinds keeps working, and
`true` is unchanged. An `onError` that only checks for `AuthorizeResultError`
does not catch these; the three member errors are exported from
`@lockness/realtime` too.

Answer a private channel with a boolean:

```ts
return entry.value !== null // Deno KV
return result.rowCount > 0 // pg
```

See [What your authorizer may return](#what-your-authorizer-may-return).

### 14. A connection never receives `joined` or `left` for its own member id

**Before**, a `left` excluded nobody
([#349](https://github.com/locknessland/lockness-monorepo/issues/349)). Only
`joined` skipped the connections of the member it named. When a Redis instance's
liveness lapsed while it stayed up, a peer's ghost sweep announced that
instance's members `left` — and the members' own open tabs received it. The
`joined` that followed skipped those same tabs, so they saw themselves leave and
never come back, until they resubscribed.

**After**, no presence frame reaches a connection whose own member id it names:
not a `joined`, not a `left`, locally or relayed from another instance. The
lapsed instance also puts its members back itself (see
[the ghost sweep](#the-authoritative-presence-roster)).

In a consistent roster nothing changes: a `left` is announced only when no
process holds the member, and a connection of that member still open means one
does. You lose a frame only where the old one was wrong. A revocation is
unaffected: the revoked connection is still told with an `unsubscribed` frame,
or its socket is closed.

No wire change, and no migration step.

### 15. `PresenceMember` is bounded, and an oversized one now throws

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

### 16. Read this even if you change nothing

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

### 17. A disconnected connection is refused at admission

**Before**, nothing recorded that a connection had been disconnected
([#361](https://github.com/locknessland/lockness-monorepo/issues/361)). A
`subscribe` whose authorizer was still pending when the socket closed, or one
issued by an `onMessage` that resumed after an `await`, resolved `{ ok: true }`.
It wrote a membership no teardown would ever reach: a cap slot, a broker watch
and, on a presence channel, a roster entry every instance kept showing. After
the teardown it also re-registered the connection, which `connectionCount` then
counted.

**After**, `register` and `subscribe` throw instead, before the authorizer runs
where they can and always before anything is written. Two classes, both exported
from `@lockness/realtime`, handled differently:

- **`ConnectionDisconnectedError`**: this connection object was disconnected.
  The socket is gone and no retry can succeed. Catch it with `instanceof` and
  drop the frame.
- **`ConnectionIdInUseError`**: a _different_ object holds this id, live or
  being torn down (widened by item 21). That breaks the id contract, so it is
  neither retried nor dropped silently — fix the transport that minted the id.

```ts
// Before: resolved { ok: true } for a socket that had already closed.
await manager.subscribe(conn, channel)

// After: drop the frame; let anything else reach onError.
try {
    await manager.subscribe(conn, channel)
} catch (error) {
    if (error instanceof ConnectionDisconnectedError) return
    throw error
}
```

The worked example under
[Where a verb budget belongs](#where-a-verb-budget-belongs) does exactly this.
If you catch nothing, the refusal reaches your `onError` hook, or the default
ERROR line when you installed none — one line per race.

**A denial is still a denial.** When the authorizer answers `false` for a
connection that disconnected while it ran, `subscribe` still resolves
`{ ok: false }`, and an authorizer result outside its contract still throws its
own error. Only an **admission** is replaced by the refusal.

Four smaller changes ride with it:

1. **`handlerHooks` now always disconnects on close**, even when your own
   `onClose` throws. Your error is still what the close rejects with, and it
   reaches your `onError` (see
   [A failing hook is reported, never fatal](#a-failing-hook-is-reported-never-fatal));
   a teardown failure after it is logged as a WARN.
2. **`connectionCount` no longer counts zombies** re-registered by a late
   `subscribe`.
3. **`evict` and `revokeChannel` re-throw a rejection whose value is
   `undefined`** from the durable record write or clear. It used to be read as
   success.
4. **A failed unwatch no longer leaves a presence member behind.** `unsubscribe`
   forgets the member before it leaves the channel and releases its roster slot
   even when the leave rejects, so a liveness lapse cannot bring it back.

If you wire your own transport, it must meet three lifecycle duties for the
refusal to reach it — see
[Your connection ids and your transport's lifecycle](#your-connection-ids-and-your-transports-lifecycle).

No wire change, and no migration step.

### 18. A Redis revocation timing the driver cannot enforce refuses to boot

**Before**, any `presence.reconcileIntervalMs` and `revocationTtlSeconds`
constructed
([#362](https://github.com/locknessland/lockness-monorepo/issues/362)). A
non-finite, zero or negative interval reached `setTimeout` as 0 ms and ran the
revocation pass and the ghost sweep back to back, and nothing compared the
interval with the TTL.

**After**, `new RedisBroadcastDriver` and `fromConfig` throw for a timing
outside the ranges, or one where the interval is more than half the TTL. Both
rules, and the fix, are stated once in
[the revocation timing](#revocation-timing); the defaults pass.

Two more changes ride with it:

1. **An injected command port must settle every command**, within a bound it
   owns — the contract is on `RedisCommandClient`. The built-in client meets it
   through its read timeout. A command that never settles is reported, not
   cancelled.
2. **A new WARN, in three forms** (`STALLED`, `MISSED`, `SKEWED`), appears at
   most once per episode when no revocation pass completes within
   `revocationTtlSeconds` of the last success's start, or when the broker's
   clock steps a full TTL. A healthy deployment never sees it.

No wire change, and no migration step.

### 19. A malformed `SMEMBERS` or `EXISTS` reply now fails the ghost sweep with a WARN

**Before**, the Redis driver's ghost sweep read its broker replies leniently
([#360](https://github.com/locknessland/lockness-monorepo/issues/360)). An
instance-set `SMEMBERS` reply that was not an array was read as an empty
instance set, so the sweep swept nothing. A liveness `EXISTS` reply that was not
an integer was read as "alive", so a dead instance was never swept. Both were
silent.

**After**, either reply is refused: the pass stops with one
`realtime: roster reconcile failed` WARN, and reports `failed` to an
`onPassComplete` handler ([measuring the passes](#measuring-passes)). The next
pass runs on its usual interval. A broker that answers as Redis does never sees
it.

Not breaking: no configuration or code change is needed. No wire change, and no
migration step.

### 20. `subscribe` requires `register`

**Before**, `subscribe` bound a connection it had never seen
([#370](https://github.com/locknessland/lockness-monorepo/issues/370)). A first
`subscribe` whose authorizer was still pending when the socket closed found
nothing for `disconnect` to retire, then bound the connection anyway: a
membership, cap slots and a count that no teardown would ever reach. A client
repeating that exhausted the watched-channel caps for everyone else.

**After**, `register` is the only way a connection is bound. `subscribe` throws
`ConnectionNotRegisteredError` for an object `register` never bound — **before
the authorizer runs**, and before anything is written.

```ts
// Before: the first subscribe bound the connection itself.
await manager.subscribe(conn, 'private-orders')

// After: register once, from the socket's open hook, then subscribe.
hooks.onOpen = (conn) => manager.register(conn)
await manager.subscribe(conn, 'private-orders')
```

**`handlerHooks` is the zero-work path**: it registers in `onOpen` for you, and
an app on it changes nothing. `connectionCount` now counts only registered
connections. The duties this enforces are stated once, in
[Your connection ids and your transport's lifecycle](#your-connection-ids-and-your-transports-lifecycle).

### 21. An id held by a live connection is refused

**Before**, a different connection object presented under the id of a live one
took its binding over
([#363](https://github.com/locknessland/lockness-monorepo/issues/363)): every
channel the first object held — private and presence included — was delivered to
the second, whose own authorizer never ran for them. And `disconnect(id)` tore
down whoever held the id when it ran, so the refused socket's own close, or an
old socket's late close after an evict and a fast reconnect, tore down the live
holder.

**After**, `register` and `subscribe` throw `ConnectionIdInUseError` for a
different object under an id another object holds, **live or being torn down**,
before the authorizer runs. On `handlerHooks`, `onOpen` closes such a socket
with `1011 'unusable connection id'`, skips your `onOpen`, and throws — the same
close every `register` refusal gets.

```ts
// Before: B silently took over A's channels.
manager.register(a) // id 'c1'
manager.register(b) // also 'c1' — now B receives A's private frames

// After: the second register throws; A keeps its channels.
manager.register(b) // ConnectionIdInUseError
```

- **The server mints the id, per socket** — `crypto.randomUUID()`, never from
  client input, and never from a user or session key. A guessable or shared id
  now has two consequences: **lockout** (whoever registers a known id first
  keeps its owner out) and **disclosure** (a refusal tells the caller that id is
  live, which leaks who is online).
- **`evict(id)` recovers a leaked binding**, whoever holds it.
- **`disconnect(conn)` is owner-scoped.** Pass the object from your close hook:
  it acts only for the object that owns its id, and returns `'not-owned'` for
  any other. `disconnect(conn.id)` still acts on whoever holds the id — so a
  refused socket's close would still tear down the live one, on a transport of
  your own (on `handlerHooks`, see item 22).
- **`handlerHooks.onMessage` skips frames from a socket that does not own its
  id** — a refused socket, or one already torn down. Your hook is not called for
  them.
- **The `ConnectionIdInUseError` constructor now takes no argument**, and
  neither it nor `ConnectionNotRegisteredError` puts the id in its message.

Apps on `handlerHooks` with framework ids see no change.

> **A subclass that overrides `disconnect(clientId: string)` still compiles**,
> and it now receives the connection **object** from `handlerHooks.onClose`.
> Widen the override to `disconnect(target: string | Connection<Identity>)` and
> pass the object form through to `super.disconnect(target)`; an override that
> reads `target` as a string will key its own work on `[object Object]`.

### 22. A refused socket no longer gets your `onClose`

**Before**, `handlerHooks` ran your `onClose` for a socket whose `register` was
refused ([#404](https://github.com/locknessland/lockness-monorepo/issues/404)) —
on a custom transport that reuses connection ids, a second socket presenting a
live id. An id-form verb there (`unsubscribe(conn.id, …)`,
`disconnect(conn.id)`) landed on the live owner of that id, and a counter you
keep in `onOpen` / `onClose` was decremented for a socket it never counted.

**After**, your `onClose` runs exactly once for each socket whose `onOpen` ran —
evicted ones included, refused ones never. A second close of the same socket
runs it no more. The framework still disconnects on every close, and your
`onError` still hears a refused socket, by design.

**An `onOpen` of yours that throws, or that closes the socket itself, still gets
its `onClose`**: the framework admitted the socket before your hook ran. Keep a
counter safe by incrementing it first:

```ts
const hooks = manager.handlerHooks({
    onOpen: (conn) => {
        open.set(key(conn), (open.get(key(conn)) ?? 0) + 1) // first line
        if (overLimit(conn)) conn.close(4429, 'too many sockets') // then decide
    },
    onClose: (conn) => {
        open.set(key(conn), (open.get(key(conn)) ?? 1) - 1) // always paired
    },
})
```

An increment placed after a check that throws or closes is skipped, while the
decrement still runs — and the count goes below zero.

If your transport reuses ids, an evicted socket's id may already be someone
else's, so still never act on `conn.id` in `onClose`. Apps on `handlerHooks`
with framework ids see no change. No wire change, and no migration step.

### 23. Only a clean revocation pass re-arms the deadline

**Before**, the Redis revocation deadline
([#362](https://github.com/locknessland/lockness-monorepo/issues/362)) re-armed
on every pass whose enumeration completed, however many of its revocations
failed to apply
([#384](https://github.com/locknessland/lockness-monorepo/issues/384)). A
revoked socket whose `Connection.close` throws stays open and owned, and fails
on every pass — yet each pass re-armed the deadline, and the record was reaped
at its TTL with nothing but one WARN per pass to show for it.

**After**, only a **clean** pass re-arms it: its re-check reported no failed
apply and no malformed tally.

- **A failure on every pass writes `MISSED`** one TTL after the last clean
  pass's start — once per episode. An expiry after a pass that was not clean is
  `MISSED`, never `STALLED`, even while a pass is in flight. Both lines now read
  "no revocation pass completed without failures within revocationTtlSeconds of
  the last clean pass's start".
- **A one-off failure costs margin, not a line.** The built-in apply failures
  happen once — the next pass finds nothing left to apply — so a single failed
  pass between clean ones writes nothing.
- **`REVOCATION_TALLY_MALFORMED` is new**: one WARN per pass for an
  `onRevocationReconcile` handler that resolves a value claiming to be a
  `RevocationTally` with bad counts (one missing, not a safe integer, negative,
  or `failed` above `attempted`). Such a pass reports no counts and does not
  re-arm. A handler that resolves nothing, or a value that is not tally-shaped,
  is unchanged.
- **Additive for callers**: `RevocationTally` is exported, the hook's handler
  type widens to
  `() => RevocationTally | void | Promise<RevocationTally | void>` (a `void`
  handler still conforms), and `PassSample` gains optional `attempts` and
  `failures`. Record them with the
  [pass-instrument recipe](observability-and-crypto.md#framework-instruments),
  and alert on the rate of `failures`.
- **Breaking for a driver that stores the handler.** If you wrote your own
  `BroadcastDriver` and keep the `onRevocationReconcile` handler in a slot typed
  `() => void | Promise<void>`, that assignment no longer compiles. Widen the
  slot to `() => unknown` (or to the hook's own handler type). Call it with no
  argument, as before; reporting the tally it resolves is optional.

No wire change and no data migration. If `MISSED` starts appearing, the WARNs
before it name the revocation that keeps failing.

### 24. A revocation record now outlives the fleet's longest live TTL

**Before**, a durable revocation record lived for its **writer's**
`revocationTtlSeconds`, and the TTL was assumed uniform across the fleet
([#380](https://github.com/locknessland/lockness-monorepo/issues/380)). A peer
configured with a shorter TTL — mid-rollout, a per-service override, a canary —
wrote records that expired before a longer-interval peer's next pass, so a
revocation whose control frame was lost was never applied there, and nothing
said so.

**After**, a record lives at least its writer's TTL and up to the longest TTL
among the instances still running revocation passes. What that means for tuning
is stated once, in [the revocation timing](#revocation-timing). What you will
observe:

- **One new key**, `<prefix>__revocation-floor`: a sorted set with one member
  per distinct TTL in the fleet, carrying its own TTL (the longest member's TTL
  plus 60 s), so it disappears on its own when the fleet stops.
- **One more read per revocation.** `markRevocation` reads that key before it
  writes the record; revocation passes refresh it with no extra round trip, and
  each instance writes it once at startup.
- **Three new WARNs**: the startup write failed (it is retried after 1 s, then 2
  s, doubling up to `reconcileIntervalMs`, and **every failed attempt logs its
  own WARN** until one lands, a revocation pass completes, or the driver closes
  — so a broker that refuses it keeps logging at that pace); the key held
  members that are not a TTL (a count, never the content); the key could not be
  read.
- **A key that cannot be read fails closed.** The record is kept for the maximum
  TTL, about 24.8 days, rather than a shorter one. That grows the revocation
  index until such records are applied or expire; marks are rare, and a
  channel-scoped record is cleared once its owner applies it.
- **Protection starts once every instance runs this release.** An older writer's
  records still live for its own TTL, exactly as before; an older reader never
  puts its TTL on the floor, so records are not lengthened for it; and an older
  reap never removes anything live.

No wire change, and no migration step.

### 25. A Redis heartbeat interval no timer can hold refuses to boot

**Before**, `presence.heartbeatIntervalMs` was bounded only by half of
`presence.livenessTtlSeconds × 1000`
([#381](https://github.com/locknessland/lockness-monorepo/issues/381)), and the
TTL has no upper bound. A large TTL admitted an interval above 2 147 483 647 ms.
Deno replaces such a delay with 1 ms, so the heartbeat renewed the instance's
liveness key every millisecond, with only a `TimeoutOverflowWarning` on stderr.

**After**, `new RedisBroadcastDriver` and `fromConfig` throw for an interval
above that ceiling. The rule is stated once, in
[the heartbeat timing](#heartbeat-timing); the defaults (`5000` ms against `15`
s) pass. The fix is to lower the interval.

No wire change, and no migration step.

### 26. A failed `unwatchChannel` now discards and reconnects the Redis subscribe socket

**Before**, a rejected `PUNSUBSCRIBE`/`UNSUBSCRIBE` write on the Redis subscribe
connection was the one write path that left its socket alone
([#372](https://github.com/locknessland/lockness-monorepo/issues/372)) — every
other write on that connection (a `PSUBSCRIBE`, the keepalive `PING`) already
discarded and reconnected on failure. A write **timeout** in particular left the
read loop healthy, so nothing else ever reconnected, and the un-discarded socket
could carry a partial frame that silently desynced every later write for every
other channel this connection hosted.

**After**, the same treatment every other write already gets: the socket is
discarded and a reconnect scheduled, which re-issues only the patterns still
wanted — never the one just unwatched. `unwatchChannel`'s own contract is
unchanged: it still resolves once the frame is on the wire, or rejects, and
never retries the unwatch itself. What is now observable is the recovery: a
`[redis-subscribe] … retrying …` WARN where none was logged before, and a brief
reconnect that deafens every channel this connection hosts — the same cost this
connection already pays on any other write failure, traded for a partial desync
that used to have no bound at all.

No wire change, and no migration step.

## Upgrading to v0.3.0

Two behaviour changes in `@lockness/realtime`. Neither needs a data migration;
both can be met before you deploy.

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
