import { assert, assertEquals, assertStringIncludes } from '@std/assert'
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

// ---------------------------------------------------------------------------
// #301 / #303 — what `redactDsnCredentials` must and must not match.
// ---------------------------------------------------------------------------

/**
 * Redaction is the one place where matching TOO MUCH is the safe direction.
 *
 * An over-match costs a line some diagnostic value; an under-match puts a
 * credential in a log store. Every table below is written with that asymmetry
 * in mind: the "must redact" rows are the security property, and the "must not"
 * rows are the bound that stops the rule eating ordinary prose.
 */
/**
 * Every codepoint JS `\s` matches that is NOT ASCII whitespace.
 *
 * These are exactly the codepoints #301 is about: `\s` was the old terminator
 * class, so each of these ended the userinfo match and leaked the password,
 * while ASCII whitespace terminates by design and must go on doing so.
 * Computed rather than listed, for the same reason `everyFormatCodepoint()`
 * above is computed: a hand-written list of seven had exactly ONE member of
 * this set in it (U+FEFF), so it looked complete while missing fifteen —
 * U+00A0 among them, which is what a copy-paste out of a web page produces.
 */
function everyNonAsciiWhitespace(): number[] {
    const ascii = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20])
    const found: number[] = []
    for (let code = 0; code <= 0x10ffff; code++) {
        if (code >= 0xd800 && code <= 0xdfff) continue
        if (ascii.has(code)) continue
        if (/\s/.test(String.fromCodePoint(code))) found.push(code)
    }
    return found
}

Deno.test('renderError - no non-ASCII whitespace can end the userinfo match', () => {
    // #301, stated as the criterion rather than as a sample. The old class was
    // `[^@\s/]+`, so every codepoint below leaked the password it sat next to.
    const set = everyNonAsciiWhitespace()
    assertEquals(set.length, 19, 'the JS \\s set this shipped against')

    const leaked: string[] = []
    for (const code of set) {
        const dsn = `postgres://user:pass${
            String.fromCodePoint(code)
        }@db.internal:5432/db`
        const out = renderError(new Error(`connect failed: ${dsn}`))
        if (out.includes('pass') || !out.includes('postgres://***:***@')) {
            leaked.push(`U+${code.toString(16).toUpperCase().padStart(4, '0')}`)
        }
    }
    assertEquals(leaked, [], 'codepoints that still end the match')
})

Deno.test('renderError - nor can an invisible format character', () => {
    // The ADJACENT class, labelled as adjacent. None of these is in JS `\s`, so
    // none of them leaked even before #301 — they pass today by accident of
    // where a JS engine drew a line, not by design. Asserting them alongside
    // the real regression guard would have recorded the accident as intent, so
    // they get their own test and their own reason.
    for (const code of [0x200b, 0x61c, 0x202e, 0x2060, 0xad, 0x180e]) {
        const dsn = `postgres://user:pass${
            String.fromCodePoint(code)
        }@db.internal:5432/db`
        const out = renderError(new Error(`connect failed: ${dsn}`))
        assertEquals(out.includes('pass'), false, `U+${code.toString(16)}`)
        assertStringIncludes(out, 'postgres://***:***@')
    }
})

Deno.test('renderError - redacts a password containing a slash', () => {
    // The character that closes this is the same character that OPENS it. A `/`
    // in the userinfo makes WHATWG `new URL()` throw, and the thrown message
    // carries the whole DSN — so the redactor was failing on precisely the
    // inputs that generate the error message it exists to clean. A `/` turns up
    // in a random 16-byte base64 secret about a third of the time.
    const dsn = 'postgres://app:aB3/xY9+z@db.internal:5432/prod'
    let thrown: unknown
    try {
        new URL(dsn)
    } catch (error) {
        thrown = error
    }
    assert(thrown, 'the fixture must actually produce the parser error')

    const out = renderError(thrown)
    assertEquals(
        out.includes('aB3/xY9+z'),
        false,
        'the password reached the sink',
    )
    assertStringIncludes(out, 'postgres://***:***@db.internal:5432/prod')
})

