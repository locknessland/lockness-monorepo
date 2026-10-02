/**
 * @fileoverview The mutation battery for #504 in `@lockness/core`: core stops
 * supplying the cookie `secure` default, warns on an explicit opt-out, and
 * refuses a conflicting `DENO_ENV` before any step runs.
 *
 * Runs under the shared contract in `tests/mutations/harness.ts`. Each row
 * names the test that must catch it.
 *
 * ```bash
 * deno run -A packages/core/tests/mutations/session_secure_504.ts
 * ```
 *
 * @module @lockness/core/tests/mutations/session_secure_504
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const HELPERS = new URL('../../kernel/bootstrap/helpers.ts', import.meta.url)
const SESSION = new URL(
    '../../kernel/bootstrap/steps/session.ts',
    import.meta.url,
)
const ENVIRONMENT = new URL(
    '../../kernel/bootstrap/steps/environment.ts',
    import.meta.url,
)
const REGISTRY = new URL('../../kernel/bootstrap/registry.ts', import.meta.url)
const SUITES = [
    new URL('../session_boot.test.ts', import.meta.url).pathname,
    new URL('../bootstrap_steps.test.ts', import.meta.url).pathname,
    new URL('../environment_tripwire.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    {
        label:
            'core supplies secure again — an unset APP_ENV boots an insecure cookie',
        file: HELPERS,
        edits: [[
            'if (baseConfig.secure !== undefined) normalized.secure = baseConfig.secure',
            'normalized.secure = baseConfig.secure ?? false',
        ]],
        killedBy: 'effective secure flag fails closed',
    },
    {
        label: 'the explicit secure: false warning removed',
        file: SESSION,
        edits: [[
            'if (sessionConfig.secure === false && !isExplicitlyDevelopment()) {',
            'if (false && sessionConfig.secure === false && !isExplicitlyDevelopment()) {',
        ]],
        killedBy: 'outside explicit development warns once',
    },
    {
        label: 'the secure: false warning fires in explicit development too',
        file: SESSION,
        edits: [[
            'if (sessionConfig.secure === false && !isExplicitlyDevelopment()) {',
            'if (sessionConfig.secure === false) {',
        ]],
        killedBy: 'no secure warning in explicit development',
    },
    {
        label: 'a conflict only warns — DENO_ENV=production alone boots',
        file: ENVIRONMENT,
        edits: [[
            "if (signal.kind === 'conflict') throw new Error(signal.message)",
            "if (signal.kind === 'conflict') return",
        ]],
        killedBy: 'DENO_ENV=production alone refuses to boot',
    },
    {
        label: 'a redundant DENO_ENV boots silently',
        file: ENVIRONMENT,
        edits: [[
            '        console.warn(`⚠️  ${signal.message}`)\n',
            '',
        ]],
        killedBy: 'equal to APP_ENV boots and warns once',
    },
    {
        label: 'the tripwire step left out of the default steps',
        file: REGISTRY,
        edits: [[
            '        environmentStep,\n',
            '',
        ]],
        killedBy: 'createApp - DENO_ENV=production alone refuses to boot',
    },
]

Deno.exit(
    await runBattery(
        '#504 mutation battery — core leaves the secure default to the session package',
        SUITES,
        MUTATIONS,
    ),
)
