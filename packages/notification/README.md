# @lockness/notification

Multi-channel notifications for Lockness. Send one event to a recipient across
**mail, database, log, and broadcast** channels from a single class — with some
channels queued — while each channel's backing package is loaded **only if that
channel is used**.

```ts
import { Notification, notify } from '@lockness/notification'

class InvoicePaid extends Notification {
    constructor(private readonly invoiceId: number) {
        super()
    }
    via() {
        return ['mail', 'database']
    }
    toMail(user: User) {/* build the mail message */}
    toDatabase() {
        return { type: 'invoice_paid', invoiceId: this.invoiceId }
    }
}

await notify(user, new InvoicePaid(7))
```

## The recipient resolves its own address

A channel never reads `user.email`; it asks the recipient:

```ts
class User implements Notifiable {
    constructor(readonly id: number, readonly email: string) {}
    routeNotificationFor(channel: string): unknown | null {
        if (channel === 'mail') return this.email
        if (channel === 'broadcast') return `notifications:user:${this.id}`
        return null // no address for this channel → skipped
    }
}
```

A `null` route skips only that channel; one channel throwing never aborts the
others.

## Channels load on demand

Each channel's backing package is soft-loaded the first time that channel is
used. A log-only app pulls neither `@lockness/mail`, `sse`, `queue`, nor
`drizzle`. A missing package fails with an actionable message
(`install @lockness/mail for the mail channel`), never a raw stack.

## The database channel

The channel ships no table — you supply one:

```ts
import { configureNotifications } from '@lockness/notification'

configureNotifications({ databaseTable: notificationsTable })
```

The table must carry a column identifying the recipient (the owner), so a later
"list my notifications" read can scope by owner.

## Queued delivery

A notification that sets `queue = true` is delivered through `@lockness/queue`:
one job runs the whole fan-out. The job serialises **identifiers only**
(`notifiableId`, the notification class, and its constructor payload) — never
rendered content — and re-renders when it runs, so no PII sits in the queue
store.

## Scaffold

```bash
deno task cli make:notification InvoicePaid
```

See [docs/notifications.md](../../docs/notifications.md) for the full guide.

## Upgrading to v0.5.0

One item. **Migration step:** if your code imports `handleMakeNotification`, run
`make:notification` through the CLI instead.

### 1. `handleMakeNotification` is no longer exported, and `make:notification` fails non-zero

`handleMakeNotification`, the handler behind `make:notification`, was exported
from `@lockness/notification`. On a missing or malformed name it printed `❌`
itself and returned `undefined`, so `make:notification` exited `0` on a failure
(#436). It is now internal: it throws a failure the CLI prints once, and
`make:notification` exits `1`. `registerNotificationCommands` is still exported
and is the way to add the command to a `Cli`; code that called
`handleMakeNotification` directly can dispatch the command instead
(`await cli.dispatch(['make:notification', 'InvoicePaid'])` returns the exit
status).
