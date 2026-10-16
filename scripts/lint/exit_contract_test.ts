/**
 * Tests for the `lockness-exit` lint plugin (#436, D5): `process-exit`,
 * `printed-failure` and `signal-subscription` (#598) — the shapes each flags, the shapes that stay clean, the
 * owner list and the file scoping.
 *
 * Scope is decided on the path relative to the repository root, so every file
 * linted through the plugin sits under the real root (`ROOT`, computed here
 * independently of the rule). The scope helpers take the root as a parameter,
 * which is how the checkout-location cases are tested.
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import { fromFileUrl } from '@std/path'
import plugin, { inCommandScope, inPackageScope } from './exit_contract.ts'

/** The repository this test file lives in, with forward slashes and a trailing `/`. */
const ROOT = fromFileUrl(new URL('../../', import.meta.url))
    .replaceAll('\\', '/')

/** Lint `source` as `file` and return the hit count of `rule`. */
function hits(
    rule: 'process-exit' | 'printed-failure' | 'signal-subscription',
    source: string,
    file: string,
): number {
    return Deno.lint.runPlugin(plugin, file, source)
        .filter((d) => d.id === `lockness-exit/${rule}`).length
}

// ---------------------------------------------------------------------------
// process-exit
// ---------------------------------------------------------------------------

/** A package file no owner list names. */
const PACKAGE_FILE = `${ROOT}packages/x/mod.ts`

const EXIT_POSITIVES: ReadonlyArray<readonly [string, string]> = [
    ['Deno.exit(1)', 'Deno.exit(1)'],
    ['Deno.exit() with no status', 'Deno.exit()'],
    ['Deno.exit inside a handler', 'async function h() { Deno.exit(code) }'],
    ['an assignment to Deno.exitCode', 'Deno.exitCode = 1'],
    ['a compound assignment to Deno.exitCode', 'Deno.exitCode ||= 1'],
    ['an increment of Deno.exitCode', 'Deno.exitCode++'],
    ['a prefix decrement of Deno.exitCode', '--Deno.exitCode'],
    ['a computed Deno.exit call', "Deno['exit'](1)"],
    ['a computed template Deno.exit call', 'Deno[`exit`](1)'],
    ['a computed Deno.exitCode assignment', "Deno['exitCode'] = 1"],
    ['exit destructured from Deno', 'const { exit } = Deno'],
    ['exit destructured and renamed', 'const { exit: quit } = Deno'],
    ['exit destructured by a string key', "const { 'exit': quit } = Deno"],
    ['exit destructured in an assignment', 'let exit; ({ exit } = Deno)'],
    // T019 (#596): the same shapes on Node's process object.
    ['process.exit(1)', 'process.exit(1)'],
    ['process.exit() with no status', 'process.exit()'],
    ['a computed process.exit call', "process['exit'](1)"],
    ['an assignment to process.exitCode', 'process.exitCode = 1'],
    ['a compound assignment to process.exitCode', 'process.exitCode ??= 1'],
    ['an increment of process.exitCode', 'process.exitCode++'],
    ['exit destructured from process', 'const { exit } = process'],
    ['exit imported from node:process', "import { exit } from 'node:process'"],
    ['exit imported and renamed', "import { exit as quit } from 'process'"],
]

for (const [label, source] of EXIT_POSITIVES) {
    test(`process-exit - flags ${label}`, () => {
        assertEquals(hits('process-exit', source, PACKAGE_FILE), 1)
    })
}

const EXIT_NEGATIVES: ReadonlyArray<readonly [string, string]> = [
    ['a read of Deno.exitCode', 'const status = Deno.exitCode'],
    ['a look-alike object', 'proc.exit(1); proc.exitCode = 1'],
    ['a read of process.exitCode', 'const status = process.exitCode'],
    [
        'other members destructured from process',
        'const { env, argv } = process',
    ],
    [
        'other imports from node:process',
        "import { env, argv } from 'node:process'",
    ],
    ['exit imported from another module', "import { exit } from './exit.ts'"],
    ['an unrelated Deno call', 'Deno.exitSignal?.()'],
    ['a returned status', 'return 1'],
    ['an increment of a look-alike', 'proc.exitCode++'],
    ['a computed read of another member', "Deno['env'].get('X')"],
    ['a computed member with a variable key', 'Deno[key](1)'],
    ['other members destructured from Deno', 'const { env, args } = Deno'],
    // A copy of the status, not a write to it.
    ['exitCode destructured from Deno', 'const { exitCode } = Deno'],
    ['exit destructured from another object', 'const { exit } = proc'],
]

