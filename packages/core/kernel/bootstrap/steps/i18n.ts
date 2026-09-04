/**
 * @fileoverview i18n configuration bootstrap step.
 *
 * Configures the translation layer when `kernel.i18n` is set, by soft-loading
 * `@lockness/i18n` and calling its `configureI18n`. Mirrors `sessionStep`: guard
 * on config, `tryImportOptionalPackage`, skip gracefully when absent.
 *
 * The ambient-`t()` `localeMiddleware` is **not** auto-installed here — the lazy
 * `getTranslator(c)` accessors work without it; an app adds the middleware to
 * its global stack (inner of the mount) to enable ambient `t()` in views.
 *
 * @module @lockness/core/kernel/bootstrap/steps/i18n
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import type { I18nConfig } from '../../kernel_decorators.ts'
import { tryImportOptionalPackage } from '../helpers.ts'

/**
 * i18n configuration step.
 *
 * Order: 115 (infrastructure setup, just after session).
 */
export const i18nStep: BootstrapStep = {
    id: 'i18n',
    order: 115,

    async run(context) {
        if (!context.config.i18n) {
            return
        }

        const i18nModule = await tryImportOptionalPackage<{
            configureI18n: (config: I18nConfig) => void
        }>('@lockness/i18n', 'i18n')

        if (!i18nModule) {
            return
        }

        i18nModule.configureI18n(context.config.i18n)
    },
}
