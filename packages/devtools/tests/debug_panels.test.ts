/**
 * Tests for the #27 debug panels: the events + sessions collection path, the
 * fail-closed activation gate, and redaction.
 *
 * @module @lockness/devtools/tests/debug_panels
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { Hono } from 'hono'
import { dispatcher } from '@lockness/events'
import { collector } from '../collector.ts'
import { devtoolsActive } from '../gate.ts'
import { REDACTED, redactSecrets, redactValue } from '../redact.ts'
import { devtoolsRequestContext } from '../request_context.ts'
import { enableDevtools } from '../mod.ts'
import { devtoolsMiddleware } from '../middleware.ts'
import type { EventInfo } from '../types.ts'

/** Run `fn` with a chosen env combo, restoring after. */
async function withEnv(
    combo: Record<string, string | undefined>,
    fn: () => void | Promise<void>,
): Promise<void> {
    const keys = ['DENO_ENV', 'APP_ENV', 'LOCKNESS_DEVTOOLS']
    const prev = Object.fromEntries(keys.map((k) => [k, Deno.env.get(k)]))
    const set = (k: string, v?: string) =>
        v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v)
    for (const k of keys) set(k, combo[k])
    try {
        await fn()
    } finally {
        for (const k of keys) set(k, prev[k])
    }
}

// --- Redaction (T014/S3) --------------------------------------------------

Deno.test('redactSecrets - masks secret-looking keys, keeps the rest', () => {
    const out = redactSecrets({
        userId: 7,
        apiKey: 'sk-live-x',
        password: 'hunter2',
        csrf: 'abc',
        theme: 'dark',
        session_key: 'zzz',
    })
    assertEquals(out.userId, 7)
    assertEquals(out.theme, 'dark')
    assertEquals(out.apiKey, REDACTED)
    assertEquals(out.password, REDACTED)
    assertEquals(out.csrf, REDACTED)
    assertEquals(out.session_key, REDACTED)
})

Deno.test('redactValue - deep + camelCase + code/state, negatives kept (#149, US2)', () => {
    const out = redactValue({
        theme: 'dark',
        monkey: 'ook',
        statusCode: 200,
        stateName: 'CA',
        sessionKey: 'k',
        code: 'oauth-code',
        state: 'xyz',
        passwd: 'p1',
        pwd: 'p2',
        credential: 'c',
        signature: 's',
        profile: { apiToken: 't', name: 'n' },
        items: [{ password: 'p', label: 'l' }],
    }) as Record<string, unknown>
    // Negatives — a camelCase/compound name that merely contains a token stays.
    assertEquals(out.theme, 'dark')
    assertEquals(out.monkey, 'ook')
    assertEquals(out.statusCode, 200)
    assertEquals(out.stateName, 'CA')
    // camelCase *Key + standalone code/state are secrets.
    assertEquals(out.sessionKey, REDACTED)
    assertEquals(out.code, REDACTED)
    assertEquals(out.state, REDACTED)
    // Canonical secret names (review LOW #1).
    assertEquals(out.passwd, REDACTED)
    assertEquals(out.pwd, REDACTED)
    assertEquals(out.credential, REDACTED)
    assertEquals(out.signature, REDACTED)
    // Deep traversal — nested object and array element.
    const profile = out.profile as Record<string, unknown>
    assertEquals(profile.apiToken, REDACTED)
    assertEquals(profile.name, 'n')
    const item0 = (out.items as unknown[])[0] as Record<string, unknown>
    assertEquals(item0.password, REDACTED)
    assertEquals(item0.label, 'l')
})

Deno.test('redactValue - a top-level array is traversed (#149, US2)', () => {
    const out = redactValue([{ password: 'p', keep: 'k' }]) as unknown[]
    const first = out[0] as Record<string, unknown>
    assertEquals(first.password, REDACTED)
    assertEquals(first.keep, 'k')
})

Deno.test('redactValue - deep and cyclic input terminate, no throw (#149, FR-012)', () => {
    // Adversarially deep, acyclic (a JSON body can be tuned like this).
    let deep: Record<string, unknown> = { secret: 's' }
    for (let i = 0; i < 5000; i++) deep = { nested: deep }
    const outDeep = redactValue(deep) // must not throw / stack-overflow
    assert(
        outDeep && typeof outDeep === 'object',
        'deep input redacted, no throw',
    )
    // The over-cap subtree is masked wholesale, not captured raw (review LOW #4).
    let cur: unknown = outDeep
    let maskedAtDepth = false
    for (let i = 0; i < 5000; i++) {
        if (cur === REDACTED) {
            maskedAtDepth = true
            break
        }
        cur = (cur as Record<string, unknown> | undefined)?.nested
    }
    assert(maskedAtDepth, 'a subtree past MAX_DEPTH is masked wholesale')

    // Cyclic — a memory-session value can be self-referential (not JSON-derived).
    const cyc: Record<string, unknown> = { theme: 'dark' }
    cyc.self = cyc
    const outCyc = redactValue(cyc) as Record<string, unknown>
    assertEquals(outCyc.theme, 'dark')
    assertEquals(outCyc.self, REDACTED, 'cycle short-circuited to REDACTED')
})

