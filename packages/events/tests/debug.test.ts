/**
 * The debug switch, and the one rule that matters about it.
 *
 * A debug line may name an event and count listeners. It may never carry a
 * payload — the framework's own events hold the request `Context`, with its
 * headers and session cookie. The design makes that unrepresentable rather than
 * forbidden: `debugLog` takes a closed record with no free-text field, so the
 * type checker enforces it at every future call site.
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { EventEmitter } from '../mod.ts'
import { debugLog, isDebugEnabled, setEventsDebug } from '../debug.ts'

/** Captures console.debug for the duration of one test. */
async function captured(run: () => void | Promise<void>): Promise<string[]> {
    const lines: string[] = []
    const original = console.debug
    console.debug = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
        await run()
    } finally {
        console.debug = original
    }
    return lines
}

Deno.test('debug - is off by default and writes nothing', async () => {
    assertEquals(isDebugEnabled(), false)

    const lines = await captured(async () => {
        const emitter = new EventEmitter()
        emitter.on('x', () => {})
        await emitter.emit('x', { anything: 1 })
    })

    assertEquals(lines, [])
})

Deno.test('debug - reports registration, emit and dispatch when switched on', async () => {
    const lines = await captured(async () => {
        setEventsDebug(true)
        try {
            const emitter = new EventEmitter()
            emitter.on('UserCreated', () => {})
            emitter.on('UserCreated', () => {})
            await emitter.emit('UserCreated', { id: 1 })
        } finally {
            setEventsDebug(false)
        }
    })

    const joined = lines.join('\n')
    assertStringIncludes(joined, 'register')
    assertStringIncludes(joined, 'emit')
    assertStringIncludes(joined, 'dispatch')
    assertStringIncludes(joined, 'UserCreated')
    assertStringIncludes(joined, '2 listener(s)')
    assertEquals(isDebugEnabled(), false, 'and it went back off')
})

Deno.test('debug - a payload never reaches a line', async () => {
    // The assertion the whole design exists for. `debugLog` has no string
    // parameter and no rest parameter, so there is nowhere for this marker to
    // go — but the test pins the outcome rather than the mechanism, because the
    // mechanism is what a future refactor would change.
    const lines = await captured(async () => {
        setEventsDebug(true)
        try {
            const emitter = new EventEmitter()
            emitter.on('Sensitive', () => {})
            await emitter.emit('Sensitive', {
                cookie: 'SHOULD-NEVER-BE-LOGGED',
                authorization: 'Bearer SHOULD-NEVER-BE-LOGGED',
            })
        } finally {
            setEventsDebug(false)
        }
    })

    assertEquals(lines.length > 0, true, 'it did log something')
    for (const line of lines) {
        assertEquals(
            line.includes('SHOULD-NEVER-BE-LOGGED'),
            false,
            `a payload reached a debug line: ${line}`,
        )
    }
})

Deno.test('debug - an event name is encoded before it is written', async () => {
    // emitString() takes an arbitrary name. A newline forges a log entry and an
    // escape byte drives the operator's terminal, so the name goes through
    // safeForLog — reachable from this package only because it lives in
    // @lockness/contract rather than @lockness/core.
    const forged = 'evil\nFAKE LOG LINE[2J'

    const lines = await captured(() => {
        setEventsDebug(true)
        try {
            debugLog({ phase: 'emit', event: forged, listenerCount: 0 })
        } finally {
            setEventsDebug(false)
        }
    })

    assertEquals(lines.length, 1)
    assertEquals(lines[0].includes('\n'), false, 'no real newline survived')
    assertEquals(lines[0].includes(''), false, 'no real escape survived')
    assertStringIncludes(lines[0], '\\x0a')
    assertStringIncludes(lines[0], '\\x1b')
})

Deno.test('debug - the events package makes no Deno.* call', async () => {
    // A constraint, not a preference: @lockness/core imports this package on
    // the boot path, so an env read here would add --allow-env to every
    // application that loads the framework — for a feature that is off by
    // default. The read lives in core's bootstrap instead, exactly as
    // @lockness/scheduler's does.
    const offenders: string[] = []
    const packageDir = new URL('../', import.meta.url)

    for await (const entry of Deno.readDir(packageDir)) {
        if (!entry.isFile || !entry.name.endsWith('.ts')) continue
        const source = await Deno.readTextFile(
            new URL(entry.name, packageDir),
        )
        // Comments stripped first: testing.ts legitimately shows `Deno.test`
        // inside a JSDoc example, and that is documentation, not a call.
        const code = source
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '')
        if (/\bDeno\.\w/.test(code)) offenders.push(entry.name)
    }

    assertEquals(offenders, [])
})
