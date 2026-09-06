/**
 * @fileoverview #248's mutation battery (#286, #287, #296), runnable.
 *
 * A table in a comment is a claim; this is what checks it. Every row asserts
 * its anchor matches **exactly once**, writes, re-reads to prove the file
 * changed, and only then reads the suite summary — a mutation that never
 * executed reads as a result, and this repo has recorded that happening.
 *
 * ```bash
 * deno run -A packages/redis/tests/mutations/subscribe_hardening_248.ts
 * # add LOCKNESS_REDIS_INTEGRATION=1 LOCKNESS_REDIS_PORT=<port> for the
 * # #296 rows, which need a real broker: the defect is a PROCESS EXIT and no
 * # in-process double can reproduce one.
 * ```
 *
 * Exit code is the number of **unexpected** survivors. Rows marked
 * `expectSurvival` are guards with no witness, recorded rather than hidden —
 * see the notes on each.
 *
 * @module @lockness/redis/tests/mutations/subscribe_hardening_248
 */

const SUB = new URL('../../subscriber.ts', import.meta.url)
const RESP = new URL('../../resp.ts', import.meta.url)
const CONN = new URL('../../connection.ts', import.meta.url)
const TESTS = new URL('../subscriber.test.ts', import.meta.url)
const SUITE = new URL('../', import.meta.url).pathname

/** One mutation, and what it is expected to prove. */
interface Mutation {
    label: string
    file: URL
    edits: readonly (readonly [string, string])[]
    /** A guard kept without a witness — the reason is required, not optional. */
    expectSurvival?: string
}

