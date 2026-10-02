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

/** Assert that no part of the marker survived into `out`. */
function assertNoMarker(out: string, context = out): void {
    assert(!out.includes(M), `marker leaked: ${context}`)
    assert(!out.includes(HEAD), `marker head leaked: ${context}`)
    assert(!out.includes(TAIL), `marker tail leaked: ${context}`)
}

/** Render `message` as the message of an `Error`. */
function render(message: string): string {
    return renderError(new Error(message))
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

Deno.test('#478 the scan is linear: a 1 MB name run and 1 MB of pairs', () => {
    const run = 'a'.repeat(1 << 20) + '=x'
    const pairs = 'a=b&'.repeat(1 << 18)
    for (const [label, text] of [['name run', run], ['pairs', pairs]]) {
        const start = performance.now()
        redactQueryCredentials(text)
        const elapsed = performance.now() - start
        assert(elapsed < 1000, `${label}: ${elapsed.toFixed(0)} ms`)
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

Deno.test('#478 a plural stem with an all-digit value is a count, not a secret', () => {
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

Deno.test('#494 a `code` ending at `&` and another pair is a form body', () => {
    assertEquals(
        redactQueryCredentials(
            `POST /token body code=${M}&grant_type=authorization_code`,
        ),
        'POST /token body code=***&grant_type=authorization_code',
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
    for (
        const text of [
            'code='.repeat(1 << 18),
            'code='.repeat(1 << 17) + '&' + 'a'.repeat(1 << 19),
        ]
    ) {
        const start = performance.now()
        redactQueryCredentials(text)
        const elapsed = performance.now() - start
        assert(elapsed < 1000, `${text.length}: ${elapsed.toFixed(0)} ms`)
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
