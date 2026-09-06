/**
 * @fileoverview #245 — the subscribe socket's liveness against a REAL broker.
 *
 * The fake server answers `PING` with the multi-bulk `["pong", ""]` once a
 * connection has entered subscribe mode, because that is what Redis does. This
 * file exists so that claim is checked against Redis rather than against our
 * model of it: the keepalive is now load-bearing in production, and a fake that
 * models the reply shape wrongly would prove the wrong thing everywhere else.
 *
 * Gated behind `LOCKNESS_REDIS_INTEGRATION=1` like the rest of the live suite
 * (#273). Skipped, not failed, when no broker is configured.
 *
 * @module @lockness/redis/tests/live_subscribe_liveness
 */

import { assert, assertEquals } from '@std/assert'
import { RedisClient } from '../client.ts'
import { encodeCommand, readReply, writeFrame } from '../resp.ts'
import { RedisSubscribeConnection } from '../subscriber.ts'
import {
    brokerConfig,
    LIVE_BROKER,
    preflight,
    runNamespace,
    waitFor,
} from './live_broker.ts'

Deno.test({
    name: 'live: a real broker keeps an idle subscribe socket alive (#274)',
    ignore: !LIVE_BROKER,
    fn: async () => {
        const config = brokerConfig()
        await preflight(config)
        const ns = runNamespace()
        const pattern = `${ns}:*`

        // Real cadences, scaled down. The window is what a live broker's RTT and
        // scheduling have to fit inside, so it is deliberately not sub-100ms
        // here the way the fake-server tests can afford to be.
        const sub = new RedisSubscribeConnection({
            ...config,
            keepaliveMs: 150,
            livenessMs: 450,
        })
        const publisher = new RedisClient(config)
        const got: string[] = []
        let reconnects = 0
        const warnings: string[] = []
        const realWarn = console.warn
        console.warn = (...args: unknown[]) => {
            warnings.push(args.map((a) => String(a)).join(' '))
        }
        try {
            // The reconnect seam is the honest witness here. A first draft of
            // this test asserted only that a publish still arrived after the
            // silence — and it PASSED with the keepalive removed, because the
            // socket simply re-dialled six times and was subscribed again by the
            // time the publish landed. Delivery survives churn; that is what
            // made the defect invisible for so long. What must be asserted is
            // the ABSENCE of churn.
            sub.onReconnect(() => void reconnects++)
            sub.psubscribe(pattern, (_topic, payload) => void got.push(payload))
            // Let the subscription land before the silence starts.
            await new Promise((r) => setTimeout(r, 300))

            // Six liveness windows of real silence against a real broker.
            await new Promise((r) => setTimeout(r, 450 * 6))

            assertEquals(
                reconnects,
                0,
                'the socket never faulted — a real broker answered the ' +
                    'keepalive inside every window',
            )
            assert(
                !warnings.some((m) => m.includes('read fault')),
                `no wire fault was reported, yet the log says: ${
                    warnings.join(' | ')
                }`,
            )

            await publisher.command('PUBLISH', `${ns}:room`, 'still-here')
            await waitFor(
                () => got.length === 1,
                'the socket that idled through six liveness windows still delivers',
            )
            assertEquals(got, ['still-here'])
            assertEquals(
                reconnects,
                0,
                'and still had not reconnected by the time it delivered',
            )
        } finally {
            console.warn = realWarn
            await sub.close()
            await publisher.close()
        }
    },
})

Deno.test({
    name: 'live: real Redis answers PING in subscribe mode with ["pong", ""]',
    ignore: !LIVE_BROKER,
    fn: async () => {
        // The claim `fake_server.ts` makes, checked against the thing it models.
        // The idle test above cannot make it: it asserts the socket survives,
        // which holds for ANY reply shape the dispatcher ignores. So the fake's
        // model was asserted nowhere, in a file whose stated purpose was to
        // assert it.
        const config = brokerConfig()
        await preflight(config)
        const ns = runNamespace()

        const conn = await Deno.connect({
            hostname: config.hostname,
            port: config.port ?? 6379,
        })
        try {
            await writeFrame(conn, encodeCommand(['PSUBSCRIBE', `${ns}:*`]))
            const confirmation = await readReply(conn, 5_000)
            assertEquals(confirmation.type, 'array')

            await writeFrame(conn, encodeCommand(['PING']))
            const pong = await readReply(conn, 5_000)

            // NOT the `+PONG` simple string a command-mode connection gets.
            assertEquals(
                pong.type,
                'array',
                'in subscribe mode Redis answers PING with a multi-bulk, not ' +
                    'the +PONG simple string — if this ever becomes `simple`, ' +
                    "the fake's model is right and this comment is wrong",
            )
            if (pong.type !== 'array') return
            assertEquals(pong.value.length, 2)
            assertEquals(pong.value[0], { type: 'bulk', value: 'pong' })
            assertEquals(pong.value[1], { type: 'bulk', value: '' })

            // The shape `#dispatch` filters on: a 4-element array is a pmessage,
            // anything else is ignored. Two elements is why a pong is inert.
            assert(
                pong.value.length !== 4,
                'a pong can never be mistaken for a pmessage',
            )
        } finally {
            conn.close()
        }
    },
})
