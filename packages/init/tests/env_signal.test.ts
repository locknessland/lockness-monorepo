/**
 * The scaffolded app reads its environment through the framework (#504).
 *
 * Structural half: no stub reads `APP_ENV` or `DENO_ENV` from `Deno.env`, the
 * session config leaves `secure` to the framework, the error handlers show
 * details only under an explicit development signal, and the image sets
 * `APP_ENV`. Behavioural half: the rendered config modules agree with the
 * framework's predicates for every `APP_ENV` × `DENO_ENV` combination, and a
 * session config scaffolded with no environment yields a `Secure` cookie.
 *
 * @module @lockness/init/tests/env_signal
 */

import { assert, assertEquals } from '@std/assert'
import { walk } from '@std/fs'
import { dirname, fromFileUrl, join } from '@std/path'
import { isDevelopment, isProduction, resolveEnvName } from '@lockness/core'
import { configureSession, getSessionConfig } from '@lockness/session'

const PACKAGES = join(dirname(fromFileUrl(import.meta.url)), '..', '..')
const INIT_STUBS = join(PACKAGES, 'init', 'stubs')
const CLI_STUBS = join(PACKAGES, 'cli', 'stubs')
const CONFIG = join(INIT_STUBS, 'init', 'config')

const ERROR_HANDLERS = [
    join(INIT_STUBS, 'optional', 'errors', 'error_handler.tsx.stub'),
    join(CLI_STUBS, 'make', 'error_handler.stub'),
    join(
        INIT_STUBS,
        'kits',
        'slim',
        'app',
        'view',
        'pages',
        'errors',
        'error_handler.tsx.stub',
    ),
]

/** Every stub file under the init and cli stub trees. */
async function allStubs(): Promise<string[]> {
    const files: string[] = []
    for (const root of [INIT_STUBS, CLI_STUBS]) {
        for await (const entry of walk(root, { includeDirs: false })) {
            files.push(entry.path)
        }
    }
    return files
}

Deno.test('no stub reads APP_ENV or DENO_ENV from Deno.env', async () => {
    const raw = /Deno\.env\.get\(\s*['"`](APP_ENV|DENO_ENV)['"`]/
    for (const file of await allStubs()) {
        const text = await Deno.readTextFile(file)
        assert(!raw.test(text), `${file} reads the environment by hand`)
    }
})

Deno.test('no stub sets or names DENO_ENV', async () => {
    for (const file of await allStubs()) {
        const text = await Deno.readTextFile(file)
        assert(!text.includes('DENO_ENV'), `${file} still names DENO_ENV`)
    }
})

Deno.test('the session config leaves secure to the framework default', async () => {
    const text = await Deno.readTextFile(join(CONFIG, 'session.ts.stub'))
    assert(!/^\s*secure\s*:/m.test(text), 'session.ts.stub sets secure')
})

Deno.test('the error handlers show details only under explicit development', async () => {
    for (const file of ERROR_HANDLERS) {
        const text = await Deno.readTextFile(file)
        assert(
            text.includes('const showDetails = isExplicitlyDevelopment()'),
            file,
        )
    }
})

Deno.test('the generated image sets APP_ENV=production', async () => {
    const text = await Deno.readTextFile(
        join(INIT_STUBS, 'init', 'Dockerfile.stub'),
    )
    assert(/^ENV APP_ENV=production$/m.test(text))
})

/** Copy the config stubs into a temp dir as `.ts` files, rendered. */
async function renderConfig(): Promise<string> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness_env_signal_' })
    for (const name of ['app.ts', 'session.ts']) {
        const text = await Deno.readTextFile(join(CONFIG, `${name}.stub`))
        await Deno.writeTextFile(
            join(dir, name),
            text.replaceAll('{{ projectName }}', 'EnvSignal'),
        )
    }
    return dir
}

/** Run `fn` with `APP_ENV` / `DENO_ENV` set exactly as given, then restore. */
async function withEnv(
    combo: { APP_ENV?: string; DENO_ENV?: string },
    fn: () => Promise<void>,
): Promise<void> {
    const prior = {
        APP_ENV: Deno.env.get('APP_ENV'),
        DENO_ENV: Deno.env.get('DENO_ENV'),
    }
    const set = (key: string, value: string | undefined) =>
        value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value)
    set('APP_ENV', combo.APP_ENV)
    set('DENO_ENV', combo.DENO_ENV)
    try {
        await fn()
    } finally {
        set('APP_ENV', prior.APP_ENV)
        set('DENO_ENV', prior.DENO_ENV)
    }
}

let generation = 0

/** Import a rendered config module fresh, so it re-reads the environment. */
function freshImport(dir: string, name: string): Promise<{
    [key: string]: unknown
}> {
    generation++
    const url = new URL(`file://${join(dir, name)}?g=${generation}`)
    return import(url.href)
}

const VALUES = [undefined, 'production', 'development']
/** APP_ENV rows, including the spellings the framework normalises. */
const APP_ENV_ROWS = [...VALUES, ' Production', 'staging']

Deno.test('the scaffolded config agrees with the framework for every APP_ENV x DENO_ENV', async () => {
    const dir = await renderConfig()
    try {
        for (const appEnv of APP_ENV_ROWS) {
            for (const denoEnv of VALUES) {
                await withEnv(
                    { APP_ENV: appEnv, DENO_ENV: denoEnv },
                    async () => {
                        const row = `APP_ENV=${appEnv} DENO_ENV=${denoEnv}`
                        const app = await freshImport(dir, 'app.ts')
                        assertEquals(app.isProduction, isProduction(), row)
                        assertEquals(app.isDevelopment, isDevelopment(), row)
                        const config = app.appConfig as { env: string }
                        assertEquals(config.env, resolveEnvName(), row)
                    },
                )
            }
        }
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('a scaffolded session config yields a Secure cookie unless APP_ENV=development', async () => {
    const dir = await renderConfig()
    try {
        for (const appEnv of [undefined, 'production', 'staging']) {
            for (const denoEnv of VALUES) {
                await withEnv(
                    { APP_ENV: appEnv, DENO_ENV: denoEnv },
                    async () => {
                        const { sessionConfig } = await freshImport(
                            dir,
                            'session.ts',
                        )
                        configureSession(
                            sessionConfig as Parameters<
                                typeof configureSession
                            >[0],
                        )
                        assertEquals(
                            getSessionConfig().secure,
                            true,
                            `APP_ENV=${appEnv} DENO_ENV=${denoEnv}`,
                        )
                    },
                )
            }
        }
        await withEnv({ APP_ENV: 'development' }, async () => {
            const { sessionConfig } = await freshImport(dir, 'session.ts')
            configureSession(
                sessionConfig as Parameters<typeof configureSession>[0],
            )
            assertEquals(getSessionConfig().secure, false)
        })
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
