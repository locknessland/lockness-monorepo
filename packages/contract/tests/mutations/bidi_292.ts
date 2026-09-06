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

const SOURCE = new URL('../../logging/sanitize.ts', import.meta.url)
const SUITE = new URL('../log_sanitize.test.ts', import.meta.url).pathname

/** What one run of the suite concluded. */
type Outcome = 'killed' | 'survived' | 'did-not-compile'

/** One mutation: where it applies, what it replaces, and what it should prove. */
interface Mutation {
    label: string
    file: URL
    edits: [string, string][]
    /** Set only for a mutant that provably cannot change behaviour. */
    expectSurvival?: string
}

const MUTATIONS: Mutation[] = [
    {
        label: 'drop the Cf test — no format character is escaped at all',
        file: SOURCE,
        edits: [[
            '(code >= 0xad && FORMAT_CHARACTER.test(char) &&',
            '(false && code >= 0xad && FORMAT_CHARACTER.test(char) &&',
        ]],
    },
    {
        label: 'drop the carve-out — the eleven content marks are escaped too',
        file: SOURCE,
        edits: [[
            '!CONTENT_FORMAT_MARKS.has(code)',
            'CONTENT_FORMAT_MARKS.size >= 0',
        ]],
    },
    {
        label: 'invert the carve-out — only the eleven are escaped',
        file: SOURCE,
        edits: [[
            '!CONTENT_FORMAT_MARKS.has(code)',
            'CONTENT_FORMAT_MARKS.has(code)',
        ]],
    },
    {
        label:
            'charCodeAt for codePointAt — the astral escape loses its codepoint',
        file: SOURCE,
        edits: [['char.codePointAt(0) ?? 0', 'char.charCodeAt(0)']],
    },
    {
        label: 'drop the backslash escape — an escape stops having one parse',
        file: SOURCE,
        edits: [['            code === 0x5c ||\n', '']],
    },
    {
        label: 'the narrow escape above 0xFF — the ambiguity #292 removes',
        file: SOURCE,
        edits: [[
            '`\\\\u{${code.toString(16)}}`',
            '`\\\\x${code.toString(16)}`',
        ]],
    },
    {
        label: 'charge the cap against emitted output — the eviction primitive',
        file: SOURCE,
        edits: [['consumed === MAX_LENGTH', 'encoded.length >= MAX_LENGTH']],
    },
    {
        label: 'off-by-one at the cap — 513 code points pass',
        file: SOURCE,
        edits: [['consumed === MAX_LENGTH', 'consumed === MAX_LENGTH + 1']],
    },
    {
        label:
            'a `g` flag on the criterion — the second of two adjacent Cf leaks',
        file: SOURCE,
        edits: [['/\\p{Cf}/u', '/\\p{Cf}/gu']],
    },
    {
        label:
            'the \\xXX boundary at 0x9f — U+00AD takes the wrong escape width',
        file: SOURCE,
        edits: [['} else if (code <= 0xff) {', '} else if (code <= 0x9f) {']],
    },
    {
        label:
            'the 0xad fast guard raised to 0x100 — U+00AD stops being escaped',
        file: SOURCE,
        edits: [[
            'code >= 0xad && FORMAT_CHARACTER.test(char)',
            'code >= 0x100 && FORMAT_CHARACTER.test(char)',
        ]],
    },
    {
        label: "renderError's own cap back to UTF-16 units — the 2x residual",
        file: SOURCE,
        edits: [[
            'safeForLog(capCodePoints(redacted, MAX))',
            'safeForLog(\n            redacted.length > MAX\n                ? `${redacted.slice(0, MAX)}…`\n                : redacted,\n        )',
        ]],
    },
    {
        label:
            'drop the truncation count — the marker stops being self-evidencing',
        file: SOURCE,
        edits: [[
            '[truncated at ${MAX_LENGTH} of ${total}]',
            '[truncated]',
        ]],
    },
    {
        label:
            'drop the C0 clause — the original injection this module exists for',
        file: SOURCE,
        edits: [['code < 0x20 ||', 'code < 0x00 ||']],
    },
]

