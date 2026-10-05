/**
 * Tests for the `lockness-exit` lint plugin (#436, D5): `process-exit` and
 * `printed-failure` — the shapes each flags, the shapes that stay clean, the
 * owner list and the file scoping.
 *
 * Scope is decided on the path relative to the repository root, so every file
 * linted through the plugin sits under the real root (`ROOT`, computed here
 * independently of the rule). The scope helpers take the root as a parameter,
 * which is how the checkout-location cases are tested.
 */

import { assertEquals } from '@std/assert'
import { fromFileUrl } from '@std/path'
import plugin, { inCommandScope, inPackageScope } from './exit_contract.ts'

/** The repository this test file lives in, with forward slashes and a trailing `/`. */
const ROOT = fromFileUrl(new URL('../../', import.meta.url))
    .replaceAll('\\', '/')

/** Lint `source` as `file` and return the hit count of `rule`. */
function hits(
    rule: 'process-exit' | 'printed-failure',
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
]

for (const [label, source] of EXIT_POSITIVES) {
    Deno.test(`process-exit - flags ${label}`, () => {
        assertEquals(hits('process-exit', source, PACKAGE_FILE), 1)
    })
}

const EXIT_NEGATIVES: ReadonlyArray<readonly [string, string]> = [
    ['a read of Deno.exitCode', 'const status = Deno.exitCode'],
    ['a look-alike object', 'process.exit(1); proc.exitCode = 1'],
    ['an unrelated Deno call', 'Deno.exitSignal?.()'],
    ['a returned status', 'return 1'],
    ['an increment of a look-alike', 'proc.exitCode++'],
    ['a computed read of another member', "Deno['env'].get('X')"],
    ['a computed member with a variable key', 'Deno[key](1)'],
    ['other members destructured from Deno', 'const { env, args } = Deno'],
    // A copy of the status, not a write to it.
    ['exitCode destructured from Deno', 'const { exitCode } = Deno'],
    ['exit destructured from another object', 'const { exit } = process'],
]

for (const [label, source] of EXIT_NEGATIVES) {
    Deno.test(`process-exit - leaves ${label} alone`, () => {
        assertEquals(hits('process-exit', source, PACKAGE_FILE), 0)
    })
}

// The rule matches `Deno` by name. A second name for the namespace, or
// reaching it through `globalThis`, is a shape it does not follow: tracking
// aliases needs scope analysis, and none of these appears in the repository.
Deno.test('process-exit - known gap: an alias of Deno is not followed', () => {
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

Deno.test('process-exit - Deno.exit is allowed only in its two owners', () => {
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

Deno.test('process-exit - an owner is a repository path, not a suffix', () => {
    assertEquals(
        hits(
            'process-exit',
            'Deno.exit(1)',
            `${ROOT}packages/x/vendor/packages/core/http/server.ts`,
        ),
        1,
    )
})

Deno.test('process-exit - Deno.exitCode is allowed only in cli/report.ts', () => {
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

Deno.test('process-exit - reports nothing in tests, stubs or outside packages', () => {
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
    Deno.test(`printed-failure - flags ${label}`, () => {
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
    Deno.test(`printed-failure - leaves ${label} alone`, () => {
        assertEquals(hits('printed-failure', source, COMMAND_FILE), 0)
    })
}

Deno.test('printed-failure - reports in every command-code path', () => {
    const source = "console.error('❌ Failed')"
    for (
        const file of [
            'packages/cli/commands/make/action.ts',
            'packages/cli/commands/queue_commands.ts',
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

Deno.test('printed-failure - reports nothing outside command code', () => {
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

Deno.test('exit-contract - the scopes default to this repository', () => {
    assertEquals(inPackageScope(`${ROOT}packages/x/mod.ts`), true)
    assertEquals(inCommandScope(`${ROOT}packages/x/cli_commands.ts`), true)
})

Deno.test('exit-contract - the scopes read Windows separators', () => {
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

Deno.test('exit-contract - a checkout under a tests or stubs directory keeps the rules on', () => {
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

Deno.test('exit-contract - a checkout under a packages directory reads the right package', () => {
    const root = '/home/me/packages/lockness/'
    assertEquals(
        inCommandScope(`${root}packages/core/cli/compile_command.ts`, root),
        true,
    )
    assertEquals(inCommandScope(`${root}packages/ui/mod.ts`, root), true)
    assertEquals(inCommandScope(`${root}packages/x/mod.ts`, root), false)
    assertEquals(inPackageScope(`${root}scripts/gate.ts`, root), false)
})

Deno.test('exit-contract - a file outside the repository is out of scope', () => {
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
