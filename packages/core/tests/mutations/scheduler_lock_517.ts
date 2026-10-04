/**
 * @fileoverview The mutation battery for #517 in `@lockness/core`: a configured
 * `schedulerLock` either installs a lock or refuses the boot. A `'redis'`
 * driver with no connection, or an unrecognised driver, used to match no
 * branch, install no lock and say nothing.
 *
 * Runs under the shared contract in `tests/mutations/harness.ts`. Each row
 * names the test that must catch it. The compile-time half — the union on
 * `driver` — is proven by the `@ts-expect-error` test, not here: a mutant that
 * stops type-checking is DEAD under the harness, not killed.
 *
 * ```bash
 * deno run -A packages/core/tests/mutations/scheduler_lock_517.ts
 * ```
 *
 * @module @lockness/core/tests/mutations/scheduler_lock_517
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const STEP = new URL(
    '../../kernel/bootstrap/steps/scheduler.ts',
    import.meta.url,
)
const SUITES = [
    new URL('../scheduler_step.test.ts', import.meta.url).pathname,
    new URL('../configured_packages.test.ts', import.meta.url).pathname,
]

const REDIS_BRANCH = "            if (lockConfig.driver === 'redis') {"
const REDIS_GUARD =
    "                if (typeof connection !== 'object' || connection === null) {"
const NEVER = '                const unrecognised: never = lockConfig\n'
const ELSE_THROW = `${NEVER}                throw new TypeError(`
const ELSE_SILENT = `${NEVER}                if (false) throw new TypeError(`

const MUTATIONS: Mutation[] = [
    {
        label:
            'the silent fall-through restored — redis without a connection and an unknown driver install no lock',
        file: STEP,
        edits: [
            [
                REDIS_BRANCH,
                "            if (lockConfig.driver === 'redis' && lockConfig.redis) {",
            ],
            [
                ELSE_THROW,
                '                const unrecognised = lockConfig as never\n' +
                '                if (false) throw new TypeError(',
            ],
        ],
        killedBy:
            "schedulerLock.driver 'redis' without a connection refuses the boot",
    },
    {
        label: 'the redis connection guard removed',
        file: STEP,
        edits: [[
            REDIS_GUARD,
            "                if (false && (typeof connection !== 'object' || connection === null)) {",
        ]],
        killedBy:
            "schedulerLock.driver 'redis' without a connection refuses the boot",
    },
    {
        label: 'the redis connection guard accepts null',
        file: STEP,
        edits: [[
            REDIS_GUARD,
            "                if (typeof connection !== 'object') {",
        ]],
        killedBy: 'with a non-object connection refuses the boot',
    },
    {
        label: 'an unknown driver falls through with no lock installed',
        file: STEP,
        edits: [[ELSE_THROW, ELSE_SILENT]],
        killedBy: 'an unknown schedulerLock.driver refuses the boot',
    },
]

Deno.exit(
    await runBattery(
        '#517 mutation battery — a configured scheduler lock installs or refuses',
        SUITES,
        MUTATIONS,
    ),
)