async function suite(): Promise<Outcome> {
    const run = await new Deno.Command(Deno.execPath(), {
        args: ['test', '--allow-all', SUITE],
        env: Deno.env.toObject(),
    }).output()
    const raw = new TextDecoder().decode(run.stdout) +
        new TextDecoder().decode(run.stderr)
    // deno-lint-ignore no-control-regex
    const out = raw.replace(/\x1b\[[0-9;]*m/g, '')
    // A MUTANT THAT DOES NOT COMPILE IS DEAD, NOT A SURVIVOR: no test ran, and
    // "no failures" reads as green.
    if (/Type checking failed|TS\d+ \[ERROR\]/.test(out)) {
        return 'did-not-compile'
    }
    // An uncaught module error is a kill, checked BEFORE the summary rather
    // than only when one is missing — Deno still prints a count after one.
    const uncaught = /uncaught error|error: Test failed/.test(out)
    const summary = out.match(/(\d+) passed[^|]*\| (\d+) failed/)
    if (!summary) return uncaught ? 'killed' : 'did-not-compile'
    return uncaught || Number(summary[2]) > 0 ? 'killed' : 'survived'
}

/**
 * Files this run has mutated and not yet restored.
 *
 * A `finally` does not run on a signal, and a reviewer aborting this script
 * once left a live mutant in the tree. A battery that can leave the repository
 * holding a defect is a worse hazard than the ones it hunts.
 */
const inFlight = new Map<string, string>()

function restoreAll(): void {
    const restored: string[] = []
    const failed: string[] = []
    for (const [path, original] of inFlight) {
        try {
            Deno.writeTextFileSync(path, original)
            restored.push(path)
        } catch (error) {
            // NEVER silent. The line below used to claim a restore whose
            // failure this catch had just discarded — an instrument reporting
            // a result it did not measure, arriving inside the instrument
            // built to find exactly that. A failed restore leaves a LIVE
            // MUTANT in the working tree, which is the one outcome this
            // handler exists to prevent.
            console.error(`FAILED to restore ${path}:`, error)
            failed.push(path)
        }
    }
    if (restored.length > 0) {
        console.error(
            `\nInterrupted — restored ${restored.length} mutated file(s): ${
                restored.join(', ')
            }`,
        )
    }
    if (failed.length > 0) {
        console.error(
            `\nSTILL MUTATED — ${failed.length} file(s) could NOT be restored ` +
                `and hold a live mutant right now: ${failed.join(', ')}\n` +
                'Run `git checkout --` on them before anything else.',
        )
    }
    inFlight.clear()
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    Deno.addSignalListener(signal, () => {
        restoreAll()
        Deno.exit(130)
    })
}

let unexpected = 0
console.log('#292 mutation battery — Unicode format-character encoding\n')
for (const mutation of MUTATIONS) {
    const original = await Deno.readTextFile(mutation.file)
    let mutated = original
    let ok = true
    for (const [from, to] of mutation.edits) {
        const hits = mutated.split(from).length - 1
        if (hits !== 1) {
            console.log(
                `DEAD MUTANT  ${mutation.label} — an anchor matched ${hits} ` +
                    'times, expected 1. The source moved; fix the anchor ' +
                    'rather than reading this run.',
            )
            ok = false
            unexpected++
            break
        }
        mutated = mutated.replace(from, to)
    }
    if (!ok) continue
    inFlight.set(mutation.file.pathname, original)
    await Deno.writeTextFile(mutation.file, mutated)
    if (await Deno.readTextFile(mutation.file) === original) {
        await Deno.writeTextFile(mutation.file, original)
        inFlight.delete(mutation.file.pathname)
        console.log(`DEAD MUTANT  ${mutation.label} — file unchanged`)
        unexpected++
        continue
    }
    let outcome: Outcome
    try {
        outcome = await suite()
    } finally {
        await Deno.writeTextFile(mutation.file, original)
        inFlight.delete(mutation.file.pathname)
    }
    if (outcome === 'did-not-compile') {
        console.log(
            `DEAD MUTANT  ${mutation.label} — the mutated source does not ` +
                'type-check, so no test ran.',
        )
        unexpected++
        continue
    }
    if (outcome === 'killed') {
        console.log(`KILLED       ${mutation.label}`)
    } else if (mutation.expectSurvival) {
        console.log(
            `SURVIVED*    ${mutation.label}\n             ${mutation.expectSurvival}`,
        )
    } else {
        console.log(`SURVIVED     ${mutation.label}`)
        unexpected++
    }
}
console.log(`\n${unexpected} unexpected survivor(s).`)
Deno.exit(unexpected)
