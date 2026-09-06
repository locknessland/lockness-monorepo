/**
 * @fileoverview #291's mutation battery.
 *
 * Same contract as `prefix_288.ts` and `contract/tests/mutations/bidi_292.ts`:
 * each anchor must match exactly once, the file is re-read to prove it changed,
 * a mutant that does not type-check is DEAD rather than a survivor, an uncaught
 * module error is a kill checked BEFORE the summary, and every mutated file is
 * restored on SIGINT/SIGTERM with any failure named rather than swallowed.
 *
 * The rows that matter are the three that revert an object-passing site. Those
 * were invisible to this package's whole suite before #291, because every
 * console-capturing test in it records `String(args[0])` and the error lives in
 * `args[1]`.
 *
 * Two rows mutate the TEST file rather than the source. That is deliberate: a
 * guard whose own failure nothing observes is not a guard, and the dispose
 * restore is exactly that shape — every test installs its own recorder, so a
 * failed restore is invisible inside this file and corrupts every file that
 * runs after it.
 *
 * The compile guard reaches every row because the suite imports `manager.ts`,
 * `websocket.ts` and `events_bridge.ts`. It did not when this battery was
 * written: the bridge rows were never type-checked, so a bridge mutant with a
 * syntax error would have been reported SURVIVED rather than DEAD.
 *
 * ```bash
 * deno run -A packages/realtime/tests/mutations/log_encoding_291.ts
 * ```
 *
 * @module @lockness/realtime/tests/mutations/log_encoding_291
 */

const MANAGER = new URL('../../manager.ts', import.meta.url)
const BRIDGE = new URL('../../events_bridge.ts', import.meta.url)
const SOCKET = new URL('../../websocket.ts', import.meta.url)
const SELF = new URL('../log_encoding_291.test.ts', import.meta.url)
const SUITE = new URL('../log_encoding_291.test.ts', import.meta.url).pathname

type Outcome = 'killed' | 'survived' | 'did-not-compile'

interface Mutation {
    label: string
    file: URL
    edits: [string, string][]
    expectSurvival?: string
}

const MUTATIONS: Mutation[] = [
    {
        label: 'evict-teardown back to a raw error.message',
        file: MANAGER,
        edits: [[
            '`after hard-close: ${renderError(error)}`',
            '`after hard-close: ${String(error)}`',
        ]],
    },
    {
        label: 'evict-teardown stops encoding the client id',
        file: MANAGER,
        edits: [['${safeForLog(clientId)}', '${clientId}']],
    },
    {
        label: 'durable-revocation WARN back to passing the error object',
        file: MANAGER,
        edits: [[
            '                    `by reconcile: ${renderError(error)}`,\n            )',
            "                    'by reconcile',\n                error,\n            )",
        ]],
    },
    {
        label: 'the default publish sink back to passing the error object',
        file: MANAGER,
        edits: [[
            '`realtime: broadcast publish failed: ${renderError(error)}`,',
            "'realtime: broadcast publish failed',\n                    error,",
        ]],
    },
    {
        label:
            'events_bridge converted — the edit this whole guard exists to stop',
        file: BRIDGE,
        edits: [[
            'const message = error instanceof Error ? error.message : String(error)',
            'const message = error instanceof Error\n            ? safeForLog(error.message)\n            : String(error)',
        ]],
        // `safeForLog`, not `renderError`: the first version of this row
        // injected a call to a name `events_bridge.ts` does not import, so it
        // did not type-check and no test ran. It read as KILLED only because
        // the compile guard could not see the bridge at all back then — the
        // suite did not import it. That is the difference between a mutation
        // and a typo, and this battery is supposed to be able to tell.
    },
    {
        label: 'the websocket default sink back to passing the error object',
        file: SOCKET,
        edits: [[
            '`realtime: unhandled websocket error: ${renderError(error)}`,',
            "'realtime: unhandled websocket error',\n                error,",
        ]],
    },
    {
        label: 'the transport detail dropped — the line renders to nothing',
        file: SOCKET,
        edits: [[
            '`websocket transport error: ${detail}`',
            "'websocket transport error'",
        ]],
    },
    {
        label: 'the public-channel warning stops encoding the event name',
        file: BRIDGE,
        edits: [['${safeForLog(name)}', '${name}']],
    },
    {
        label: 'the public-channel warning stops encoding the channel',
        file: BRIDGE,
        edits: [['${safeForLog(channel)}', '${channel}']],
    },
    {
        label: 'the durable-revocation WARN raised to console.error',
        file: MANAGER,
        edits: [[
            "console.warn(\n                'realtime: the durable revocation write failed",
            "console.error(\n                'realtime: the durable revocation write failed",
        ]],
    },
    {
        label: "captureConsole's dispose emptied — a patched console leaks out",
        file: SELF,
        edits: [[
            '        [Symbol.dispose]() {\n            console.warn = realWarn\n            console.error = realError\n        },',
            '        [Symbol.dispose]() {},',
        ]],
    },
    {
        label: "events_bridge's CONTROL FLOW label removed",
        file: BRIDGE,
        edits: [['// CONTROL FLOW, NOT A LOG LINE.', '// A note.']],
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
    if (/Type checking failed|TS\d+ \[ERROR\]/.test(out)) {
        return 'did-not-compile'
    }
    const uncaught = /uncaught error|error: Test failed/.test(out)
    const summary = out.match(/(\d+) passed[^|]*\| (\d+) failed/)
    if (!summary) return uncaught ? 'killed' : 'did-not-compile'
    return uncaught || Number(summary[2]) > 0 ? 'killed' : 'survived'
}

const inFlight = new Map<string, string>()

function restoreAll(): void {
    const restored: string[] = []
    const failed: string[] = []
    for (const [path, original] of inFlight) {
        try {
            Deno.writeTextFileSync(path, original)
            restored.push(path)
        } catch (error) {
            // Never silent: a failed restore leaves a LIVE MUTANT in the tree,
            // and claiming a restore that did not happen is the one outcome
            // this handler exists to prevent.
            console.error(`FAILED to restore ${path}:`, error)
            failed.push(path)
        }
    }
    if (restored.length > 0) {
        console.error(`\nInterrupted — restored: ${restored.join(', ')}`)
    }
    if (failed.length > 0) {
        console.error(
            `\nSTILL MUTATED — these hold a live mutant right now: ${
                failed.join(', ')
            }\nRun \`git checkout --\` on them before anything else.`,
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
console.log('#291 mutation battery — manager log encoding\n')
for (const mutation of MUTATIONS) {
    const original = await Deno.readTextFile(mutation.file)
    let mutated = original
    let ok = true
    for (const [from, to] of mutation.edits) {
        const hits = mutated.split(from).length - 1
        if (hits !== 1) {
            console.log(
                `DEAD MUTANT  ${mutation.label} — an anchor matched ${hits} ` +
                    'times, expected 1. The source moved; fix the anchor.',
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
            `DEAD MUTANT  ${mutation.label} — the mutant does not type-check, ` +
                'so no test ran.',
        )
        unexpected++
    } else if (outcome === 'killed') {
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
