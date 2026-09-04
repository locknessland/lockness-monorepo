import { assertStringIncludes } from '@std/assert'
import { Modal, ModalClose, ModalTrigger } from '../components/Modal/mod.tsx'

/** Render a Hono JSX node to its HTML string. */
function renderToString(component: unknown): string {
    return (component as { toString: () => string }).toString()
}

Deno.test('Modal', async (t) => {
    await t.step(
        'renders a <dialog> that self-dismisses on backdrop click',
        () => {
            const html = renderToString(<Modal id='my-modal'>Body</Modal>)
            assertStringIncludes(html, '<dialog')
            assertStringIncludes(html, 'id="my-modal"')
            assertStringIncludes(html, 'this.close()')
            assertStringIncludes(html, 'Body')
        },
    )

    await t.step(
        'native ModalTrigger wires showModal() to the target id',
        () => {
            const html = renderToString(
                <ModalTrigger targetId='my-modal'>Open</ModalTrigger>,
            )
            assertStringIncludes(html, '<button')
            assertStringIncludes(html, 'getElementById(') // id is HTML-escaped in the attr
            assertStringIncludes(html, 'my-modal')
            assertStringIncludes(html, 'showModal()')
        },
    )

    await t.step('href ModalTrigger switches to an Unpoly layer', () => {
        const html = renderToString(
            <ModalTrigger href='/modal-content'>Open</ModalTrigger>,
        )
        assertStringIncludes(html, '<a')
        assertStringIncludes(html, 'up-layer="new"')
        assertStringIncludes(html, 'href="/modal-content"')
    })

    await t.step('ModalClose closes the nearest dialog', () => {
        const html = renderToString(<ModalClose>Done</ModalClose>)
        assertStringIncludes(html, 'this.closest(') // dialog selector is HTML-escaped
        assertStringIncludes(html, '.close()')
        assertStringIncludes(html, 'Done')
    })
})
