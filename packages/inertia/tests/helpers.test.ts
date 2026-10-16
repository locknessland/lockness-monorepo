import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import {
    defaultRootView,
    escapeHtml,
    serializePageForHtml,
} from '../helpers.ts'

test('escapeHtml - escapes < and >', () => {
    assertEquals(escapeHtml('<script>'), '&lt;script&gt;')
})

test('escapeHtml - escapes quotes', () => {
    assertEquals(escapeHtml('"test"'), '&quot;test&quot;')
    assertEquals(escapeHtml("'test'"), '&#039;test&#039;')
})

test('escapeHtml - escapes ampersand', () => {
    assertEquals(escapeHtml('a & b'), 'a &amp; b')
})

test('serializePageForHtml - produces safe JSON', () => {
    const page = {
        component: 'Test',
        props: { message: '<script>alert("xss")</script>' },
        url: '/test',
        version: '1.0',
    }
    const result = serializePageForHtml(page)
    assertEquals(result.includes('<script>'), false)
    assertEquals(result.includes('&lt;script&gt;'), true)
})

test('defaultRootView - returns valid HTML', () => {
    const page = {
        component: 'Test',
        props: { errors: {} },
        url: '/test',
        version: '1.0',
    }
    const html = defaultRootView(page)
    assertEquals(html.includes('<!DOCTYPE html>'), true)
    assertEquals(html.includes('data-page='), true)
    assertEquals(html.includes('id="app"'), true)
})
