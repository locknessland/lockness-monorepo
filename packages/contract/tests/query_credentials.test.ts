/**
 * `renderError` replaces the value of every credential-named `name=value`
 * pair, by shape, before the cap and the encoding (#478).
 *
 * Every secret is a fake marker assembled at run time, so the repository's
 * secret scan never sees a credential-shaped literal. Each test asserts that
 * neither half of the marker, nor the whole, reaches the rendered line.
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { renderError } from '../logging/sanitize.ts'
import {
    isCredentialParamName,
    redactQueryCredentials,
} from '../logging/credential_params.ts'

const HEAD = 'FA' + 'KE'
const TAIL = 'MA' + 'RK'
/** The fake secret. */
const M = HEAD + TAIL
/** A second fake secret, for the value between a head and a tail. */
const MID = 'MI' + 'DS'

/** Assert that no part of the marker, nor {@link MID}, survived into `out`. */
function assertNoMarker(out: string, context = out): void {
    assert(!out.includes(M), `marker leaked: ${context}`)
    assert(!out.includes(HEAD), `marker head leaked: ${context}`)
    assert(!out.includes(TAIL), `marker tail leaked: ${context}`)
    assert(!out.includes(MID), `middle marker leaked: ${context}`)
}

/** Render `message` as the message of an `Error`. */
function render(message: string): string {
    return renderError(new Error(message))
}

/**
 * Assert that redacting `text` takes under `limit` ms, on the best of up to
 * three runs. Under load a collection or a preemption adds to one run, never
 * to the scan's own cost, while a quadratic scan misses on every run.
 */
function assertScanUnder(label: string, text: string, limit = 1000): void {
    let best = Infinity
    for (let run = 0; run < 3 && best >= limit; run++) {
        const start = performance.now()
        redactQueryCredentials(text)
        best = Math.min(best, performance.now() - start)
    }
    assert(best < limit, `${label}: ${best.toFixed(0)} ms`)
}

Deno.test('#478 every credential stem is redacted', () => {
    const names = [
        'token',
        'key',
        'api_key',
        'access_token',
        'authToken',
        'secret',
        'client_secret',
        'password',
        'sslpassword',
        'passwd',
        'pwd',
        'pass',
        'sig',
        'signature',
        'X-Amz-Signature',
        'X-Amz-Credential',
        'auth',
        'jwt',
        'code',
    ]
    for (const name of names) {
        const out = render(`GET https://api.example.com/v1?${name}=${M}&page=2`)
        assertNoMarker(out, name)
        assertStringIncludes(out, `${name}=***&page=2`, name)
    }
})

Deno.test('#478 a credential name matches whatever its case', () => {
    for (const name of ['PASSWORD', 'AUTHTOKEN', 'Api_Key']) {
        const out = render(`fetch failed: /x?${name}=${M}`)
        assertNoMarker(out, name)
        assertStringIncludes(out, `${name}=***`)
    }
})

Deno.test('#478 an encoded name, value or equals sign is still redacted', () => {
    const cases: Record<string, string> = {
        'encoded name': `/x?api%5Fkey=${M}`,
        'encoded value': `/x?token=${M}%2B%2F%3D`,
        'encoded equals': `/x?token%3D${M}`,
        'lowercase encoded equals': `/x?token%3d${M}`,
    }
    for (const [label, message] of Object.entries(cases)) {
        assertNoMarker(render(message), label)
    }
})

Deno.test('#478 a credential nested in an encoded redirect is redacted', () => {
    // The walk stops at the encoded `?`, so the name is `token`, not
    // `cb%3Ftoken`; and `%26` does not end a value, which only eats more.
    const out = render(`/login?next=%2Fcb%3Ftoken%3D${M}%26x%3D1`)
    assertNoMarker(out)
    assertStringIncludes(out, 'next=%2Fcb%3Ftoken%3D***')
})

Deno.test('#478 an encoded separator ends a name, so a nested `code` is found', () => {
    // Crossing the encoded `?` would make the name `cb%3Fcode`, which is no
    // credential — the OAuth code would leak.
    const out = render(`/login?next=%2Fcb%3Fcode%3D${M}`)
    assertNoMarker(out)
    assertStringIncludes(out, 'code%3D***')
})

Deno.test('#478 a credential after `#` is redacted, and its neighbours survive', () => {
    const out = render(
        `https://app.example.com/cb#access_token=${M}&token_type=bearer`,
    )
    assertNoMarker(out)
    assertStringIncludes(out, '#access_token=***&token_type=bearer')
})

Deno.test('#478 any `name=value` matches, not only a URL query', () => {
    const cases: Record<string, [string, string]> = {
        libpq: [`host=db password=${M} dbname=x`, 'dbname=x'],
        odbc: [`Driver=x;Server=db;Pwd=${M};`, 'Pwd=***'],
        cli: [`spawn failed: tool --password=${M} --verbose`, '--verbose'],
        env: [`AWS_SECRET_ACCESS_KEY=${M} AWS_REGION=eu`, 'AWS_REGION=eu'],
    }
    for (const [label, [message, kept]] of Object.entries(cases)) {
        const out = render(message)
        assertNoMarker(out, label)
        assertStringIncludes(out, kept, label)
    }
})

Deno.test('#478 an empty credential value is left alone', () => {
    assertEquals(render('/x?token=&page=1'), 'Error: /x?token=&page=1')
    assertEquals(redactQueryCredentials('?token=&page=1'), '?token=&page=1')
    assertEquals(redactQueryCredentials("token=''"), "token=''")
    // Outside a URL `&` is content, so a bare `token=&x` is eaten: the
    // over-redacting direction, chosen on purpose.
    assertEquals(redactQueryCredentials('token=&page=1'), 'token=***')
})