for (const [label, source] of EXIT_NEGATIVES) {
    test(`process-exit - leaves ${label} alone`, () => {
        assertEquals(hits('process-exit', source, PACKAGE_FILE), 0)
    })
}

// The rule matches `Deno` by name. A second name for the namespace, or
// reaching it through `globalThis`, is a shape it does not follow: tracking
// aliases needs scope analysis, and none of these appears in the repository.
test('process-exit - known gap: an alias of Deno is not followed', () => {
    for (
        const source of [
            'const d = Deno; d.exit(1)',
            'globalThis.Deno.exit(1)',
            'const { exit } = globalThis.Deno',
        ]
    ) {
        assertEquals(hits('process-exit', source, PACKAGE_FILE), 0, source)
    }
})

test('process-exit - Deno.exit is allowed only in its two owners', () => {
    const source = 'Deno.exit(1)'
    assertEquals(
        hits('process-exit', source, `${ROOT}packages/core/http/server.ts`),
        0,
    )
    assertEquals(
        hits('process-exit', source, `${ROOT}packages/core/kernel/signals.ts`),
        0,
    )
    assertEquals(
        hits('process-exit', source, `${ROOT}packages/cli/report.ts`),
        1,
    )
})

test('process-exit - the owners own the process.* forms too (#596)', () => {
    // An owner migrating off Deno keeps its right to exit, and no more.
    const server = `${ROOT}packages/core/http/server.ts`
    const report = `${ROOT}packages/cli/report.ts`
    assertEquals(hits('process-exit', 'process.exit(1)', server), 0)
    assertEquals(
        hits('process-exit', "import { exit } from 'node:process'", server),
        0,
    )
    assertEquals(hits('process-exit', 'process.exitCode = 1', server), 1)
    assertEquals(hits('process-exit', 'process.exitCode = 1', report), 0)
    assertEquals(hits('process-exit', 'process.exit(1)', report), 1)
})

test('process-exit - an owner is a repository path, not a suffix', () => {
    assertEquals(
        hits(
            'process-exit',
            'Deno.exit(1)',
            `${ROOT}packages/x/vendor/packages/core/http/server.ts`,
        ),
        1,
    )
})

test('process-exit - Deno.exitCode is allowed only in cli/report.ts', () => {
    const source = 'Deno.exitCode = status'
    assertEquals(
        hits('process-exit', source, `${ROOT}packages/cli/report.ts`),
        0,
    )
    assertEquals(
        hits(
            'process-exit',
            'Deno.exitCode++',
            `${ROOT}packages/cli/report.ts`,
        ),
        0,
    )
    assertEquals(
        hits('process-exit', source, `${ROOT}packages/core/http/server.ts`),
        1,
    )
    assertEquals(
        hits('process-exit', source, `${ROOT}packages/cli/entry.ts`),
        1,
    )
})

test('process-exit - reports nothing in tests, stubs or outside packages', () => {
    const source = 'Deno.exit(1)'
    for (
        const file of [
            'packages/x/tests/a.ts',
            'packages/x/a.test.ts',
            'packages/x/a_test.ts',
            'packages/x/a.test.tsx',
            'packages/x/stubs/make/a.ts',
            'scripts/gate.ts',
            'app/kernel.ts',
        ]
    ) {
        assertEquals(hits('process-exit', source, `${ROOT}${file}`), 0, file)
    }
})

// ---------------------------------------------------------------------------
// printed-failure
// ---------------------------------------------------------------------------

/** A command file inside the rule's scope. */
const COMMAND_FILE = `${ROOT}packages/x/cli_commands.ts`

const PRINT_POSITIVES: ReadonlyArray<readonly [string, string]> = [
    ['console.error with a ❌ string', "console.error('❌ Failed')"],
    ['console.warn with a ❌ string', 'console.warn("❌ Failed")'],
    ['console.log with a ❌ string', "console.log('❌ Failed')"],
    ['a ❌ template', 'console.error(`❌ Failed: ${name}`)'],
    ['a ❌ string with more arguments', "console.error('❌ Failed:', error)"],
    ['a ❌ after leading whitespace', "console.log('\\n❌ Failed')"],
    [
        'a ❌ template on the line after the call',
        'console.error(\n    `❌ Job ${name} failed`,\n)',
    ],
]

