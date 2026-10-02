/**
 * `renderError` prints stack frames only when the sink asks, and every frame
 * goes through the same redaction, cap and encoding as the line above it
 * (#488).
 *
 * Every marker is assembled at runtime, so no source line carries a value a
 * secret scanner would flag and no assertion can pass by matching its own
 * literal.
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { renderError } from '../logging/sanitize.ts'

/** A fake secret, distinct per call; it must never reach a rendered line. */
function marker(tag: string): string {
    return ['fx', tag, crypto.randomUUID().slice(0, 8)].join('')
}

/** Assert that no part of `secret` survived into `out`. */
function assertAbsent(out: string, secret: string): void {
    assert(!out.includes(secret), `leaked ${JSON.stringify(secret)}: ${out}`)
}

/** An `Error('boom')` whose stack is exactly `frames`, under its header. */
function withFrames(frames: string[]): Error {
    const error = new Error('boom')
    error.stack = ['Error: boom', ...frames].join('\n')
    return error
}

/** `count` ordinary frames, numbered so each one is recognisable. */
function numbered(count: number): string[] {
    return Array.from(
        { length: count },
        (_, i) => `    at fn${i} (file:///app/mod.ts:${i + 1}:1)`,
    )
}

/** The frame lines of a rendered string: everything after the head. */
function frameLines(out: string): string[] {
    return out.split('\n').slice(1)
}

Deno.test('#488 no frames option renders one line, byte-identical to frames: 0', () => {
    const error = withFrames(numbered(5))
    error.cause = withFrames(numbered(3))
    const plain = renderError(error)
    assert(!plain.includes('\n'), plain)
    assertEquals(plain, 'Error: boom caused by: Error: boom')
    assertEquals(renderError(error, { frames: 0 }), plain)
})

Deno.test('#488 frames: 2 on a 5-frame stack gives two indented frames and no header', () => {
    const out = renderError(withFrames(numbered(5)), { frames: 2 })
    assertEquals(
        out,
        [
            'Error: boom',
            '    at fn0 (file:///app/mod.ts:1:1)',
            '    at fn1 (file:///app/mod.ts:2:1)',
        ].join('\n'),
    )
})

Deno.test('#488 frames follow the whole chain, and only the head error has frames', () => {
    const error = withFrames(numbered(2))
    error.cause = withFrames(['    at causeOnly (file:///app/cause.ts:9:9)'])
    const out = renderError(error, { frames: 10 })
    assertEquals(out.split('\n')[0], 'Error: boom caused by: Error: boom')
    assertEquals(frameLines(out).length, 2)
    assert(!out.includes('causeOnly'), out)
})

Deno.test('#488 userinfo and a credential pair in a frame are redacted', () => {
    const user = marker('u')
    const pass = marker('p')
    const token = marker('t')
    const out = renderError(
        withFrames([
            `    at handler (https://${user}:${pass}@cdn.test/mod.ts:1:2)`,
            `    at file:///app/x.ts?token=${token}:2:3`,
        ]),
        { frames: 10 },
    )
    for (const secret of [user, pass, token]) assertAbsent(out, secret)
    assertStringIncludes(out, 'https://***:***@cdn.test/mod.ts')
    assertStringIncludes(out, 'token=***')
})

Deno.test('#488 redaction runs before the frame cap, so a straddling URL cannot leak a prefix', () => {
    const pass = marker('straddle')
    // `at ` + 280 + ` (` + `https://` + `u:` puts the password at code point
    // 295, so a cap applied first would keep its first five characters and cut
    // the `@` the userinfo rule needs.
    const frame = `at ${'f'.repeat(280)} (https://u:${pass}@cdn.test/x.ts:1:2)`
    const out = renderError(withFrames([frame]), { frames: 1 })
    assertAbsent(out, pass.slice(0, 5))
})

Deno.test('#488 a data: URL frame collapses to data:… and keeps its position', () => {
    const source = marker('src')
    const out = renderError(
        withFrames([
            `    at data:application/typescript;base64,${source}:1:5`,
            `    at run (data:text/javascript,const%20k=${source}:3:4)`,
            // A `:line:col` inside the source is not the frame's own: only the
            // one that ends the line is kept.
            `    at mid (data:text/javascript,a:7:7 ${source}:8:9)`,
        ]),
        { frames: 10 },
    )
    assertAbsent(out, source)
    assertEquals(frameLines(out), [
        '    at data:…:1:5',
        '    at run (data:…:3:4)',
        '    at mid (data:…:8:9)',
    ])
})

