import { assertEquals, assertStringIncludes } from '@std/assert'
import { renderError, safeForLog } from '../logging/sanitize.ts'

Deno.test('safeForLog - neutralises a newline injected through a decoded path', () => {
    // decodeURI turns %0A into a real newline, so this is what reaches the sink.
    const forged = '/x\nGET /admin 200 - looks like a second request'

    const out = safeForLog(forged)

    assertEquals(out.includes('\n'), false)
    assertStringIncludes(out, '\\x0a')
})

Deno.test('safeForLog - neutralises a carriage return', () => {
    const out = safeForLog('/x\rGET /admin')

    assertEquals(out.includes('\r'), false)
    assertStringIncludes(out, '\\x0d')
})

Deno.test('safeForLog - neutralises a terminal escape', () => {
    const out = safeForLog('/x\u001b[2J\u001b[H')

    assertEquals(out.includes('\u001b'), false)
    assertStringIncludes(out, '\\x1b')
})

Deno.test('safeForLog - leaves an ordinary path untouched', () => {
    assertEquals(safeForLog('/fr/ca/users?q=1'), '/fr/ca/users?q=1')
})

Deno.test('safeForLog - truncates a very long value rather than flooding the log', () => {
    const out = safeForLog('/'.padEnd(5000, 'a'))

    assertEquals(out.length < 600, true)
    assertStringIncludes(out, '[truncated at 512 of 5000]')
})

Deno.test('safeForLog - neutralises DEL, the C1 range and the JS line terminators', () => {
    // The predicate singles out four classes and the tests covered only C0.
    // Deleting `code === 0x7f`, `(code >= 0x80 && code <= 0x9f)` or the
    // U+2028/U+2029 clause left every test green — and U+2028 is the one the
    // module's own comment calls out, because a JS-based log consumer splits on
    // it exactly as it splits on a newline.
    assertStringIncludes(safeForLog('a\u007fb'), '\\x7f', 'DEL')
    assertStringIncludes(safeForLog('a\u0085b'), '\\x85', 'C1 (NEL)')
    assertStringIncludes(safeForLog('a\u009fb'), '\\x9f', 'C1 (upper edge)')
    assertStringIncludes(
        safeForLog('a\u2028b'),
        '\\u{2028}',
        'JS line separator',
    )
    assertStringIncludes(
        safeForLog('a\u2029b'),
        '\\u{2029}',
        'JS paragraph separator',
    )

    // And an ordinary non-ASCII character is left alone.
    assertEquals(safeForLog('héllo — ok'), 'héllo — ok')
})

Deno.test('safeForLog - truncates at exactly the documented bound', () => {
    // `out.length < 600` passed for any MAX_LENGTH from 1 to ~587.
    const out = safeForLog('a'.repeat(5000))
    assertEquals(out.length, 512 + '\u2026[truncated at 512 of 5000]'.length)
    // The count is the half content cannot forge: a value may contain the
    // literal text of the marker, but not a true statement about its own size.
    assertStringIncludes(out, '[truncated at 512 of 5000]')
})

Deno.test('renderError - redacts credentials in a PostgreSQL DSN in the message', () => {
    // A postgres driver failure carries the whole connection string, userinfo
    // included, verbatim in error.message.
    const out = renderError(
        new Error(
            'connection failed: postgres://user:password@db.internal:5432/app',
        ),
    )

    assertEquals(out.includes('password'), false)
    // The host, port and database stay so the line is still diagnostic.
    assertStringIncludes(out, 'db.internal:5432/app')
    assertStringIncludes(out, 'postgres://***:***@')
})

Deno.test('renderError - redacts credentials in a MySQL DSN in the message', () => {
    const out = renderError(
        new Error('access denied: mysql://user:password@db.internal:3306/app'),
    )

    assertEquals(out.includes('password'), false)
    assertStringIncludes(out, 'db.internal:3306/app')
    assertStringIncludes(out, 'mysql://***:***@')
})

