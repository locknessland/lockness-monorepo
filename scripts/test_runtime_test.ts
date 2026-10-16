/**
 * @fileoverview Unit tests for `scripts/test_runtime.ts` (#594): package
 * selection from `engines`, the lane with no declared package, the declared
 * package that ran zero tests, argument validation, the test-file rule and
 * the JUnit count. No runtime is spawned: the lane runs against a recording
 * host.
 *
 * @module
 */

import { test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import type { Member } from './manifests.ts'
import {
    countTestsRun,
    INSTALL,
    type Invocation,
    isTestFile,
    type LaneHost,
    type LanePackage,
    main,
    parseRuntimeArgs,
    runLane,
    selectPackages,
    testFilesOf,
    testInvocation,
    UsageError,
} from './test_runtime.ts'

/** A host that records every call and answers from a script. */
function recordingHost(
    answer: (invocation: Invocation) => { code: number; report?: string },
): LaneHost & { runs: Invocation[]; out: string[]; err: string[] } {
    const reports = new Map<string, string>()
    const runs: Invocation[] = []
    const out: string[] = []
    const err: string[] = []
    return {
        runs,
        out,
        err,
        run: (invocation) => {
            runs.push(invocation)
            const { code, report } = answer(invocation)
            const path = invocation.args
                .map((a) =>
                    a.match(
                        /^--(?:junit-path|reporter-outfile|test-reporter-destination)=(.+\.xml)$/,
                    )?.[1]
                )
                .find((p) => p !== undefined)
            if (path !== undefined && report !== undefined) {
                reports.set(path, report)
            }
            return Promise.resolve(code)
        },
        readReport: (path) => Promise.resolve(reports.get(path) ?? null),
        log: (line) => out.push(line),
        error: (line) => err.push(line),
    }
}

const ONE_TEST = '<testsuites><testcase name="a" file="x"/></testsuites>'

const members: Member[] = [
    {
        dir: 'packages/a',
        pkg: { name: '@lockness/a', engines: { deno: '>=2.2' } },
    },
    {
        dir: 'packages/b',
        pkg: { name: '@lockness/b', engines: { deno: '>=2.2', node: '>=24' } },
    },
    {
        dir: 'packages/c',
        pkg: { name: '@lockness/c', engines: { deno: '>=2.2', bun: '>=1.4' } },
    },
    { dir: 'packages/d/demo', pkg: {} },
]

/** A lane package with one file, declared. */
function pkg(
    label: string,
    files = [`packages/${label}/x.test.ts`],
): LanePackage {
    return { label, dir: `packages/${label}`, declared: true, files }
}

test('a lane selects exactly the members whose engines name its runtime', () => {
    assertEquals(selectPackages(members, 'node', []), [
        { label: '@lockness/b', dir: 'packages/b', declared: true },
    ])
    assertEquals(
        selectPackages(members, 'bun', []).map((s) => s.label),
        ['@lockness/c'],
    )
    assertEquals(
        selectPackages(members, 'deno', []).map((s) => s.label),
        ['@lockness/a', '@lockness/b', '@lockness/c'],
    )
})

test('--package names a member by name, short name or directory, declared or not', () => {
    assertEquals(selectPackages(members, 'node', ['a', '@lockness/b']), [
        { label: '@lockness/a', dir: 'packages/a', declared: false },
        { label: '@lockness/b', dir: 'packages/b', declared: true },
    ])
    assertEquals(
        selectPackages(members, 'node', ['packages/d/demo', 'd/demo/'])
            .map((s) => s.label),
        ['packages/d/demo'],
    )
    assertThrows(
        () => selectPackages(members, 'node', ['nope']),
        UsageError,
        '--package=nope is not a workspace member',
    )
})

test('a lane with no declared package runs nothing and passes', async () => {
    const host = recordingHost(() => ({ code: 1 }))
    const outcome = await runLane('bun', [], '/r', host)
    assertEquals(outcome, { code: 0, faults: [] })
    // Not even the install: a lane with nothing to run costs nothing.
    assertEquals(host.runs, [])
    assertEquals(host.out, [
        'test:runtime bun: no package declares engines.bun; nothing to run',
    ])
})

test('main on a tree where no package declares node exits 0', async () => {
    const root = await mkdtemp(join(tmpdir(), 'test-runtime-'))
    try {
        await writeFile(
            join(root, 'package.json'),
            JSON.stringify({ workspaces: ['packages/a'] }),
        )
        await mkdir(join(root, 'packages/a/tests'), { recursive: true })
        await writeFile(
            join(root, 'packages/a/package.json'),
            JSON.stringify({ name: '@lockness/a', engines: { deno: '>=2.2' } }),
        )
        await writeFile(join(root, 'packages/a/tests/a.test.ts'), '')
        const host = recordingHost(() => ({ code: 0, report: ONE_TEST }))
        assertEquals(await main(['--runtime=node'], root, host), 0)
        assertEquals(host.runs, [])
        // The same tree on Deno runs the declared package.
        assertEquals(await main(['--runtime=deno'], root, host), 0)
        assertEquals(host.runs.map((r) => r.command), ['deno'])
        assertEquals(host.runs[0].args.at(-1), 'packages/a/tests/a.test.ts')
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('a declared package that ran zero tests fails the lane', async () => {
    // The runner exits 0 but reports nothing that ran.
    const host = recordingHost((inv) =>
        inv.command === 'deno' ? { code: 0 } : {
            code: 0,
            report:
                '<testsuites><testcase name="s"><skipped/></testcase></testsuites>',
        }
    )
    const outcome = await runLane('node', [pkg('b')], '/r', host)
    assertEquals(outcome.code, 1)
    assertEquals(outcome.faults, [
        'b declares engines.node, but 0 of its tests ran on node',
    ])
    assertEquals(host.runs[0], INSTALL)
})

test('a missing report (Bun writes none when no test ran) is zero tests', async () => {
    const host = recordingHost(() => ({ code: 0 }))
    const outcome = await runLane('bun', [pkg('c')], '/r', host)
    assertEquals(outcome.code, 1)
    assertStringIncludes(outcome.faults[0], '0 of its tests ran on bun')
})

test('a declared package with no test file fails the lane', async () => {
    const host = recordingHost(() => ({ code: 0, report: ONE_TEST }))
    const outcome = await runLane('deno', [pkg('a', [])], '/r', host)
    assertEquals(outcome, {
        code: 1,
        faults: ['a: no test file, so 0 tests ran on deno'],
    })
})

test('every package runs; a failing runner and a passing one are both reported', async () => {
    const host = recordingHost((inv) =>
        inv.args.some((a) => a.includes('/b/'))
            ? { code: 3, report: ONE_TEST }
            : {
                code: 0,
                report: ONE_TEST,
            }
    )
    const outcome = await runLane('deno', [pkg('b'), pkg('a')], '/r', host)
    assertEquals(outcome, {
        code: 1,
        faults: ['b: the deno runner exited 3'],
    })
    assertEquals(host.runs.length, 2)
    assertEquals(host.err, ['❌ b: the deno runner exited 3'])
})

test('a failed install stops the lane before any test', async () => {
    const host = recordingHost(() => ({ code: 7 }))
    const outcome = await runLane('node', [pkg('b')], '/r', host)
    assertEquals(outcome.code, 1)
    assertEquals(host.runs, [INSTALL])
    assertEquals(outcome.faults, ['deno install --frozen failed (exit 7)'])
})

test('the deno lane does not install, and a passing lane exits 0', async () => {
    const host = recordingHost(() => ({ code: 0, report: ONE_TEST }))
    const outcome = await runLane('deno', [pkg('a')], '/r', host)
    assertEquals(outcome, { code: 0, faults: [] })
    assertEquals(host.runs.map((r) => r.command), ['deno'])
})

test('an undeclared package named by --package is noted, then run', async () => {
    const host = recordingHost(() => ({ code: 0, report: ONE_TEST }))
    const undeclared = { ...pkg('a'), declared: false }
    const outcome = await runLane('node', [undeclared], '/r', host, true)
    assertEquals(outcome.code, 0)
    assertStringIncludes(host.out[1], 'a does not declare engines.node')
})

test('arguments: --runtime is required, known, and given once', () => {
    assertEquals(parseRuntimeArgs(['--runtime=bun']), {
        runtime: 'bun',
        packages: [],
    })
    assertEquals(
        parseRuntimeArgs(['--package=core', '--runtime=node', '--package=cli']),
        { runtime: 'node', packages: ['core', 'cli'] },
    )
    assertThrows(
        () => parseRuntimeArgs([]),
        UsageError,
        '--runtime is required',
    )
    assertThrows(
        () => parseRuntimeArgs(['--runtime=bunn']),
        UsageError,
        'unknown runtime "bunn"',
    )
    assertThrows(
        () => parseRuntimeArgs(['--runtime=bun', '--runtime=node']),
        UsageError,
        '--runtime given twice',
    )
    assertThrows(
        () => parseRuntimeArgs(['--runtime=bun', '--package=']),
        UsageError,
        '--package needs a name',
    )
    assertThrows(
        () => parseRuntimeArgs(['--runtime', 'bun']),
        UsageError,
        'unknown argument: --runtime',
    )
})

test('main maps a usage error to exit 2 without running anything', async () => {
    const host = recordingHost(() => ({ code: 0 }))
    assertEquals(await main(['--runtime=deno', '--leaks'], '/nowhere', host), 2)
    assertEquals(host.runs, [])
    assertStringIncludes(host.err[0], 'unknown argument: --leaks')
})

test("a test file is what Deno's discovery picks", () => {
    for (const name of ['test.ts', 'a_test.ts', 'a.test.tsx', 'a.test.mjs']) {
        assertEquals(isTestFile(name), true, name)
    }
    for (const name of ['a-test.ts', 'atest.ts', 'a.test.ts.stub', 'a.ts']) {
        assertEquals(isTestFile(name), false, name)
    }
})

test('the file walk skips node_modules, dist, dot-dirs and nested members', async () => {
    const root = await mkdtemp(join(tmpdir(), 'test-runtime-'))
    try {
        for (
            const file of [
                'packages/v/tests/a.test.ts',
                'packages/v/sub/tests/b_test.ts',
                'packages/v/node_modules/x/c.test.ts',
                'packages/v/dist/d.test.js',
                'packages/v/.cache/e.test.ts',
                'packages/v/demo/f.test.ts',
                'packages/v/tests/helper.ts',
            ]
        ) {
            await mkdir(dirname(join(root, file)), { recursive: true })
            await writeFile(join(root, file), '')
        }
        assertEquals(
            await testFilesOf(root, 'packages/v', [
                'packages/v',
                'packages/v/demo',
            ]),
            ['packages/v/sub/tests/b_test.ts', 'packages/v/tests/a.test.ts'],
        )
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('each runtime gets its invocation, reporting JUnit to the given path', () => {
    const files = ['packages/a/tests/a.test.ts']
    assertEquals(testInvocation('deno', files, '/r/0.xml'), {
        command: 'deno',
        args: ['test', '-A', '--junit-path=/r/0.xml', ...files],
    })
    assertEquals(testInvocation('bun', files, '/r/0.xml'), {
        command: 'bun',
        args: [
            'test',
            '--conditions=lockness-source',
            '--timeout=0',
            '--reporter=junit',
            '--reporter-outfile=/r/0.xml',
            './packages/a/tests/a.test.ts',
        ],
    })
    assertEquals(testInvocation('node', files, '/r/0.xml'), {
        command: 'node',
        args: [
            '--conditions=lockness-source',
            '--test',
            '--test-concurrency=1',
            '--test-reporter=spec',
            '--test-reporter-destination=stdout',
            '--test-reporter=junit',
            '--test-reporter-destination=/r/0.xml',
            ...files,
        ],
    })
})

test('the JUnit count skips skipped tests and Node file placeholders', () => {
    // Shapes taken from Node 24, Bun 1.4 and Deno 2.9 reports.
    const node = `<testsuites>
	<testsuite name="suite" tests="2">
		<testcase name="one" classname="suite" file="/w/tests/a.test.ts"/>
		<testcase name="skipped" classname="suite" file="/w/tests/a.test.ts">
			<skipped type="skipped" message="true"/>
		</testcase>
	</testsuite>
	<testcase name="tests/empty.test.ts" classname="test" file="/w/tests/empty.test.ts"/>
</testsuites>`
    assertEquals(countTestsRun(node), 1)
    const bun = `<testsuites name="bun test" tests="3">
  <testsuite name="tests/a.test.ts" file="tests/a.test.ts">
    <testcase name="one" classname="suite" time="0.001" file="tests/a.test.ts" line="4" assertions="0" />
    <testcase name="skipped" classname="suite" time="0" file="tests/a.test.ts" line="7"><skipped /></testcase>
    <testcase name="a &gt; b" classname="" file="tests/a.test.ts" line="9" />
  </testsuite>
</testsuites>`
    assertEquals(countTestsRun(bun), 2)
    const deno = `<testsuites name="deno test" tests="2">
    <testsuite name="./tests/a.test.ts" tests="2">
        <testcase name="parent" classname="./tests/a.test.ts" time="0.001" line="9" col="1">
        </testcase>
        <testcase name="parent &gt; child" classname="./tests/a.test.ts" time="0.000" line="10" col="13">
        </testcase>
    </testsuite>
</testsuites>`
    assertEquals(countTestsRun(deno), 2)
    assertEquals(countTestsRun('<testsuites></testsuites>'), 0)
})
