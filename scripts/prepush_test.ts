/**
 * @fileoverview Tests for `scripts/prepush.ts` (#433): the pre-push gate
 * decision, the order of gate and scan, and the stdin handoff.
 *
 * The decision tests build their repositories with the same #431 fixture the
 * secret scan's admission tests use (`scripts/prepush_test_support.ts`): the
 * gate skip IS the scan's predicate, so it is tested against the same notion
 * of "already published". The gate and the scan are injected as recorders.
 *
 * The last two tests spawn the real `scripts/prepush.ts` in a throwaway
 * repository whose own `deno.jsonc` defines a `gate` task that records what
 * it read on stdin, so the handoff to the real scan program and the gate's
 * empty stdin are checked end to end. Nothing touches the checkout the tests
 * run in.
 *
 * @module
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { fromFileUrl, join } from '@std/path'
import { sanitizedGitEnv } from './git_env.ts'
import {
    decideGate,
    type PrepushDeps,
    runPrepush,
    SKIP_REASON,
    spawnScan,
} from './prepush.ts'
import {
    git,
    isolatedEnv,
    type PublishedFixture,
    publishedFixture,
    sideCommit,
    subtreeCommit,
    withTempDir,
    ZERO,
} from './prepush_test_support.ts'

/** What the injected gate and scan saw. */
interface Recorder {
    /** `gate` and `scan`, in call order. */
    calls: string[]
    /** Every buffer handed to the scan. */
    scanned: Uint8Array[]
    /** Every line the hook printed. */
    logs: string[]
    deps: PrepushDeps
}

/**
 * Recording stand-ins for the gate and the scan.
 *
 * @param gateCode - The exit code the fake gate returns.
 * @returns The recorder, with `deps` ready for {@link runPrepush}.
 */
function recorder(gateCode = 0): Recorder {
    const rec: Recorder = {
        calls: [],
        scanned: [],
        logs: [],
        deps: {
            runGate: () => {
                rec.calls.push('gate')
                return Promise.resolve(gateCode)
            },
            runScan: (input) => {
                rec.calls.push('scan')
                rec.scanned.push(input)
                return Promise.resolve(0)
            },
            log: (line) => rec.logs.push(line),
        },
    }
    return rec
}

/**
 * {@link runPrepush} over `stdin`, with the decision's git isolated to the
 * fixture.
 *
 * @param stdin - The hook's stdin.
 * @param dir - The repository root, also `HOME`.
 * @param rec - The recorder whose deps are used.
 * @returns The hook's exit code.
 */
function prepush(stdin: string, dir: string, rec: Recorder): Promise<number> {
    return runPrepush(new TextEncoder().encode(stdin), dir, {
        ...rec.deps,
        env: isolatedEnv(dir),
    })
}

/**
 * The two lines a package mirror push hands the hook: the branch over the
 * previous mirror head, and the lightweight tag (no remote tip yet).
 *
 * @param fixture - A {@link publishedFixture}.
 * @returns The stdin text, newline-terminated.
 */
async function mirrorPush(
    { dir, m1, m2 }: PublishedFixture,
): Promise<string> {
    const previous = await subtreeCommit(dir, m1)
    const head = await subtreeCommit(dir, m2, previous)
    return `refs/heads/main ${head} refs/heads/main ${previous}\n` +
        `refs/tags/v2 ${head} refs/tags/v2 ${ZERO}\n`
}

/**
 * A new branch whose tip adds one blob `origin/main` does not hold.
 *
 * @param dir - A {@link publishedFixture} repository.
 * @param base - The commit the branch starts from.
 * @returns The stdin line, newline-terminated.
 */
async function newContentPush(dir: string, base: string): Promise<string> {
    const side = await sideCommit(
        dir,
        base,
        () =>
            Deno.writeTextFile(
                join(dir, 'packages/a/new.ts'),
                'export const n = 1\n',
            ),
    )
    return `refs/heads/feature ${side} refs/heads/feature ${ZERO}\n`
}

Deno.test('prepush: a mirror-shaped push skips the gate and is still scanned', async () => {
    await withTempDir('prepush-mirror-', async (dir) => {
        const fixture = await publishedFixture(dir)
        const rec = recorder()
        const code = await prepush(await mirrorPush(fixture), dir, rec)
        assertEquals(code, 0)
        assertEquals(rec.calls, ['scan'])
        assertEquals(rec.logs[0], `[pre-push] gate skip: ${SKIP_REASON}`)
    })
})

Deno.test('prepush: new content runs the gate before the scan', async () => {
    await withTempDir('prepush-new-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const rec = recorder()
        await prepush(await newContentPush(dir, m2), dir, rec)
        assertEquals(rec.calls, ['gate', 'scan'])
        assertStringIncludes(rec.logs[0], '[pre-push] gate run: ')
        assertStringIncludes(
            rec.logs[0],
            'refs/heads/feature: sends objects origin/main has not published',
        )
    })
})