Deno.test('renderError - leaves a credential-free SQLite/file DSN intact', () => {
    // SQLite connection strings carry no userinfo; the redactor must not mangle
    // them, and the `://path` shape must survive untouched.
    const out = renderError(
        new Error('unable to open: sqlite:///var/lib/app/app.db'),
    )

    assertStringIncludes(out, 'sqlite:///var/lib/app/app.db')
    assertEquals(out.includes('***'), false)
})

Deno.test('renderError - does not touch a host:port that is not userinfo', () => {
    // A colon in the host authority (the port) must not be mistaken for a
    // password separator: there is no `@`, so nothing is redacted.
    const out = renderError(new Error('timeout reaching redis://cache:6379/0'))

    assertStringIncludes(out, 'redis://cache:6379/0')
    assertEquals(out.includes('***'), false)
})

// ---------------------------------------------------------------------------
// #292 — Unicode format characters (General_Category=Cf).
// ---------------------------------------------------------------------------

/** Every `Cf` codepoint, computed rather than listed. */
function everyFormatCodepoint(): number[] {
    const found: number[] = []
    for (let code = 0; code <= 0x10ffff; code++) {
        if (code >= 0xd800 && code <= 0xdfff) continue
        if (/\p{Cf}/u.test(String.fromCodePoint(code))) found.push(code)
    }
    return found
}

/** The eleven Arabic/Syriac prefix marks FR-001b exempts. */
const CONTENT_FORMAT_MARKS: readonly number[] = [
    0x600,
    0x601,
    0x602,
    0x603,
    0x604,
    0x605,
    0x6dd,
    0x70f,
    0x890,
    0x891,
    0x8e2,
]

const escapeOf = (code: number) => `\\u{${code.toString(16)}}`

Deno.test('safeForLog - encodes each bidi range the issue names, per range', () => {
    // Per range, not by one representative: a fix that catches U+202E and
    // misses U+2066 passes a single-sample test.
    const perRange: [number, string][] = [
        [0x200b, 'ZWSP — U+200B-200F'],
        [0x200e, 'LRM — same range, direction-setting'],
        [0x202a, 'LRE — U+202A-202E'],
        [0x202e, 'RLO — the reordering override'],
        [0x2066, 'LRI — U+2066-2069'],
        [0x2069, 'PDI — same range'],
    ]

    for (const [code, why] of perRange) {
        assertStringIncludes(
            safeForLog(`a${String.fromCodePoint(code)}b`),
            escapeOf(code),
            why,
        )
    }
})

Deno.test('safeForLog - encodes the format characters the issue did NOT name', () => {
    // Each named individually. These are what the `\p{Cf}` criterion buys over
    // the three enumerated ranges, and a criterion asserted only in aggregate
    // can lose one of them to an off-by-one without a test noticing.
    const beyondTheIssue: [number, string][] = [
        [
            0x61c,
            'ALM — a Bidi_Control in the Trojan Source set, reachable as %d8%9c',
        ],
        [
            0xfeff,
            'BOM/ZWNBSP — invisible, and defeats DSN redaction (see #301)',
        ],
        [0x2060, 'word joiner — invisible, not in the issue table'],
        [0xad, 'soft hyphen — Cf below U+0100, so it takes the \\xXX form'],
        [
            0xe0001,
            'astral tag — the current vehicle for invisible text smuggling',
        ],
    ]

    for (const [code, why] of beyondTheIssue) {
        // Equality, not absence. An absence assertion passes when the character
        // was STRIPPED, which contradicts this module's own rule that a
        // replacement leaves evidence — and it pins no escape width, so the
        // `code <= 0xff` boundary went unasserted at its only lower edge
        // (U+00AD is the sole Cf codepoint in 0xA0-0xFF).
        assertEquals(
            safeForLog(`a${String.fromCodePoint(code)}b`),
            `a${code <= 0xff ? `\\x${code.toString(16)}` : escapeOf(code)}b`,
            why,
        )
    }
})

