/**
 * Tests for the /llms-full.txt corpus (#69, re-scoped).
 *
 * `generateFullText` is unit-tested with faked loaders (aggregation, headers,
 * source URLs, graceful skip of an unreadable section). The route is smoke-
 * tested end to end against the real loaders.
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { App, CacheServiceToken, container } from '@lockness/core'
import { cache } from '@lockness/cache'
import { LlmSectionService } from '../app/service/llm_section_service.ts'
import { DocsLoader } from '../app/service/docs_loader.ts'
import { LlmController } from '../app/controller/llm_controller.tsx'

/** A loader stub exposing only what generateFullText calls. */
interface LoaderStub {
    getAvailableLlmsSlugs(): string[]
    loadLlms(slug: string): Promise<string>
}

/** Build a LlmSectionService wired to two loader stubs. */
function serviceWith(docs: LoaderStub, ui: LoaderStub): LlmSectionService {
    const svc = new LlmSectionService()
    svc.docsLoader = docs as unknown as DocsLoader
    ;(svc as unknown as { uiDocLoader: LoaderStub }).uiDocLoader = ui
    return svc
}

Deno.test('generateFullText - inlines every section with heading and source URL', async () => {
    const svc = serviceWith(
        {
            getAvailableLlmsSlugs: () => ['routing'],
            loadLlms: () => Promise.resolve('ROUTING BODY'),
        },
        {
            getAvailableLlmsSlugs: () => ['button'],
            loadLlms: () => Promise.resolve('BUTTON BODY'),
        },
    )

    const text = await svc.generateFullText()

    assertStringIncludes(text, '# Framework Documentation')
    assertStringIncludes(text, '## routing')
    assertStringIncludes(
        text,
        'Source: https://lockness.land/docs/llms/routing.txt',
    )
    assertStringIncludes(text, 'ROUTING BODY')
    assertStringIncludes(text, '# UI Components')
    assertStringIncludes(text, '## button')
    assertStringIncludes(
        text,
        'Source: https://lockness.land/ui/llms/button.txt',
    )
    assertStringIncludes(text, 'BUTTON BODY')
})

Deno.test('generateFullText - skips an unreadable section, keeps the rest', async () => {
    const svc = serviceWith(
        {
            getAvailableLlmsSlugs: () => ['ok', 'broken'],
            loadLlms: (slug) =>
                slug === 'broken'
                    ? Promise.reject(new Error('missing file'))
                    : Promise.resolve('OK BODY'),
        },
        {
            getAvailableLlmsSlugs: () => [],
            loadLlms: () => Promise.resolve(''),
        },
    )

    const text = await svc.generateFullText()

    assertStringIncludes(text, '## ok')
    assertStringIncludes(text, 'OK BODY')
    assert(!text.includes('## broken'), 'the unreadable section is skipped')
})

Deno.test('GET /llms-full.txt - returns the corpus as plain text', async () => {
    container.set(CacheServiceToken, cache())
    const app = new App()
    await app.init({ controllers: [LlmController] })

    const res = await app.fetch(new Request('http://localhost/llms-full.txt'))

    assertEquals(res.status, 200)
    assertStringIncludes(
        res.headers.get('content-type') ?? '',
        'text/plain',
    )
    const body = await res.text()
    assertStringIncludes(body, 'Full LLM Documentation')
    assertStringIncludes(body, '# Framework Documentation')
})