Deno.test('#478 names that only resemble a credential survive', () => {
    const message = '/x?tokenType=a&key_id=b&statuscode=c&page=d'
    assertEquals(render(message), `Error: ${message}`)
})

Deno.test('#478 the ends-with rule over-matches on purpose: monkey= is masked', () => {
    // Pinned so a future narrowing is a decision, not an accident.
    assertEquals(redactQueryCredentials('monkey=banana'), 'monkey=***')
})

Deno.test('#497 the pin stem over-matches on purpose: spin= is masked', () => {
    // The `monkey=` trade, made again: an ends-with `pin` keeps `newpin`,
    // `cardpin` and `USERPIN` masked, and pays with these. Pinned so a future
    // narrowing is a decision, not an accident.
    for (
        const name of [
            'spin',
            'hairpin',
            'kingpin',
            'gpio_pin',
            'free_spins',
            'max_pins',
            'keyCode',
        ]
    ) {
        assert(isCredentialParamName(name), name)
    }
    assertEquals(redactQueryCredentials('spin=up'), 'spin=***')
})

Deno.test('#478 redaction runs before the cap: a straddling secret leaks no prefix', () => {
    // The secret starts a few code points before the 200 cap.
    const out = render(`${'a'.repeat(190)} token=${M}${M}`)
    assertNoMarker(out)
})

Deno.test('#478 redaction runs before the cap: the line keeps what the secret pushed out', () => {
    // Redacted first, the line fits under the cap and keeps its tail; capped
    // first, the long secret evicts the tail before anything is redacted.
    const out = render(`${'a'.repeat(150)} token=${M.repeat(20)} tail`)
    assertNoMarker(out)
    assert(out.endsWith('token=*** tail'), out)
})

Deno.test('#478 userinfo and query credentials are both redacted', () => {
    const out = render(
        `connect failed: postgres://app:${M}@db/app?password=${M}`,
    )
    assertNoMarker(out)
    assertStringIncludes(out, 'postgres://***:***@db/app?password=***')
})

Deno.test('#478 a credential in a cause is redacted', () => {
    const error = new Error('request failed', {
        cause: new TypeError(`fetch https://api.example.com/?api_key=${M}`),
    })
    const out = renderError(error)
    assertNoMarker(out)
    assertStringIncludes(out, 'caused by: TypeError:')
})

Deno.test('#478 a thrown non-Error value is redacted too', () => {
    const out = renderError(`upstream said /x?secret=${M}`)
    assertNoMarker(out)
    assertStringIncludes(out, 'secret=***')
})

Deno.test('#478 the scan is linear: a 256 KB name run and 256 KB of pairs', () => {
    // 256 KB, not 1 MB: at 1 MB the name run's best of three reached 704 ms
    // with 16 copies of this suite running at once. The quadratic regex this
    // replaced took 2.4 s on 40k characters, so 256 KB still misses by far.
    const run = 'a'.repeat(1 << 18) + '=x'
    const pairs = 'a=b&'.repeat(1 << 16)
    for (const [label, text] of [['name run', run], ['pairs', pairs]]) {
        assertScanUnder(label, text)
    }
})

Deno.test('#478 isCredentialParamName normalises before it matches', () => {
    assert(isCredentialParamName('X-Amz-Signature'))
    assert(isCredentialParamName('api%5Fkey'))
    assert(isCredentialParamName('CODE'))
    assertEquals(isCredentialParamName('key_id'), false)
    assertEquals(isCredentialParamName('token_type'), false)
    assertEquals(isCredentialParamName('statuscode'), false)
    assertEquals(isCredentialParamName(''), false)
    assertEquals(isCredentialParamName('---'), false)
})

// ============================================================================
// Review fold-in: quoted values, raw-value terminators, spacing, ANSI, names
// ============================================================================

Deno.test('#478 a quoted value is redacted up to its closing quote', () => {
    const cases: Record<string, [string, string]> = {
        'single quotes': [`password='${M}' next=1`, "password='***' next=1"],
        'double quotes': [`password="${M}" next=1`, 'password="***" next=1'],
        'libpq quoted, with a space': [
            `host=db password='${M} x' dbname=app`,
            "host=db password='***' dbname=app",
        ],
        'env double-quoted': [
            `AWS_SECRET_ACCESS_KEY="${M}"`,
            'AWS_SECRET_ACCESS_KEY="***"',
        ],
        'cli double-quoted': [`--password="${M}" -v`, '--password="***" -v'],
    }
    for (const [label, [text, expected]] of Object.entries(cases)) {
        assertEquals(redactQueryCredentials(text), expected, label)
        assertNoMarker(render(text), label)
    }
})

Deno.test('#478 an unclosed quote redacts to the end of the text', () => {
    assertEquals(
        redactQueryCredentials(`password="${M} and more`),
        'password="***',
    )
})

Deno.test('#478 outside a URL, a raw value ends only at whitespace or a quote', () => {
    for (const separator of ['&', '#', '<', '>', ';']) {
        const text = `--password=ab${separator}${M} -v`
        assertEquals(
            redactQueryCredentials(text),
            '--password=*** -v',
            separator,
        )
    }
})

Deno.test('#478 inside a URL query, `&` and `#` still end a value', () => {
    assertEquals(
        redactQueryCredentials(`/x?token=${M}&page=2#top`),
        '/x?token=***&page=2#top',
    )
    assertEquals(
        redactQueryCredentials(`/x?a=1&token=${M}#top`),
        '/x?a=1&token=***#top',
    )
})

Deno.test('#478 a vertical tab does not end a value', () => {
    assertNoMarker(render(`--password=ab\v${M}`))
})