Deno.test('safeForLog - a RUN of format characters is escaped, every one of them', () => {
    // Every other test feeds one format character isolated between ASCII, and
    // that shape cannot see the defect this guards. Add a `g` flag to
    // FORMAT_CHARACTER and the regex carries `lastIndex` between calls: the
    // first character of a run matches, the second `test()` starts past the end
    // of its one-character subject, misses, and the character reaches the log
    // VERBATIM. Measured — that mutant survives all 23 of the other tests.
    //
    // A run is also the realistic payload rather than the contrived one: a
    // Trojan Source construction is RLO ... PDF, and nested isolates come in
    // pairs by definition.
    const run = String.fromCodePoint(0x202e) + String.fromCodePoint(0x202c) +
        String.fromCodePoint(0x200b)

    assertEquals(
        safeForLog(run),
        escapeOf(0x202e) + escapeOf(0x202c) + escapeOf(0x200b),
    )
})

Deno.test('safeForLog - the Cf criterion holds in both directions', () => {
    // The property behind FR-001/FR-003, swept over the whole class rather than
    // sampled. Asserting only the escaped half would let the carve-out be
    // asserted by nothing but the code that implements it.
    const all = everyFormatCodepoint()
    assertEquals(
        all.length,
        170,
        'The Cf class size measured on the runtime this shipped against. This ' +
            'pins the toolchain, not safeForLog: a Deno/ICU bump that adds a ' +
            'Cf codepoint fails here while the behaviour stays correct, since ' +
            'the criterion is a criterion and the new codepoint gets escaped. ' +
            'It is the canary for the one thing the sweeps cannot see — that ' +
            'the domain and the implementation ask the same question, so ' +
            'neither can notice the criterion drifting. Remedy: check the new ' +
            'codepoints escape, decide whether any belongs in the carve-out, ' +
            'then update this number.',
    )

    const exempt = new Set(CONTENT_FORMAT_MARKS)
    const leaked: string[] = []
    const overreached: string[] = []

    for (const code of all) {
        const char = String.fromCodePoint(code)
        const encoded = safeForLog(`a${char}b`)
        const survivedVerbatim = encoded === `a${char}b`

        if (exempt.has(code)) {
            if (!survivedVerbatim) overreached.push(code.toString(16))
        } else if (survivedVerbatim) leaked.push(code.toString(16))
    }

    assertEquals(leaked, [], 'Cf codepoints reaching the log unescaped')
    assertEquals(overreached, [], 'Arabic/Syriac content marks wrongly escaped')

    // DOCUMENTATION, NOT COVERAGE — and labelled so nobody counts it twice.
    // safeForLog does not appear below. General_Category assigns each codepoint
    // exactly one value, so Cf and L/N are disjoint by construction of the
    // property: this is unfalsifiable in every Unicode version, not merely true
    // in this one. It records WHY the criterion is safe to state as a
    // criterion; the two sweeps above are what actually test the code.
    const letters = all.filter((c) =>
        /[\p{L}\p{N}]/u.test(String.fromCodePoint(c))
    )
    assertEquals(letters, [], 'no Cf codepoint is a letter or a digit')
})

Deno.test('safeForLog - right-to-left script is untouched', () => {
    for (const word of ['مرحبا بالعالم', 'שלום עולם', 'ܫܠܡܐ']) {
        assertEquals(safeForLog(word), word, word)
    }
})

Deno.test('safeForLog - escapes a joiner without touching the letters around it', () => {
    // ZWNJ and ZWJ are NOT bidi controls, and escaping them is a real cost to
    // legitimate text (plan §12). The assertion is the exact rendered string,
    // because a letters-only assertion passes straight over this.
    const zwnj = String.fromCodePoint(0x200c)
    const zwj = String.fromCodePoint(0x200d)

    assertEquals(
        safeForLog(`می${zwnj}رود`),
        `می${escapeOf(0x200c)}رود`,
        'Persian ZWNJ — letters intact, joiner escaped',
    )
    assertEquals(
        safeForLog(`\u{1f468}${zwj}\u{1f469}${zwj}\u{1f467}`),
        `\u{1f468}${escapeOf(0x200d)}\u{1f469}${escapeOf(0x200d)}\u{1f467}`,
        'ZWJ emoji family — components intact, joiners escaped',
    )
})

