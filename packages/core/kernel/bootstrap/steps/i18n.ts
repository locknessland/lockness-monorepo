/**
 * @fileoverview i18n configuration bootstrap step.
 *
 * Configures the translation layer when `kernel.i18n` is set, by loading
 * `@lockness/i18n` and calling its `configureI18n`. Mirrors `sessionStep`: the
 * key decides, `loadConfiguredPackage` loads, and a set key whose package does
 * not resolve refuses the boot.
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
import {
    defaultImportModule,
    loadConfiguredPackage,
} from '../optional_packages.ts'

/**
 * i18n configuration step.
 *
 * Order: 115 (infrastructure setup, just after session).
 */
export const i18nStep: BootstrapStep = {
    id: 'i18n',
    order: 115,

    async run(context) {
        const setting = context.config.i18n
        const i18nModule = await loadConfiguredPackage<{
            configureI18n: (config: I18nConfig) => void
        }>(
            context.config,
            'i18n',
            context.importModule ?? defaultImportModule,
        )
        // `!setting` narrows the type only: the loader already returned null
        // for an unset key, having imported nothing.
        if (!i18nModule || !setting) {
            return
        }

        i18nModule.configureI18n(setting)
    },
}
