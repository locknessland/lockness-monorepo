/**
 * @fileoverview `Translator` — `t()`/`trans()` over a locale's catalog cascade.
 *
 * A translator resolves a key through a **per-key language cascade** (the
 * ordered catalogs handed by the registry), parses the matched message once
 * (shared AST cache) and renders it. `t()` returns a **plain string** (never a
 * Hono `HtmlEscapedString`) — the view escapes; params are data (security S1).
 *
 * @module @lockness/i18n/translator
 */

import { type ICUNode, parseICU, renderICU } from './icu.ts'

/** A message catalog — nested or flat, string leaves. */
export interface Messages {
    [key: string]: string | Messages
}

/**
 * Flatten a nested catalog to dot-keyed entries (`{ a: { b: 'x' } }` →
 * `{ 'a.b': 'x' }`). A flat catalog passes through.
 *
 * @param messages - The (possibly nested) catalog.
 * @returns A flat `key → message` map.
 */
export function flattenMessages(messages: Messages): Map<string, string> {
    const out = new Map<string, string>()
    const walk = (obj: Messages, prefix: string) => {
        for (const [k, v] of Object.entries(obj)) {
            const key = prefix ? `${prefix}.${k}` : k
            if (typeof v === 'string') out.set(key, v)
            else walk(v, key)
        }
    }
    walk(messages, '')
    return out
}

/** Interpolation params for `t()`. */
export type TranslateParams = Record<string, unknown>

/**
 * Translates keys for one locale against an ordered catalog cascade.
 *
 * @example
 * ```ts
 * translator.t('cart.items', { count: 3 }) // '3 items'
 * ```
 */
export class Translator {
    /**
     * @param locale - The active locale (for `Intl` formatting).
     * @param cascade - Ordered flat catalogs: active locale, then its language,
     *   then fallback, then default — the first with the key wins (per-key).
     * @param astCache - Shared message→AST cache (parse-once).
     */
    constructor(
        readonly locale: string,
        private readonly cascade: ReadonlyArray<Map<string, string>>,
        private readonly astCache: Map<string, ICUNode[]>,
    ) {}

    /**
     * Translate a key with optional interpolation params.
     *
     * @param key - The dot-keyed message key.
     * @param params - Interpolation values (data; substituted as literal text).
     * @returns The rendered string; the key itself when no catalog has it.
     */
    t(key: string, params: TranslateParams = {}): string {
        for (const catalog of this.cascade) {
            const message = catalog.get(key)
            if (message !== undefined) {
                return renderICU(this.ast(message), params, this.locale)
            }
        }
        return key // no throw — the key is the last-resort fallback
    }

    /** Alias for {@link Translator.t}. */
    trans(key: string, params: TranslateParams = {}): string {
        return this.t(key, params)
    }

    /** Parse a message once and cache its AST. */
    private ast(message: string): ICUNode[] {
        let nodes = this.astCache.get(message)
        if (!nodes) {
            nodes = parseICU(message)
            this.astCache.set(message, nodes)
        }
        return nodes
    }
}