Deno.test('#478 spaces or tabs around `=` still mark a pair', () => {
    for (const text of [`token =${M}`, `password = ${M}`, `pwd\t=\t${M}`]) {
        assertNoMarker(render(text), JSON.stringify(text))
    }
    assertEquals(
        redactQueryCredentials(`host=db password = ${M} dbname=app`),
        'host=db password = *** dbname=app',
    )
})

Deno.test('#478 an ANSI escape inside a name does not hide the pair', () => {
    const out = render(`\x1b[1mpassword\x1b[0m=${M}`)
    assertNoMarker(out)
    assertStringIncludes(out, 'password=***')
})

Deno.test('#478 an ANSI escape with no credential is still shown escaped', () => {
    assertEquals(render('\x1b[31mred\x1b[0m'), 'Error: \\x1b[31mred\\x1b[0m')
})

Deno.test('#478 trailing digits, a confirmation suffix and a plural still match', () => {
    for (
        const name of [
            'password2',
            'password_confirmation',
            'passwordConfirmation',
            'tokens',
            'api_keys',
            'passphrase',
            'client_assertion',
            'code_verifier',
        ]
    ) {
        assert(isCredentialParamName(name), name)
        assertNoMarker(render(`/x?${name}=${M}`), name)
    }
})

Deno.test('#478 tokenType and key_id still survive', () => {
    assertEquals(isCredentialParamName('tokenType'), false)
    assertEquals(isCredentialParamName('key_id'), false)
    assertEquals(isCredentialParamName('confirmation'), false)
    assertEquals(isCredentialParamName('2'), false)
})

Deno.test('#478 userinfo runs before the query pass: a `=` in a password cannot shield it', () => {
    // Query first would eat `M@h/db` as the value of `mytoken` and leave the
    // userinfo net nothing to find, leaking `u` and `mytoken`.
    assertEquals(
        render(`connect failed: postgres://u:mytoken=${M}@h/db`),
        'Error: connect failed: postgres://***:***@h/db',
    )
})

// ============================================================================
// Re-review fold-in: escaped quotes, and non-secrets left readable
// ============================================================================

Deno.test('#478 a backslash-escaped quote opens a value that closes at its escaped twin', () => {
    // The shape JSON serialisation gives a quoted CLI argument.
    const text = `{"cmd":"tool --password=\\"${M}\\" -v"}`
    assertEquals(
        redactQueryCredentials(text),
        '{"cmd":"tool --password=\\"***\\" -v"}',
    )
    assertNoMarker(render(text))
})

Deno.test('#478 an escaped quote inside a quoted value does not end it', () => {
    const text = `password="ab\\"${M}" next=1`
    assertEquals(redactQueryCredentials(text), 'password="***" next=1')
    assertNoMarker(render(text))
})

Deno.test('#478 a bare `code` outside a URL is a diagnostic, not an OAuth code', () => {
    for (
        const text of [
            'status code=503',
            'exit code=1',
            'duplicate key (code=23505)',
            'connect failed: code=ECONNREFUSED',
        ]
    ) {
        assertEquals(redactQueryCredentials(text), text)
    }
    assertEquals(
        redactQueryCredentials(`/cb?code=${M}&state=1`),
        '/cb?code=***&state=1',
    )
})

Deno.test('#494 blanks after `=` are skipped even with none before it', () => {
    // `util.format('k=', v)`, Python's `print('k=', v)`, Go's `fmt.Println`
    // and dotenv's `KEY= value` all put a blank after a bare `=`.
    for (
        const text of [
            `password= ${M}`,
            `password=\t${M}`,
            ['connect failed', 'password=', M].join(' '),
            `password= "${M} x"`,
        ]
    ) {
        assertNoMarker(render(text), JSON.stringify(text))
    }
    assertEquals(
        redactQueryCredentials(`password= ${M} dbname=app`),
        'password= *** dbname=app',
    )
    // Blanks on both sides are still the libpq `name = value` spelling.
    assertEquals(redactQueryCredentials(`token = ${M}`), 'token = ***')
    // The accepted cost: an empty value right after `=` takes the next word.
    assertEquals(
        redactQueryCredentials('token= in header'),
        'token= *** header',
    )
})

Deno.test('#478 a known count name with an all-digit value is a count, not a secret', () => {
    for (const text of ['max_tokens=4096', 'prompt_tokens=9000 total=1']) {
        assertEquals(redactQueryCredentials(text), text)
    }
    assertNoMarker(render(`api_keys=${M}`))
    assertEquals(redactQueryCredentials('token=4096'), 'token=***')
})

Deno.test('#494 an escaped quote inside an escaped-quote value does not end it', () => {
    // `--password="ab\"<secret>"` serialised: the inner `\"` becomes `\\\"`.
    const text = JSON.stringify(`--password="ab\\"${M}" --x`)
    assertEquals(redactQueryCredentials(text), '"--password=\\"***\\" --x"')
    assertNoMarker(render(text))
    // An escaped backslash before the closer is content, not an escape of it.
    assertEquals(
        redactQueryCredentials(JSON.stringify(`--password="C:\\\\" --x`)),
        '"--password=\\"***\\" --x"',
    )
    assertEquals(
        redactQueryCredentials(JSON.stringify(`token="a\\nb${M}" next=1`)),
        '"token=\\"***\\" next=1"',
    )
})

Deno.test('#494 an OAuth `code` after an HTML-escaped `&amp;` is in a query', () => {
    assertEquals(
        redactQueryCredentials(`<a href="/cb?state=1&amp;code=${M}">`),
        '<a href="/cb?state=1&amp;code=***">',
    )
    assertEquals(
        redactQueryCredentials(`/cb?state=1&AMP;code=${M}&amp;x=1`),
        '/cb?state=1&AMP;code=***&amp;x=1',
    )
})