Deno.test('#508 a data: URL collapses whatever characters its source holds', () => {
    const source = marker('chars')
    const out = renderError(
        withFrames([
            // No position suffix: the collapse runs to the end of the line.
            `    at data:text/javascript,a b) ${source} (c`,
            // `.` in a regex stops at CR and U+2028; the collapse must not.
            `    at f (data:text/javascript,x\r  ${source}:2:3)`,
            // A URL scheme is case-insensitive.
            `    at DATA:text/javascript,${source}:4:5`,
        ]),
        { frames: 10 },
    )
    assertAbsent(out, source)
    assertEquals(frameLines(out), [
        '    at data:…',
        '    at f (data:…:2:3)',
        '    at data:…:4:5',
    ])
})

/**
 * Import a `data:` module that throws from a function, and return what it
 * threw. A real Deno stack, so the test pins what the runtime prints, not a
 * shape this file invented.
 */
async function throwFromDataModule(specifier: string): Promise<Error> {
    try {
        await import(specifier)
    } catch (error) {
        if (error instanceof Error) return error
        throw error
    }
    throw new Error(`the data: module did not throw: ${specifier}`)
}

Deno.test('#508 a real unencoded data: module with a space and a ) before the secret prints none of it', async () => {
    const secret = marker('raw')
    const error = await throwFromDataModule(
        `data:application/javascript,const k = "(x) ${secret}"; ` +
            'function boom() { throw new Error("x") }; boom()',
    )
    // The precondition: the runtime does put the source in the frame.
    assertStringIncludes(String(error.stack), secret)
    const out = renderError(error, { frames: 10 })
    assertAbsent(out, secret)
    const frames = frameLines(out)
    assert(frames.length >= 2, out)
    assert(/^ {4}at boom \(data:…:\d+:\d+\)$/.test(frames[0]), out)
    assert(/^ {4}at data:…:\d+:\d+$/.test(frames[1]), out)
})

Deno.test('#508 a real percent-encoded data: module prints none of its source', async () => {
    const secret = marker('enc')
    const error = await throwFromDataModule(
        'data:application/javascript,' + encodeURIComponent(
            `const k = "(x) ${secret}"; function boom() { throw new Error("x") }; boom()`,
        ),
    )
    assertStringIncludes(String(error.stack), secret)
    const out = renderError(error, { frames: 10 })
    assertAbsent(out, secret)
    assert(/^ {4}at boom \(data:…:\d+:\d+\)$/.test(frameLines(out)[0]), out)
})

Deno.test('#488 ANSI escapes and a carriage return in a frame are encoded', () => {
    const out = renderError(
        withFrames(['    at \x1b[31mred\rforged (file:///app/x.ts:1:1)']),
        { frames: 1 },
    )
    assert(!out.includes('\x1b'), out)
    assert(!out.includes('\r'), out)
    assertEquals(frameLines(out), [
        '    at \\x1b[31mred\\x0dforged (file:///app/x.ts:1:1)',
    ])
})

Deno.test('#488 a throwing stack getter renders a sentinel, not a throw', () => {
    const error = new Error('boom')
    Object.defineProperty(error, 'stack', {
        get() {
            throw new Error('stack read refused')
        },
    })
    const out = renderError(error, { frames: 5 })
    assertEquals(out, 'Error: boom\n    [unreadable stack]')
})

Deno.test('#488 without frames the stack is never read', () => {
    let reads = 0
    const error = new Error('boom')
    Object.defineProperty(error, 'stack', {
        get() {
            reads++
            throw new Error('stack read refused')
        },
    })
    assertEquals(renderError(error), 'Error: boom')
    assertEquals(renderError(error, { frames: 0 }), 'Error: boom')
    assertEquals(reads, 0)
})

