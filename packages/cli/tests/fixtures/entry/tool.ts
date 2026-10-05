/**
 * @fileoverview A standalone tool whose work throws, run through `runEntry`
 * exactly as a `jsr:@lockness/<pkg>` entry would (#436).
 *
 * `entry.test.ts` spawns it so the real process exit status and the real
 * stderr are observed, including whether Deno printed `error: Uncaught`.
 *
 * - `Deno.args[0]` is `failure` or `unexpected`: a `CommandFailedError`, or a
 *   plain `Error`, is thrown.
 * - `Deno.args[1]` and `Deno.args[2]` are fake secrets, placed in the message
 *   and in the cause.
 *
 * @module @lockness/cli/tests/fixtures/entry/tool
 */

import { CommandFailedError } from '../../../command_failure.ts'
import { runEntry } from '../../../entry.ts'

const [kind, inMessage, inCause] = Deno.args

/** The tool's work: it throws, and never touches process state. */
async function main(): Promise<void> {
    await Promise.resolve()
    const cause = new Error(`fetch https://api.test/v1?api_key=${inCause}`)
    if (kind === 'failure') {
        throw new CommandFailedError(
            `Cannot reach postgres://app:${inMessage}@db.test/app`,
            { cause },
        )
    }
    throw new Error(`Cannot reach postgres://app:${inMessage}@db.test/app`, {
        cause,
    })
}

if (import.meta.main) await runEntry('tool', () => main())
