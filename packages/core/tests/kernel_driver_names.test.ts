/**
 * @fileoverview The kernel's driver options are the contract's driver-name
 * types (#592): the scheduler-lock union's drivers are exactly
 * `SchedulerLockDriverName`, so a driver added to one and not the other fails
 * `deno check` here.
 *
 * @module @lockness/core/tests/kernel_driver_names
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import type {
    CacheDriverName,
    SchedulerLockDriverName,
} from '@lockness/contract/store'
import type { KernelConfig } from '../kernel/kernel_decorators.ts'

/** `true` when `A` and `B` are the same union, `false` otherwise. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

type LockDrivers = NonNullable<KernelConfig['schedulerLock']>['driver']
type CacheDrivers = NonNullable<
    Exclude<KernelConfig['cache'], boolean | undefined>['driver']
>

test('kernel schedulerLock drivers are exactly SchedulerLockDriverName', () => {
    const lock: Same<LockDrivers, SchedulerLockDriverName> = true
    const cache: Same<CacheDrivers, CacheDriverName> = true
    assertEquals([lock, cache], [true, true])
})