Deno.test('#499 after `&amp;`, a credential other than `code` keeps the raw end', () => {
    // A credential put into a URL unencoded, then HTML-escaped, carries the
    // escape inside its value: only whitespace or a quote may end it.
    for (const name of ['password', 'api_key']) {
        for (const inner of ['&lt;', '&amp;', '&quot;', '#', '&']) {
            for (
                const text of [
                    `/x?y=1&amp;${name}=${HEAD}${inner}${TAIL} end`,
                    `run --opt=1&amp;${name}=${HEAD}${inner}${TAIL} end`,
                ]
            ) {
                assertEquals(
                    redactQueryCredentials(text),
                    text.replace(`${HEAD}${inner}${TAIL}`, '***'),
                    text,
                )
                assertNoMarker(render(text), text)
            }
        }
    }
})

/**
 * Assert, for each entry of `cases`, that the redaction renders the key text
 * as its value, and that `renderError` leaks no marker part from it.
 */
function assertRedacted(cases: Record<string, string>): void {
    for (const [text, expected] of Object.entries(cases)) {
        assertEquals(redactQueryCredentials(text), expected, text)
        assertNoMarker(render(text), text)
    }
}

Deno.test('#500 a credential pair after `&amp;` is masked by its own rule', () => {
    // A raw value used to run through `&amp;<credential>=`, hiding the next
    // name from the scan, so its quoted or blank-separated value showed.
    assertRedacted({
        [`/x?y=1&amp;password=${HEAD}&amp;token="${TAIL}"`]:
            '/x?y=1&amp;password=***&amp;token="***"',
        [`/x?y=1&amp;password=${HEAD}&amp;api_key= ${TAIL}`]:
            '/x?y=1&amp;password=***&amp;api_key= ***',
        [`/x?y=1&amp;password=${HEAD}&amp;api_key =${TAIL}`]:
            '/x?y=1&amp;password=***&amp;api_key =***',
        [`/x?y=1&AMP;password=${HEAD}&AMP;token="${TAIL}"`]:
            '/x?y=1&AMP;password=***&AMP;token="***"',
    })
})

Deno.test('#500 a credential pair after a raw `&` is masked by its own rule', () => {
    assertRedacted({
        [`--password=${HEAD}&token="${TAIL}" -v`]:
            '--password=***&token="***" -v',
        [`--password=${HEAD}&api%5Fkey="${TAIL}" -v`]:
            '--password=***&api%5Fkey="***" -v',
        [`--password=${HEAD}&code="${TAIL}" -v`]:
            '--password=***&code="***" -v',
    })
})

Deno.test('#500 a raw value runs on through `&` that starts no credential pair', () => {
    // Cutting there would show the rest of a CLI or HTML-escaped value.
    assertRedacted({
        [`password=${HEAD}&lt;${TAIL} end`]: 'password=*** end',
        [`--password=ab&${M} -v`]: '--password=*** -v',
        [`--password=${HEAD}&x=${TAIL} -v`]: '--password=*** -v',
        // An encoded separator ends the lookahead's name, as it ends a name
        // walked leftwards: `M%26token` is no credential name.
        [`--password=ab&${M}%26token=1 -v`]: '--password=*** -v',
        [`/x?y=1&amp;password=${HEAD}&amp;b=${TAIL} end`]:
            '/x?y=1&amp;password=*** end',
    })
    assertEquals(redactQueryCredentials('--password=ab&cd'), '--password=***')
})

Deno.test('#525 a credential pair after `;` or `,` is masked by its own rule', () => {
    // A raw value used to run through `;<credential>=` and `,<credential>=`,
    // hiding the next name from the scan, so its quoted or blank-separated
    // value showed — the second secret of an ODBC connection string.
    assertRedacted({
        [`Pwd=${HEAD};Token="${TAIL}"`]: 'Pwd=***;Token="***"',
        [`Pwd=${HEAD};Api_Key= ${TAIL}`]: 'Pwd=***;Api_Key= ***',
        [`Server=x;Pwd=${HEAD};Token='${TAIL}'`]:
            "Server=x;Pwd=***;Token='***'",
        [`password=${HEAD},secret =${TAIL}`]: 'password=***,secret =***',
        [`Pwd=${HEAD};Token=\\"${TAIL}\\" x`]: 'Pwd=***;Token=\\"***\\" x',
        [`Pwd=${HEAD};Token%3D"${TAIL}"`]: 'Pwd=***;Token%3D"***"',
        [`Pwd=${HEAD};api%5Fkey="${TAIL}"`]: 'Pwd=***;api%5Fkey="***"',
        [`Pwd=${HEAD};Token=${MID};Secret="${TAIL}"`]:
            'Pwd=***;Token=***;Secret="***"',
    })
})

Deno.test('#525 a `;` or `,` inside a password cuts only before a credential `name=`', () => {
    // Only `;<credential>=` cuts, so a password holding one shows that
    // fragment and none of its own characters.
    assertRedacted({
        [`Pwd=${HEAD};cd;token=${TAIL}`]: 'Pwd=***;token=***',
        [`Pwd=${HEAD};${TAIL}`]: 'Pwd=***',
        [`password=${HEAD},cd=${TAIL}`]: 'password=***',
    })
})

Deno.test("#525 a count before a cut keeps the next pair's own rule", () => {
    // The count is not a masked value, so the pair after it is not a cut
    // inside one: `code=23505` stays a diagnostic and `prompt_tokens` a
    // count. The other rows pin what the wider cut leaves unchanged.
    for (
        const text of [
            'max_tokens=4096;code=23505',
            'max_tokens=4096,prompt_tokens=10',
            'Server=db;Database=app;User Id=sa',
            'status code=503,retry=2',
            'exit code=1;token_type=bearer',
        ]
    ) {
        assertEquals(redactQueryCredentials(text), text)
    }
    assertRedacted({
        [`/cb?code=${M}&state=1`]: '/cb?code=***&state=1',
        [`?password=${M}&page=2`]: '?password=***&page=2',
        [`code=${M}&grant_type=authorization_code`]:
            'code=***&grant_type=authorization_code',
        [`password=${HEAD};${TAIL} ef`]: 'password=*** ef',
        [`--password=${HEAD}&lt;${TAIL} e`]: '--password=*** e',
    })
})