// --- Gate (T008/S1) -------------------------------------------------------

Deno.test('devtoolsActive - fails closed unless explicitly dev or opted in', async () => {
    await withEnv({}, () => assert(!devtoolsActive(), 'no env -> off'))
    await withEnv(
        { DENO_ENV: 'production' },
        () => assert(!devtoolsActive(), 'production -> off'),
    )
    await withEnv(
        { DENO_ENV: 'development' },
        () => assert(devtoolsActive(), 'explicit dev -> on'),
    )
    await withEnv(
        { APP_ENV: 'development' },
        () => assert(devtoolsActive(), 'explicit APP_ENV dev -> on'),
    )
    await withEnv(
        { LOCKNESS_DEVTOOLS: '1' },
        () => assert(devtoolsActive(), 'opt-in -> on'),
    )
})

// --- Collector events bucket (T006/A5) ------------------------------------

Deno.test('collector - addEvent/getEvents, maxEvents trim, clear resets events', () => {
    collector.clear()
    collector.addEvent({ eventName: 'A', listenerCount: 1, timestamp: 1 })
    collector.addEvent({ eventName: 'B', listenerCount: 0, timestamp: 2 })
    const events = collector.getEvents()
    assertEquals(events.length, 2)
    assertEquals(events[0].eventName, 'B', 'newest first')

    for (let i = 0; i < 600; i++) {
        collector.addEvent({
            eventName: `E${i}`,
            listenerCount: 0,
            timestamp: i,
        })
    }
    assert(collector.getEvents().length <= 500, 'trimmed to maxEvents')

    collector.clear()
    assertEquals(collector.getEvents().length, 0, 'clear resets events')
})

// --- Events capture end to end (T012/A3/A4/A6) ----------------------------

Deno.test('events - captured via onAny with requestId + registered count, idempotent', async () => {
    await withEnv({ LOCKNESS_DEVTOOLS: '1' }, async () => {
        const app = new Hono()
        // Two calls: the second must NOT double-wire the subscriber (A6).
        enableDevtools(app)
        enableDevtools(app)

        collector.clear()
        // Emit inside a request scope so the capture is correlated (A4).
        await devtoolsRequestContext.run({ requestId: 'req-xyz' }, async () => {
            await dispatcher().emitString('DevtoolsProbeEvent', { n: 1 })
        })

        const probes = collector.getEvents().filter(
            (e: EventInfo) => e.eventName === 'DevtoolsProbeEvent',
        )
        assertEquals(
            probes.length,
            1,
            'captured exactly once (idempotent wiring)',
        )
        assertEquals(
            probes[0].requestId,
            'req-xyz',
            'correlated to the request',
        )
        // Exact value, not just the type (#149, US3): no @Listener is
        // registered for the probe event, so the registered count is 0.
        assertEquals(
            probes[0].listenerCount,
            0,
            'exact registered-listener count for the probe event',
        )

        // Outside a request scope -> unattributed, not dropped.
        collector.clear()
        await dispatcher().emitString('DevtoolsProbeEvent', { n: 2 })
        const outside = collector.getEvents().filter(
            (e: EventInfo) => e.eventName === 'DevtoolsProbeEvent',
        )
        assertEquals(outside.length, 1)
        assertEquals(
            outside[0].requestId,
            undefined,
            'unattributed outside a request',
        )
    })
})

// --- Session capture via the middleware (T016/S3) -------------------------

Deno.test('sessions - middleware captures a redacted snapshot; none => nothing', async () => {
    await withEnv({ LOCKNESS_DEVTOOLS: '1' }, async () => {
        const app = new Hono()
        enableDevtools(app)
        // Inner middleware sets a fake session AFTER the devtools middleware
        // wraps the request; devtools reads it post-next().
        app.use('*', (c, next) => {
            // deno-lint-ignore no-explicit-any
            ;(c as any).set('session', {
                getId: () => 'sess-1',
                all: () => ({ userId: 7, apiKey: 'sk-secret' }),
            })
            return next()
        })
        app.get('/page', (c) => c.text('ok'))

        collector.clear()
        await app.request('/page')

        const s = collector.getSessions().find((x) => x.id === 'sess-1')
        assert(s, 'session captured')
        assertEquals(s!.data.userId, 7)
        assertEquals(s!.data.apiKey, REDACTED, 'secret value redacted')
    })
})

Deno.test('sessions - no session on the context => nothing captured (#149, US3)', async () => {
    await withEnv({ LOCKNESS_DEVTOOLS: '1' }, async () => {
        const app = new Hono()
        enableDevtools(app)
        // No inner middleware sets a session; the guarded capture must no-op.
        app.get('/no-sess', (c) => c.text('ok'))

        collector.clear()
        await app.request('/no-sess')

        assertEquals(
            collector.getSessions().length,
            0,
            'no session set => no snapshot captured, no throw',
        )
    })
})

// --- Request capture redaction at the collector (T005/#149 US1) -----------