const MUTATIONS: readonly Mutation[] = [
    // ── #287: the single-flight guard ──────────────────────────────────────
    {
        label: '#287 discard clears the dial unconditionally (the defect)',
        file: CONN,
        edits: [[
            'if (this.pending?.conn === conn) this.pending = null',
            'this.pending = null',
        ]],
    },
    {
        label: '#287 the promise is never paired with its socket',
        file: CONN,
        edits: [[
            'if (this.pending) this.pending.conn = conn',
            'if (false) this.pending!.conn = conn',
        ]],
    },
    // ── #286: the write deadline ───────────────────────────────────────────
    {
        label: '#286 the write deadline is not passed to writeFrame',
        file: SUB,
        edits: [[
            'return writeFrame(conn, frame, this.#writeDeadlineMs)',
            'return writeFrame(conn, frame)',
        ]],
    },
    {
        label: '#286 the ceiling is removed (raw liveness window)',
        file: SUB,
        edits: [[
            'this.#writeDeadlineMs = Math.min(\n            this.#livenessMs,\n            WRITE_STALL_CEILING_MS,\n        )',
            'this.#writeDeadlineMs = this.#livenessMs',
        ]],
    },
    {
        label: '#286 the deadline is per-write rather than per-frame',
        file: RESP,
        edits: [[
            'const remaining = deadline - Date.now()',
            'const remaining = timeoutMs',
        ]],
    },
    {
        label: '#286 writeFrame accepts a nonsense deadline',
        file: RESP,
        edits: [[
            'if (\n        timeoutMs !== undefined &&\n        (!Number.isFinite(timeoutMs) || timeoutMs <= 0)\n    ) {',
            'if (false) {',
        ]],
    },
    // ── #286: the write chain ──────────────────────────────────────────────
    {
        label:
            '#286 no in-closure generation check (a queued write reaches a dead socket)',
        file: SUB,
        edits: [[
            'if (this.#writeChainConn !== conn) {\n                throw new Error(',
            'if (false) {\n                throw new Error(',
        ]],
    },
    {
        label: '#286 no rebase on a generation change',
        file: SUB,
        edits: [[
            'if (this.#writeChainConn !== conn) {\n            this.#writeChain = Promise.resolve()\n            this.#writeChainConn = conn\n        }',
            'this.#writeChainConn = conn',
        ]],
        expectSurvival:
            'Redundant with the conditional clear in `#discardSocket`, given ' +
            'that every current path discards a socket before replacing it — ' +
            'so no reachable sequence distinguishes them. Kept because that ' +
            'is a property of the CALLERS, not of this method, and the file ' +
            'already records the cost of depending on it: the `#keepaliveConn` ' +
            'comment describes the same assumption holding until it did not.',
    },
    {
        label: '#286 the discard clear is made unconditional',
        file: SUB,
        edits: [[
            'if (this.#writeChainConn === conn) {\n            this.#writeChain = Promise.resolve()\n            this.#writeChainConn = null\n        }',
            'this.#writeChain = Promise.resolve()\n        this.#writeChainConn = null',
        ]],
        expectSurvival:
            'Reaching it needs a STALE discard while a newer generation is ' +
            'live, which needs two generations plus a late-firing deadline — ' +
            'constructible in principle (the plan audit wrote the sequence ' +
            'out) and not constructed here. This is the highest-value ' +
            'uncovered guard in the branch and it is named as such rather ' +
            'than left to look covered.',
    },
    // ── #286: the keepalive's discard obligation ───────────────────────────
    {
        label: '#286 the keepalive no longer discards and schedules',
        file: SUB,
        edits: [[
            "if (error instanceof RespFramingError) {\n                    this.#discardSocket(conn)\n                    this.#scheduleRetry(true, error, 'keepalive write stalled')\n                }",
            'if (false) {\n                    this.#discardSocket(conn)\n                }',
        ]],
    },
    // ── #287: the strict parser ────────────────────────────────────────────
    {
        label: '#287 length prefixes go back to Number()',
        file: RESP,
        edits: [[
            "function parseLength(line: string): number | null {\n    if (line === '-1') return -1\n    if (!/^[0-9]+$/.test(line)) return null",
            "function parseLength(line: string): number | null {\n    if (line === '-1') return -1\n    if (false) return null",
        ]],
    },
    {
        label: '#287 the bulk terminator is consumed without being checked',
        file: RESP,
        edits: [[
            'if (terminator[0] !== 0x0d || terminator[1] !== 0x0a) {',
            'if (false) {',
        ]],
    },
    // ── #296: containment ──────────────────────────────────────────────────
    {
        label: '#296 the handler call is unguarded again (needs a live broker)',
        file: SUB,
        edits: [[
            '} catch (error) {\n            this.#reportHandlerFault(pattern.value, error)\n        }',
            '} catch (error) {\n            throw error\n        }',
        ]],
    },
    {
        label: '#296 the pattern is logged unencoded (needs a live broker)',
        file: SUB,
        edits: [[
            'a handler for ${safeForLog(pattern)} threw',
            'a handler for ${pattern} threw',
        ]],
    },
    {
        label: '#296 an ASYNC handler rejection escapes containment',
        file: SUB,
        edits: [[
            'Promise.resolve(result).catch((error: unknown) =>\n                    this.#reportHandlerFault(pattern.value, error)\n                )',
            'void result',
        ]],
    },
    {
        label: '#287 the warn helper stops restoring on scope exit',
        file: TESTS,
        edits: [[
            'return { messages, [Symbol.dispose]: () => void (console.warn = real) }',
            'return { messages, [Symbol.dispose]: () => {} }',
        ]],
    },
    {
        label: '#286 the zero-progress stall is a bare Error again',
        file: RESP,
        edits: [[
            'throw new RespFramingError(\n                `Redis write stalled after ${offset} of ${frame.byteLength} bytes`,\n            )',
            'throw new Error(\n                `Redis write stalled after ${offset} of ${frame.byteLength} bytes`,\n            )',
        ]],
        expectSurvival:
            'The zero-progress branch needs a socket that returns 0 from ' +
            '`conn.write` AND is owned by the keepalive, which no fixture ' +
            'builds — the resp-level test covers the throw, not which type it ' +
            'is. Kept as one type for one obligation: two seats found the ' +
            'inconsistency by reading, and reading is what will find it again.',
    },
    {
        label: '#296 the per-generation fault counter never resets',
        file: SUB,
        edits: [[
            '        this.#handlerFaults.clear()',
            '        // reset removed',
        ]],
        expectSurvival:
            'Reaching it needs a reconnect plus repeated throws on both ' +
            'generations. It degrades reporting only — a suppressed count ' +
            'rather than a dropped message — which is why it is the one row ' +
            'here left uncovered on purpose rather than for want of a fixture.',
    },
]

