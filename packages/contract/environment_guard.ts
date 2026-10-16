/**
 * @fileoverview The one home of "an unreadable `APP_ENV` is a production risk;
 * an unset one is not" (#624, plan 274 §5).
 *
 * The public predicates in `@lockness/contract/environment` read an unreadable
 * `APP_ENV` as absent: they pick conveniences, and an app asking
 * `isProduction()` keeps its meaning. A framework control whose failure would
 * destroy data, start production with a per-process session key, or expose
 * captured mail cannot afford that reading — a `deno compile` binary whose `compile.flags`
 * narrow `--allow-env`, or a hardened run with a narrowed `--allow-env` would look like development to
 * it. Those controls ask {@link productionRisk} and fail closed on any answer
 * but `undefined`:
 *
 * - `@lockness/drizzle`'s `assertNotProduction`;
 * - the cookie-session no-secret boot refusal in `@lockness/core`;
 * - `@lockness/mail`'s preview block.
 *
 * `@lockness/core`'s order-1 `environment` boot step prints
 * {@link UNREADABLE_APP_ENV} once, which covers the conveniences.
 *
 * **Framework-internal.** Reached only through
 * `@lockness/contract/environment/guard/internal`, never from contract's root:
 * core re-exports that root, so an export there would hand apps a public
 * "may be production" predicate nobody decided to offer (plan 274 §12 Q5).
 *
 * @module @lockness/contract/environment/guard/internal
 */

import { readAppEnv } from './environment_read.ts'

/**
 * Why a production guard must refuse: `APP_ENV` names production, or this
 * process cannot read it and it may.
 */
export type ProductionRisk = 'production' | 'unreadable'

/**
 * The one sentence that explains an unreadable `APP_ENV` — printed by the boot
 * warning and embedded in a guard's refusal, so the two never drift.
 */
export const UNREADABLE_APP_ENV: string =
    'APP_ENV cannot be read by this process (grant it with ' +
    '--allow-env=APP_ENV); production guards treat it as possibly production.'

/**
 * Whether a control that protects production must act.
 *
 * Derived from the one normalised `APP_ENV` read, so it agrees with
 * `isProduction()` on every readable value. It never prompts and never throws
 * on a missing permission.
 *
 * @returns `'production'` when `APP_ENV` names production, `'unreadable'` when
 *   this process cannot read `APP_ENV`, `undefined` otherwise — an unset or
 *   blank `APP_ENV` is never production.
 * @throws Whatever the env read raises other than a missing permission —
 *   `InvalidData` when `APP_ENV` is not valid Unicode.
 *
 * @example
 * ```ts
 * if (productionRisk() !== undefined) return // fail closed
 * ```
 */
export function productionRisk(): ProductionRisk | undefined {
    const read = readAppEnv()
    if (!read.readable) return 'unreadable'
    return read.value === 'production' ? 'production' : undefined
}
