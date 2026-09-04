# Notifications

`@lockness/notification` sends one event to a recipient across several channels
— **mail, database, log, broadcast** — from a single class, with some channels
queued. Each channel's backing package loads **only if that channel is used**.

## Quick start

```ts
import { Notification, notify } from '@lockness/notification'
import type { Notifiable } from '@lockness/notification'

class InvoicePaid extends Notification {
    constructor(private readonly invoiceId: number) {
        super()
    }
    via(): string[] {
        return ['mail', 'database']
    }
    toMail() {
        return { subject: 'Invoice paid', html: '<h1>Thanks!</h1>' }
    }
    toDatabase() {
        return { type: 'invoice_paid', invoiceId: this.invoiceId }
    }
}

await notify(user, new InvoicePaid(7))
```

Scaffold one with the CLI:

```bash
deno task cli make:notification InvoicePaid
```

## The recipient resolves its own address

A channel never reads `user.email`. It asks the recipient through
`routeNotificationFor(channel)`:

```ts
class User implements Notifiable {
    constructor(readonly id: number, readonly email: string) {}
    routeNotificationFor(channel: string): unknown | null {
        switch (channel) {
            case 'mail':
                return this.email
            case 'broadcast':
                return `notifications:user:${this.id}` // per-user client id
            case 'database':
            case 'log':
                return this.id // the owner / summary subject
            default:
                return null // no route → this channel is skipped
        }
    }
}
```

A `null` route skips **only** that channel. One channel throwing never aborts
the others — `notify` returns a report of `delivered` / `skipped` / `failures`.

## Registering the channels

```ts
import { defaultManager, registerBuiltInChannels } from '@lockness/notification'

registerBuiltInChannels(defaultManager, { broadcaster: sseChannel })
```

- **log** — a bounded summary (`type`, notifiable id, channels), never the
  payload; user-derived strings pass through `safeForLog`.
- **broadcast** — pushes to the recipient's **own** SSE connection
  (`send(clientId, …)`), never a shared broadcast. Supply your app's SSE channel
  as `broadcaster`.
- **database** — persists a row (see below).
- **mail** — sends through `@lockness/mail`.
- **sms / slack** — stubs that throw `ProviderNotConfiguredError` until wired.

Each backing package is soft-loaded on first use, so a log-only app pulls none
of the others.

## The database channel

The channel ships no table — supply one, and make sure it has a column
identifying the recipient (the owner):

```ts
import { configureNotifications } from '@lockness/notification'
import { notifications } from './app/schema.ts'

configureNotifications({ databaseTable: notifications })
```

The channel sets the owner column itself (default `notifiable_id`) from the
recipient's `database` route, so a `toDatabase()` payload cannot forge a
different owner. A later "list my notifications" read scopes by that column.

## Queued delivery

A notification that sets `queue = true` is delivered through the queue: one job
runs the whole fan-out. The job serialises **identifiers only** — never rendered
content — and re-renders when it runs, so no PII sits in the queue store.

Wire the enqueue and the worker once at boot:

```ts
import {
    configureNotifications,
    handleNotificationJob,
    registerNotification,
} from '@lockness/notification'
import { dispatch } from '@lockness/queue'

// 1) How a queued notification is enqueued.
configureNotifications({
    queueDispatcher: (job) => dispatch('notifications', job),
    // 2) How the worker rebuilds the recipient.
    resolveNotifiable: (id) => userRepository.find(Number(id)),
})

// 3) How the worker rebuilds each notification class.
registerNotification(
    'InvoicePaid',
    (p) => new InvoicePaid((p as { invoiceId: number }).invoiceId),
)

// 4) In the queue worker for 'notifications':
//    await handleNotificationJob(job)
```

A notification opts in and declares its constructor payload:

```ts
class InvoicePaid extends Notification {
    override readonly queue = true
    constructor(private readonly invoiceId: number) {
        super()
    }
    override toQueue() {
        return { invoiceId: this.invoiceId } // identifiers only
    }
    // …via()/toMail() as before
}
```

## Building it

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze
deno test -A packages/notification/
```
