/**
 * The scaffolded docs controller imports no app file itself (#483).
 *
 * `install.ts` copies `stubs/api_docs_controller.stub` into a user app, where
 * nothing lints it. Its own `` import(`file://${Deno.cwd()}/${path}`) `` read a
 * `#` in the app path as a fragment, and a `try` around the scan swallowed the
 * failure, so the document silently lost controllers. Discovery now belongs to
 * `loadDocumentedControllers`, which `tests/discovery.test.ts` covers; this
 * test pins that the stub delegates to it.
 *
 * @module @lockness/openapi/tests/api_docs_controller_stub
 */

import { assert, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { Stub } from '@lockness/cli'

/** The stub directory `install.ts` renders from. */
const STUBS_DIR = join(dirname(fromFileUrl(import.meta.url)), '..', 'stubs')

Deno.test('api_docs_controller stub - imports no app file and delegates discovery', async () => {
    const rendered = await Stub.renderFrom(
        STUBS_DIR,
        '',
        'api_docs_controller',
        {
            title: 'Lockness API',
            version: '1.0.0',
            description: 'Docs',
        },
    )

    assert(
        !rendered.includes('import('),
        'the rendered stub must not import files itself',
    )
    assertStringIncludes(rendered, 'loadDocumentedControllers()')
    assert(
        !rendered.includes('catch'),
        'the rendered stub must not swallow a discovery failure',
    )
    assertStringIncludes(rendered, '!== ApiDocsController')
})