Deno.test('prepush: without origin/main the gate runs, even for a mirror-shaped push', async () => {
    await withTempDir('prepush-no-main-', async (dir) => {
        const stdin = await mirrorPush(await publishedFixture(dir))
        await git(dir, 'update-ref', '-d', 'refs/remotes/origin/main')
        const rec = recorder()
        await prepush(stdin, dir, rec)
        assertEquals(rec.calls, ['gate', 'scan'])
        assertStringIncludes(rec.logs[0], 'origin/main does not resolve')
    })
})

Deno.test('prepush: a mixed push (one admitted update, one with new content) runs the gate', async () => {
    await withTempDir('prepush-mixed-', async (dir) => {
        const fixture = await publishedFixture(dir)
        const stdin = await mirrorPush(fixture) +
            await newContentPush(dir, fixture.m2)
        const rec = recorder()
        await prepush(stdin, dir, rec)
        assertEquals(rec.calls, ['gate', 'scan'])
        assertStringIncludes(rec.logs[0], 'refs/heads/feature: ')
    })
})

Deno.test('prepush: an empty push runs the gate and the scan still gets the empty input', async () => {
    await withTempDir('prepush-empty-', async (dir) => {
        await publishedFixture(dir)
        const rec = recorder()
        assertEquals(await prepush('', dir, rec), 0)
        assertEquals(rec.calls, ['gate', 'scan'])
        assertEquals(rec.scanned, [new Uint8Array()])
        assertStringIncludes(rec.logs[0], 'an empty push proves nothing')
    })
})

Deno.test('prepush: a delete runs the gate', async () => {
    await withTempDir('prepush-delete-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const rec = recorder()
        await prepush(`refs/heads/old ${ZERO} refs/heads/old ${m2}\n`, dir, rec)
        assertEquals(rec.calls, ['gate', 'scan'])
        assertStringIncludes(rec.logs[0], 'refs/heads/old: a delete')
    })
})

Deno.test('prepush: a remote sha missing from the local object store runs the gate', async () => {
    await withTempDir('prepush-missing-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const head = await subtreeCommit(dir, m2)
        const absent = 'deadbeef'.repeat(5)
        const rec = recorder()
        await prepush(
            `refs/heads/main ${head} refs/heads/main ${absent}\n`,
            dir,
            rec,
        )
        assertEquals(rec.calls, ['gate', 'scan'])
        assertStringIncludes(
            rec.logs[0],
            'refs/heads/main: what it sends cannot be computed',
        )
    })
})

Deno.test('prepush: a failing gate refuses the push and the scan never runs', async () => {
    await withTempDir('prepush-gate-fails-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const rec = recorder(3)
        const code = await prepush(await newContentPush(dir, m2), dir, rec)
        assertEquals(code, 3)
        assertEquals(rec.calls, ['gate'])
        assert(
            rec.logs.some((l) => l.includes('push refused')),
            rec.logs.join('\n'),
        )
    })
})

Deno.test('prepush: when the decision cannot run, the gate runs and the printed reason carries the error', async () => {
    await withTempDir('prepush-undecidable-', async (dir) => {
        const line = `refs/heads/main ${
            'a'.repeat(40)
        } refs/heads/main ${ZERO}\n`

        // A directory that is not a repository: no origin/main to admit by.
        const plain = recorder()
        await prepush(line, dir, plain)
        assertEquals(plain.calls, ['gate', 'scan'])
        assertStringIncludes(plain.logs[0], '[pre-push] gate run: ')

        assertStringIncludes(plain.logs[0], 'origin/main does not resolve')

        // A directory git cannot even be spawned in: the decision itself
        // throws, and the spawn error — which names the directory — is
        // printed rather than swallowed.
        const missing = join(dir, 'does-not-exist')
        const rec = recorder()
        await prepush(line, missing, rec)
        assertEquals(rec.calls, ['gate', 'scan'])
        assertStringIncludes(
            rec.logs[0],
            '[pre-push] gate run: the gate decision failed (',
        )
        assertStringIncludes(rec.logs[0], missing)

        // decideGate itself never throws.
        const decision = await decideGate(line, missing, isolatedEnv(dir))
        assertEquals(decision.gate, 'run')
        assertStringIncludes(decision.reason, missing)
    })
})

Deno.test('prepush: the scan receives the exact input bytes, on a skip and on a run', async () => {
    await withTempDir('prepush-bytes-', async (dir) => {
        const fixture = await publishedFixture(dir)
        const mirror = await mirrorPush(fixture)
        // A tab separator and a blank last line: whatever the decision
        // tolerates, the scan must see verbatim.
        const skipInput = mirror.replace(' ', '\t') + '\n'
        const runInput = await newContentPush(dir, fixture.m2) + mirror

        for (
            const [stdin, expected] of [[skipInput, 'skip'], [runInput, 'run']]
        ) {
            const input = new TextEncoder().encode(stdin)
            const rec = recorder()
            await runPrepush(input, dir, { ...rec.deps, env: isolatedEnv(dir) })
            assertStringIncludes(rec.logs[0], `[pre-push] gate ${expected}: `)
            assertEquals(rec.scanned.length, 1)
            assertEquals(rec.scanned[0], input)
        }
    })
})