Deno.test("safeForLog - the issue's own probe string no longer round-trips", () => {
    const probe = `/admin${String.fromCodePoint(0x202e)}gnp.txt${
        String.fromCodePoint(0x202c)
    }${String.fromCodePoint(0x200b)}${String.fromCodePoint(0x2066)}x`

    // Not `!== probe`: that passes when ANY ONE of the four format characters
    // changed, so three could regress in silence. The input is four codepoints
    // and one literal path — assert the whole rendering.
    assertEquals(
        safeForLog(probe),
        `/admin${escapeOf(0x202e)}gnp.txt${escapeOf(0x202c)}${
            escapeOf(0x200b)
        }${escapeOf(0x2066)}x`,
    )
})

Deno.test('safeForLog - the backslash escape removes the spelling collision', () => {
    // The backslash is what makes this true. Without FR-004b a real U+2028 and
    // the literal text of its own escape are byte-identical, and the claim is
    // false whichever escape width is chosen.
    // 0x1b is the low-range case: the `\xXX` collision exists for every
    // codepoint below 0x100 and is the one an operator is likeliest to meet,
    // since %1b is what this module was originally written for.
    for (const code of [0x1b, 0x2028, 0x202e]) {
        const real = safeForLog(`a${String.fromCodePoint(code)}b`)

        // Both spellings: the one this change introduces, and the four-hex-digit
        // `\xXXXX` the encoder emits today. Asserting only the new spelling
        // would leave the test green against the exact collision the audit
        // measured, since today's real U+2028 renders as `\x2028` and it is the
        // literal text `\x2028` it collides with.
        for (
            const spelling of [
                escapeOf(code),
                `\\x${code.toString(16).padStart(2, '0')}`,
            ]
        ) {
            assertEquals(
                real === safeForLog(`a${spelling}b`),
                false,
                `U+${
                    code.toString(16)
                } collides with the literal text ${spelling}`,
            )
        }
    }
})

Deno.test('safeForLog - a backslash is doubled, which is the visible cost', () => {
    // The user-facing consequence of FR-004b, asserted in the shape an operator
    // will actually see rather than only through the collision test.
    assertEquals(safeForLog('C:\\Users\\kevin'), 'C:\\\\Users\\\\kevin')
})

Deno.test('safeForLog - an astral codepoint outside Cf survives byte-identical', () => {
    // Only true while the loop iterates code POINTS. This fails the moment
    // someone switches it to charCodeAt, which is exactly what an earlier draft
    // of the plan would have told them to do.
    assertEquals(safeForLog('a\u{1f600}b'), 'a\u{1f600}b')
    assertEquals(safeForLog('\u{10000}\u{10ffff}'), '\u{10000}\u{10ffff}')

    // And an astral codepoint that IS escaped must escape to its own value, not
    // to its leading surrogate. This is the assertion that actually pins the
    // iteration mode: under charCodeAt the two above still pass, because an
    // unescaped character is appended whole either way — but the escape below
    // is built from `code`, so it silently becomes \u{db40} and the character
    // is lost. Measured; the earlier version of this test did not catch it.
    assertEquals(
        safeForLog(`a${String.fromCodePoint(0xe0001)}b`),
        `a${escapeOf(0xe0001)}b`,
        'astral tag escapes to its codepoint, not its high surrogate',
    )
})

