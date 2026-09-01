/**
 * The boot gate: an application with the cookie session driver and no usable
 * key does not start in production.
 *
 * Why the gate lives in the bootstrap step and nowhere else — this is the one
 * place holding both halves of the question:
 *
 * - `@lockness/session` has the secret and **cannot** have the environment. A
 *   library must not ask whether it is in production, and reading `Deno.env`
 *   from one needs a permission its consumer never granted.
 * - `sessionMiddleware()` has neither at the moment the kernel calls it: the
 *   call happens in a field initialiser, run by `new KernelClass()` in
 *   `loader.ts`, *before* this step runs `configureSession`. A gate there throws
 *   for every application in development.
 * - `createDriver` runs per request, so a gate there is 500-per-request rather
 *   than a refusal to start.
 */

import { assertEquals, assertRejects } from '@std/assert'
import { runBootstrapSteps } from '../kernel/bootstrap/registry.ts'
import { sessionStep } from '../kernel/bootstrap/steps/session.ts'
import {
    devSessionKey,
    normalizeSessionConfig,
} from '../kernel/bootstrap/helpers.ts'
import type { BootstrapContext } from '../kernel/bootstrap/types.ts'
import {
    assertUsableSecret,
    generateAppKey,
    getSessionConfig,
    SessionSecretError,
} from '@lockness/session'

// deno-lint-ignore no-explicit-any
function contextFor(session: any): BootstrapContext {
    return {
        config: { session },
        kernel: {},
        KernelClass: class {},
        globalMiddlewareProp: undefined,
        bootHooks: [],
        shutdownHooks: [],
    } as unknown as BootstrapContext
}

async function withEnv(
    vars: Record<string, string | undefined>,
    fn: () => Promise<void>,
): Promise<void> {
    const saved = new Map<string, string | undefined>()
    for (const [k, v] of Object.entries(vars)) {
        saved.set(k, Deno.env.get(k))
        if (v === undefined) Deno.env.delete(k)
        else Deno.env.set(k, v)
    }
    try {
        await fn()
    } finally {
        for (const [k, v] of saved) {
            if (v === undefined) Deno.env.delete(k)
            else Deno.env.set(k, v)
        }
    }
}

Deno.test('session boot - production with no APP_KEY refuses to start', async () => {
    await withEnv({ APP_ENV: 'production', APP_KEY: undefined }, async () => {
        const error = await assertRejects(
            () => runBootstrapSteps(contextFor(true), [sessionStep]),
            SessionSecretError,
        )

        assertEquals(error.reason, 'missing')
    })
})

Deno.test('session boot - the refusal names APP_KEY and carries no key', async () => {
    await withEnv({ APP_ENV: 'production', APP_KEY: undefined }, async () => {
        const error = await assertRejects(
            () => runBootstrapSteps(contextFor(true), [sessionStep]),
            SessionSecretError,
        )

        assertEquals(error.message.includes('APP_KEY'), true)
        // A message that would let somebody read a key out of a boot log.
        assertEquals(/base64:[A-Za-z0-9+/]{40,}/.test(error.message), false)
    })
})

Deno.test('session boot - production with a placeholder APP_KEY refuses to start', async () => {
    await withEnv(
        { APP_ENV: 'production', APP_KEY: 'change-me-in-production' },
        async () => {
            const error = await assertRejects(
                () => runBootstrapSteps(contextFor(true), [sessionStep]),
                SessionSecretError,
            )

            assertEquals(error.reason, 'known-placeholder')
        },
    )
})

Deno.test('session boot - development with no APP_KEY boots on a process key', async () => {
    await withEnv({ APP_ENV: 'development', APP_KEY: undefined }, async () => {
        await runBootstrapSteps(contextFor(true), [sessionStep])

        const secret = getSessionConfig().secret
        assertEquals(typeof secret, 'string')
        assertEquals(secret?.startsWith('base64:'), true)
    })
})

