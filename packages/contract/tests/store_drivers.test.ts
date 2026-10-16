/**
 * @fileoverview Store-driver names and the one "`deno-kv` needs Deno"
 * refusal (#592, plan §5 Storage).
 *
 * The refusal is decided once, in `store/deno_kv.ts`, and asked by the cache,
 * session, queue and scheduler-lock factories. On Deno it changes nothing —
 * the factories go on to build the driver exactly as before; anywhere else it
 * refuses with a message that names the subsystem and the portable driver.
 *
 * @module @lockness/contract/tests/store_drivers
 */

import { test } from 'node:test'
import {
    assertEquals,
    assertInstanceOf,
    assertStringIncludes,
    assertThrows,
} from '@std/assert'
import {
    assertDenoKvRuntime,
    DenoKvUnavailableError,
} from '../store/deno_kv.ts'
import type {
    CacheDriverName,
    QueueDriverName,
    SchedulerLockDriverName,
    SessionDriverName,
    StoreDriverName,
} from '../store/drivers.ts'

test('assertDenoKvRuntime - on Deno it returns and refuses nothing', () => {
    assertEquals(assertDenoKvRuntime('cache', () => true), undefined)
})

test('assertDenoKvRuntime - the default probe answers true on Deno', () => {
    // This suite runs on Deno today; the default must not refuse here.
    assertEquals(assertDenoKvRuntime('session'), undefined)
})

test('assertDenoKvRuntime - off Deno it refuses, naming the subsystem and sqlite', () => {
    const error = assertThrows(
        () => assertDenoKvRuntime('queue', () => false),
        DenoKvUnavailableError,
    )
    assertInstanceOf(error, Error)
    assertEquals(error.name, 'DenoKvUnavailableError')
    assertEquals(error.subsystem, 'queue')
    assertStringIncludes(error.message, "queue driver 'deno-kv' needs Deno")
    assertStringIncludes(error.message, "'sqlite'")
})

test('driver-name types - each subsystem list is built from the one store list', () => {
    const store: StoreDriverName[] = ['memory', 'deno-kv', 'redis']
    const cache: CacheDriverName[] = store
    const queue: QueueDriverName[] = store
    const session: SessionDriverName[] = ['cookie', ...store]
    const lock: SchedulerLockDriverName[] = ['deno-kv', 'redis']
    // @ts-expect-error -- `memory` cannot hold a lock across replicas
    const memoryLock: SchedulerLockDriverName = 'memory'
    // @ts-expect-error -- `cookie` is a session driver, not a store
    const cookieCache: CacheDriverName = 'cookie'
    assertEquals(
        [cache, queue, session, lock].map((list) => list.length),
        [3, 3, 4, 2],
    )
    assertEquals([memoryLock, cookieCache], ['memory', 'cookie'])
})
