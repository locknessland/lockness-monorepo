/**
 * @fileoverview The one runtime detector (plan 274 §5, FR-002): its order
 * (Deno, then Bun, then Node), its refusals (an unknown runtime, a Bun below
 * the floor), and its memo.
 *
 * The decision is tested through {@link detectRuntime} with forged
 * `process.versions` records, so every branch runs on every lane; the live
 * rows only check that the memoised answer agrees with the process it runs in.
 *
 * @module @lockness/runtime/tests/runtime
 */

import { test } from 'node:test'
import process from 'node:process'
import {
    assertEquals,
    assertInstanceOf,
    assertStrictEquals,
    assertThrows,
} from '@std/assert'
import {
    BUN_FLOOR,
    currentRuntime,
    detectRuntime,
    runtimeProbe,
    UnsupportedRuntimeError,
} from '../runtime.ts'

test('detectRuntime - Deno wins even though it also reports a node version', () => {
    assertEquals(detectRuntime({ deno: '2.9.6', node: '26.3.0' }), 'deno')
})

test('detectRuntime - Deno is asked before Bun', () => {
    assertEquals(
        detectRuntime({ deno: '2.9.6', bun: '1.4.3', node: '24.3.0' }),
        'deno',
    )
})

test('detectRuntime - Bun wins over the node version it reports', () => {
    assertEquals(detectRuntime({ bun: '1.4.3', node: '24.3.0' }), 'bun')
})

test('detectRuntime - Node when only node is reported', () => {
    assertEquals(detectRuntime({ node: '24.22.0' }), 'node')
})

test('detectRuntime - no known runtime is refused, not guessed', () => {
    const error = assertThrows(
        () => detectRuntime({}),
        UnsupportedRuntimeError,
        'Deno, Bun or Node',
    )
    assertEquals(error.name, 'UnsupportedRuntimeError')
})

test('detectRuntime - an empty version string is not a runtime', () => {
    assertThrows(() => detectRuntime({ node: '' }), UnsupportedRuntimeError)
    assertEquals(detectRuntime({ deno: '', node: '24.0.0' }), 'node')
})

test('detectRuntime - the Bun floor is 1.4.0', () => {
    assertEquals(BUN_FLOOR, '1.4.0')
})

test('detectRuntime - Bun exactly at the floor is accepted', () => {
    assertEquals(detectRuntime({ bun: '1.4.0', node: '24.3.0' }), 'bun')
})

test('detectRuntime - Bun above the floor on any component is accepted', () => {
    assertEquals(detectRuntime({ bun: '1.4.1' }), 'bun')
    assertEquals(detectRuntime({ bun: '1.5.0' }), 'bun')
    assertEquals(detectRuntime({ bun: '2.0.0' }), 'bun')
    assertEquals(detectRuntime({ bun: '1.10.0' }), 'bun')
})

test('detectRuntime - a Bun build suffix does not hide its version', () => {
    assertEquals(detectRuntime({ bun: '1.4.0-canary.12+abc' }), 'bun')
    assertThrows(
        () => detectRuntime({ bun: '1.3.10-canary.1' }),
        UnsupportedRuntimeError,
    )
})

test('detectRuntime - Bun below the floor is refused, naming both versions', () => {
    for (const version of ['1.3.3', '1.3.10', '0.9.9', '1.3.99']) {
        const error = assertThrows(
            () => detectRuntime({ bun: version, node: '24.3.0' }),
            UnsupportedRuntimeError,
        )
        assertEquals(error.message.includes(`Bun ${version}`), true)
        assertEquals(error.message.includes('1.4.0'), true)
        assertEquals(error.message.includes('decorators'), true)
    }
})

test('detectRuntime - an unreadable Bun version is refused', () => {
    assertThrows(() => detectRuntime({ bun: 'next' }), UnsupportedRuntimeError)
})

test('currentRuntime - agrees with the process it runs in', () => {
    const expected = process.versions.deno !== undefined
        ? 'deno'
        : process.versions.bun !== undefined
        ? 'bun'
        : 'node'
    assertEquals(currentRuntime(), expected)
})

test('currentRuntime - is memoised: the same answer every call', () => {
    const first = currentRuntime()
    assertStrictEquals(currentRuntime(), first)
})

test('runtimeProbe - lazy: reads nothing until first asked', () => {
    let reads = 0
    runtimeProbe(() => {
        reads++
        return { node: '24.0.0' }
    })
    assertEquals(reads, 0)
})

test('runtimeProbe - memoised: reads the versions once', () => {
    let reads = 0
    const probe = runtimeProbe(() => {
        reads++
        return { bun: '1.4.3', node: '24.3.0' }
    })
    assertEquals(probe(), 'bun')
    assertEquals(probe(), 'bun')
    assertEquals(reads, 1)
})

test('runtimeProbe - a refusal is raised on every call, never memoised as an answer', () => {
    const probe = runtimeProbe(() => ({ bun: '1.3.3' }))
    assertThrows(probe, UnsupportedRuntimeError)
    assertThrows(probe, UnsupportedRuntimeError)
})

test('UnsupportedRuntimeError - is an Error', () => {
    assertInstanceOf(new UnsupportedRuntimeError('x'), Error)
})