Deno.test('session boot - the development key is one per PROCESS, not one per call', () => {
    // normalizeSessionConfig is pure and runs once per createApp plus four times
    // in this package's own suite. A key generated inside its body would be a
    // key per call: two applications in one process would hold different keys
    // and nothing would notice.
    //
    // Both probes are REAL keys, deliberately. `devSessionKey` memoises into
    // process-global state, so whatever this test puts there outlives it — and
    // an earlier version handed it the string 'base64:GENERATED-ONCE', which is
    // not a usable key. Every later test that boots on the development path then
    // inherited it, and the suite passed only in declaration order:
    // `--shuffle=9` failed 1 of 32. A test that poisons shared state is a defect
    // in the test, and it was found by shuffling rather than by reading.
    const first = devSessionKey(generateAppKey)
    const second = devSessionKey(generateAppKey)

    assertEquals(first, second)
    assertUsableSecret(first, 'generated')
})

Deno.test('session boot - a non-cookie driver needs no key at all', async () => {
    // Memory, Deno KV and Redis put a random id in the cookie and the data in a
    // store. Requiring a secret there breaks working configurations to protect
    // nothing.
    await withEnv({ APP_ENV: 'production', APP_KEY: undefined }, async () => {
        await runBootstrapSteps(contextFor({ driver: 'memory' }), [sessionStep])

        assertEquals(getSessionConfig().driver, 'memory')
    })
})

Deno.test('session boot - normalizeSessionConfig never substitutes a literal', async () => {
    await withEnv({ APP_KEY: undefined }, () => {
        assertEquals(normalizeSessionConfig(true).secret, undefined)
        return Promise.resolve()
    })
})

Deno.test('session boot - DENO_ENV=production refuses to start, not just APP_ENV', async () => {
    // The framework's own container sets DENO_ENV, not APP_ENV
    // (packages/init/stubs/init/Dockerfile.stub), and http/server.ts already
    // read `DENO_ENV || APP_ENV`. A gate consulting only APP_ENV is therefore
    // inert in the exact image it exists to protect — the feature would have
    // shipped looking correct and doing nothing in production.
    await withEnv(
        { DENO_ENV: 'production', APP_ENV: undefined, APP_KEY: undefined },
        async () => {
            const error = await assertRejects(
                () => runBootstrapSteps(contextFor(true), [sessionStep]),
                SessionSecretError,
            )

            assertEquals(error.reason, 'missing')
        },
    )
})

Deno.test('session boot - the secure cookie flag reads the same two names', async () => {
    // Same mismatch, same file: `secure` defaulted off DENO_ENV-less APP_ENV, so
    // the cookie lost `Secure` in that image too. One helper, both callers.
    await withEnv(
        { DENO_ENV: 'production', APP_ENV: undefined },
        () => {
            assertEquals(normalizeSessionConfig(true).secure, true)
            return Promise.resolve()
        },
    )
})

Deno.test('session boot - production WITH a valid APP_KEY starts', async () => {
    // The positive control, and the gap the review named. Every other test here
    // proves the gate refuses something; none proved it lets a correct
    // configuration through. A gate mutated to refuse unconditionally in
    // production survived the whole file — I checked, and the two tests that did
    // go red broke for an unrelated reason (the development fallback lives
    // inside the same branch), which is exactly how a mis-targeted mutation
    // impersonates coverage.
    const key = generateAppKey()
    await withEnv({ APP_ENV: 'production', APP_KEY: key }, async () => {
        await runBootstrapSteps(contextFor(true), [sessionStep])

        assertEquals(getSessionConfig().secret, key)
        assertEquals(getSessionConfig().driver, 'cookie')
    })
})

Deno.test('session boot - a key given in kernel config beats APP_KEY, and starts', async () => {
    const explicit = generateAppKey()
    await withEnv(
        { APP_ENV: 'production', APP_KEY: generateAppKey() },
        async () => {
            await runBootstrapSteps(
                contextFor({ driver: 'cookie', secret: explicit }),
                [sessionStep],
            )

            assertEquals(getSessionConfig().secret, explicit)
        },
    )
})