Deno.test('renderError - the slash residual is whitespace, and it is known', () => {
    // Not every character can be spanned, and pretending otherwise is how the
    // last gap survived. Whitespace still terminates, because removing it would
    // let the rule eat `see http://docs and mail bob@y.com`. A DSN whose
    // password holds a raw space therefore still leaks here — which is exactly
    // why `Database.connect` redacts by substring against the URL it holds
    // instead of relying on this function.
    const out = renderError(new Error('postgres://app:my pass@db:5432/prod'))
    assertStringIncludes(
        out,
        'my pass',
        'the residual changed — update the docs',
    )
})

Deno.test('renderError - redacts a colon-less userinfo, the token-in-URL shape', () => {
    // #303. The old gate fired only when the userinfo carried a `:`, which is
    // how every bare-token URL — the shape GitHub, GitLab and most APIs accept
    // — reached the log verbatim. A `fetch` rejection carries the URL in
    // `error.message`, so this is the common case, not the exotic one.
    const out = renderError(
        new Error(
            'request failed: https://ghp_S3cr3tToken@github.com/org/repo',
        ),
    )

    assertEquals(
        out.includes('ghp_S3cr3tToken'),
        false,
        'the token reached the sink',
    )
    assertStringIncludes(out, 'https://***@github.com/org/repo')
})

Deno.test('renderError - keeps the two userinfo shapes distinguishable', () => {
    // `***:***` for a pair, `***` for a single value. The shape is the only
    // thing left of the credential, and it is what tells an operator whether a
    // password was configured at all.
    assertStringIncludes(
        renderError(new Error('x postgres://u:p@h/d')),
        'postgres://***:***@',
    )
    assertStringIncludes(
        renderError(new Error('x https://t@h/d')),
        'https://***@',
    )
})

Deno.test('renderError - does not eat things that only look like a DSN', () => {
    // The bound. Each row is a control that failed to survive an earlier draft
    // of this rule, or that the old `:`-gate and `\s` terminator were the only
    // thing protecting.
    const untouched: [string, string][] = [
        [
            'redis://cache:6379/0',
            'a port is not userinfo — there is no @ at all',
        ],
        [
            'sqlite:///var/lib/app/app.db',
            'no userinfo: the / follows the :// directly',
        ],
        ['https://github.com/org/repo', 'an ordinary URL'],
        ['mailto:user@example.com', 'an @ with no ://'],
        [
            'failed to reach https://api.example.com/v1 for admin@corp.com',
            'prose: the path / terminates the userinfo before the email',
        ],
        [
            'https://api.example.com:8443/path@thing',
            'a host:port whose PATH contains an @. Only reachable as a control ' +
            'because `/` is permitted in the span now; the port shape is ' +
            'what keeps it out.',
        ],
        [
            'upstream 502: {"url":"https://api.example.com","contact":"support@example.com"}',
            'a JSON error body. JSON.stringify emits no spaces, so whitespace ' +
            'does not save this one — it rendered as ' +
            'https://***:***@example.com, destroying the host AND asserting ' +
            'a user:password pair that never existed. The ***:*** form is a ' +
            'deliberate signal, so that was a forgery, not just noise.',
        ],
        [
            'GET https://api.example.com?email=bob@example.com failed',
            'a query string carrying an email — the same forgery through ?',
        ],
        [
            'see https://api.example.com#frag@x',
            'and through a fragment',
        ],
        [
            'failed to load https://jsr.io/@std/assert/1.0.17/equals.ts',
            'a SCOPED PACKAGE url — the @ is in the PATH, and only the `/` ' +
            'terminator keeps the match off it. Without it this renders ' +
            'as https://***@std/assert/... and mangles the commonest log ' +
            'line in this ecosystem. The mutation battery found this gap; ' +
            'none of the other five controls could see it.',
        ],
        [
            'GET https://cdn.example.com/assets/logo@2x.png 404',
            'the same shape outside a registry: an @ in a filename',
        ],
        [
            'see http://docs and mail bob@y.com',
            'prose with NO path slash — whitespace is the only terminator, ' +
            'which is why it cannot simply be dropped from the class',
        ],
    ]

    for (const [message, why] of untouched) {
        // Exact equality, not `includes`. A one-sided check sees an over-match
        // that DELETES the region it looked at, and misses one that ADDS a
        // redaction beside it — and the two older tests this table duplicates
        // carry an `includes('***') === false` half that the table had
        // dropped. Every row here is ASCII, single-line, under the cap and
        // backslash-free, so the exact form is available for free.
        assertEquals(renderError(new Error(message)), `Error: ${message}`, why)
    }
})

