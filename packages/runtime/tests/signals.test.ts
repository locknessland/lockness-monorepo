/**
 * @fileoverview The shutdown-signal primitive (plan 274 §5, audit A12): one
 * subscription, one way to undo it, on every runtime.
 *
 * Most rows use a recording target; the last one sends a real `SIGHUP` to the
 * test process through the default target, so the `node:process` path is
 * proven on each lane that runs it (POSIX only — Windows CI is out of scope).
 *
 * @module @lockness/runtime/tests/signals
 */

import { test } from 'node:test'
import process from 'node:process'
import { assertEquals, assertThrows } from '@std/assert'
import { onSignal, type ShutdownSignal, type SignalTarget } from '../signals.ts'

/** A target that records subscriptions, and can fire them. */
function recorder(): SignalTarget & {
    listeners: Map<string, Array<() => void>>
    fire(signal: ShutdownSignal): void
} {
    const listeners = new Map<string, Array<() => void>>()
    return {
        listeners,
        on(signal, listener) {
            listeners.set(signal, [...(listeners.get(signal) ?? []), listener])
        },
        off(signal, listener) {
            listeners.set(
                signal,
                (listeners.get(signal) ?? []).filter((l) => l !== listener),
            )
        },
        fire(signal) {
            for (const listener of listeners.get(signal) ?? []) listener()
        },
    }
}

test('onSignal - subscribes the listener to that signal only', () => {
    const target = recorder()
    const seen: string[] = []
    onSignal('SIGTERM', (signal) => seen.push(signal), target)
    assertEquals(target.listeners.get('SIGTERM')?.length, 1)
    assertEquals(target.listeners.get('SIGINT'), undefined)
    target.fire('SIGINT')
    target.fire('SIGTERM')
    assertEquals(seen, ['SIGTERM'])
})

test('onSignal - the listener is told which signal fired', () => {
    const target = recorder()
    const seen: string[] = []
    onSignal('SIGINT', (signal) => seen.push(signal), target)
    onSignal('SIGHUP', (signal) => seen.push(signal), target)
    target.fire('SIGHUP')
    target.fire('SIGINT')
    assertEquals(seen, ['SIGHUP', 'SIGINT'])
})

test('onSignal - the returned function unsubscribes', () => {
    const target = recorder()
    let calls = 0
    const off = onSignal('SIGINT', () => calls++, target)
    off()
    target.fire('SIGINT')
    assertEquals(calls, 0)
    assertEquals(target.listeners.get('SIGINT'), [])
})

test('onSignal - unsubscribing twice removes once', () => {
    const target = recorder()
    let removals = 0
    const counting: SignalTarget = {
        on: target.on,
        off(signal, listener) {
            removals++
            target.off(signal, listener)
        },
    }
    const off = onSignal('SIGTERM', () => {}, counting)
    off()
    off()
    assertEquals(removals, 1)
})

test('onSignal - a platform refusal propagates, so the caller decides', () => {
    const refusing: SignalTarget = {
        on() {
            throw new TypeError("Binding to signal 'SIGTERM' is not allowed")
        },
        off() {},
    }
    assertThrows(
        () => onSignal('SIGTERM', () => {}, refusing),
        TypeError,
        'not allowed',
    )
})

test('onSignal - the default target receives a real signal', async () => {
    let off: () => void = () => {}
    const received = new Promise<string>((resolve) => {
        off = onSignal('SIGHUP', resolve)
    })
    try {
        process.kill(process.pid, 'SIGHUP')
        const timeout = new Promise<string>((_, reject) => {
            const timer = setTimeout(
                () => reject(new Error('SIGHUP not received')),
                5_000,
            )
            received.finally(() => clearTimeout(timer))
        })
        assertEquals(await Promise.race([received, timeout]), 'SIGHUP')
    } finally {
        off()
    }
})
