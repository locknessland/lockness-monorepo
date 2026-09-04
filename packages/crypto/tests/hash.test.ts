/**
 * @fileoverview Tests for `Hash` — make/check, random salt, needsRehash (SC-002).
 *
 * @module @lockness/crypto/tests/hash
 */

import { assert, assertEquals } from '@std/assert'
import { Hash } from '../mod.ts'

Deno.test('SC-002: check(v, make(v)) is true; wrong value is false', async () => {
    const hash = await Hash.make('correct horse battery staple')
    assertEquals(await Hash.check('correct horse battery staple', hash), true)
    assertEquals(await Hash.check('wrong', hash), false)
})

Deno.test('make uses a random per-hash salt (two hashes of the same input differ)', async () => {
    const a = await Hash.make('same')
    const b = await Hash.make('same')
    assert(a !== b, 'hashes must differ (random salt)')
    assertEquals(await Hash.check('same', a), true)
    assertEquals(await Hash.check('same', b), true)
})

Deno.test('output is self-describing (pbkdf2$SHA-256$600000$...) and needsRehash tracks it', async () => {
    const hash = await Hash.make('x')
    assert(hash.startsWith('pbkdf2$SHA-256$600000$'), hash)
    assertEquals(Hash.needsRehash(hash), false)
    assertEquals(Hash.needsRehash('pbkdf2$SHA-256$1000$aaaa$bbbb'), true) // low iters
    assertEquals(Hash.needsRehash('garbage'), true)
})

Deno.test('check rejects a malformed stored hash without throwing', async () => {
    assertEquals(await Hash.check('x', 'not-a-hash'), false)
    assertEquals(await Hash.check('x', 'pbkdf2$MD5$1$a$b'), false) // wrong algo
})
