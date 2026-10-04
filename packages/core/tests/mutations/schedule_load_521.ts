/**
 * @fileoverview The mutation battery for #521 in `@lockness/core`: a schedule
 * file that fails to load refuses the boot with a `ScheduleLoadError`, instead
 * of passing for an absent schedules directory when it throws
 * `Deno.errors.NotFound` while it evaluates.
 *
 * Runs under the shared contract in `tests/mutations/harness.ts`. Each row
 * names the test that must catch it.
 *
 * ```bash
 * deno run -A packages/core/tests/mutations/schedule_load_521.ts
 * ```
 *
 * @module @lockness/core/tests/mutations/schedule_load_521
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const DISCOVERY = new URL(
    '../../scheduler/schedule_discovery.ts',
    import.meta.url,
)
const SUITES = [
    new URL('../schedule_load_error.test.ts', import.meta.url).pathname,
    new URL('../load_failure_redaction.test.ts', import.meta.url).pathname,
    new URL('../schedule_discovery.test.ts', import.meta.url).pathname,
    new URL('../scheduler_step.test.ts', import.meta.url).pathname,
]

const WRAPPED_IMPORT =
    '        const module = await importAppFile(file).catch((error: unknown) => {\n' +
    '            throw new ScheduleLoadError(file, error)\n' +
    '        })\n'
const RENDERED =
    '                renderError(error)\n            }`,\n        )\n'

const MUTATIONS: Mutation[] = [
    {
        label:
            'the wrap removed — a bare import lets a module NotFound pass for an absent directory',
        file: DISCOVERY,
        edits: [[
            WRAPPED_IMPORT,
            '        const module = await importAppFile(file)\n',
        ]],
        killedBy:
            'a schedule module that throws NotFound is a broken file, not an absent directory',
    },
    {
        label: 'the original error attached as a raw cause',
        file: DISCOVERY,
        edits: [[
            RENDERED,
            '                renderError(error)\n            }`,\n            { cause: error },\n        )\n',
        ]],
        killedBy: 'the error carries no cause',
    },
    {
        label: 'the original error embedded raw, not rendered',
        file: DISCOVERY,
        edits: [[
            RENDERED,
            '                String(error)\n            }`,\n        )\n',
        ]],
        killedBy: 'redacts a credential pair a schedule file throws',
    },
    {
        label: 'the file named by its absolute path',
        file: DISCOVERY,
        edits: [[
            '        const shown = shownPath(file)\n',
            '        const shown = file\n',
        ]],
        killedBy: 'unresolvable specifier refuses the boot, naming the file',
    },
]

Deno.exit(
    await runBattery(
        '#521 mutation battery — a schedule file that fails to load refuses the boot',
        SUITES,
        MUTATIONS,
    ),
)