/** What a run of the suite under a mutation actually told us. */
type Outcome = 'killed' | 'survived' | 'did-not-compile'

async function suite(): Promise<Outcome> {
    const run = await new Deno.Command(Deno.execPath(), {
        args: ['test', '--allow-all', SUITE],
        env: Deno.env.toObject(),
    }).output()
    const raw = new TextDecoder().decode(run.stdout) +
        new TextDecoder().decode(run.stderr)
    // deno-lint-ignore no-control-regex
    const out = raw.replace(/\x1b\[[0-9;]*m/g, '')
    // AN UNCAUGHT MODULE ERROR IS A KILL, and it has to be checked BEFORE the
    // summary — not only when the summary is missing.
    //
    // Measured the hard way: the async-containment mutation takes the whole
    // test file down with an unhandled rejection, and Deno then prints a
    // summary reading `0 passed | 0 failed`. Reading only the failure count
    // called that mutant a SURVIVOR when it was killed. That is the same class
    // of defect this battery exists to find — an instrument reporting a result
    // it did not measure — arriving in the instrument itself.
    // A MUTANT THAT DOES NOT COMPILE IS DEAD, NOT A SURVIVOR — and this is the
    // third distinct way this script has misreported a result, each found by
    // measuring rather than by reading. `if (false) { … }` around a block that
    // was the only consumer of a local makes that local unused, TypeScript
    // refuses the file, no test runs, and "no failures" reads as green.
    if (/Type checking failed|TS\d+ \[ERROR\]/.test(out)) {
        return 'did-not-compile'
    }
    // An uncaught module error is a kill, and it has to be checked BEFORE the
    // summary rather than only when one is missing: an unhandled rejection
    // takes the file down and Deno still prints a count.
    const uncaught = /uncaught error|error: Test failed/.test(out)
    const summary = out.match(/(\d+) passed[^|]*\| (\d+) failed/)
    if (!summary) return uncaught ? 'killed' : 'did-not-compile'
    return uncaught || Number(summary[2]) > 0 ? 'killed' : 'survived'
}

/**
 * Files this run has mutated and not yet restored.
 *
 * **A `finally` is not enough, and that was proved rather than argued**: a
 * reviewer aborted this script mid-run and left a live mutant in `resp.ts`. No
 * `finally` runs on SIGINT or SIGTERM, so a script that edits the working tree
 * has to restore on the signal too. A mutation battery that can leave the
 * repository holding a defect is a worse hazard than the ones it hunts.
 */
const inFlight = new Map<string, string>()

function restoreAll(): void {
    for (const [path, original] of inFlight) {
        try {
            Deno.writeTextFileSync(path, original)
        } catch {
            // Best effort: a partially-restored tree is still better reported
            // than silently left, and the message below says which file.
        }
    }
    if (inFlight.size > 0) {
        console.error(
            `\nInterrupted — restored ${inFlight.size} mutated file(s): ${
                [...inFlight.keys()].join(', ')
            }`,
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
console.log('#248 mutation battery — subscribe-connection hardening\n')
for (const mutation of MUTATIONS) {
    const original = await Deno.readTextFile(mutation.file)
    let mutated = original
    let ok = true
    for (const [from, to] of mutation.edits) {
        const hits = mutated.split(from).length - 1
        if (hits !== 1) {
            console.log(
                `DEAD MUTANT  ${mutation.label} — an anchor matched ${hits} ` +
                    'times. The source moved; fix the anchor rather than ' +
                    'reading this run.',
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
                'type-check, so no test ran. Rewrite the edit so it compiles; ' +
                'a mutant that cannot execute proves nothing either way.',
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
