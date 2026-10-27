/**
 * The slim kit's JSON error handler, rendered and run (#479).
 *
 * A client error keeps its status, anything else answers 500, and the error's
 * message reaches the body only under an explicit development signal.
 *
 * @module @lockness/init/tests/slim_error_handler
 */

import { assert, assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join, toFileUrl } from '@std/path'

const STUB = join(
    dirname(fromFileUrl(import.meta.url)),
    '..',
    'stubs',
    'kits',
    'slim',
    'app',
    'view',
    'pages',
    'errors',
    'error_handler.tsx.stub',
)

/** The handler's shape, as far as these tests call it. */
type Handler = (error: Error, c: unknown) => Response

/** The JSON body the handler answers with. */
interface Body {
    readonly error: string
    readonly status: number
    readonly message?: string
}

/** Render the stub into a temp dir, import it, and hand its handler over. */
async function withHandler(run: (handler: Handler) => Promise<void>) {
    const dir = await Deno.makeTempDir({ prefix: 'lockness_slim_errors_' })
    try {
        const file = join(dir, 'error_handler.tsx')
        const text = await Deno.readTextFile(STUB)
        await Deno.writeTextFile(
            file,
            text.replaceAll('{{ projectName }}', 'SlimErrors'),
        )
        const module = await import(toFileUrl(file).href)
        await run(module.errorHandler as Handler)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

/** Call the handler with console output dropped and `APP_ENV` as given. */
async function answer(
    handler: Handler,
    error: Error,
    appEnv?: string,
): Promise<{ response: Response; body: Body }> {
    const prior = Deno.env.get('APP_ENV')
    const original = { error: console.error, log: console.log }
    console.error = console.log = () => {}
    if (appEnv === undefined) Deno.env.delete('APP_ENV')
    else Deno.env.set('APP_ENV', appEnv)
    try {
        const response = handler(error, { req: { path: '/probe' } })
        return { response, body: await response.json() as Body }
    } finally {
        if (prior === undefined) Deno.env.delete('APP_ENV')
        else Deno.env.set('APP_ENV', prior)
        Object.assign(console, original)
    }
}

/** An error carrying `status`, as framework and app errors do. */
function withStatus(message: string, status?: unknown): Error {
    return Object.assign(new Error(message), { status })
}

Deno.test('slim error handler - a 4xx keeps its status and its reason phrase', async () => {
    await withHandler(async (handler) => {
        for (
            const [status, reason] of [
                [400, 'Bad Request'],
                [404, 'Not Found'],
                [422, 'Unprocessable Content'],
                [429, 'Too Many Requests'],
                [418, 'Client Error'],
            ] as const
        ) {
            const { response, body } = await answer(
                handler,
                withStatus('nope', status),
            )
            assertEquals(response.status, status)
            assertEquals(body, { error: reason, status })
            assert(
                response.headers.get('content-type')?.includes(
                    'application/json',
                ),
            )
        }
    })
})

Deno.test('slim error handler - a 5xx, an unknown or a missing status answers 500', async () => {
    await withHandler(async (handler) => {
        for (const status of [503, 500, 700, '422', undefined]) {
            const { response, body } = await answer(
                handler,
                withStatus('boom', status),
            )
            assertEquals(response.status, 500, String(status))
            assertEquals(body, { error: 'Internal Server Error', status: 500 })
        }
    })
})

Deno.test('slim error handler - the message is shown only under explicit development', async () => {
    await withHandler(async (handler) => {
        for (const appEnv of [undefined, 'production', 'staging', '']) {
            const { body } = await answer(
                handler,
                withStatus('secret detail'),
                appEnv,
            )
            assert(!('message' in body), `APP_ENV=${appEnv}`)
        }
        const { body } = await answer(
            handler,
            withStatus('secret detail'),
            'development',
        )
        assertEquals(body.message, 'secret detail')
    })
})