Deno.test('#488 a non-string stack or a non-Error head gets no frames', () => {
    const numeric = new Error('boom')
    Object.defineProperty(numeric, 'stack', { value: 42 })
    assertEquals(renderError(numeric, { frames: 5 }), 'Error: boom')

    const missing = new Error('boom')
    Object.defineProperty(missing, 'stack', { value: undefined })
    assertEquals(renderError(missing, { frames: 5 }), 'Error: boom')

    assertEquals(renderError('plain string', { frames: 5 }), 'plain string')
    const lookalike = {
        message: 'boom',
        stack: 'Error: boom\n    at fake (file:///app/x.ts:1:1)',
        toString: () => 'lookalike',
    }
    assertEquals(renderError(lookalike, { frames: 5 }), 'lookalike')
})

for (const count of [-1, NaN, 1.5, Infinity, -Infinity]) {
    Deno.test(`#488 a frame count of ${count} means none`, () => {
        const error = withFrames(numbered(5))
        assertEquals(renderError(error, { frames: count }), 'Error: boom')
    })
}

Deno.test('#488 a huge frame count is clamped to 50', () => {
    const error = withFrames(numbered(60))
    assertEquals(frameLines(renderError(error, { frames: 1e6 })).length, 50)
    assertEquals(frameLines(renderError(error, { frames: 51 })).length, 50)
    assertEquals(frameLines(renderError(error, { frames: 50 })).length, 50)
})

Deno.test('#488 each frame is capped at 300 code points', () => {
    // 297 astral code points after `at `, so the frame is exactly 300 code
    // points and survives whole, and one more tips it over the cap.
    const fits = `at ${'𝔣'.repeat(297)}`
    const over = `at ${'𝔣'.repeat(298)}`
    const out = renderError(withFrames([fits, over]), { frames: 2 })
    assertEquals(frameLines(out), [`    ${fits}`, `    ${fits}…`])
})

Deno.test('#488 only lines shaped like a frame are kept', () => {
    const error = new Error('boom')
    error.stack = [
        'Error: boom',
        'with a second header line',
        '    at kept (file:///app/x.ts:1:1)',
        '    attached to nothing',
        '\tat tabbed (file:///app/y.ts:2:2)',
    ].join('\n')
    assertEquals(frameLines(renderError(error, { frames: 10 })), [
        '    at kept (file:///app/x.ts:1:1)',
        '    at tabbed (file:///app/y.ts:2:2)',
    ])
})

/** An error constructed in a named function, so it has real frames. */
function realErrorWith(message: string): Error {
    return new Error(message)
}

Deno.test('#508 forged at-lines in the message are message text, not frames', () => {
    const secret = marker('forged')
    const forged = Array.from(
        { length: 10 },
        (_, i) => `    at forged${i} (file:///forged.ts:${i}:1) ${secret}`,
    )
    // The marker sits past the 200-code-point message cap, and the forged
    // lines past it: neither may reach the line.
    const error = realErrorWith(
        `${'A'.repeat(250)} ${secret}\n${forged.join('\n')}`,
    )
    const out = renderError(error, { frames: 10 })
    assertAbsent(out, secret)
    assert(!out.includes('forged'), out)
    const frames = frameLines(out)
    assert(frames.length >= 1, out)
    assert(/^ {4}at realErrorWith \(/.test(frames[0]), out)
    assertStringIncludes(frames[0], 'error_frames_488.test.ts')
})

Deno.test('#508 a header the stack does not start with is not skipped', () => {
    // The stack was assigned from elsewhere, so the header cannot be located
    // by count: the frame filter alone decides, as before. The message has
    // three lines, so skipping by its count anyway would eat two frames.
    const error = new Error('renamed\nover\nlines')
    error.stack = ['Error: original', ...numbered(3)].join('\n')
    assertEquals(frameLines(renderError(error, { frames: 10 })), numbered(3))
})

Deno.test('#508 a header that cannot be built renders the stack as unreadable', () => {
    const error = new Error('boom')
    error.stack = 'Error: boom\n    at kept (file:///app/x.ts:1:1)'
    Object.defineProperty(error, 'name', {
        get() {
            throw new Error('name read refused')
        },
    })
    assertEquals(
        renderError(error, { frames: 5 }),
        '[unrenderable error]\n    [unreadable stack]',
    )
})