Deno.test('#524 a pair a cut starts keeps the raw end', () => {
    // Such a pair sits inside a masked value, so it never takes URL mode:
    // ending at the next `&`, `#`, `<` or `>` would show the rest of the
    // password.
    assertRedacted({
        [`--password=${HEAD}&token=${MID}&${TAIL}`]: '--password=***&token=***',
        [`--password=${HEAD}&token=${MID}#${TAIL}`]: '--password=***&token=***',
        [`--password=${HEAD}&token=&${TAIL}`]: '--password=***&token=***',
        [`/x?y=1&amp;password=${HEAD}&amp;code=${MID}&${TAIL}`]:
            '/x?y=1&amp;password=***&amp;code=***',
    })
})

Deno.test('#524 a pair a cut starts takes no exemption', () => {
    // Neither a bare `code` nor a count is kept there: either would show a
    // password's characters as the value it keeps.
    assertRedacted({
        [`--password=${HEAD}&code=${MID}&${TAIL}`]: '--password=***&code=***',
        [`Pwd=${HEAD};code=${MID} end`]: 'Pwd=***;code=*** end',
        [`Pwd=${HEAD};code="${MID}"`]: 'Pwd=***;code="***"',
        [`--password=${HEAD}&max_tokens=4096`]: '--password=***&max_tokens=***',
        [`Pwd=${HEAD};max_tokens=4096`]: 'Pwd=***;max_tokens=***',
    })
})

Deno.test('#524 #525 the accepted cost: a cut shows its separator and name', () => {
    // A raw value that holds `&`, `;` or `,` before a credential `name=` is
    // cut there, so that fragment shows; a URL-mode value is never cut, and
    // a pair after a cut ends only where a raw value ends. Pinned here so a
    // change to that extent is a decision, not a drift.
    for (
        const [text, expected] of [
            ['Pwd=ab;token=cd', 'Pwd=***;token=***'],
            ['Pwd=ab;key="x"yz', 'Pwd=***;key="***"yz'],
            ['?password=A;token="B"', '?password=***"B"'],
            [
                'client_secret=cs&code=xyz&grant_type=authorization_code',
                'client_secret=***&code=***',
            ],
        ]
    ) {
        assertEquals(redactQueryCredentials(text), expected, text)
    }
})

Deno.test('#500 the scan stays linear on credential lookaheads', () => {
    // Nine shapes, 256 KB each: a cut at every `&amp;`, a lookahead that never
    // meets `=`, one long non-credential name, a run of non-credential pairs,
    // credential names followed by a blank and no `=`, an empty credential
    // value at every `;`, a run of bare `;`, a run of `,x=` pairs, and a chain
    // of pairs each cut inside the value before it.
    //
    // A fixed limit on the best of up to three runs: the allocation-heavy
    // shapes showed a 40x tail on single runs under load. A lookahead that
    // never stops — the quadratic mutant the battery runs — misses the limit
    // on every run. A size-doubling ratio was measured and rejected: at sizes
    // the battery can afford, a sample is shorter than a scheduler slice, and
    // under load one preemption pushed the ratio to 8 against a bound that
    // must stay under the quadratic 4.
    const size = 256 << 10
    for (
        const text of [
            'password=' + '&amp;token='.repeat(size / 11),
            'password=a' + '&amp;tokenx'.repeat(size / 11),
            '--password=a&' + 'a'.repeat(size),
            '--password=a' + '&x='.repeat(size / 3),
            '--password=a' + '&token\t'.repeat(size / 7),
            'password=' + ';token='.repeat(size / 7),
            'Pwd=a' + ';'.repeat(size),
            'password=a' + ',x='.repeat(size / 3),
            'password=' + ';token=a'.repeat(size / 8),
        ]
    ) {
        assertScanUnder(text.slice(0, 24), text)
    }
})

Deno.test('#494 a `code` ending at `&` and another pair is a form body', () => {
    assertEquals(
        redactQueryCredentials(
            `POST /token body code=${M}&grant_type=authorization_code`,
        ),
        'POST /token body code=***&grant_type=authorization_code',
    )
    // An HTML-escaped body separates its pairs with `&amp;`.
    assertEquals(
        redactQueryCredentials(
            `code=${M}&amp;grant_type=authorization_code`,
        ),
        'code=***&amp;grant_type=authorization_code',
    )
    // Diagnostics with no following pair are still left alone.
    for (
        const text of [
            'status code=503',
            'exit code=1',
            'exit code=1 && retry',
            'exit code=1&&retry=2',
            'code=503& done',
        ]
    ) {
        assertEquals(redactQueryCredentials(text), text)
    }
})

Deno.test('#494 the scan stays linear on a run of bare `code=` pairs', () => {
    // Sized so the linear scan takes milliseconds and a quadratic one takes
    // seconds: large enough to fail the threshold, small enough to finish,
    // since the mutation battery runs this suite with no timeout. A step
    // count would need a counter in the production module.
    for (
        const text of [
            'code='.repeat(1 << 15),
            'code='.repeat(1 << 14) + '&' + 'a'.repeat(1 << 16),
        ]
    ) {
        assertScanUnder(String(text.length), text)
    }
})

