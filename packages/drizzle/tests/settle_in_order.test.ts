/**
 * @fileoverview #447 — `settleInOrder`, the release helper the default
 * maintenance opener closes through and #573 wires into the handlers: every
 * step runs, the first failure is thrown as itself, and every later one is
 * logged at WARN, never dropped.
 *
 * @module @lockness/drizzle/tests/settle_in_order
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert'
import { rejectAfter, settleInOrder } from '../settle_in_order.ts'
import { RefusedError } from '../refusal.ts'

/** Capture every `console.warn` line `fn` writes, and what it rejected with. */
async function warnings(fn: () => Promise<void>): Promise<{
    readonly lines: string[]
    readonly error: unknown
}> {
    const lines: string[] = []
    const { warn } = console
    console.warn = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
        await fn()
        return { lines, error: undefined }
    } catch (error) {
        return { lines, error }
    } finally {
        console.warn = warn
    }
}

/** A step that records its name, and fails with `error` when given one. */
function step(ran: string[], what: string, error?: unknown) {
    return {
        what,
        run: () => {
            ran.push(what)
            return error === undefined
                ? Promise.resolve()
                : Promise.reject(error)
        },
    }
}

Deno.test('#447 settleInOrder runs every step in order and resolves when none fails', async () => {
    const ran: string[] = []

    const { lines, error } = await warnings(() =>
        settleInOrder([step(ran, 'a'), step(ran, 'b'), step(ran, 'c')])
    )

    assertEquals(error, undefined)
    assertEquals(ran, ['a', 'b', 'c'])
    assertEquals(lines, [])
})

Deno.test('#447 settleInOrder runs the later steps after a failure and throws the first failure as itself', async () => {
    const ran: string[] = []
    const first = new RefusedError('the first')

    const { lines, error } = await warnings(() =>
        settleInOrder([
            step(ran, 'refuse', first),
            step(ran, 'close the connection'),
            step(ran, 'close the database'),
        ])
    )

    assertStrictEquals(error, first)
    assertEquals(ran, ['refuse', 'close the connection', 'close the database'])
    assertEquals(lines, [])
})

Deno.test('#447 settleInOrder logs every later failure at WARN, rendered, never in place of the first', async () => {
    const ran: string[] = []
    const first = new Error('connection close failed')

    const { lines, error } = await warnings(() =>
        settleInOrder([
            step(ran, 'close the connection', first),
            step(ran, 'close the database', new Error('database close failed')),
            step(ran, 'close the pool', new TypeError('pool close failed')),
        ])
    )

    assertStrictEquals(error, first)
    assertEquals(lines, [
        '⚠️  Could not close the database either: Error: database close failed',
        '⚠️  Could not close the pool either: TypeError: pool close failed',
    ])
})

Deno.test('#447 settleInOrder renders a later failure head-only, without its cause', async () => {
    const { lines } = await warnings(async () => {
        await assertRejects(() =>
            settleInOrder([
                step([], 'one', new Error('first')),
                step(
                    [],
                    'close the database',
                    new Error('outer', { cause: new Error('inner detail') }),
                ),
            ])
        )
    })

    assertEquals(lines.length, 1)
    assert(lines[0].includes('outer'))
    assertEquals(lines[0].includes('inner detail'), false)
})

Deno.test('#447 rejectAfter runs the release steps, then throws the given failure, logging a release failure', async () => {
    const ran: string[] = []
    const failure = new RefusedError('refused first')

    const { lines, error } = await warnings(() =>
        rejectAfter(failure, [
            step(ran, 'close the connection', new Error('close failed')),
            step(ran, 'close the database'),
        ])
    )

    assertStrictEquals(error, failure)
    assertEquals(ran, ['close the connection', 'close the database'])
    assertEquals(lines, [
        '⚠️  Could not close the connection either: Error: close failed',
    ])
})