Deno.test('safeForLog - a hostile prefix cannot evict the diagnostic tail', () => {
    // The eviction primitive: charge the cap against EMITTED output and each
    // hostile character buys ~8 characters of budget, so a short prefix discards
    // the tail — including, in renderError, the evidence that redaction fired.
    const tail = 'DIAGNOSTIC-TAIL'
    const out = safeForLog(String.fromCodePoint(0x202e).repeat(200) + tail)

    // POSITIVE CONTROLS FIRST. Without them this passes when Cf escaping is
    // dropped entirely — 215 unescaped characters never reach the cap, so the
    // tail survives for a reason that has nothing to do with the rule under
    // test. The assertion's subject has to be proved reached.
    assertStringIncludes(out, escapeOf(0x202e))
    assertEquals(
        out.length > 512,
        true,
        'the emitted line must exceed the old cap',
    )

    assertStringIncludes(out, tail)
})

Deno.test('safeForLog - the cap is charged against consumed input', () => {
    // Input-charged, so the emitted bound is derived and deterministic rather
    // than chosen by the attacker: 512 code points x the widest escape.
    const wide = String.fromCodePoint(0xe0001) // \u{e0001} — 9 characters

    const atCap = safeForLog(wide.repeat(512))
    assertEquals(
        atCap.includes('[truncated'),
        false,
        '512 code points is within budget',
    )
    assertEquals(
        atCap.length <= 5120,
        true,
        `derived bound exceeded: ${atCap.length}`,
    )

    const overCap = safeForLog(wide.repeat(513))
    assertStringIncludes(overCap, '[truncated at 512 of 513]')
})

Deno.test('renderError - inherits the encoding with no change of its own', () => {
    const out = renderError(new Error(`boom${String.fromCodePoint(0x202e)}x`))

    assertStringIncludes(out, escapeOf(0x202e))
    assertStringIncludes(out, 'Error: boom')
})

Deno.test('renderError - its own 200-cap is charged in code points too', () => {
    // The same units mismatch the encoder below it just closed, one layer up:
    // slice(0, 200) charges an astral character two UTF-16 units, so 120 of them
    // spent the whole budget and evicted the ***:*** that proves redaction ran.
    // 180 ASCII characters did not. Measured at both ends before the fix.
    const out = renderError(
        new Error(
            '\u{1f600}'.repeat(120) +
                ' postgres://user:password@db.internal:5432/app',
        ),
    )

    assertEquals(out.includes('password'), false)
    assertStringIncludes(out, 'postgres://***:***@')

    // And the cut can no longer land between a surrogate pair, which used to
    // put a lone surrogate on the wire to render as U+FFFD.
    //
    // `\p{Cs}` WITH the `u` flag, never the `[\uD800-\uDFFF]` range: without
    // `u` the pattern matches code UNITS, so every well-formed astral character
    // in this very string matches it and the assertion fires on correct output.
    // Measured — that is how this test failed the first time it ran. Under `u`
    // a valid pair is a single non-Cs code point and only an unpaired half
    // matches.
    assertEquals(
        /\p{Cs}/u.test(out),
        false,
        'a lone surrogate reached the sink',
    )
})

Deno.test('renderError - a redacted DSN keeps its evidence behind a hostile prefix', () => {
    // The two halves together: the prefix cannot evict, so ***:*** survives.
    // renderError caps its message at 200 before safeForLog sees it, and
    // 200 < 512, so a rendered error is never truncated by safeForLog again.
    // 60 was FOUR SHORT and the test passed under the exact mutant it names:
    // 60 escapes emit 480, the evidence lands at offset 500, and an
    // emitted-length cap fires at 512 — twelve characters too late to evict it.
    // 80 puts the evidence well past the cap, so the assertion is live.
    const out = renderError(
        new Error(
            String.fromCodePoint(0x202e).repeat(80) +
                ' postgres://user:password@db.internal:5432/app',
        ),
    )

    assertStringIncludes(out, escapeOf(0x202e))
    assertEquals(out.includes('password'), false)
    assertStringIncludes(out, 'postgres://***:***@')
})
