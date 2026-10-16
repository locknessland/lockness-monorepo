/**
 * Tests for Auth System
 */

import { test } from 'node:test'
import { assertEquals, assertExists } from '@std/assert'
import { hashPassword, verifyPassword } from '@lockness/auth'

test('auth system', async (t) => {
    await t.test('hashPassword returns a hash', async () => {
        const hash = await hashPassword('mypassword123')

        assertExists(hash)
        assertEquals(typeof hash, 'string')
        assertEquals(hash !== 'mypassword123', true)
    })

    await t.test('hashPassword creates unique hashes', async () => {
        const hash1 = await hashPassword('password')
        const hash2 = await hashPassword('password')

        assertEquals(hash1 !== hash2, true)
    })

    await t.test('verifyPassword validates correct password', async () => {
        const password = 'correctPassword123!'
        const hash = await hashPassword(password)

        const isValid = await verifyPassword(password, hash)
        assertEquals(isValid, true)
    })

    await t.test('verifyPassword rejects incorrect password', async () => {
        const hash = await hashPassword('correctPassword')

        const isValid = await verifyPassword('wrongPassword', hash)
        assertEquals(isValid, false)
    })

    await t.test('hashPassword handles special characters', async () => {
        const password = 'p@$$w0rd!#$%^&*()éàü中文'
        const hash = await hashPassword(password)

        const isValid = await verifyPassword(password, hash)
        assertEquals(isValid, true)
    })

    await t.test('hashPassword handles empty string', async () => {
        const hash = await hashPassword('')

        assertExists(hash)
        const isValid = await verifyPassword('', hash)
        assertEquals(isValid, true)
    })

    await t.test('hashPassword handles long passwords', async () => {
        const longPassword = 'a'.repeat(1000)
        const hash = await hashPassword(longPassword)

        const isValid = await verifyPassword(longPassword, hash)
        assertEquals(isValid, true)
    })
})
