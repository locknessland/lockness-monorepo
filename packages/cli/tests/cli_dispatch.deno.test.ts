/**
 * @fileoverview The `@lockness/cli` exit contract's subprocess row (#508):
 * T6, a `LOCKNESS_CLI_RAW_ERRORS` value that is not valid Unicode.
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name.** The bytes cannot
 * be set in-process (`process.env` takes a string), so a POSIX shell builds
 * them and launches the fixture with `deno run`; launching a script on
 * runtime R belongs to `@lockness/runtime`'s invocation (plan 274 §5, C12).
 * The rest of the contract runs on every runtime, in `cli_dispatch.test.ts`.
 *
 * @module @lockness/cli/tests/cli_dispatch_deno
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'

/** The raw switch's variable. */
const RAW = 'LOCKNESS_CLI_RAW_ERRORS'

Deno.test(
    'dispatch - T6 a switch value that is not valid Unicode still prints the real error once, exit 1',
    {
        // A POSIX shell builds the bytes; `Deno.Command` takes only strings.
        ignore: Deno.build.os === 'windows',
    },
    async function () {
        const message = ['fx', 'real', crypto.randomUUID().slice(0, 8)].join(
            '',
        )
        const fixture = new URL(
            './fixtures/raw-errors/dispatch.ts',
            import.meta.url,
        )
        const { code, stdout, stderr } = await new Deno.Command('sh', {
            args: [
                '-c',
                `${RAW}="$(printf '\\377\\376')" exec "$0" run --allow-env "$1" "$2"`,
                Deno.execPath(),
                fixture.pathname,
                message,
            ],
            cwd: new URL('..', import.meta.url).pathname,
            stdout: 'piped',
            stderr: 'piped',
        }).output()
        const out = new TextDecoder().decode(stdout) +
            new TextDecoder().decode(stderr)
        assertEquals(code, 1, out)
        assertEquals(
            out.split(`❌ task failed: Error: ${message}`).length - 1,
            1,
            out,
        )
        assertStringIncludes(
            out,
            `${RAW}=<not valid Unicode> could not be read`,
        )
        assert(!out.includes('InvalidData'), out)
    },
)
