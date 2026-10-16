/**
 * @fileoverview The boot's environment checks, run first: the unreadable
 * `APP_ENV` warning (#624) and the `DENO_ENV` tripwire (#504).
 *
 * A process that cannot read `APP_ENV` — a `deno compile` binary, a run with a
 * narrowed `--allow-env` — gets one warning here, once per boot. The
 * framework's production guards fail closed on it on their own (they ask
 * `productionRisk()`); the warning is what covers the conveniences, which read
 * an unreadable `APP_ENV` as development, and an app's own `isProduction()`.
 *
 * Since v0.5.0 `APP_ENV` is the only environment signal. A deployment that
 * still sets `DENO_ENV` relied on the old resolution, where `DENO_ENV` won;
 * reading `APP_ENV` alone would move it silently — a `DENO_ENV=production`
 * process with no `APP_ENV` would lose the `APP_KEY` refusal and every other
 * production-only control. So a disagreeing `DENO_ENV` refuses the boot, and an
 * agreeing one warns that it is now inert. Scheduled for removal in v0.7.0.
 *
 * @module @lockness/core/kernel/bootstrap/steps/environment
 */

import type { BootstrapStep } from '../types.ts'
import { legacyEnvironmentSignal } from '@lockness/contract/environment/internal'
import {
    productionRisk,
    UNREADABLE_APP_ENV,
} from '@lockness/contract/environment/guard/internal'

/**
 * The environment step: the unreadable-`APP_ENV` warning, then the tripwire.
 *
 * **Order: 1 — before every step that reads the environment.** The events
 * debug switch (10), the session `APP_KEY` gate (110) and the devtools gate all
 * decide on `APP_ENV`; a conflict must stop the boot before any of them has
 * acted on the wrong answer. The warning comes before the tripwire, so an
 * operator whose boot the tripwire refuses still learns that `APP_ENV` was
 * unreadable — the tripwire's own message reads it as unset.
 *
 * @throws {Error} When `DENO_ENV` disagrees with `APP_ENV`, including when
 * `APP_ENV` is unset. The message names `APP_ENV` and the fix.
 */
export const environmentStep: BootstrapStep = {
    id: 'environment',
    order: 1,

    run() {
        if (productionRisk() === 'unreadable') {
            console.warn(`⚠️  ${UNREADABLE_APP_ENV}`)
        }
        const signal = legacyEnvironmentSignal()
        if (signal === undefined) return
        if (signal.kind === 'conflict') throw new Error(signal.message)
        console.warn(`⚠️  ${signal.message}`)
    },
}