Deno.test('#494 only a known count name keeps an all-digit value', () => {
    // Counts: a `tokens` or `keys` plural named for a limit or a tally.
    for (
        const text of [
            'max_tokens=4096',
            'maxTokens=4096',
            'max_completion_tokens=512',
            'prompt_tokens=9000',
            'completion_tokens=12',
            'total_tokens=9012',
            'max-keys=1000',
        ]
    ) {
        assertEquals(redactQueryCredentials(text), text)
    }
    // Every other plural is a credential, digits or not: a PIN, an OTP, a
    // numeric API key.
    const digits = '12' + '3456'
    for (
        const name of [
            'api_tokens',
            'passwords',
            'pwds',
            'secrets',
            'credentials',
            'account_keys',
        ]
    ) {
        assertEquals(
            redactQueryCredentials(`${name}=${digits}`),
            `${name}=***`,
            name,
        )
    }
    // The exemption is for unquoted values only.
    assertEquals(
        redactQueryCredentials('max_tokens="4096"'),
        'max_tokens="***"',
    )
})

// ============================================================================
// #497: numeric-PIN credential names, and the qualified `code` rule
// ============================================================================

/** A short all-digit secret, assembled at run time. */
const PIN = '48' + '21'

Deno.test('#497 a numeric-PIN name masks an all-digit value, quoted or not', () => {
    for (
        const name of [
            'pin',
            'PIN',
            'Pin',
            'user_pin',
            'userPin',
            'USER_PIN',
            'card-pin',
            'new_pin',
            'newpin',
            'mpin',
            'upiPin',
            'USERPIN',
            'pin2',
            'pin_confirmation',
            'pins',
            'otp',
            'OTP',
            'totp',
            'hotp',
            'sms_otp',
            'otp2',
            'otps',
            'cvv',
            'cvv2',
            'CVV2',
            'card_cvv',
            'cvc',
            'cvc2',
            'card_cvc',
        ]
    ) {
        assert(isCredentialParamName(name), name)
        assertEquals(
            redactQueryCredentials(`${name}=${PIN}`),
            `${name}=***`,
            name,
        )
        assertEquals(
            redactQueryCredentials(`${name}="${PIN}"`),
            `${name}="***"`,
            name,
        )
    }
    assertEquals(
        redactQueryCredentials(`verify failed pin=${PIN}`),
        'verify failed pin=***',
    )
    assertEquals(redactQueryCredentials(`otp="${PIN}"`), 'otp="***"')
    assertEquals(
        redactQueryCredentials(`/x?cvv=${PIN}&page=1`),
        '/x?cvv=***&page=1',
    )
    assertEquals(
        redactQueryCredentials(`charge failed cvc=${PIN} retry=1`),
        'charge failed cvc=*** retry=1',
    )
})

Deno.test('#497 a code qualified by a credential or a factor word is masked anywhere', () => {
    // One name per factor word that only that word qualifies, so deleting
    // any one of them fails here; then the credential-stem leftovers.
    for (
        const name of [
            'mfa_code',
            'mfaCode',
            '2fa_code',
            '2faCode',
            'sms_code',
            'smsCode',
            'one_time_code',
            'one-time-code',
            'security_code',
            'card_security_code',
            'verification_code',
            'email_verification_code',
            'verify_code',
            'verifyCode',
            'recovery_code',
            'backup_codes',
            'access_code',
            'passcode',
            'passCode',
            'pass_code',
            'pin_code',
            'pinCode',
            'pincode',
            'otp_code',
            'totp_code',
            'auth_code',
            'pin_code_confirmation',
        ]
    ) {
        assert(isCredentialParamName(name), name)
        assertEquals(
            redactQueryCredentials(`login ${name}=${PIN} user=bob`),
            `login ${name}=*** user=bob`,
            name,
        )
    }
    assertEquals(
        redactQueryCredentials(`login mfa_code=${PIN} user=bob`),
        'login mfa_code=*** user=bob',
    )
})

Deno.test('#497 an unqualified code compound is still a diagnostic', () => {
    for (
        const name of [
            'status_code',
            'statusCode',
            'statuscode',
            'error_code',
            'exit_code',
            'exitCode',
            'response_code',
            'http_code',
            'zip_code',
            'zipcode',
            'postcode',
            'country_code',
            'promo_code',
            'confirmation_code',
            'barcode',
            'opcode',
            'unicode',
            'decode',
            'encode',
            'codec',
            'codes',
            'code_page',
            'preset_code',
        ]
    ) {
        assertEquals(isCredentialParamName(name), false, name)
    }
    for (
        const text of [
            'status code=503',
            'exit_code=1 status_code=503',
            'max_tokens=4096',
            'Postgres code=23505',
            'zip_code=75001 country_code=FR',
        ]
    ) {
        assertEquals(redactQueryCredentials(text), text)
    }
    assertEquals(
        redactQueryCredentials('/cb?code=abc&state=1'),
        '/cb?code=***&state=1',
    )
})

Deno.test('#497 a numeric-PIN name is never a count', () => {
    // `pins` is a credential plural, not a `tokens`/`keys` count, so a count
    // word in the name does not reopen the digit exemption.
    for (const name of ['max_pins', 'total_otps', 'max_cvvs']) {
        assertEquals(
            redactQueryCredentials(`${name}=${PIN}`),
            `${name}=***`,
            name,
        )
    }
})

Deno.test('#497 names that only contain the letters survive', () => {
    for (
        const name of [
            'pinned',
            'opinion',
            'shipping',
            'option',
            'options',
            'spinning',
            'pinpoint',
            '2fa',
            'mfa',
            'sms',
            'security',
            'verification',
            'backup',
            'tokenType',
            'key_id',
            'grant_type',
            'state',
        ]
    ) {
        assertEquals(isCredentialParamName(name), false, name)
    }
    for (
        const text of [
            'shipping=2 option=a pinned=true',
            'mfa=required access=denied',
        ]
    ) {
        assertEquals(redactQueryCredentials(text), text)
    }
})

