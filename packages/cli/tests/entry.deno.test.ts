/**
 * @fileoverview `runEntry` as a real subprocess (#436): the exit status the
 * operating system sees, a fake credential in message and cause absent from
 * stderr, and no `error: Uncaught`. Every fake credential is assembled at run
 * time.
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name.** The child is
 * spawned as `deno run`; how to launch a script on runtime R belongs to
 * `@lockness/runtime`'s invocation (plan 274 §5, C12), and these rows move to
 * it there. The in-process rows, which run on every runtime, are in
 * `entry.test.ts`.
 *
 * @module @lockness/cli/tests/entry_deno
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { fromFileUrl } from '@std/path'

/** A fake secret, distinct per call; it must never reach stderr. */
function fakeSecret(tag: string): string {
    return ['fx', tag, crypto.randomUUID().slice(0, 8)].join('')
}

for (const kind of ['failure', 'unexpected'] as const) {
    Deno.test(`runEntry - a subprocess whose work throws (${kind}) exits non-zero, redacted, with no uncaught error`, async () => {
        const [inMessage, inCause] = ['msg', 'cause'].map(fakeSecret)
        const fixture = new URL('./fixtures/entry/tool.ts', import.meta.url)
        const { code, stdout, stderr } = await new Deno.Command(
            Deno.execPath(),
            {
                args: ['run', fromFileUrl(fixture), kind, inMessage, inCause],
                env: { NO_COLOR: '1' },
                stdout: 'piped',
                stderr: 'piped',
            },
        ).output()
        const out = new TextDecoder().decode(stdout) +
            new TextDecoder().decode(stderr)
        assertEquals(code, 1, out)
        assert(!out.includes(inMessage), out)
        assert(!out.includes(inCause), out)
        assert(!out.includes('error: Uncaught'), out)
        assertEquals(out.split('❌').length - 1, 1, out)
        assertStringIncludes(out, 'postgres://***:***@db.test/app')
        assertStringIncludes(out, 'api_key=***')
    })
}
