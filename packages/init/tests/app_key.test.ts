/**
 * The scaffolded application key.
 *
 * `init` generates the key itself rather than importing
 * `@lockness/session`'s generator: a scaffolder that runs once should not pull
 * the session package, and Hono behind it, into a tooling package whose
 * dependency contract is `allow: ["cli"]`.
 *
 * **This file is what makes that safe.** The shape has one home —
 * `packages/session/secret.ts` — and these tests run `init`'s output through
 * that home's validator, so the two cannot drift apart without going red. The
 * import is test-only: `deps_analyzer.ts` skips `tests/`, and `init`'s
 * `deno.json` excludes it from publish.
 */

import { assertEquals } from '@std/assert'
import { assertUsableSecret } from '@lockness/session'
import { generateAppKey, withAppKey } from '../mod.ts'

Deno.test("init - a scaffolded key satisfies the session package's validator", () => {
    const bytes = assertUsableSecret(generateAppKey(), 'generated')

    assertEquals(bytes.byteLength, 32)
})

Deno.test('init - every scaffold gets a different key', () => {
    const seen = new Set(Array.from({ length: 32 }, () => generateAppKey()))

    assertEquals(seen.size, 32)
})

Deno.test('init - the key replaces the empty placeholder line, it is not appended', () => {
    const example = 'APP_ENV=development\nAPP_KEY=\nPORT=8888\n'
    const written = withAppKey(example, 'base64:KEY')

    assertEquals(written.match(/^APP_KEY=/gm)?.length, 1)
    assertEquals(written.includes('APP_KEY=base64:KEY'), true)
    assertEquals(written.includes('PORT=8888'), true)
})

Deno.test('init - a file with no APP_KEY line gains exactly one, carrying the key', () => {
    // The replace branch asserted the value and the surviving content; this one
    // asserted only the line count, so an append writing an empty value passed.
    const written = withAppKey('APP_ENV=development\nPORT=8888\n', 'base64:KEY')

    assertEquals(written.match(/^APP_KEY=/gm)?.length, 1)
    assertEquals(/^APP_KEY=base64:KEY$/m.test(written), true)
    assertEquals(written.includes('APP_ENV=development'), true)
    assertEquals(written.includes('PORT=8888'), true)
})

Deno.test('init - no shipped .env example carries a key', async () => {
    // The stub is committed by whoever scaffolds. A key placed there is shared
    // by everybody who clones the project — the defect this feature removes,
    // wearing a different hat.
    const roots = [
        'stubs/init/.env.exemple.stub',
        'stubs/kits/web/.env.exemple.stub',
        'stubs/kits/api/.env.exemple.stub',
        'stubs/kits/slim/.env.exemple.stub',
    ]

    for (const relative of roots) {
        const text = await Deno.readTextFile(
            new URL(`../${relative}`, import.meta.url),
        )
        const line = text.match(/^APP_KEY=(.*)$/m)?.[1]

        assertEquals(line, '', `${relative} ships a key`)
    }
})
