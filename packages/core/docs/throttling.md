# Rate limiting with `@Throttle`

`@Throttle` caps how often a route may be called. It works on a controller class
or on a single method, and is enforced by middleware that runs **before** the
cache, the validators and any user middleware — a rejected request does no work.

```ts
import { Controller, Get, Post, Throttle, ThrottleLogin } from '@lockness/core'

@Controller('/api')
@Throttle(100, '1m') // every route in this controller
class ApiController {
    @Get('/items')
    index(c: Context) {
        return c.json([])
    }

    @Post('/login')
    @ThrottleLogin() // this route only: 5 per minute
    login(c: Context) {
        return c.json({ ok: true })
    }
}
```

## Method rules replace controller rules

A method-level `@Throttle` **replaces** the controller-level one. The two never
stack, so a route can be made deliberately more permissive than its controller
default:

```ts
@Controller('/api')
@Throttle(10, '1m')
class C {
  @Get('/report')
  @Throttle(100, '1m') // 100, not min(10, 100)
  report(c: Context) { … }
}
```

Each route gets its own counter, so two routes under a `@Throttle(2, '1m')`
controller each allow two requests per minute — not two between them.

## Windows

The window is milliseconds, or a quantity followed by a unit:

| Value    | Meaning             |
| -------- | ------------------- |
| `'30s'`  | 30 seconds          |
| `'15m'`  | 15 minutes          |
| `'2h'`   | 2 hours             |
| `'1d'`   | 1 day               |
| `60_000` | 60 000 milliseconds |

Anything else throws a `TypeError` while routes are being registered. This is
deliberate: a window that silently fell back to a default would leave the route
it guards less protected than its author intended, and nothing would say so.

## Identifying the client

`options.by` decides what the counter is keyed on. The default is `'ip'`.

| `by`                 | Key                                                        |
| -------------------- | ---------------------------------------------------------- |
| `'ip'`               | The client address                                         |
| `'user'`             | The authenticated user id, `anon:<address>` when anonymous |
| `'header:X-Api-Key'` | That header's value, falling back to the address           |
| `(c) => string`      | Whatever you return                                        |

```ts
@Throttle(1000, '1h', { by: 'header:X-Api-Key' })
```

Anonymous requests under `by: 'user'` fall back to the address under a distinct
prefix. Without that, every unauthenticated caller would share one bucket and a
single flood would lock all of them out together.

### A note on addresses

The address is read from `cf-connecting-ip`, `x-real-ip` then `x-forwarded-for`,
in that order, taking the first entry of the forwarding chain. These headers are
trusted as given.

Behind a reverse proxy that strips inbound copies, that value is authoritative.
Behind one that does not, a client can forge it. That is a deployment concern
rather than one the framework can settle — with no proxy in front there is no
header to read at all. If your edge does not normalise these headers, key on
something you control instead, with `by: 'header:…'` or a function.

## Shaping the rejection

```ts
@Throttle(5, '1m', {
  message: 'Too many attempts, try again shortly.',
  statusCode: 429,
  headers: true,
  skip: (c) => c.req.header('x-internal-token') === INTERNAL,
})
```

| Option       | Default | Effect                                        |
| ------------ | ------- | --------------------------------------------- |
| `message`    | library | Response body when the limit is exceeded      |
| `statusCode` | `429`   | Status returned on rejection                  |
| `headers`    | `true`  | Emit `RateLimit-*` headers (draft-7)          |
| `skip`       | —       | Return `true` to let a request through untold |
| `store`      | memory  | Counter backend                               |

A request that `skip` lets through is **not counted** — it does not consume the
caller's budget.

## Presets

| Decorator              | Limit          | Intended for                      |
| ---------------------- | -------------- | --------------------------------- |
| `@ThrottleLogin()`     | 5 per minute   | Credential checks                 |
| `@ThrottleSensitive()` | 3 per hour     | Destructive or high-value actions |
| `@ThrottleApi()`       | 100 per minute | General API traffic               |
| `@ThrottleHeavy()`     | 10 per minute  | Reports, exports, uploads         |

Each accepts the same options object as `@Throttle`, so a preset can be reused
with a different key: `@ThrottleApi({ by: 'header:X-Api-Key' })`.

## Distributed state

The default counter is in memory, which means **per process**. Across several
instances each one enforces the limit separately, so the effective limit is the
configured value multiplied by the instance count.

Supply `options.store` with a shared backend to fix that. The store contract is
`increment` / `decrement` / `resetKey`; a Redis implementation backed by
`@lockness/cache` is not shipped yet.
