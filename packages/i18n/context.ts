/**
 * @fileoverview Per-request accessors + the ambient-`t()` `AsyncLocalStorage`
 * scope + the optional eager middleware.
 *
 * `getLocale(c)` / `getTranslator(c)` are the **primary API** (the `getSession(c)`
 * precedent): they resolve lazily and memoise on the context. Ambient `t()` in
 * deep JSX works only inside an ALS scope — established by the eager
 * `localeMiddleware()` or `runWithLocale()`. The **pure** `Translator`/`icu`/
 * `registry` never read ALS — the ambient scope is presentation-only (A-L1).
 *
 * @module @lockness/i18n/context
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { Context, MiddlewareHandler } from '@lockness/hono'
import type { Translator } from './translator.ts'
import { getRegistry } from './config.ts'
import { resolveLocale } from './resolver.ts'

/** The request-scoped i18n state carried through ALS. */
interface I18nScope {
    locale: string
    translator: Translator
}

const scope = new AsyncLocalStorage<I18nScope>()
const LOCALE_KEY = '__lockness_i18n_locale'
const TRANSLATOR_KEY = '__lockness_i18n_translator'

/**
 * The request's resolved locale (lazy + memoised on the context).
 *
 * @param c - The request context.
 * @returns The resolved locale.
 * @throws {Error} When i18n is not configured.
 */
export function getLocale(c: Context): string {
    const cached = c.get(LOCALE_KEY as never) as unknown
    if (typeof cached === 'string') return cached
    const locale = resolveLocale(c)
    c.set(LOCALE_KEY as never, locale as never)
    return locale
}

/**
 * The request's translator (lazy + memoised) — the primary API.
 *
 * @param c - The request context.
 * @returns A translator bound to the resolved locale.
 * @throws {Error} When i18n is not configured.
 */
export function getTranslator(c: Context): Translator {
    const cached = c.get(TRANSLATOR_KEY as never) as unknown
    if (cached) return cached as Translator
    const translator = getRegistry().translator(getLocale(c))
    c.set(TRANSLATOR_KEY as never, translator as never)
    return translator
}

/**
 * Run `fn` inside a locale scope so ambient {@link t} resolves — the test +
 * manual-render helper (A-L1).
 *
 * @typeParam T - The callback's return type.
 * @param locale - The locale to bind.
 * @param fn - The callback run inside the scope.
 * @returns The callback's result.
 */
export function runWithLocale<T>(locale: string, fn: () => T): T {
    return scope.run(
        { locale, translator: getRegistry().translator(locale) },
        fn,
    )
}

/**
 * Ambient translate — usable in deep JSX without prop-drilling. Requires an
 * active locale scope (the eager {@link localeMiddleware} or {@link runWithLocale});
 * outside one, use {@link getTranslator}.
 *
 * @param key - The message key.
 * @param params - Interpolation params.
 * @returns The translated string.
 * @throws {Error} When called outside a locale scope.
 */
export function t(key: string, params?: Record<string, unknown>): string {
    const current = scope.getStore()
    if (!current) {
        throw new Error(
            'ambient t() called outside a locale scope — install localeMiddleware(), wrap in runWithLocale(), or use getTranslator(c)',
        )
    }
    return current.translator.t(key, params)
}

/**
 * The current ambient locale, or `undefined` outside a scope.
 *
 * @returns The active locale.
 */
export function currentLocale(): string | undefined {
    return scope.getStore()?.locale
}

/**
 * The optional eager middleware — pre-resolves the locale, exposes `c.get('t')`
 * / `c.get('locale')`, and runs the request inside the ALS scope so ambient
 * `t()` works in views. Install it globally to enable ambient `t()`; the lazy
 * accessors work without it. If installed it must run **inner** of the mount
 * `i18nMiddleware` (so `localeKey` is set).
 *
 * @returns A Hono middleware handler.
 */
export function localeMiddleware(): MiddlewareHandler {
    return async (c, next) => {
        const locale = getLocale(c)
        const translator = getTranslator(c)
        c.set('t' as never, translator as never)
        c.set('locale' as never, locale as never)
        await scope.run({ locale, translator }, () => next())
    }
}
