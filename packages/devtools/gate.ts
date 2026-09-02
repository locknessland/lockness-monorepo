/**
 * @fileoverview The devtools activation gate — fail closed.
 *
 * The debug bar and its data collection are a dev-only surface that exposes
 * session contents, events, and request data. They must activate **only on an
 * explicit development signal**, never by default: a production deployment that
 * merely forgot to set an env var, or a `deno compile` binary running without
 * `--allow-env`, must NOT get the bar (both resolve the environment name to
 * `'development'` by default, so a plain `isDevelopment()` check fails open).
 *
 * @module @lockness/devtools/gate
 */

import { isExplicitlyDevelopment } from '@lockness/contract'

/**
 * Whether devtools may mount and collect.
 *
 * `true` only when the environment is **explicitly** development
 * (`DENO_ENV`/`APP_ENV === 'development'`) or the operator opts in with
 * `LOCKNESS_DEVTOOLS=1`. Ambiguous, unset, production, and no-`--allow-env`
 * states all resolve to `false` (fail closed). Never throws.
 *
 * @returns `true` when devtools is allowed to be active.
 *
 * @example
 * ```typescript
 * if (!devtoolsActive()) return // do not mount / do not collect
 * ```
 */
export function devtoolsActive(): boolean {
    if (isExplicitlyDevelopment()) return true
    try {
        return Deno.env.get('LOCKNESS_DEVTOOLS') === '1'
    } catch {
        return false
    }
}
