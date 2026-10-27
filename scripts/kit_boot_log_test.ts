/**
 * @fileoverview #505 — `kits:smoke` judges what a kit printed while booting,
 * and round-trips a configured cache.
 *
 * `boots()` used to discard the server's output on success, so a kit that
 * booted while printing "@lockness/cache not found - skipping cache setup"
 * passed. These pin the judge, and the cache probe's contract, without
 * scaffolding anything.
 *
 * @module
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import {
    BOOT_LOG_FAILURES,
    CACHE_PROBE_SOURCE,
    cacheRuns,
    judgeBootLog,
} from './kit_smoke.ts'

Deno.test('judgeBootLog - a clean boot passes', () => {
    const verdict = judgeBootLog(
        '✓ Scheduler started: 0 task(s) armed of 0 registered\nListening on http://localhost:8931/\n',
    )
    assertEquals(verdict.ok, true)
})

Deno.test('judgeBootLog - the old optional-package probe fails the kit', () => {
    const verdict = judgeBootLog(
        'Listening\n⚠️  @lockness/cache not found - skipping cache setup\n',
    )
    assertEquals(verdict.ok, false)
    assertStringIncludes(verdict.detail, '@lockness/cache not found')
    assertStringIncludes(verdict.detail, BOOT_LOG_FAILURES[0].reason)
})

Deno.test('judgeBootLog - a MissingOptionalPackageError refusal fails the kit', () => {
    const verdict = judgeBootLog(
        'error: Uncaught (in promise) MissingOptionalPackageError: @lockness/cache is configured but not installed\n',
    )
    assertEquals(verdict.ok, false)
    assertStringIncludes(verdict.detail, BOOT_LOG_FAILURES[1].reason)
})

Deno.test('judgeBootLog - any other warning is the app’s business', () => {
    // A judge that failed on every warning would be switched off within a
    // week; it judges the loader's lines and nothing else.
    const verdict = judgeBootLog(
        '⚠️  No APP_KEY set — using a random key for this process only.\n',
    )
    assertEquals(verdict.ok, true)
})

Deno.test('cacheRuns - memory by default, deno-kv in production on an in-memory database', () => {
    const [memory, kv] = cacheRuns()
    assertEquals(memory.driver, 'memory')
    assertEquals(kv.driver, 'deno-kv')
    assertEquals(kv.env.APP_ENV, 'production')
    assertEquals(kv.env.DATABASE_KV_PATH, ':memory:')
    assert(kv.env.APP_KEY, 'production needs a key, or a session kit refuses')
})

Deno.test('the cache probe boots the kit kernel and round-trips set/get/forget', () => {
    for (
        const needle of [
            "from './app/kernel.ts'",
            'await createApp(AppKernel)',
            'cache().set(',
            'cache().get(',
            'cache().forget(',
            'CACHE_ROUND_TRIP_OK driver=',
        ]
    ) {
        assertStringIncludes(CACHE_PROBE_SOURCE, needle)
    }
})
