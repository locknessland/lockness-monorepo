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
    assertEquals(redactQueryCredentials('token=&page=1'), 'token=&page=1')
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
