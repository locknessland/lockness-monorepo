/**
 * @fileoverview `isContained`, the one path-containment check the `make:*`
 * scaffolders of mail, features, search and i18n share (#579). It used to be
 * the same four-line function copied into each, and exported from each root.
 *
 * @module @lockness/contract/tests/fs_contained
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { isContained } from '../fs/contained.ts'

test('isContained - a file under the root is contained', () => {
    assertEquals(
        isContained('/app/mail', join('/app/mail', 'Welcome.ts')),
        true,
    )
    assertEquals(isContained('./app/mail', './app/mail/sub/Welcome.ts'), true)
})

test('isContained - the root itself is not a file inside it', () => {
    assertEquals(isContained('/app/mail', '/app/mail'), false)
})

test('isContained - a traversal or a sibling is not contained', () => {
    assertEquals(isContained('/app/mail', '/app/mail/../../etc/x'), false)
    assertEquals(isContained('/app/mail', '/app/mailer/x.ts'), false)
    assertEquals(isContained('/app/mail', '/etc/passwd'), false)
})
