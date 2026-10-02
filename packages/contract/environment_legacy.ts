/**
 * @fileoverview The `DENO_ENV` tripwire (#504) — framework-internal.
 *
 * Until v0.5.0 the framework resolved `DENO_ENV` before `APP_ENV`. It now reads
 * `APP_ENV` alone, and a deployment that still sets `DENO_ENV` must not be
 * downgraded silently: a `DENO_ENV=production` deployment with no `APP_ENV`
 * would otherwise lose every production-only refusal without a word.
 *
 * {@link legacyEnvironmentSignal} classifies what `DENO_ENV` says against
 * `APP_ENV`. `@lockness/core` refuses to boot on a `conflict` and warns once on
 * a `redundant` one; the destructive drizzle commands refuse on a `conflict`.
 * Entry point `@lockness/contract/environment/internal`, so it never reaches an
 * app through `@lockness/core`'s re-export of the package root.
 *
 * Scheduled for removal in v0.7.0.
 *
 * @module @lockness/contract/environment/internal
 */

import { readEnvName, readEnvVar } from './environment_read.ts'
import { safeForLog } from './logging/sanitize.ts'

/** What a set `DENO_ENV` means now that it is no longer read. */
export interface LegacyEnvSignal {
    /**
     * `conflict` — `DENO_ENV` names a different environment from `APP_ENV`
     * (including when `APP_ENV` is unset): the process must not start.
     * `redundant` — it names the same one: harmless, but it should go.
     */
    kind: 'conflict' | 'redundant'
    /** The operator-facing explanation, safe to print or throw. */
    message: string
}

/**
 * Classify a set `DENO_ENV` against `APP_ENV`.
 *
 * Both values are normalised the same way (trimmed, lower-cased, blank means
 * unset), so `DENO_ENV=Production` beside `APP_ENV=production` is redundant,
 * not a conflict. The raw `DENO_ENV` reaches the message only through
 * `safeForLog`, since it is attacker-reachable in some deployments and the
 * message goes to a terminal.
 *
 * @returns `undefined` when `DENO_ENV` is unset, blank or unreadable;
 * otherwise the signal and its message.
 *
 * @example
 * ```typescript
 * const signal = legacyEnvironmentSignal()
 * if (signal?.kind === 'conflict') throw new Error(signal.message)
 * if (signal?.kind === 'redundant') console.warn(signal.message)
 * ```
 */
export function legacyEnvironmentSignal(): LegacyEnvSignal | undefined {
    const legacy = readEnvName('DENO_ENV')
    if (legacy === undefined) return undefined
    const current = readEnvName('APP_ENV')
    if (legacy === current) {
        return {
            kind: 'redundant',
            message:
                'DENO_ENV is ignored since Lockness v0.5.0, which reads only APP_ENV; remove it.',
        }
    }
    const shown = safeForLog(readEnvVar('DENO_ENV') ?? '')
    const app = current === undefined
        ? 'APP_ENV is unset'
        : `APP_ENV=${safeForLog(readEnvVar('APP_ENV') ?? '')}`
    return {
        kind: 'conflict',
        message:
            `DENO_ENV=${shown} disagrees with the environment signal (${app}). ` +
            'Since v0.5.0 Lockness reads only APP_ENV. ' +
            'Set APP_ENV to the intended environment and remove DENO_ENV.',
    }
}
