/**
 * @fileoverview The mutation battery for #488: the stack frames `renderError`
 * prints when a sink asks.
 *
 * Runs under the shared contract in `harness.ts`, which refuses to start unless
 * the suites are already green and the target files are clean, and requires
 * every row to name the test that must catch it — so a KILLED row proves the
 * mutated line executed under the named test, not merely that something went
 * red.
 *
 * Rows cover the default (none), the count normalisation and its clamp, the
 * frame filter, each step of the per-frame chain and its order, the cap, the
 * indent, and the two places the function stays total.
 *
 * ```bash
 * deno run -A packages/contract/tests/mutations/error_frames_488.ts
 * ```
 *
 * @module @lockness/contract/tests/mutations/error_frames_488
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const SANITIZE = new URL('../../logging/sanitize.ts', import.meta.url)
const SUITES = [
    new URL('../error_frames_488.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    // ---- The request ---------------------------------------------------------
    {
        label: 'frames default to 10 instead of 0 — every sink gets a stack',
        file: SANITIZE,
        edits: [[
            'frameCount(options.frames)',
            'frameCount(options.frames ?? 10)',
        ]],
        killedBy: 'no frames option renders one line',
    },
    {
        label: 'the frame clamp raised to 51',
        file: SANITIZE,
        edits: [['const MAX_FRAMES = 50', 'const MAX_FRAMES = 51']],
        killedBy: 'a huge frame count is clamped to 50',
    },
    {
        label: 'the frame clamp removed — the caller sizes the output',
        file: SANITIZE,
        edits: [['return Math.min(frames, MAX_FRAMES)', 'return frames']],
        killedBy: 'a huge frame count is clamped to 50',
    },
    {
        label: 'the integer check dropped — 1.5 prints a frame',
        file: SANITIZE,
        edits: [['!Number.isInteger(frames) || ', '']],
        killedBy: 'a frame count of 1.5 means none',
    },
    {
        label: 'the lower bound loosened — -1 slices from the end',
        file: SANITIZE,
        edits: [['frames < 1) {', 'frames < -1) {']],
        killedBy: 'a frame count of -1 means none',
    },
    {
        label: 'the zero short-circuit removed — frames: 0 reads the stack',
        file: SANITIZE,
        edits: [["if (count === 0) return ''", '']],
        killedBy: 'without frames the stack is never read',
    },
    // ---- Which lines are frames ----------------------------------------------
    {
        label: 'the frame filter removed — the header is printed twice',
        file: SANITIZE,
        edits: [[
            '.filter((line) => FRAME_LINE.test(line))',
            '.filter(() => true)',
        ]],
        killedBy: 'frames: 2 on a 5-frame stack',
    },
    {
        label: 'the non-Error guard removed — a lookalike object gets frames',
        file: SANITIZE,
        edits: [[
            "if (!(error instanceof Error)) return ''\n        stack = error.stack",
            'stack = (error as Error).stack',
        ]],
        killedBy: 'a non-string stack or a non-Error head gets no frames',
    },
    // ---- The per-frame chain -------------------------------------------------
    {
        label: 'a frame skips the userinfo redaction',
        file: SANITIZE,
        edits: [['redactDsnCredentials(line.trim())', 'line.trim()']],
        killedBy: 'userinfo and a credential pair in a frame are redacted',
    },
    {
        label: 'a frame skips the credential-pair redaction',
        file: SANITIZE,
        edits: [[
            'redactQueryCredentials(withoutUserinfo)',
            'withoutUserinfo',
        ]],
        killedBy: 'userinfo and a credential pair in a frame are redacted',
    },
    {
        label: 'the data: collapse removed — module source reaches the line',
        file: SANITIZE,
        edits: [[
            "withoutPairs.replace(DATA_URL, 'data:…')",
            'withoutPairs',
        ]],
        killedBy: 'a data: URL frame collapses',
    },
    {
        label: 'the cap moved before the redactions — a cut URL leaks a prefix',
        file: SANITIZE,
        edits: [
            [
                'redactDsnCredentials(line.trim())',
                'redactDsnCredentials(capCodePoints(line.trim(), MAX_FRAME))',
            ],
            ['capCodePoints(collapsed, MAX_FRAME)', 'collapsed'],
        ],
        killedBy: 'redaction runs before the frame cap',
    },
    {
        label: 'the frame cap off by one — 301 code points pass',
        file: SANITIZE,
        edits: [['const MAX_FRAME = 300', 'const MAX_FRAME = 301']],
        killedBy: 'each frame is capped at 300 code points',
    },
    {
        label: 'a frame skips safeForLog — ANSI and CR reach the terminal',
        file: SANITIZE,
        edits: [[
            'return safeForLog(capCodePoints(collapsed, MAX_FRAME))',
            'return capCodePoints(collapsed, MAX_FRAME)',
        ]],
        killedBy: 'ANSI escapes and a carriage return in a frame are encoded',
    },
    {
        label: 'the indent shrinks to two spaces',
        file: SANITIZE,
        edits: [[
            '`\\n    ${renderFrame(line)}`',
            '`\\n  ${renderFrame(line)}`',
        ]],
        killedBy: 'frames: 2 on a 5-frame stack',
    },
    // ---- Totality ------------------------------------------------------------
    {
        label: 'the stack read loses its guard — a throwing getter escapes',
        file: SANITIZE,
        edits: [[
            'return `\\n${UNREADABLE_STACK}`',
            "throw new Error('rethrown')",
        ]],
        killedBy: 'a throwing stack getter renders a sentinel',
    },
]

Deno.exit(
    await runBattery(
        '#488 mutation battery — the stack frames renderError prints on request',
        SUITES,
        MUTATIONS,
    ),
)