// ---------------------------------------------------------------------------
// End to end: the real scripts/prepush.ts, the real scan program, a fixture
// repository whose `gate` task records its stdin.
// ---------------------------------------------------------------------------

/** The entry point under test. */
const PREPUSH = fromFileUrl(new URL('./prepush.ts', import.meta.url))

/** What the fixture's gate task recorded. */
interface GateRecord {
    /** Everything the gate read on stdin. */
    stdin: string
    /** Whether the gate's stdin was a pipe (it must be `/dev/null`). */
    fifo: boolean | null
}

/** The outcome of one end-to-end hook run. */
interface HookRun {
    code: number
    output: string
    /** `null` when the gate never ran. */
    gate: GateRecord | null
}

/**
 * Spawn the real `scripts/prepush.ts` in a fixture repository, the way the
 * installed hook does, with `stdin` piped in.
 *
 * @param dir - An empty temp directory, made into the fixture.
 * @param stdin - git's ref-update lines.
 * @returns The exit code, combined output, and the gate's record.
 */
async function runHook(dir: string, stdin: string): Promise<HookRun> {
    await git(dir, 'init', '-q')
    await Deno.writeTextFile(
        join(dir, 'gate_probe.ts'),
        `const input = await new Response(Deno.stdin.readable).text()
const fifo = Deno.statSync('/dev/stdin').isFifo
await Deno.writeTextFile('gate_record.json', JSON.stringify({ stdin: input, fifo }))
`,
    )
    await Deno.writeTextFile(
        join(dir, 'deno.jsonc'),
        '{ "tasks": { "gate": "deno run -A gate_probe.ts" } }\n',
    )
    const child = new Deno.Command(Deno.execPath(), {
        args: ['run', '-A', PREPUSH],
        cwd: dir,
        clearEnv: true,
        env: {
            ...sanitizedGitEnv(),
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_CONFIG_NOSYSTEM: '1',
        },
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'piped',
    }).spawn()
    const writer = child.stdin.getWriter()
    await writer.write(new TextEncoder().encode(stdin))
    await writer.close()
    const out = await child.output()
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
    const gate = await Deno.readTextFile(join(dir, 'gate_record.json')).then(
        (text) => JSON.parse(text) as GateRecord,
        () => null,
    )
    return {
        code: out.code,
        output: decode(out.stdout) + decode(out.stderr),
        gate,
    }
}

/**
 * Two ref lines, the LAST one malformed. The scan's parser rejects it before
 * it installs gitleaks, so the test needs no gitleaks binary, and the decision
 * rejects it too (rule 1), so the gate runs first. Putting the malformed line
 * last means a handoff that drops anything after the first line cannot pass:
 * the scan would see a lone delete and exit 0.
 */
const MALFORMED = `refs/heads/old ${ZERO} refs/heads/old ${'a'.repeat(40)}\n` +
    'refs/heads/main only-two-fields\n'

Deno.test('prepush end to end: the scan program receives the ref-update bytes', async () => {
    await withTempDir('prepush-e2e-scan-', async (dir) => {
        const run = await runHook(dir, MALFORMED)
        // Handed nothing, or only the first line, the scan would exit 0
        // ("nothing to scan", or a skipped delete).
        assert(run.code !== 0, run.output)
        assertStringIncludes(
            run.output,
            '[secret-scan] malformed pre-push ref line: "refs/heads/main only-two-fields"',
        )
        assertStringIncludes(
            run.output,
            '[pre-push] gate run: ref updates unreadable',
        )
    })
})

Deno.test('prepush end to end: the gate runs with no stdin, never the ref-update lines', async () => {
    await withTempDir('prepush-e2e-gate-', async (dir) => {
        const run = await runHook(dir, MALFORMED)
        assert(run.gate !== null, `the gate did not run:\n${run.output}`)
        assertEquals(run.gate.stdin, '')
        // Inherited, the gate would read the hook's (drained) pipe; it must
        // be handed /dev/null instead.
        assertEquals(run.gate.fifo, false)
    })
})

Deno.test('spawnScan: a scan that exits 0 without reading its stdin is a refusal, not a pass', async () => {
    await withTempDir('prepush-unread-', async (dir) => {
        const stub = join(dir, 'scan_stub.ts')
        await Deno.writeTextFile(stub, 'Deno.exit(0)\n')
        // Well past any pipe buffer, so the write cannot complete before the
        // stub exits: it fails with a broken pipe.
        const input = new Uint8Array(1024 * 1024).fill(0x61)
        assert(input.length > 64 * 1024)
        assertEquals(await spawnScan(input, stub), 1)
    })
})
