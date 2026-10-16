/**
 * @fileoverview The mutation battery for #624: an unreadable `APP_ENV` is a
 * production risk; an unset one is not.
 *
 * Runs under the shared contract in `harness.ts`. Each row reads *unreadable*
 * as *unset* again somewhere — in the read, in the rule, at one of the three
 * guards that protect production, or in the boot warning — and names the test
 * that must catch it. The guards' rows live here, beside the rule's own, as
 * the drizzle tripwire rows live beside the tripwire's in `env_signal_504.ts`.
 *
 * ```bash
 * deno run -A packages/contract/tests/mutations/env_unreadable_624.ts
 * ```
 *
 * @module @lockness/contract/tests/mutations/env_unreadable_624
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const READ = new URL('../../environment_read.ts', import.meta.url)
const RULE = new URL('../../environment_guard.ts', import.meta.url)
const PACKAGES = new URL('../../../', import.meta.url)
const DRIZZLE = new URL('drizzle/production_guard.ts', PACKAGES)
const BOOT = new URL('core/kernel/bootstrap/steps/environment.ts', PACKAGES)
const SESSION = new URL('core/kernel/bootstrap/steps/session.ts', PACKAGES)
const MAIL = new URL('mail/preview.ts', PACKAGES)
const DEVTOOLS = new URL('devtools/gate.ts', PACKAGES)

const SUITES = [
    'contract/tests/environment_read.deno.test.ts',
    'contract/tests/environment_guard.deno.test.ts',
    'drizzle/tests/production_guard.deno.test.ts',
    'core/tests/environment_unreadable.deno.test.ts',
    'mail/tests/preview_unreadable.deno.test.ts',
    'devtools/tests/gate_env.deno.test.ts',
].map((path) => new URL(path, PACKAGES).pathname)

const WARNING_BLOCK = "        if (productionRisk() === 'unreadable') {\n" +
    '            console.warn(`⚠️  ${UNREADABLE_APP_ENV}`)\n' +
    '        }\n'

const MUTATIONS: Mutation[] = [
    {
        label: 'a "prompt" permission read as readable — the read prompts',
        file: READ,
        edits: [[
            "if (state !== 'granted') return UNREADABLE",
            "if (state === 'denied') return UNREADABLE",
        ]],
        killedBy: 'permission "prompt" is unreadable',
    },
    {
        label: 'NotCapable after a granted query read as unset again',
        file: READ,
        edits: [[
            'if (error instanceof Deno.errors.NotCapable) return UNREADABLE',
            'if (error instanceof Deno.errors.NotCapable) return { readable: true, value: undefined }',
        ]],
        killedBy: 'NotCapable after a granted query is unreadable',
    },
    {
        label: "productionRisk drops 'unreadable' — the rule fails open",
        file: RULE,
        edits: [[
            "if (!read.readable) return 'unreadable'",
            'if (!read.readable) return undefined',
        ]],
        killedBy: 'an unreadable APP_ENV is a risk, whatever it holds',
    },
    {
        label: 'drizzle reverts to isProduction — db:seed runs blind',
        file: DRIZZLE,
        edits: [[
            // Typed as the rule's answer so the guard's later
            // `risk === 'unreadable'` still compiles; only 'production' is kept.
            'const risk = productionRisk()',
            "const risk = productionRisk() === 'production' ? productionRisk() : undefined",
        ]],
        killedBy: 'an unreadable APP_ENV refuses, naming the grant',
    },
    {
        label:
            'drizzle ignores the override when unreadable — no way to proceed',
        file: DRIZZLE,
        edits: [[
            'if (allowProduction || risk === undefined) return',
            "if (risk === undefined || (allowProduction && risk === 'production')) return",
        ]],
        killedBy: 'an unreadable APP_ENV passes with the explicit override',
    },
    {
        label:
            'the session refusal reverts to isProduction — a per-process key',
        file: SESSION,
        edits: [[
            'if (productionRisk() !== undefined) {',
            "if (productionRisk() === 'production') {",
        ]],
        killedBy: 'cookie session and no APP_KEY refuses',
    },
    {
        label: 'the mail preview reverts to resolveEnvName alone',
        file: MAIL,
        edits: [[
            'return productionRisk() !== undefined || BLOCKED_ENVS.has(resolveEnvName())',
            'return BLOCKED_ENVS.has(resolveEnvName())',
        ]],
        killedBy: 'leaves enableMailPreview a no-op',
    },
    {
        label: 'the boot warning removed',
        file: BOOT,
        edits: [[WARNING_BLOCK, '']],
        killedBy: 'an unreadable APP_ENV warns exactly once',
    },
    {
        label: 'the boot warning fires on an unset APP_ENV too',
        file: BOOT,
        edits: [[
            "if (productionRisk() === 'unreadable') {",
            "if (productionRisk() !== 'production') {",
        ]],
        killedBy: 'a readable APP_ENV (unset) prints no unreadable warning',
    },
    {
        label:
            'the boot warning moved after the tripwire — a refused boot hides it',
        file: BOOT,
        edits: [
            [WARNING_BLOCK, ''],
            [
                "if (signal.kind === 'conflict') throw new Error(signal.message)\n",
                "if (signal.kind === 'conflict') throw new Error(signal.message)\n" +
                WARNING_BLOCK,
            ],
        ],
        killedBy: 'printed before a DENO_ENV conflict refuses',
    },
    {
        label: 'devtools reverts to a raw Deno.env.get — the opt-in prompts',
        file: DEVTOOLS,
        edits: [[
            "return readEnvVar('LOCKNESS_DEVTOOLS') === '1'",
            "return Deno.env.get('LOCKNESS_DEVTOOLS') === '1'",
        ]],
        killedBy: 'an unreadable LOCKNESS_DEVTOOLS is off',
    },
]

Deno.exit(
    await runBattery(
        '#624 mutation battery — an unreadable APP_ENV is a production risk',
        SUITES,
        MUTATIONS,
    ),
)
