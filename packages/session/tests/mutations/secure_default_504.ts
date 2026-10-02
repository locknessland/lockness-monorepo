/**
 * @fileoverview The mutation battery for #504 in `@lockness/session`: the
 * package is the one home of the fail-closed cookie `secure` default.
 *
 * Runs under the shared contract in `harness.ts`. Each row reopens one way the
 * default could be lost or bypassed, and names the test that must catch it.
 *
 * ```bash
 * deno run -A packages/session/tests/mutations/secure_default_504.ts
 * ```
 *
 * @module @lockness/session/tests/mutations/secure_default_504
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const CONFIG = new URL('../../config.ts', import.meta.url)
const SUITES = [
    new URL('../secure_default.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    {
        label:
            'the explicit config spread last again — secure: undefined erases the default',
        file: CONFIG,
        edits: [[
            '        ...config,\n        secure: config.secure ?? secureCookieDefault(),\n',
            '        secure: secureCookieDefault(),\n        ...config,\n',
        ]],
        killedBy: 'explicitly undefined secure takes the fail-closed default',
    },
    {
        label: 'an explicit false overridden — the app cannot opt out',
        file: CONFIG,
        edits: [[
            'secure: config.secure ?? secureCookieDefault(),',
            'secure: config.secure || secureCookieDefault(),',
        ]],
        killedBy: 'an explicit secure value always wins',
    },
    {
        label: 'the default fails open — an unset environment is not Secure',
        file: CONFIG,
        edits: [[
            'return !isExplicitlyDevelopment()',
            "return Deno.env.get('APP_ENV') === 'production'",
        ]],
        killedBy: 'not explicitly development',
    },
    {
        label: 'a raw DENO_ENV read as development — the cookie drops Secure',
        file: CONFIG,
        edits: [[
            'return !isExplicitlyDevelopment()',
            "return !isExplicitlyDevelopment() && Deno.env.get('DENO_ENV') !== 'development'",
        ]],
        killedBy: 'a DENO_ENV alone is not a development signal',
    },
]

Deno.exit(
    await runBattery(
        '#504 mutation battery — the session secure default has one home',
        SUITES,
        MUTATIONS,
    ),
)
