/**
 * @fileoverview The `queue:*` commands through a real `Cli.dispatch` (#592).
 *
 * They moved to `@lockness/queue` and throw a local failure class there; this
 * pins that the dispatcher still reads it as a command failure: exit 1, one
 * `❌` line, no stack. `@lockness/queue` is a test-only dependency of cli.
 *
 * @module @lockness/cli/tests/queue_dispatch
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import { configureQueue, registerQueueCommands } from '@lockness/queue'
import { Cli } from '../mod.ts'
import { captureConsole, inTempDir } from './helpers.ts'

test('queue:retry with an unknown id exits 1 with one ❌ line', async () => {
    const saved = Deno.env.get('QUEUE_DRIVER')
    Deno.env.delete('QUEUE_DRIVER')
    try {
        const { result, error } = await inTempDir(() => {
            const cli = new Cli()
            registerQueueCommands(cli)
            return captureConsole(() =>
                cli.dispatch(['queue:retry', 'no-such-id'])
            )
        })

        assertEquals(result, 1)
        assertEquals(error, [['❌ No failed job with id no-such-id']])
    } finally {
        if (saved !== undefined) Deno.env.set('QUEUE_DRIVER', saved)
        configureQueue({ driver: 'memory', redis: undefined })
    }
})
