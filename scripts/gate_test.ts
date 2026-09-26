/**
 * @fileoverview Unit tests for the gate runner in `scripts/gate.ts` (#388):
 * the step list, the `--leaks` and `--registry` variants, argument refusal,
 * and stop-at-first-failure.
 *
 * @module
 */

import {
    assertEquals,
    assertNotEquals,
    assertStringIncludes,
    assertThrows,
} from '@std/assert'
import {
    type GateStep,
    gateSteps,
    main,
    parseGateArgs,
    runGate,
} from './gate.ts'

Deno.test('the gate runs the suite last, after every static check', () => {
    // Asserts each step's args, not only its label (#397): a step that kept
    // its label while running the wrong command used to pass this test.
    assertEquals(gateSteps(), [
        { label: 'fmt --check', args: ['fmt', '--check'] },
        { label: 'lint', args: ['lint'] },
        { label: 'check', args: ['check'] },
        { label: 'deps:analyze', args: ['task', 'deps:analyze'] },
        {
            label: 'agents:brief --check',
            args: ['task', 'agents:brief', '--check'],
        },
        { label: 'docs:coverage', args: ['task', 'docs:coverage'] },
        { label: 'publish:check', args: ['task', 'publish:check'] },
        { label: 'test', args: ['task', 'test'] },
    ])
})

Deno.test('--leaks swaps only the suite for test:leaks', () => {
    const plain = gateSteps()
    const leaks = gateSteps({ leaks: true })
    assertEquals(leaks.slice(0, -1), plain.slice(0, -1))
    assertEquals(leaks.at(-1), {
        label: 'test:leaks',
        args: ['task', 'test:leaks'],
    })
})

Deno.test('--registry reaches publish:check and no other step', () => {
    const plain = gateSteps()
    const registry = gateSteps({ registry: true })
    const publishIndex = plain.findIndex((s) => s.label === 'publish:check')
    // Every step but publish:check is untouched.
    assertEquals(
        registry.filter((_, i) => i !== publishIndex),
        plain.filter((_, i) => i !== publishIndex),
    )
    // publish:check alone carries the flag.
    assertEquals(registry[publishIndex], {
        label: 'publish:check',
        args: ['task', 'publish:check', '--registry'],
    })
})

Deno.test('--leaks and --registry combine without interfering', () => {
    const both = gateSteps({ leaks: true, registry: true })
    assertEquals(both.at(-1), {
        label: 'test:leaks',
        args: ['task', 'test:leaks'],
    })
    assertEquals(
        both.find((s) => s.label === 'publish:check'),
        {
            label: 'publish:check',
            args: ['task', 'publish:check', '--registry'],
        },
    )
})

Deno.test('an unknown argument is refused, not ignored', () => {
    assertEquals(parseGateArgs([]), {})
    assertEquals(parseGateArgs(['--leaks']), { leaks: true })
    assertEquals(parseGateArgs(['--registry']), { registry: true })
    assertEquals(parseGateArgs(['--leaks', '--registry']), {
        leaks: true,
        registry: true,
    })
    assertThrows(() => parseGateArgs(['--leak']), Error, '--leak')
})

Deno.test('the gate stops at the first failing step with its code', async () => {
    const ran: string[] = []
    const outcome = await runGate(gateSteps(), (step: GateStep) => {
        ran.push(step.label)
        return Promise.resolve(step.label === 'publish:check' ? 3 : 0)
    })
    assertEquals(outcome.code, 3)
    assertEquals(outcome.failed?.label, 'publish:check')
    assertEquals(ran.at(-1), 'publish:check')
    assertEquals(ran.includes('test'), false)
})

Deno.test('the gate passes only when every step exits 0', async () => {
    const outcome = await runGate(gateSteps(), () => Promise.resolve(0))
    assertEquals(outcome, { code: 0 })
})

Deno.test("main returns the failing step's code, never 0", async () => {
    const code = await main(
        [],
        (step) => Promise.resolve(step.label === 'lint' ? 5 : 0),
    )
    assertEquals(code, 5)
})

Deno.test('main returns 2 on an unknown argument without running a step', async () => {
    let ran = 0
    const code = await main(['--leak'], () => {
        ran++
        return Promise.resolve(0)
    })
    assertEquals(code, 2)
    assertEquals(ran, 0)
})

Deno.test('main returns 0 only when every step passes', async () => {
    assertEquals(await main(['--leaks'], () => Promise.resolve(0)), 0)
})

Deno.test('main with --registry runs publish:check with --registry and no other step gets it', async () => {
    const seen: Record<string, string[]> = {}
    const code = await main(['--registry'], (step) => {
        seen[step.label] = step.args
        return Promise.resolve(0)
    })
    assertEquals(code, 0)
    assertEquals(seen['publish:check'], ['task', 'publish:check', '--registry'])
    for (const [label, args] of Object.entries(seen)) {
        if (label === 'publish:check') continue
        assertEquals(
            args.includes('--registry'),
            false,
            `${label} got --registry`,
        )
    }
})

/**
 * Run the real gate entry point as a child process.
 *
 * @param cwd - Working directory for the gate and every step it spawns.
 * @param args - Gate arguments.
 * @returns The child's exit code and combined output.
 */
async function runGateProcess(
    cwd: string,
    args: string[],
): Promise<{ code: number; out: string }> {
    const run = await new Deno.Command(Deno.execPath(), {
        args: [
            'run',
            '-A',
            new URL('./gate.ts', import.meta.url).pathname,
            ...args,
        ],
        cwd,
        // A clean env: no GITHUB_ACTIONS, so the output is the local form.
        clearEnv: true,
        env: {
            PATH: Deno.env.get('PATH') ?? '',
            HOME: Deno.env.get('HOME') ?? '',
        },
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    return {
        code: run.code,
        out: new TextDecoder().decode(run.stdout) +
            new TextDecoder().decode(run.stderr),
    }
}

Deno.test('the gate PROCESS exits non-zero when a step fails', async () => {
    // A directory whose only file is badly formatted: the first step,
    // `deno fmt --check`, fails for real, and nothing later runs.
    const dir = await Deno.makeTempDir({ prefix: 'gate-red-' })
    try {
        await Deno.writeTextFile(`${dir}/bad.ts`, 'const   x=1;export{x}\n')
        const { code, out } = await runGateProcess(dir, [])
        assertNotEquals(code, 0, `a failing step exited 0:\n${out}`)
        assertStringIncludes(out, 'gate failed at "fmt --check"')
        assertEquals(out.includes('gate passed'), false, out)
        assertEquals(out.includes('▶ gate: lint'), false, out)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('the gate PROCESS exits 2 on an unknown flag', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'gate-flag-' })
    try {
        const { code, out } = await runGateProcess(dir, ['--leak'])
        assertEquals(code, 2, out)
        assertStringIncludes(out, 'unknown argument: --leak')
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