// ---------------------------------------------------------------------------
// #302 — renderError follows the cause chain.
// ---------------------------------------------------------------------------

Deno.test('renderError - follows the cause chain instead of dropping it', () => {
    // A wrapper whose whole content is its cause used to render to nothing:
    // `Error: websocket transport error` and not one word about what failed.
    const out = renderError(
        new Error('websocket transport error', {
            cause: new Error('ECONNRESET'),
        }),
    )

    // Exact, so the separator literal is pinned. Every `includes` form here
    // passes with the leading space dropped, rendering
    // `...transport errorcaused by:...`.
    assertEquals(
        out,
        'Error: websocket transport error caused by: Error: ECONNRESET',
    )
})

Deno.test('renderError - a credential in a cause is redacted like any other', () => {
    // The whole chain goes through the same redaction and the same cap. A cause
    // that skipped either would be a hole opened by the fix for #302.
    const out = renderError(
        new Error('startup failed', {
            cause: new Error('postgres://svc:S3cr3t@db.internal:5432/app'),
        }),
    )

    assertEquals(
        out.includes('S3cr3t'),
        false,
        'a password reached the sink via a cause',
    )
    assertStringIncludes(out, 'postgres://***:***@')
})

Deno.test('renderError - the chain is bounded and a cycle terminates', () => {
    // Depth first: a five-deep chain renders three links and stops.
    let deep = new Error('root')
    for (const label of ['c1', 'c2', 'c3', 'c4']) {
        deep = new Error(label, { cause: deep })
    }
    const bounded = renderError(deep)
    assertEquals(
        bounded.split('caused by:').length - 1,
        2,
        'the chain must stop at two links beyond the top error',
    )
    assertEquals(bounded.includes('root'), false, 'the bound was not applied')

    // Then a cycle, which has no depth to run out of.
    const a = new Error('a')
    const b = new Error('b', { cause: a })
    ;(a as { cause?: unknown }).cause = b
    const cyclic = renderError(a)
    assertStringIncludes(cyclic, 'Error: a')
    assertStringIncludes(cyclic, 'Error: b')
    // The marker, not just the two names. Without it this test passes with the
    // cycle guard deleted outright: the depth bound stops the walk either way,
    // so `a -> b -> a` renders three links and both names appear regardless.
    // Measured — the first version of this test could not see its own mutant.
    assertStringIncludes(cyclic, '[cycle]')
})

Deno.test('renderError - renders a non-Error cause through the same rules', () => {
    // EXACT equality per row. The previous version asserted only that
    // `Error: wrapper` was present — which the HEAD produces, whatever the
    // cause branch does — and that the render was one line, which is a
    // tautology for data containing no newline. Neither assertion could read
    // the value the loop existed to produce. Measured: three mutants of the
    // non-Error branch survived it, and so did dropping the `null` half of the
    // chain terminator.
    const rows: [unknown, string][] = [
        [new Event('error'), 'Error: wrapper caused by: [object Event]'],
        ['a bare string', 'Error: wrapper caused by: a bare string'],
        [{ code: 'ECONNRESET' }, 'Error: wrapper caused by: [object Object]'],
        // These two stop the walk, which is the only thing that distinguishes
        // the terminator's `null` half from its `undefined` half.
        [null, 'Error: wrapper'],
        [undefined, 'Error: wrapper'],
    ]

    for (const [cause, expected] of rows) {
        assertEquals(renderError(new Error('wrapper', { cause })), expected)
    }
})

Deno.test('renderError - a non-Error at the TOP level is redacted too', () => {
    // Nothing in this suite passed a non-Error to renderError at all, so the
    // whole branch — its redaction, its cap and its encoder — was unasserted.
    // A rejected promise carrying a string is an ordinary way to reach it.
    assertEquals(
        renderError('connect failed: postgres://u:S3cr3t@h:5432/db'),
        'connect failed: postgres://***:***@h:5432/db',
    )
    // The cap applies on this path as well as the Error path.
    const long = renderError('x'.repeat(400))
    assertEquals(
        long.length,
        201,
        'capped at 200 code points plus the ellipsis',
    )
    // And so does the encoder.
    assertStringIncludes(renderError('a\u0000b'), '\\x00')
})

