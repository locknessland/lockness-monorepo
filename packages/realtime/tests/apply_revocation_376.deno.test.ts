/**
 * @fileoverview #376 — the CONTROL row of `apply_revocation_376.test.ts`.
 *
 * Without it, every `escaped` assertion in that file could pass because the
 * `unhandledrejection` listener never fires, not because nothing escaped.
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name** (#590). The row lets
 * a rejection escape on purpose. `node:test` under Deno fails the running test
 * on it through an internal hook no listener can intercept, so the row cannot
 * run there — and under `node:test` a witness's escape already fails its row by
 * name, which is the guarantee this control exists to back.
 *
 * @module @lockness/realtime/tests/apply_revocation_376_deno
 */

import { assertEquals } from '@std/assert'
import { settle, watchingEscapes } from './escape_watcher.ts'

Deno.test('#376 CONTROL: the watcher records a real unhandled rejection', async () => {
    await watchingEscapes(async (escaped) => {
        void Promise.reject(new Error('deliberately unhandled'))
        await settle()
        assertEquals(escaped.length, 1, 'the watcher saw the escape')
    })
})