// ============================================================================
// #528: every cut passes the marker on, whatever the value it ends
// ============================================================================

Deno.test('#528 an empty pair a cut starts passes the marker on', () => {
    // The empty pair sits inside the masked value before it, so the pair
    // after it does too: an exemption there would show the password's tail.
    assertRedacted({
        [`pwd=${HEAD};token=;code=${TAIL}`]: 'pwd=***;token=;code=***',
        [`pwd=${HEAD},secret=,code=${TAIL}`]: 'pwd=***,secret=,code=***',
        [`pwd=${HEAD};token=;max_tokens=4096`]: 'pwd=***;token=;max_tokens=***',
        [`--password=${HEAD}&token=&code=${TAIL}&${MID}`]:
            '--password=***&token=&code=***',
        [`pwd=${HEAD};card[cvc]=;code=${TAIL}`]: 'pwd=***;card[cvc]=;code=***',
    })
    // A kept count masks nothing, so the pair after it keeps its own rule.
    assertEquals(
        redactQueryCredentials('max_tokens=4096;code=23505'),
        'max_tokens=4096;code=23505',
    )
})

Deno.test('#528 an empty value a cut ends passes the marker on', () => {
    assertRedacted({
        [`--password=,code=${TAIL},retry=${MID}`]: '--password=,code=***',
        [`Pwd=;max_tokens=${PIN}`]: 'Pwd=;max_tokens=***',
        [`--password=,user[code]=${TAIL},retry=${MID}`]:
            '--password=,user[code]=***',
    })
    // The accepted cost, pinned so a change is a decision: an empty raw
    // credential value before a separator and a bare `code` masks that code.
    assertEquals(redactQueryCredentials('token=;code=23505'), 'token=;code=***')
})

// ============================================================================
// #526: bracketed form and query names (`card[cvc]`, `user[password]`)
// ============================================================================

Deno.test('#526 a bracketed name is classified by its field segment, raw or encoded', () => {
    // The field is the last bracket segment that holds a letter; an index
    // segment (`[]`, `[0]`) names a position, so it is skipped, and a name
    // whose segments are all indexes reads as its path.
    assertRedacted({
        [`card[cvc]=${PIN}`]: 'card[cvc]=***',
        [`/pay?card[cvc]=${PIN}&card[number]=4242`]:
            '/pay?card[cvc]=***&card[number]=4242',
        [`card[pin]=${PIN}`]: 'card[pin]=***',
        [`card%5Bpin%5D=${PIN}`]: 'card%5Bpin%5D=***',
        [`card%5bpin%5d=${PIN}`]: 'card%5bpin%5d=***',
        [`card[cvc%5D=${PIN}`]: 'card[cvc%5D=***',
        [`card%5Bcvc]=${PIN}`]: 'card%5Bcvc]=***',
        [`data[cvv]=${PIN}`]: 'data[cvv]=***',
        [`user[password]=${M}`]: 'user[password]=***',
        [`/x?auth[token]=${M}`]: '/x?auth[token]=***',
        [`a[b][password]=${M}`]: 'a[b][password]=***',
        [`password[]=${M}`]: 'password[]=***',
        [`password[0]=${M}`]: 'password[0]=***',
        [`password[-1]=${M}`]: 'password[-1]=***',
        [`card[cvc][]=${PIN}`]: 'card[cvc][]=***',
        [`card[cvc][0]=${PIN}`]: 'card[cvc][0]=***',
        [`user[password_confirmation]=${M}`]: 'user[password_confirmation]=***',
    })
    for (
        const name of [
            'card[cvc]',
            'card%5Bcvc%5D',
            'auth[token]',
            'password[]',
        ]
    ) {
        assert(isCredentialParamName(name), name)
    }
})

Deno.test('#526 a bracketed `code` field takes the bare `code` rule', () => {
    // A bracket container is structure, so the field is literally `code`: an
    // OAuth code in a URL, after `&amp;` or in a form body, a diagnostic
    // elsewhere.
    assertRedacted({
        [`user[code]=${M}&state=1`]: 'user[code]=***&state=1',
        [`/cb?user[code]=${M}`]: '/cb?user[code]=***',
        [`two_factor[code]=${PIN}&commit=Verify`]:
            'two_factor[code]=***&commit=Verify',
        [`user[code][]=${M}&state=1`]: 'user[code][]=***&state=1',
        [`/x?y=1&amp;card[cvc]=${PIN}`]: '/x?y=1&amp;card[cvc]=***',
        [`/cb?state=1&amp;user[code]=${M}`]: '/cb?state=1&amp;user[code]=***',
    })
    for (
        const text of [
            'status[code]=503',
            'error status[code]=503 retry',
            'user[code]=23505',
            'user[zip_code]=75001',
            'order[promo_code]=SAVE10',
        ]
    ) {
        assertEquals(redactQueryCredentials(text), text)
    }
})

Deno.test('#526 the path qualifies a field across the brackets', () => {
    // The whole path, read as a dotted name is, can only raise the field's
    // result to `stem`, never lower it.
    const digits = '12' + '3456'
    assertEquals(
        redactQueryCredentials(`verification[code]=${PIN}`),
        'verification[code]=***',
    )
    assertEquals(redactQueryCredentials(`pin[code]=${PIN}`), 'pin[code]=***')
    assertRedacted({
        [`password[confirmation]=${M}`]: 'password[confirmation]=***',
    })
    assertEquals(
        redactQueryCredentials(`max[api_tokens]=${digits}`),
        'max[api_tokens]=***',
    )
    // A pinned over-match: a stem prefix qualifies the code after it.
    assertEquals(redactQueryCredentials('[auth]code=23505'), '[auth]code=***')
    // Pinned over-matches: a `key` field is a stem, and a nested `code`
    // field in a URL or a form body takes the OAuth rule.
    assertRedacted({
        [`config[key]=${M}`]: 'config[key]=***',
        [`/x?error[code]=${M}&a=1`]: '/x?error[code]=***&a=1',
        [`error[code]=${M}&a=b`]: 'error[code]=***&a=b',
    })
})

