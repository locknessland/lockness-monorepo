/**
 * Tests for CLI make:component command
 */

import { test } from 'node:test'
import { assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

test('make:component', async (t) => {
    await t.test('generates valid component from stub', async () => {
        const content = await Stub.render('make', 'component', {
            className: 'Button',
            propsInterface: '{ children?: any }',
        })

        assertStringIncludes(content, 'export const Button')
        assertStringIncludes(content, '{ children?: any }')
    })

    await t.test('includes props parameter', async () => {
        const content = await Stub.render('make', 'component', {
            className: 'Card',
            propsInterface: '{ title: string; children?: any }',
        })

        assertStringIncludes(content, '(props:')
        assertStringIncludes(content, 'props.children')
    })

    await t.test('includes JSX return', async () => {
        const content = await Stub.render('make', 'component', {
            className: 'Modal',
            propsInterface: '{ children?: any }',
        })

        assertStringIncludes(content, 'return (')
        assertStringIncludes(content, '<div>')
        assertStringIncludes(content, '</div>')
    })
})
