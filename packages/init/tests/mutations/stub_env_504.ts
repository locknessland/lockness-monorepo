/**
 * @fileoverview The mutation battery for #504 in `@lockness/init`: the
 * scaffolded app reads its environment through the framework.
 *
 * Runs under the shared contract in `tests/mutations/harness.ts`. Each row puts
 * one pre-#504 stub line back and names the test that must catch it.
 *
 * ```bash
 * deno run -A packages/init/tests/mutations/stub_env_504.ts
 * ```
 *
 * @module @lockness/init/tests/mutations/stub_env_504
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const CONFIG = '../../stubs/init/config/'
const APP = new URL(`${CONFIG}app.ts.stub`, import.meta.url)
const SESSION = new URL(`${CONFIG}session.ts.stub`, import.meta.url)
const ERROR_HANDLER = new URL(
    '../../../cli/stubs/make/error_handler.stub',
    import.meta.url,
)
const SLIM_ERROR_HANDLER = new URL(
    '../../stubs/kits/slim/app/view/pages/errors/error_handler.tsx.stub',
    import.meta.url,
)
const DOCKERFILE = new URL('../../stubs/init/Dockerfile.stub', import.meta.url)
const SUITES = [new URL('../env_signal.test.ts', import.meta.url).pathname]

const AGREES = 'agrees with the framework for every APP_ENV x DENO_ENV'

const MUTATIONS: Mutation[] = [
    {
        label:
            'the kit session sets secure from APP_ENV again — unset env, no Secure',
        file: SESSION,
        edits: [[
            '    // `secure` is deliberately absent: the framework sets the Secure flag\n    // unless APP_ENV=development. Set it only to override that default.\n',
            "    secure: Deno.env.get('APP_ENV') === 'production',\n",
        ]],
        killedBy: 'yields a Secure cookie unless APP_ENV=development',
    },
    {
        label: 'the kit reads APP_ENV by hand for its env name',
        file: APP,
        edits: [[
            'env: resolveEnvName(),',
            "env: Deno.env.get('APP_ENV') || 'development',",
        ]],
        killedBy: AGREES,
    },
    {
        label:
            'the kit decides production by hand — APP_ENV=" Production" disagrees',
        file: APP,
        edits: [[
            'export const isProduction = isProductionEnv()',
            "export const isProduction = Deno.env.get('APP_ENV') === 'production'",
        ]],
        killedBy: AGREES,
    },
    {
        label:
            'the make:error-handler stub shows details whenever env is unset',
        file: ERROR_HANDLER,
        edits: [[
            'const showDetails = isExplicitlyDevelopment()',
            'const showDetails = isDevelopment()',
        ]],
        killedBy: 'show details only under explicit development',
    },
    {
        label:
            "the slim kit's JSON error handler shows the message whenever env is unset (#479)",
        file: SLIM_ERROR_HANDLER,
        edits: [[
            'const showDetails = isExplicitlyDevelopment()',
            'const showDetails = isDevelopment()',
        ]],
        killedBy: 'show details only under explicit development',
    },
    {
        label:
            'the image sets DENO_ENV again — the tripwire refuses every container',
        file: DOCKERFILE,
        edits: [['ENV APP_ENV=production', 'ENV DENO_ENV=production']],
        killedBy: 'the generated image sets APP_ENV=production',
    },
]

Deno.exit(
    await runBattery(
        '#504 mutation battery — the scaffolded app reads the framework environment',
        SUITES,
        MUTATIONS,
    ),
)
