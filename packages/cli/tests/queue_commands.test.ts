/**
 * Tests for env-based queue driver configuration (#270).
 *
 * `resolveQueueConfigFromEnv` is the pure unit the `queue:*` commands share to
 * turn `QUEUE_DRIVER` + the `REDIS_*` connection variables into a
 * `Partial<QueueConfig>`. It is exercised with an injected env reader (no global
 * mutation) for the driver-selection and redis-wiring branches and the
 * missing/invalid-connection error path; one integration case sets real
 * `Deno.env` variables (saved and restored) and drives them through
 * `configureQueue` to prove the resolved config flows into the queue system.
 *
 * @module @lockness/cli/tests/queue_commands
 */

import { assertEquals, assertThrows } from '@std/assert'
import { configureQueue, getQueueConfig } from '@lockness/queue'
import {
    RedisQueueConfigError,
    resolveQueueConfigFromEnv,
} from '../commands/queue_commands.ts'

/** Build an env reader over a fixed map, mirroring `Deno.env.get`. */
function readerFrom(
    map: Record<string, string>,
): (key: string) => string | undefined {
    return (key) => map[key]
}

Deno.test('resolveQueueConfigFromEnv - defaults to memory when QUEUE_DRIVER unset', () => {
    assertEquals(resolveQueueConfigFromEnv(readerFrom({})), {
        driver: 'memory',
    })
})

Deno.test('resolveQueueConfigFromEnv - selects deno-kv', () => {
    assertEquals(
        resolveQueueConfigFromEnv(readerFrom({ QUEUE_DRIVER: 'deno-kv' })),
        { driver: 'deno-kv' },
    )
})

Deno.test('resolveQueueConfigFromEnv - unknown driver falls back to memory', () => {
    assertEquals(
        resolveQueueConfigFromEnv(readerFrom({ QUEUE_DRIVER: 'bogus' })),
        { driver: 'memory' },
    )
})

Deno.test('resolveQueueConfigFromEnv - redis reads full connection block', () => {
    const config = resolveQueueConfigFromEnv(
        readerFrom({
            QUEUE_DRIVER: 'redis',
            REDIS_HOST: 'redis.internal',
            REDIS_PORT: '6380',
            REDIS_DB: '3',
            REDIS_PASSWORD: 'secret',
            REDIS_TLS: 'true',
        }),
    )
    assertEquals(config, {
        driver: 'redis',
        redis: {
            hostname: 'redis.internal',
            port: 6380,
            db: 3,
            password: 'secret',
            tls: true,
        },
    })
})

Deno.test('resolveQueueConfigFromEnv - redis with only REDIS_HOST omits optional fields', () => {
    const config = resolveQueueConfigFromEnv(
        readerFrom({ QUEUE_DRIVER: 'redis', REDIS_HOST: 'localhost' }),
    )
    assertEquals(config, { driver: 'redis', redis: { hostname: 'localhost' } })
})

Deno.test('resolveQueueConfigFromEnv - redis without REDIS_HOST throws a clear typed error', () => {
    const err = assertThrows(
        () => resolveQueueConfigFromEnv(readerFrom({ QUEUE_DRIVER: 'redis' })),
        RedisQueueConfigError,
        'REDIS_HOST',
    )
    // The message names the missing variable, not a stack-y internal crash.
    assertEquals(err instanceof RedisQueueConfigError, true)
})

Deno.test('resolveQueueConfigFromEnv - redis with a non-numeric REDIS_PORT throws', () => {
    assertThrows(
        () =>
            resolveQueueConfigFromEnv(
                readerFrom({
                    QUEUE_DRIVER: 'redis',
                    REDIS_HOST: 'localhost',
                    REDIS_PORT: 'not-a-port',
                }),
            ),
        RedisQueueConfigError,
        'REDIS_PORT',
    )
})

Deno.test('resolveQueueConfigFromEnv - redis with a non-numeric REDIS_DB throws', () => {
    assertThrows(
        () =>
            resolveQueueConfigFromEnv(
                readerFrom({
                    QUEUE_DRIVER: 'redis',
                    REDIS_HOST: 'localhost',
                    REDIS_DB: 'nope',
                }),
            ),
        RedisQueueConfigError,
        'REDIS_DB',
    )
})

Deno.test('resolveQueueConfigFromEnv - REDIS_TLS accepts true/1 and false/0', () => {
    const on = ['true', 'TRUE', '1']
    const off = ['false', 'FALSE', '0']
    for (const v of on) {
        const c = resolveQueueConfigFromEnv(
            readerFrom({
                QUEUE_DRIVER: 'redis',
                REDIS_HOST: 'h',
                REDIS_TLS: v,
            }),
        )
        assertEquals(c.redis?.tls, true, `expected ${v} -> true`)
    }
    for (const v of off) {
        const c = resolveQueueConfigFromEnv(
            readerFrom({
                QUEUE_DRIVER: 'redis',
                REDIS_HOST: 'h',
                REDIS_TLS: v,
            }),
        )
        assertEquals(c.redis?.tls, false, `expected ${v} -> false`)
    }
})

Deno.test('resolveQueueConfigFromEnv - reads real Deno.env and flows into configureQueue', () => {
    const keys = [
        'QUEUE_DRIVER',
        'REDIS_HOST',
        'REDIS_PORT',
        'REDIS_DB',
        'REDIS_PASSWORD',
        'REDIS_TLS',
    ]
    const saved = new Map(keys.map((k) => [k, Deno.env.get(k)]))
    try {
        Deno.env.set('QUEUE_DRIVER', 'redis')
        Deno.env.set('REDIS_HOST', 'queue.example')
        Deno.env.set('REDIS_PORT', '6379')
        Deno.env.delete('REDIS_DB')
        Deno.env.delete('REDIS_PASSWORD')
        Deno.env.delete('REDIS_TLS')

        configureQueue(resolveQueueConfigFromEnv())

        const config = getQueueConfig()
        assertEquals(config.driver, 'redis')
        assertEquals(config.redis?.hostname, 'queue.example')
        assertEquals(config.redis?.port, 6379)
    } finally {
        // Restore env and reset the process-global queue config to memory.
        for (const [k, v] of saved) {
            if (v === undefined) Deno.env.delete(k)
            else Deno.env.set(k, v)
        }
        configureQueue({ driver: 'memory', redis: undefined })
    }
})
