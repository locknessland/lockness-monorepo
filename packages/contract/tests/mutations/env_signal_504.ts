/**
 * @fileoverview The mutation battery for #504: `APP_ENV` is the single
 * environment signal.
 *
 * Runs under the shared contract in `harness.ts`. Each row puts back one piece
 * of the pre-#504 behaviour, or removes one piece of the normalisation or the
 * tripwire, and names the test that must catch it.
 *
 * ```bash
 * deno run -A packages/contract/tests/mutations/env_signal_504.ts
 * ```
 *
 * @module @lockness/contract/tests/mutations/env_signal_504
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const ENVIRONMENT = new URL('../../environment.ts', import.meta.url)
const READ = new URL('../../environment_read.ts', import.meta.url)
const LEGACY = new URL('../../environment_legacy.ts', import.meta.url)
const SUITES = [
    new URL('../environment.test.ts', import.meta.url).pathname,
    new URL('../environment_legacy.test.ts', import.meta.url).pathname,
]

const MATRIX = 'the predicates depend on APP_ENV alone'

const MUTATIONS: Mutation[] = [
    {
        label: 'DENO_ENV read first again — a stray DENO_ENV overrides APP_ENV',
        file: ENVIRONMENT,
        edits: [[
            "return readEnvName('APP_ENV')",
            "return readEnvName('DENO_ENV') ?? readEnvName('APP_ENV')",
        ]],
        killedBy: MATRIX,
    },
    {
        label:
            'isExplicitlyDevelopment ORs a raw DENO_ENV — production and dev both true',
        file: ENVIRONMENT,
        edits: [[
            "return explicitEnvName() === 'development'",
            "return explicitEnvName() === 'development' || Deno.env.get('DENO_ENV') === 'development'",
        ]],
        killedBy: 'never both true',
    },
    {
        label: 'trim dropped — a CRLF .env value is not production',
        file: READ,
        edits: [[
            'raw.trim().toLowerCase()',
            'raw.toLowerCase()',
        ]],
        killedBy: MATRIX,
    },
    {
        label: 'lower-casing dropped — APP_ENV=Production is not production',
        file: READ,
        edits: [[
            'raw.trim().toLowerCase()',
            'raw.trim()',
        ]],
        killedBy: MATRIX,
    },
    {
        label: "a blank APP_ENV kept — the environment is named ''",
        file: READ,
        edits: [[
            "return normalised === '' ? undefined : normalised",
            'return normalised',
        ]],
        killedBy: MATRIX,
    },
    {
        label: 'the NotCapable catch removed — resolution throws without env',
        file: READ,
        edits: [[
            '        if (error instanceof Deno.errors.NotCapable) return undefined\n        throw error\n',
            '        throw error\n',
        ]],
        killedBy: 'NotCapable read resolves to development',
    },
    {
        label: 'the NotCapable catch widened — every read failure means unset',
        file: READ,
        edits: [[
            '        if (error instanceof Deno.errors.NotCapable) return undefined\n        throw error\n',
            '        void error\n        return undefined\n',
        ]],
        killedBy: 'other than NotCapable is not swallowed',
    },
    {
        label: 'an unset APP_ENV read as agreeing — DENO_ENV alone boots',
        file: LEGACY,
        edits: [[
            'if (legacy === current) {',
            'if (current === undefined || legacy === current) {',
        ]],
        killedBy: 'disagrees with APP_ENV is a conflict',
    },
    {
        label: 'the raw DENO_ENV reaches the message — terminal controls pass',
        file: LEGACY,
        edits: [[
            "const shown = safeForLog(readEnvVar('DENO_ENV') ?? '')",
            "const shown = readEnvVar('DENO_ENV') ?? ''",
        ]],
        killedBy: 'encodes a DENO_ENV value carrying terminal controls',
    },
]

Deno.exit(
    await runBattery(
        '#504 mutation battery — APP_ENV is the single environment signal',
        SUITES,
        MUTATIONS,
    ),
)
