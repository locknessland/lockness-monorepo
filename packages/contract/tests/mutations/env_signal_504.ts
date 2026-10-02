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
// The destructive drizzle commands run outside the app boot, so they carry
// the tripwire themselves; their rows live here, beside the tripwire's own.
const GUARD = new URL('../../../drizzle/production_guard.ts', import.meta.url)
const SUITES = [
    new URL('../environment.test.ts', import.meta.url).pathname,
    new URL('../environment_legacy.test.ts', import.meta.url).pathname,
    new URL('../../../drizzle/tests/production_guard.test.ts', import.meta.url)
        .pathname,
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
    {
        label:
            'the drizzle guard drops the tripwire — db:seed runs under DENO_ENV=production alone',
        file: GUARD,
        edits: [[
            "if (legacy?.kind === 'conflict') {",
            "if (false && legacy?.kind === 'conflict') {",
        ]],
        killedBy: 'a DENO_ENV conflicting with APP_ENV refuses',
    },
    {
        label:
            '--allow-production bypasses the tripwire — the override reaches an unknown env',
        file: GUARD,
        edits: [[
            "if (legacy?.kind === 'conflict') {",
            "if (!allowProduction && legacy?.kind === 'conflict') {",
        ]],
        killedBy: 'a DENO_ENV conflicting with APP_ENV refuses',
    },
    {
        label: 'the production message names DENO_ENV again',
        file: GUARD,
        edits: [[
            '`(APP_ENV is "production"). This is a destructive dev/test ` +',
            '`(DENO_ENV/APP_ENV is "production"). This is a destructive dev/test ` +',
        ]],
        killedBy: 'a DENO_ENV equal to APP_ENV changes nothing',
    },
]

Deno.exit(
    await runBattery(
        '#504 mutation battery — APP_ENV is the single environment signal',
        SUITES,
        MUTATIONS,
    ),
)