Deno.test('renderError - is total, whatever a cause does', () => {
    // A log encoder is called from `catch` blocks, several of them shutdown
    // drains and one a `void guard(...)` whose rejection Deno turns into a
    // process exit. A throw here replaces the error being reported, at the one
    // moment nothing is left to catch it.
    //
    // Before the cause chain, a well-formed Error could not make renderError
    // throw. A cause can, and four of these did — measured, and the throwing
    // GETTER survived the first fix because the read happens in the walk rather
    // than in renderOne.
    const throwing = new Error('head')
    Object.defineProperty(throwing, 'cause', {
        get() {
            throw new Error('getter boom')
        },
    })
    const looping = new Error('head')
    ;(looping as { cause?: unknown }).cause = new Proxy({}, {
        get() {
            throw new Error('proxy boom')
        },
    })

    const hostile: [string, Error][] = [
        [
            'null-prototype cause',
            new Error('h', { cause: Object.create(null) }),
        ],
        [
            'toString throws',
            new Error('h', {
                cause: {
                    toString() {
                        throw new Error('boom')
                    },
                },
            }),
        ],
        [
            'toPrimitive throws',
            new Error('h', {
                cause: {
                    [Symbol.toPrimitive]() {
                        throw new Error('boom')
                    },
                },
            }),
        ],
        [
            'non-string message',
            new Error('h', {
                cause: Object.assign(new Error('x'), { message: 42 }),
            }),
        ],
        [
            'absent message',
            new Error('h', {
                cause: Object.create(Error.prototype),
            }),
        ],
        ['throwing cause getter', throwing],
        ['throwing proxy cause', looping],
    ]

    for (const [why, error] of hostile) {
        const out = renderError(error)
        // Total, and still says something — the same rule the encoder follows
        // for a control character: a replacement leaves evidence.
        assertEquals(out.length > 0, true, why)
        assertEquals(out.split('\n').length, 1, `${why}: multi-line`)
    }
})

Deno.test('renderError - a hostile error name cannot inflate the line', () => {
    // `name` was uncapped, which is why this file's own length bound was wrong.
    // safeForLog can emit nine characters per code point, so one name could
    // contribute thousands to a line reasoned about as a few hundred.
    const wide = new Error('short')
    wide.name = 'N'.repeat(500)
    assertEquals(renderError(wide).length < 200, true, 'the name is not capped')
})

Deno.test('renderError - a long scheme-legal run does not stall the event loop', () => {
    // The scheme group `[a-z][a-z0-9+.-]*` backtracks O(n) per start position
    // over a run of scheme-legal characters. Measured on the unbounded form:
    // 44 ms at n=8k, 704 ms at n=32k, 11.6 SECONDS at n=128k — and this is
    // reachable from a websocket frame, whose `type` field is interpolated into
    // `unknown frame type: ...` and rendered by the default error sink.
    //
    // `{0,31}` makes it linear at no expressiveness cost: no URI scheme is 32
    // characters. Measured after: 5 ms at n=64k, where the unbounded form took
    // ~2.4 s. The threshold below is 100x the observed figure, so it fails only
    // on a genuine complexity regression rather than on a slow machine.
    const started = performance.now()
    renderError(new Error('a'.repeat(64_000)))
    const elapsed = performance.now() - started

    assertEquals(
        elapsed < 500,
        true,
        `redaction took ${elapsed.toFixed(0)}ms — the scheme group is ` +
            'backtracking again',
    )
})

Deno.test('renderError - the sink policy is honoured in both directions', () => {
    // `RenderErrorOptions` is public and introduced by this change, and its
    // only exercise was one value of it from a DOWNSTREAM package. The contract
    // package's own suite would have stayed green with the parameter deleted.
    const wrapped = new Error('outer', { cause: new Error('inner') })

    assertEquals(renderError(wrapped, { followCause: false }), 'Error: outer')
    assertEquals(
        renderError(wrapped, { followCause: true }),
        'Error: outer caused by: Error: inner',
    )
    assertEquals(renderError(wrapped), 'Error: outer caused by: Error: inner')
})