Deno.test('#526 non-credential bracket names still render', () => {
    for (
        const text of [
            'card[number]=4242',
            'filter[status]=open',
            'page[size]=20',
            'token[type]=bearer',
            'api_key[id]=k1',
            'limits[max_tokens]=4096',
            'max_tokens[0]=4096',
            'usage[total_tokens]=9012',
            '[0]=x',
            '[]=x',
            'max_tokens=4096;code=23505',
            '?token=&page=1',
        ]
    ) {
        assertEquals(redactQueryCredentials(text), text)
    }
    for (
        const name of ['card[number]', 'token[type]', 'filter[status]', '[0]']
    ) {
        assertEquals(isCredentialParamName(name), false, name)
    }
})

Deno.test('#526 a credential pair after a separator is found through its brackets', () => {
    // The lookahead reads the bracketed name as the walk left does, so the
    // pair is cut and masked by its own rule.
    assertRedacted({
        [`code=${M}&grant[type]=authorization_code`]:
            'code=***&grant[type]=authorization_code',
        [`pwd=${HEAD}&card[cvc]="${TAIL} ${MID}"`]: 'pwd=***&card[cvc]="***"',
        [`Pwd=${HEAD};card%5Bcvc%5D="${TAIL} ${MID}"`]:
            'Pwd=***;card%5Bcvc%5D="***"',
        [`--password=${HEAD}&card[cvc]=${TAIL}&${MID}`]:
            '--password=***&card[cvc]=***',
        [`--password=${HEAD}&user[code]=${TAIL}&${MID}`]:
            '--password=***&user[code]=***',
        [`Pwd=${HEAD};limits[max_tokens]=4096`]:
            'Pwd=***;limits[max_tokens]=***',
    })
    // A non-credential bracket lookahead does not cut.
    assertEquals(
        redactQueryCredentials('--password=ab&x[y]=cd'),
        '--password=***',
    )
})

Deno.test('#526 a bracket in a log prefix leaves the name after it classified', () => {
    // As on `main`, where the walk stopped at the bracket: a reading of the
    // path alone would lose these.
    const digits = '12' + '3456'
    assertRedacted({
        [`[INFO]password=${M}`]: '[INFO]password=***',
        [`[INFO]code=${M}&a=b`]: '[INFO]code=***&a=b',
    })
    assertEquals(
        redactQueryCredentials(`[max]api_tokens=${digits}`),
        '[max]api_tokens=***',
    )
})

Deno.test('#526 the accepted cost: what a bracketed name still shows', () => {
    // Pinned so a change to any of these is a decision, not a drift.
    for (
        const [text, expected] of [
            // A credential container with a generic field name.
            ['password[value]=x', 'password[value]=x'],
            // A doubly encoded bracket, like `%253D`.
            ['card%255Bcvc%255D=314', 'card%255Bcvc%255D=314'],
            // A blank inside a segment ends the walk there.
            ['user[pass word]=x', 'user[pass word]=x'],
            // An unqualified container's `code` in free text.
            ['user[code]=x', 'user[code]=x'],
            // A raw value outside a URL eats its neighbour.
            ['card[cvc]=314&card[number]=4242', 'card[cvc]=***'],
            // A query name that begins with a bracket takes URL mode.
            ['?[x]password=A&B', '?[x]password=***&B'],
            // A credential container with another generic field name.
            ['token[raw]=x', 'token[raw]=x'],
            // A dotted path keeps its single compound reading.
            ['user.code=X&a=b', 'user.code=X&a=b'],
            // `two_factor` is no code qualifier, so free text renders.
            ['two_factor[code]=x', 'two_factor[code]=x'],
            // A nested `code` field in free text is a diagnostic.
            ['error[code]=E_X', 'error[code]=E_X'],
        ]
    ) {
        assertEquals(redactQueryCredentials(text), expected, text)
    }
    // `[` and `]` join the run a cut shows (#529): a password holding
    // `,Q7W[y8]zi.SiG-=` is cut there, and that fragment renders.
    assertRedacted({
        [`password=${HEAD},Q7W[y8]zi.SiG-=${TAIL}`]:
            'password=***,Q7W[y8]zi.SiG-=***',
    })
    // A query name with a bracket before its field segment takes URL mode
    // too, so the text after the next `&` renders where `main` masked it.
    const out = redactQueryCredentials(`&a[b]password=${M}&next`)
    assertEquals(out, '&a[b]password=***&next')
    assertNoMarker(out)
})

Deno.test('#526 the scan stays linear on bracketed names', () => {
    // Eight shapes, about 256 KB each: one long bracket name, an index-only
    // name (sized smaller, so the quadratic mutant the battery runs still
    // finishes), `x]=` repeated, encoded brackets, `&a[` lookaheads, a cut
    // chain of empty bracket pairs, `;card[cvc]=a` chains and `user[code]=a&`
    // runs. A fixed limit on the best of up to three runs, as for #500.
    const size = 256 << 10
    for (
        const text of [
            'a' + '[b]'.repeat(size / 3) + '=x',
            '[0]'.repeat(49152) + '=x',
            'x]='.repeat(size / 3),
            '%5Ba%5D'.repeat(size / 7) + '=x',
            '--password=a' + '&a['.repeat(size / 3),
            'password=' + '&a[token]='.repeat(size / 10),
            'password=' + ';card[cvc]=a'.repeat(size / 12),
            'user[code]=a&'.repeat(size / 13),
        ]
    ) {
        assertScanUnder(text.slice(0, 24), text)
    }
})