Deno.test('request capture - headers/query/body redacted at capture (#149, US1)', async () => {
    await withEnv({ LOCKNESS_DEVTOOLS: '1' }, async () => {
        const app = new Hono()
        enableDevtools(app)
        app.post('/echo', (c) => c.text('ok'))

        collector.clear()
        await app.request('/echo?token=abc&theme=dark', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'cookie': 'session=zzz',
                'authorization': 'Bearer sekret',
            },
            body: JSON.stringify({
                password: 'x',
                profile: { apiToken: 'y' },
                keep: 'z',
            }),
        })

        const req = collector.getRequests().find((r) => r.path === '/echo')
        assert(req, 'request captured')
        // Headers: Cookie + Authorization masked, content-type kept.
        assertEquals(req!.headers['cookie'], REDACTED)
        assertEquals(req!.headers['authorization'], REDACTED)
        assertEquals(req!.headers['content-type'], 'application/json')
        // Query: token masked, theme kept.
        assertEquals(req!.query['token'], REDACTED)
        assertEquals(req!.query['theme'], 'dark')
        // Body: password + nested apiToken masked, keep kept.
        const body = req!.body as Record<string, unknown>
        assertEquals(body.password, REDACTED)
        assertEquals(
            (body.profile as Record<string, unknown>).apiToken,
            REDACTED,
        )
        assertEquals(body.keep, 'z')
    })
})

// --- Fail-closed at the integration boundaries (HIGH: S1 mount / S2 collect) --

Deno.test('production - enableDevtools mounts no route and the middleware collects nothing', async () => {
    await withEnv({ DENO_ENV: 'production' }, async () => {
        // Mount refusal (S1): no dashboard/api route is registered.
        const app = new Hono()
        enableDevtools(app)
        const res = await app.request('/_devtools/api/data')
        assertEquals(res.status, 404, 'no devtools route mounted in production')

        // Collection refusal (S2): a directly-wired middleware no-ops.
        const app2 = new Hono()
        app2.use('*', devtoolsMiddleware(false))
        app2.get('/prod-probe', (c) => c.text('ok'))
        collector.clear()
        await app2.request('/prod-probe')
        assert(
            !collector.getRequests().some((r) => r.path === '/prod-probe'),
            'middleware must not collect when inactive',
        )
    })
})

// --- requestId is confined to the request (MED: enterWith -> run, SC-001) -----

Deno.test('events - requestId is confined to the request via run()', async () => {
    await withEnv({ LOCKNESS_DEVTOOLS: '1' }, async () => {
        const app = new Hono()
        enableDevtools(app)
        app.get('/emit', async (c) => {
            await dispatcher().emitString('InRequestEvent', {})
            return c.text('ok')
        })

        collector.clear()
        await app.request('/emit')
        const inReq = collector.getEvents().find(
            (e: EventInfo) => e.eventName === 'InRequestEvent',
        )
        assert(inReq, 'event captured')
        assert(
            typeof inReq!.requestId === 'string',
            'correlated to the request that fired it',
        )

        // After the request, the scope is gone — an event is unattributed, not
        // wrongly tagged with the previous request's id (run() confinement).
        collector.clear()
        await dispatcher().emitString('AfterRequestEvent', {})
        const after = collector.getEvents().find(
            (e: EventInfo) => e.eventName === 'AfterRequestEvent',
        )
        assertEquals(after!.requestId, undefined, 'no stale requestId leak')
    })
})

// --- Panel rendering with zero and one record (HIGH: SC-004) ------------------

import { Events as EventsPanel } from '../ui/panels/Events.tsx'
import { Sessions as SessionsPanel } from '../ui/panels/Sessions.tsx'

/** Render a devtools panel node to an HTML string. */
async function renderPanel(node: unknown): Promise<string> {
    const app = new Hono()
    // deno-lint-ignore no-explicit-any
    app.get('/', (c) => c.html(node as any))
    return await (await app.request('/')).text()
}

Deno.test('Events panel - empty state and a populated row (SC-004)', async () => {
    const empty = await renderPanel(EventsPanel({ data: { events: [] } }))
    assertStringIncludes(empty, 'No events dispatched yet.')

    const one = await renderPanel(
        EventsPanel({
            data: {
                events: [{
                    eventName: 'UserRegistered',
                    listenerCount: 2,
                    timestamp: Date.now(),
                    requestId: 'r1',
                }],
            },
        }),
    )
    assertStringIncludes(one, 'UserRegistered')
})

Deno.test('Sessions panel - empty state and a redacted value (SC-004/S3)', async () => {
    const empty = await renderPanel(SessionsPanel({ data: { sessions: [] } }))
    assertStringIncludes(empty, 'No session captured for this request.')

    const one = await renderPanel(
        SessionsPanel({
            data: {
                sessions: [{
                    id: 'sess-9',
                    data: { userId: 7, apiKey: REDACTED },
                    createdAt: 1,
                    updatedAt: 1,
                }],
            },
        }),
    )
    assertStringIncludes(one, 'sess-9')
    assertStringIncludes(one, REDACTED)
})
