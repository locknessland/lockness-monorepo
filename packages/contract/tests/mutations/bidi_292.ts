/**
 * @fileoverview #292's mutation battery, as a runnable script.
 *
 * **A mutation table in a comment is a claim; this is the thing that checks
 * it.** Same contract as `realtime/tests/mutations/prefix_288.ts` and
 * `redis/tests/mutations/subscribe_hardening_248.ts`: every row proves its
 * anchor matched exactly once and that the file changed on disk **before** any
 * test result is read, a mutant that does not type-check is reported DEAD
 * rather than counted as a survivor, and an uncaught module error is read as a
 * kill **before** the summary line.
 *
 * This battery earned its keep during the branch it was written for. The
 * `charCodeAt` row survived the first run, and the test the plan claimed would
 * pin the iteration mode did not: an unescaped astral character is appended
 * whole under either loop, so the byte-identical assertions passed. Only an
 * astral character that *is* escaped tells the two apart, because the escape is
 * built from the code and silently becomes the leading surrogate. The
 * assertion that closes it exists because this script measured its absence.
 *
 * ```bash
 * deno run -A packages/contract/tests/mutations/bidi_292.ts
 * ```
 *
 * Exit code is the number of unexpected survivors, so CI can gate on it.
 *
 * @module @lockness/contract/tests/mutations/bidi_292
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const SOURCE = new URL('../../logging/sanitize.ts', import.meta.url)
const SUITE = new URL('../log_sanitize.test.ts', import.meta.url).pathname

const MUTATIONS: Mutation[] = [
    {
        label: 'drop the Cf test — no format character is escaped at all',
        file: SOURCE,
        edits: [[
            '(code >= 0xad && FORMAT_CHARACTER.test(char) &&',
            '(false && code >= 0xad && FORMAT_CHARACTER.test(char) &&',
        ]],
        killedBy: 'the Cf criterion holds in both directions',
    },
    {
        label: 'drop the carve-out — the eleven content marks are escaped too',
        file: SOURCE,
        edits: [[
            '!CONTENT_FORMAT_MARKS.has(code)',
            'CONTENT_FORMAT_MARKS.size >= 0',
        ]],
        killedBy: 'the Cf criterion holds in both directions',
    },
    {
        label: 'invert the carve-out — only the eleven are escaped',
        file: SOURCE,
        edits: [[
            '!CONTENT_FORMAT_MARKS.has(code)',
            'CONTENT_FORMAT_MARKS.has(code)',
        ]],
        killedBy: 'the Cf criterion holds in both directions',
    },
    {
        label:
            'charCodeAt for codePointAt — the astral escape loses its codepoint',
        file: SOURCE,
        edits: [['char.codePointAt(0) ?? 0', 'char.charCodeAt(0)']],
        killedBy: 'an astral codepoint outside Cf survives byte-identical',
    },
    {
        label: 'drop the backslash escape — an escape stops having one parse',
        file: SOURCE,
        edits: [['            code === 0x5c ||\n', '']],
        killedBy: 'the backslash escape removes the spelling collision',
    },
    {
        label: 'the narrow escape above 0xFF — the ambiguity #292 removes',
        file: SOURCE,
        edits: [[
            '`\\\\u{${code.toString(16)}}`',
            '`\\\\x${code.toString(16)}`',
        ]],
        killedBy: 'encodes each bidi range the issue names',
    },
    {
        label: 'charge the cap against emitted output — the eviction primitive',
        file: SOURCE,
        edits: [['consumed === MAX_LENGTH', 'encoded.length >= MAX_LENGTH']],
        killedBy: 'a hostile prefix cannot evict the diagnostic tail',
    },
    {
        label: 'off-by-one at the cap — 513 code points pass',
        file: SOURCE,
        edits: [['consumed === MAX_LENGTH', 'consumed === MAX_LENGTH + 1']],
        killedBy: 'the cap is charged against consumed input',
    },
    {
        label:
            'a `g` flag on the criterion — the second of two adjacent Cf leaks',
        file: SOURCE,
        edits: [['/\\p{Cf}/u', '/\\p{Cf}/gu']],
        killedBy: 'a RUN of format characters is escaped',
    },
    {
        label:
            'the \\xXX boundary at 0x9f — U+00AD takes the wrong escape width',
        file: SOURCE,
        edits: [['} else if (code <= 0xff) {', '} else if (code <= 0x9f) {']],
        killedBy: 'encodes the format characters the issue did NOT name',
    },
    {
        label:
            'the 0xad fast guard raised to 0x100 — U+00AD stops being escaped',
        file: SOURCE,
        edits: [[
            'code >= 0xad && FORMAT_CHARACTER.test(char)',
            'code >= 0x100 && FORMAT_CHARACTER.test(char)',
        ]],
        killedBy: 'encodes the format characters the issue did NOT name',
    },
    {
        label: "renderError's own cap back to UTF-16 units — the 2x residual",
        file: SOURCE,
        edits: [[
            'capCodePoints(redacted, MAX_MESSAGE)',
            'redacted.slice(0, MAX_MESSAGE)',
        ]],
        // Re-anchored when #302 moved this expression into `renderOne` and
        // renamed the constant. The battery caught its own staleness and
        // reported DEAD rather than reading the run — which is the whole
        // reason the anchor-matched-exactly-once check exists.
        killedBy: 'its own 200-cap is charged in code points too',
    },
    {
        label:
            'drop the truncation count — the marker stops being self-evidencing',
        file: SOURCE,
        edits: [[
            '[truncated at ${MAX_LENGTH} of ${total}]',
            '[truncated]',
        ]],
        killedBy: 'truncates at exactly the documented bound',
    },
    {
        label:
            'drop the C0 clause — the original injection this module exists for',
        file: SOURCE,
        edits: [['code < 0x20 ||', 'code < 0x00 ||']],
        killedBy: 'neutralises a newline injected through a decoded path',
    },
]

Deno.exit(
    await runBattery(
        '#292 mutation battery — Unicode format-character encoding',
        [SUITE],
        MUTATIONS,
    ),
)
