import { assertStringIncludes } from '@std/assert'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../components/Accordion/mod.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('Accordion components', async (t) => {
    await t.step('renders complete accordion', () => {
        const html = renderToString(
            <Accordion>
                <AccordionItem value='item-1'>
                    <AccordionTrigger>Question 1</AccordionTrigger>
                    <AccordionContent>Answer 1</AccordionContent>
                </AccordionItem>
                <AccordionItem value='item-2'>
                    <AccordionTrigger>Question 2</AccordionTrigger>
                    <AccordionContent>Answer 2</AccordionContent>
                </AccordionItem>
            </Accordion>,
        )
        assertStringIncludes(html, 'Question 1')
        assertStringIncludes(html, 'Answer 1')
        assertStringIncludes(html, 'Question 2')
        assertStringIncludes(html, 'Answer 2')
    })

    await t.step('AccordionItem uses details element', () => {
        const html = renderToString(
            <AccordionItem value='test'>
                <AccordionTrigger>Trigger</AccordionTrigger>
            </AccordionItem>,
        )
        assertStringIncludes(html, '<details')
        assertStringIncludes(html, 'data-value="test"')
    })

    await t.step('AccordionTrigger uses summary element', () => {
        const html = renderToString(
            <AccordionTrigger>Click me</AccordionTrigger>,
        )
        assertStringIncludes(html, '<summary')
        assertStringIncludes(html, 'Click me')
    })

    await t.step('AccordionContent renders children', () => {
        const html = renderToString(
            <AccordionContent>Content here</AccordionContent>,
        )
        assertStringIncludes(html, 'Content here')
    })
})
