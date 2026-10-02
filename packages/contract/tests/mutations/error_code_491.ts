/**
 * @fileoverview The mutation battery for #491: which error codes `renderError`
 * shows.
 *
 * Runs under the shared contract in `harness.ts`, which refuses to start unless
 * the suites are already green and the target files are clean, and requires
 * every row to name the test that must catch it — so a KILLED row proves the
 * mutated line executed under the named test, not merely that something went
 * red.
 *
 * Four rows widen the spelling check one vocabulary at a time, one removes the
 * compile-failure suppression, and one folds the guarded `.code` read back into
 * the renderer's own guard.
 *
 * ```bash
 * deno run -A packages/contract/tests/mutations/error_code_491.ts
 * ```
 *
 * @module @lockness/contract/tests/mutations/error_code_491
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const ERROR_CODE = new URL('../../logging/error_code.ts', import.meta.url)
const SANITIZE = new URL('../../logging/sanitize.ts', import.meta.url)
const SUITES = [
    new URL('../error_code_491.test.ts', import.meta.url).pathname,
    new URL('../compile_diagnostic.test.ts', import.meta.url).pathname,
]

/** The three vocabularies, exactly as `error_code.ts` spells them. */
const PATTERN = '/^(?:[0-9A-Z]{5}|E[A-Z]{1,15}|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)$/'

const MUTATIONS: Mutation[] = [
    {
        label: 'the length cap dropped — a 49-character upper-snake is shown',
        file: ERROR_CODE,
        edits: [[
            "typeof value === 'string' && value.length <= MAX_CODE &&",
            "typeof value === 'string' &&",
        ]],
        killedBy: 'a code spelled like anything else is never shown',
    },
    {
        label: 'lowercase allowed — a snake-case value carrying data is shown',
        file: ERROR_CODE,
        edits: [[PATTERN, `${PATTERN}i`]],
        killedBy: 'a code spelled like anything else is never shown',
    },
    {
        label:
            'the underscore requirement dropped — a key id or a base32 seed is shown',
        file: ERROR_CODE,
        edits: [['(?:_[A-Z0-9]+)+)$/', '(?:_[A-Z0-9]+)*)$/']],
        killedBy: 'a code spelled like anything else is never shown',
    },
    {
        label: 'SQLSTATE widened past five — a six-digit OTP is shown',
        file: ERROR_CODE,
        edits: [['[0-9A-Z]{5}|', '[0-9A-Z]{5,8}|']],
        killedBy: 'a code spelled like anything else is never shown',
    },
    {
        label:
            'the compile-failure suppression removed — a parse failure reads ERR_MODULE_NOT_FOUND',
        file: SANITIZE,
        edits: [[
            'diagnostic === undefined ? readShownCode(error) : undefined,',
            'readShownCode(error),',
        ]],
        killedBy: '#478 a parse failure keeps its outer name',
    },
    {
        label:
            "the code read moved into renderOne's guard — a throwing getter loses the line",
        file: ERROR_CODE,
        edits: [[
            '    try {\n        code = (error as Error & { code?: unknown }).code\n    } catch {\n        return UNREADABLE_CODE\n    }\n',
            '    code = (error as Error & { code?: unknown }).code\n    void UNREADABLE_CODE\n',
        ]],
        killedBy: 'a throwing code getter renders a sentinel',
    },
]

Deno.exit(
    await runBattery(
        '#491 mutation battery — which error codes renderError shows',
        SUITES,
        MUTATIONS,
    ),
)
