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
 * #508 added three groups: the header dropped by its line count before the
 * filter, the `data:` collapse running to the frame's own position, and the
 * CLI's raw switch, whose read must stay total and prompt-free — which is why
 * the CLI's two suites run here too.
 *
 * ```bash
 * deno run -A packages/contract/tests/mutations/error_frames_488.ts
 * ```
 *
 * @module @lockness/contract/tests/mutations/error_frames_488
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const SANITIZE = new URL('../../logging/sanitize.ts', import.meta.url)
/** The CLI's raw switch (#508): its read is the dispatcher's frame sink. */
const RAW_ERRORS = new URL('../../../cli/raw_errors.ts', import.meta.url)
const SUITES = [
    new URL('../error_frames_488.test.ts', import.meta.url).pathname,
    new URL('../../../cli/tests/raw_errors.test.ts', import.meta.url).pathname,
    new URL('../../../cli/tests/cli_dispatch.test.ts', import.meta.url)
        .pathname,
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
        // Since #508 the header is dropped by its line count, so without the
        // filter it is no longer printed twice: what leaks is every other
        // non-frame line after it.
        label:
            'the frame filter removed — non-frame lines after the header print',
        file: SANITIZE,
        edits: [[
            '.filter((line) => FRAME_LINE.test(line))',
            '.filter(() => true)',
        ]],
        killedBy: 'only lines shaped like a frame are kept',
    },
    {
        label:
            'the header skip removed — forged message lines print as frames (#508)',
        file: SANITIZE,
        edits: [['.slice(headerLineCount(stack, header))', '.slice(0)']],
        killedBy: 'forged at-lines in the message are message text',
    },
    {
        label: 'the header skip one line short — the last forged line prints',
        file: SANITIZE,
        edits: [[
            "return stack.startsWith(header) ? header.split('\\n').length : 0",
            "return stack.startsWith(header) ? header.split('\\n').length - 1 : 0",
        ]],
        killedBy: 'forged at-lines in the message are message text',
    },
    {
        label: 'a header the stack does not start with is skipped anyway',
        file: SANITIZE,
        edits: [['return stack.startsWith(header) ?', 'return true ?']],
        killedBy: 'a header the stack does not start with is not skipped',
    },
    {
        label:
            'the header read moved out of the guard — a throwing name escapes',
        file: SANITIZE,
        edits: [
            ['        header = Error.prototype.toString.call(error)\n', ''],
            [
                "    if (typeof stack !== 'string') return ''\n",
                "    if (typeof stack !== 'string') return ''\n    header = Error.prototype.toString.call(error)\n",
            ],
        ],
        killedBy:
            'a header that cannot be built renders the stack as unreadable',
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
        // Re-anchored when #436 folded both redactions into
        // `redactCredentials`: the frame keeps only the pair pass.
        edits: [[
            'redactCredentials(line.trim())',
            'redactQueryCredentials(line.trim())',
        ]],
        killedBy: 'userinfo and a credential pair in a frame are redacted',
    },
    {
        label: 'a frame skips the credential-pair redaction',
        file: SANITIZE,
        // Re-anchored when #436 folded both redactions into
        // `redactCredentials`: the frame keeps only the userinfo pass.
        edits: [[
            'redactCredentials(line.trim())',
            'redactDsnCredentials(line.trim())',
        ]],
        killedBy: 'userinfo and a credential pair in a frame are redacted',
    },
    {
        label: 'the data: collapse removed — module source reaches the line',
        file: SANITIZE,
        edits: [[
            'collapseDataUrl(withoutCredentials)',
            'withoutCredentials',
        ]],
        killedBy: 'a data: URL frame collapses',
    },
    {
        label:
            'the collapse stops at the first space or ) again — source after it prints (#508)',
        file: SANITIZE,
        edits: [[
            "return `${frame.slice(0, start)}data:…${position?.[0] ?? ''}`",
            "return frame.replace(/data:[^\\s)]+/g, 'data:…')",
        ]],
        killedBy: 'a real unencoded data: module with a space and a )',
    },
    {
        label: 'the collapse built on `.` — a CR or U+2028 ends it early',
        file: SANITIZE,
        edits: [[
            "return `${frame.slice(0, start)}data:…${position?.[0] ?? ''}`",
            "return frame.replace(/data:.*(?=:\\d+:\\d+\\)?$)|data:.*$/, 'data:…')",
        ]],
        killedBy: 'a data: URL collapses whatever characters its source holds',
    },
    {
        label: "the frame's position dropped from a collapsed data: URL",
        file: SANITIZE,
        edits: [["data:…${position?.[0] ?? ''}`", 'data:…`']],
        killedBy:
            'a data: URL frame collapses to data:… and keeps its position',
    },
    {
        label:
            'the position not anchored to the end — a :line:col in source wins',
        file: SANITIZE,
        edits: [[
            'const POSITION_SUFFIX = /:\\d+:\\d+\\)?$/',
            'const POSITION_SUFFIX = /:\\d+:\\d+\\)?/',
        ]],
        killedBy:
            'a data: URL frame collapses to data:… and keeps its position',
    },
    {
        label: 'a data: URL with no position is kept whole',
        file: SANITIZE,
        edits: [[
            "const position = POSITION_SUFFIX.exec(frame.slice(start + 'data:'.length))",
            "const position = POSITION_SUFFIX.exec(frame.slice(start + 'data:'.length))\n    if (position === null) return frame",
        ]],
        killedBy: 'a data: URL collapses whatever characters its source holds',
    },
    {
        label: 'the scheme matched case-sensitively — DATA: keeps its source',
        file: SANITIZE,
        edits: [['const DATA_URL = /data:/i', 'const DATA_URL = /data:/']],
        killedBy: 'a data: URL collapses whatever characters its source holds',
    },
    {
        label: 'the cap moved before the redactions — a cut URL leaks a prefix',
        file: SANITIZE,
        edits: [
            [
                'redactCredentials(line.trim())',
                'redactCredentials(capCodePoints(line.trim(), MAX_FRAME))',
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
    // ---- The CLI's raw switch (#508) -----------------------------------------
    {
        label:
            "a value that is not valid Unicode re-thrown — the command's error is lost",
        file: RAW_ERRORS,
        edits: [[
            "if (error instanceof Deno.errors.NotCapable) return { state: 'off' }",
            "if (error instanceof Deno.errors.NotCapable) return { state: 'off' }\n        if (error instanceof Deno.errors.InvalidData) throw error",
        ]],
        killedBy: 'T6 a switch value that is not valid Unicode',
    },
    {
        label: 'InvalidData shown as <unreadable> — the notice loses its cause',
        file: RAW_ERRORS,
        edits: [[
            'placeholder: error instanceof Deno.errors.InvalidData',
            'placeholder: false',
        ]],
        killedBy:
            'a value that is not valid Unicode (InvalidData) reads as off',
    },
    {
        label: 'the permission check removed — the read can prompt',
        file: RAW_ERRORS,
        edits: [["if (state !== 'granted') return undefined", '']],
        killedBy: 'reads as off without touching the environment',
    },
]

Deno.exit(
    await runBattery(
        '#488 mutation battery — the stack frames renderError prints on request',
        SUITES,
        MUTATIONS,
    ),
)
