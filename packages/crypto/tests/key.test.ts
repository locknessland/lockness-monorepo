/**
 * @fileoverview Tests for `resolveAppKey` fail-closed behaviour (security S3/S6/
 * SC-006): a valid override resolves; a placeholder/degenerate override is
 * rejected (the reject path holds regardless of environment); and an
 * **explicit** development environment yields a stable per-process ephemeral
 * key when `APP_KEY` is unset (the only case that earns the fallback).
 *
 * @module @lockness/crypto/tests/key
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import { generateAppKey, KeyMaterialError, resolveAppKey } from '../mod.ts'
import { HKDF_INFO } from '../key.ts'

Deno.test('a valid explicit key resolves to 32 bytes', () => {
    assertEquals(resolveAppKey(generateAppKey()).byteLength, 32)
})

Deno.test('SC-006: a known-placeholder key is rejected (non-dev env fails closed)', () => {
    // Pin a non-development environment so the ephemeral fallback is NOT taken;
    // restore afterwards so no other test is affected.
    const priorApp = Deno.env.get('APP_ENV')
    const priorDeno = Deno.env.get('DENO_ENV')
    Deno.env.set('APP_ENV', 'production')
    Deno.env.delete('DENO_ENV')
    try {
        const err = assertThrows(
            () => resolveAppKey('change-me-in-production'),
            KeyMaterialError,
        ) as KeyMaterialError
        assertEquals(err.reason, 'known-placeholder')
    } finally {
        if (priorApp === undefined) Deno.env.delete('APP_ENV')
        else Deno.env.set('APP_ENV', priorApp)
        if (priorDeno !== undefined) Deno.env.set('DENO_ENV', priorDeno)
    }
})

Deno.test('an explicit development env yields a stable 32-byte ephemeral key when APP_KEY is unset', () => {
    // Exercise the ephemeral dev-key branch: no APP_KEY set, environment
    // EXPLICITLY development. Save/restore all three env vars so no leaked
    // state reaches sibling tests.
    const priorKey = Deno.env.get('APP_KEY')
    const priorApp = Deno.env.get('APP_ENV')
    const priorDeno = Deno.env.get('DENO_ENV')
    Deno.env.delete('APP_KEY')
    Deno.env.delete('DENO_ENV')
    Deno.env.set('APP_ENV', 'development')
    try {
        const key = resolveAppKey()
        assertEquals(key.byteLength, 32) // 32 usable key bytes
        // The ephemeral key is per-process and stable — a key that changed per
        // call would make already-encrypted data undecryptable within the run.
        assertEquals([...resolveAppKey()], [...key])
    } finally {
        if (priorKey === undefined) Deno.env.delete('APP_KEY')
        else Deno.env.set('APP_KEY', priorKey)
        if (priorApp === undefined) Deno.env.delete('APP_ENV')
        else Deno.env.set('APP_ENV', priorApp)
        if (priorDeno === undefined) Deno.env.delete('DENO_ENV')
        else Deno.env.set('DENO_ENV', priorDeno)
    }
})

Deno.test('the HKDF info labels are distinct and not the session cookie label', () => {
    const labels = [HKDF_INFO.crypt as string, HKDF_INFO.sign as string]
    assertEquals(new Set(labels).size, labels.length) // no duplicates
    assert(!labels.includes('lockness/session/cookie/v1'))
})
