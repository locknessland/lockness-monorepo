/**
 * @fileoverview #450 — the one classifier of "this failure is the machine
 * being offline", shared by every suite that skips on it.
 *
 * @module
 */

import { assertEquals } from '@std/assert'
import { isOffline } from './offline.ts'

Deno.test('#450 isOffline: recognises a registry the machine cannot reach', () => {
    for (
        const output of [
            'error: error sending request for url (https://registry.npmjs.org/drizzle-kit)',
            'TypeError: Failed to fetch',
            'dns error: failed to lookup address information',
            'tcp connect error: Network is unreachable (os error 51)',
            'Import failed: os error 65',
            'error trying to connect: tls handshake eof',
        ]
    ) assertEquals(isOffline(output), true, output)
})

Deno.test('#450 isOffline: any other failure is not offline', () => {
    assertEquals(isOffline('error: Uncaught TypeError: x is undefined'), false)
    assertEquals(isOffline(''), false)
})

Deno.test('#450 isOffline: a refused connection counts only when asked', () => {
    // A suite that points its app at a closed loopback port expects a refusal
    // to mean a real fault, so the default must not swallow it.
    for (
        const output of [
            'Connection refused (os error 61)',
            'connection refused (os error 111)',
        ]
    ) {
        assertEquals(isOffline(output), false, output)
        assertEquals(isOffline(output, { refused: true }), true, output)
    }
})

Deno.test('#450 isOffline: a refusal inside a failed fetch is offline regardless', () => {
    // `refused` gates only a BARE refusal. Deno's HTTP client wraps one in
    // "error sending request … tcp connect error", which is a registry the
    // machine cannot reach whatever the option says.
    const output =
        'error: error sending request for url (https://registry.npmjs.org/vite): client error (Connect): tcp connect error: Connection refused (os error 61)'
    assertEquals(isOffline(output), true)
    assertEquals(isOffline(output, { refused: true }), true)
})