for (const [label, source] of PRINT_POSITIVES) {
    test(`printed-failure - flags ${label}`, () => {
        assertEquals(hits('printed-failure', source, COMMAND_FILE), 1)
    })
}

const PRINT_NEGATIVES: ReadonlyArray<readonly [string, string]> = [
    ['a success line', "console.log('✅ Created')"],
    ['a warning line', "console.warn('⚠️  Skipped')"],
    ['a ❌ that is not first', "console.log('Status: ❌')"],
    ['a ❌ in a later argument', "console.error(label, '❌ Failed')"],
    ['console.info', "console.info('❌ Failed')"],
    ['a look-alike object', "logger.error('❌ Failed')"],
    ['a thrown failure', "throw new CommandFailedError('Failed')"],
    ['a template starting with a substitution', 'console.error(`${icon} x`)'],
]

for (const [label, source] of PRINT_NEGATIVES) {
    test(`printed-failure - leaves ${label} alone`, () => {
        assertEquals(hits('printed-failure', source, COMMAND_FILE), 0)
    })
}

test('printed-failure - reports in every command-code path', () => {
    const source = "console.error('❌ Failed')"
    for (
        const file of [
            'packages/cli/commands/make/action.ts',
            'packages/queue/commands.ts',
            'packages/mail/cli_commands.ts',
            'packages/openapi/install.ts',
            'packages/drizzle/generators/model_generator.ts',
            'packages/cli/core_commands.ts',
            'packages/core/cli/compile_command.ts',
            'packages/ui/mod.ts',
            'packages/upgrade/mod.ts',
            'packages/init/mod.ts',
        ]
    ) {
        assertEquals(hits('printed-failure', source, `${ROOT}${file}`), 1, file)
    }
})

test('printed-failure - reports nothing outside command code', () => {
    const source = "console.error('❌ Failed')"
    for (
        const file of [
            'packages/cli/mod.ts',
            'packages/cli/report.ts',
            'packages/core/mod.ts',
            'packages/core/exceptions/formatter.ts',
            'packages/queue/worker.ts',
            'packages/drizzle/mod.ts',
            'packages/cli/tests/commands/a.ts',
            'packages/x/commands/a.test.ts',
            'packages/cli/stubs/commands/a.ts',
            'scripts/commands/a.ts',
        ]
    ) {
        assertEquals(hits('printed-failure', source, `${ROOT}${file}`), 0, file)
    }
})

// ---------------------------------------------------------------------------
// scoping helpers
// ---------------------------------------------------------------------------

test('exit-contract - the scopes default to this repository', () => {
    assertEquals(inPackageScope(`${ROOT}packages/x/mod.ts`), true)
    assertEquals(inCommandScope(`${ROOT}packages/x/cli_commands.ts`), true)
})

test('exit-contract - the scopes read Windows separators', () => {
    const root = 'C:\\repo\\'
    assertEquals(inPackageScope('C:\\repo\\packages\\x\\mod.ts', root), true)
    assertEquals(
        inPackageScope('C:\\repo\\packages\\x\\tests\\a.ts', root),
        false,
    )
    assertEquals(
        inCommandScope('C:\\repo\\packages\\x\\cli_commands.ts', root),
        true,
    )
    assertEquals(inCommandScope('C:\\repo\\packages\\x\\mod.ts', root), false)
})

test('exit-contract - a checkout under a tests or stubs directory keeps the rules on', () => {
    for (const root of ['/home/me/tests/lockness/', '/srv/stubs/lockness/']) {
        assertEquals(inPackageScope(`${root}packages/x/mod.ts`, root), true)
        assertEquals(
            inCommandScope(`${root}packages/x/cli_commands.ts`, root),
            true,
        )
        assertEquals(
            inPackageScope(`${root}packages/x/tests/a.ts`, root),
            false,
        )
    }
})

test("exit-contract - a package's commands.ts is command code (#592)", () => {
    const root = '/repo/'
    assertEquals(
        inCommandScope(`${root}packages/queue/commands.ts`, root),
        true,
    )
    assertEquals(
        inCommandScope(`${root}packages/queue/tests/commands.ts`, root),
        false,
    )
    assertEquals(inCommandScope(`${root}packages/queue/worker.ts`, root), false)
})

