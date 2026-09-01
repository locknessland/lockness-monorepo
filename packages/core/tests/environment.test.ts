/**
 * Tests for the consolidated environment-name resolution (#144).
 *
 * Every converted site must honour BOTH `DENO_ENV` (first) and `APP_ENV`
 * (second), default to `development`, never throw without `--allow-env`, and
 * fail closed for the error-detail gates.
 *
 * @module @lockness/core/tests/environment
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { Hono } from 'hono'
import { isDevelopment, isProduction, resolveEnvName } from '../environment.ts'
import { App } from '../app.ts'
import { formatErrorForConsole } from '../exceptions/formatter.ts'
import { defaultErrorHandler } from '../exceptions/default_view.tsx'

/** Snapshot both env names, run `fn` under a chosen combo, then restore. */
function withEnv(
    combo: { DENO_ENV?: string; APP_ENV?: string },
    fn: () => void | Promise<void>,
): void | Promise<void> {
    const prevDeno = Deno.env.get('DENO_ENV')
    const prevApp = Deno.env.get('APP_ENV')
    const set = (k: string, v?: string) =>
        v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v)
    const restore = () => {
        set('DENO_ENV', prevDeno)
        set('APP_ENV', prevApp)
    }
    set('DENO_ENV', combo.DENO_ENV)
    set('APP_ENV', combo.APP_ENV)
    try {
        const out = fn()
        if (out instanceof Promise) return out.finally(restore)
        restore()
    } catch (e) {
        restore()
        throw e
    }
}

// --- resolveEnvName: the four combinations -------------------------------

Deno.test('resolveEnvName - DENO_ENV alone is honoured', () => {
    withEnv({ DENO_ENV: 'production' }, () => {
        assertEquals(resolveEnvName(), 'production')
    })
})

Deno.test('resolveEnvName - APP_ENV alone is honoured', () => {
    withEnv({ APP_ENV: 'production' }, () => {
        assertEquals(resolveEnvName(), 'production')
    })
})

Deno.test('resolveEnvName - DENO_ENV wins when both are set', () => {
    withEnv({ DENO_ENV: 'production', APP_ENV: 'development' }, () => {
        assertEquals(resolveEnvName(), 'production')
    })
})

Deno.test('resolveEnvName - neither set defaults to development', () => {
    withEnv({}, () => {
        assertEquals(resolveEnvName(), 'development')
    })
})

Deno.test('isProduction / isDevelopment are built on resolveEnvName', () => {
    withEnv({ DENO_ENV: 'production' }, () => {
        assert(isProduction())
        assert(!isDevelopment())
    })
    withEnv({ APP_ENV: 'development' }, () => {
        assert(!isProduction())
        assert(isDevelopment())
    })
    withEnv({}, () => {
        // Absence is never production — fail closed.
        assert(!isProduction())
        assert(isDevelopment())
    })
})

// --- NotCapable safety: never throws without --allow-env ------------------

Deno.test('resolveEnvName - a NotCapable read resolves to development, never throws', () => {
    // deno-lint-ignore no-explicit-any
    const envAny = Deno.env as any
    const original = envAny.get
    try {
        envAny.get = () => {
            throw new Deno.errors.NotCapable('Requires env access')
        }
        assertEquals(resolveEnvName(), 'development')
        assert(!isProduction(), 'a throwing read must never read as production')
    } finally {
        envAny.get = original
    }
})

// --- App getters (sites 1 & 2) -------------------------------------------

Deno.test('App.isProduction / isDevelopment reflect the resolved env', () => {
    const app = new App()
    withEnv({ DENO_ENV: 'production' }, () => {
        // DENO_ENV alone now flips App.isProduction (was blind to it pre-#144).
        assert(app.isProduction)
        assert(!app.isDevelopment)
    })
    withEnv({ APP_ENV: 'development' }, () => {
        assert(app.isDevelopment)
        assert(!app.isProduction)
    })
    withEnv({}, () => {
        assert(app.isDevelopment)
        assert(!app.isProduction)
    })
})

// --- formatter fail-closed (site 3) --------------------------------------

Deno.test('formatErrorForConsole - production hides the verbose stack dump (site 3)', () => {
    const logs: string[] = []
    const errs: string[] = []
    const origLog = console.log
    const origErr = console.error
    console.log = (...a: unknown[]) => void logs.push(a.join(' '))
    console.error = (...a: unknown[]) => void errs.push(a.join(' '))
    try {
        const err = new Error('BOOM-SECRET')
        // DENO_ENV=production, APP_ENV unset — the fail-closed combo.
        withEnv({ DENO_ENV: 'production' }, () => {
            formatErrorForConsole(err, 500, '/x')
        })
        assert(
            !logs.some((l) => l.includes('❌ 500 Error')),
            'no verbose dev error block in production',
        )
        assert(
            errs.some((l) => l.includes('Error:')),
            'production logs the error plainly instead',
        )
        // And in development the verbose block DOES appear (falsifiable).
        logs.length = 0
        withEnv({ APP_ENV: 'development' }, () => {
            formatErrorForConsole(err, 500, '/x')
        })
        assert(
            logs.some((l) => l.includes('❌ 500 Error')),
            'development shows the verbose block',
        )
    } finally {
        console.log = origLog
        console.error = origErr
    }
})

// --- default_view fail-closed (site 4) -----------------------------------

async function bodyForEnv(
    combo: { DENO_ENV?: string; APP_ENV?: string },
): Promise<string> {
    const app = new Hono()
    app.get('/boom', () => {
        throw new Error('STACK-MARKER-SHOULD-NOT-LEAK')
    })
    app.onError((e, c) => defaultErrorHandler(e as Error, c))
    let body = ''
    await withEnv(combo, async () => {
        const res = await app.request('/boom')
        assertEquals(res.status, 500)
        body = await res.text()
    })
    return body
}

Deno.test('defaultErrorHandler - production 500 leaks no stack detail (site 4)', async () => {
    const prod = await bodyForEnv({ DENO_ENV: 'production' })
    assert(
        !prod.includes('STACK-MARKER-SHOULD-NOT-LEAK'),
        'production must not expose the error detail',
    )

    // Falsifiable the other way: development DOES surface the detail.
    const dev = await bodyForEnv({ APP_ENV: 'development' })
    assertStringIncludes(dev, 'STACK-MARKER-SHOULD-NOT-LEAK')
})