test("exit-contract - a package's setup.ts is command code (#592)", () => {
    const root = '/repo/'
    assertEquals(
        inCommandScope(`${root}packages/deprecation-contracts/setup.ts`, root),
        true,
    )
    assertEquals(
        inCommandScope(`${root}packages/x/tests/setup.ts`, root),
        false,
    )
})

test('exit-contract - a checkout under a packages directory reads the right package', () => {
    const root = '/home/me/packages/lockness/'
    assertEquals(
        inCommandScope(`${root}packages/core/cli/compile_command.ts`, root),
        true,
    )
    assertEquals(inCommandScope(`${root}packages/ui/mod.ts`, root), true)
    assertEquals(inCommandScope(`${root}packages/x/mod.ts`, root), false)
    assertEquals(inPackageScope(`${root}scripts/gate.ts`, root), false)
})

test('exit-contract - a file outside the repository is out of scope', () => {
    const root = '/home/me/lockness/'
    assertEquals(inPackageScope('/elsewhere/packages/x/mod.ts', root), false)
    assertEquals(
        inCommandScope('/elsewhere/packages/x/install.ts', root),
        false,
    )
    assertEquals(
        hits('process-exit', 'Deno.exit(1)', '/elsewhere/packages/x/mod.ts'),
        0,
    )
})

// ---------------------------------------------------------------------------
// signal-subscription (plan 274 §5, #598)
// ---------------------------------------------------------------------------

const SIGNAL_POSITIVES: ReadonlyArray<readonly [string, string]> = [
    ["process.on('SIGINT')", "process.on('SIGINT', stop)"],
    ["process.once('SIGTERM')", "process.once('SIGTERM', stop)"],
    ['process.addListener', "process.addListener('SIGHUP', stop)"],
    ['process.prependListener', "process.prependListener('SIGINT', stop)"],
    [
        'process.prependOnceListener',
        "process.prependOnceListener('SIGINT', stop)",
    ],
    ['a computed method', "process['on']('SIGINT', stop)"],
    ['a template signal name', 'process.on(`SIGTERM`, stop)'],
    ['a signal Lockness does not name', "process.on('SIGUSR2', stop)"],
    ['inside a function', "function f() { process.on('SIGINT', () => {}) }"],
]

for (const [label, source] of SIGNAL_POSITIVES) {
    test(`signal-subscription - flags ${label}`, () => {
        assertEquals(hits('signal-subscription', source, PACKAGE_FILE), 1)
    })
}

const SIGNAL_NEGATIVES: ReadonlyArray<readonly [string, string]> = [
    ['a non-signal process event', "process.on('exit', done)"],
    ['an unhandled-rejection hook', "process.on('unhandledRejection', log)"],
    ['a dynamic event name', 'process.on(name, handler)'],
    ['an emitter that is not process', "server.on('SIGINT', stop)"],
    ['removing a listener', "process.off('SIGINT', stop)"],
    ['Deno is not this rule', "Deno.addSignalListener('SIGINT', stop)"],
    ['a lower-case look-alike', "process.on('sigint', stop)"],
]

for (const [label, source] of SIGNAL_NEGATIVES) {
    test(`signal-subscription - leaves ${label} alone`, () => {
        assertEquals(hits('signal-subscription', source, PACKAGE_FILE), 0)
    })
}

test('signal-subscription - runtime/signals.ts is the one owner', () => {
    const source = "process.on('SIGINT', stop)"
    assertEquals(
        hits(
            'signal-subscription',
            source,
            `${ROOT}packages/runtime/signals.ts`,
        ),
        0,
    )
    for (
        const file of [
            'packages/core/kernel/signals.ts',
            'packages/queue/commands.ts',
            'packages/runtime/process.ts',
            'packages/x/vendor/packages/runtime/signals.ts',
        ]
    ) {
        assertEquals(
            hits('signal-subscription', source, `${ROOT}${file}`),
            1,
            file,
        )
    }
})

test('signal-subscription - reports nothing in tests, stubs or outside packages', () => {
    const source = "process.on('SIGINT', stop)"
    for (
        const file of [
            'packages/runtime/tests/signals.test.ts',
            'packages/x/a_test.ts',
            'packages/x/stubs/make/a.ts',
            'scripts/test_runtime.ts',
            'app/kernel.ts',
        ]
    ) {
        assertEquals(
            hits('signal-subscription', source, `${ROOT}${file}`),
            0,
            file,
        )
    }
})
