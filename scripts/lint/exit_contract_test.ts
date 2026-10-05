/**
 * Tests for the `lockness-exit` lint plugin (#436, D5): `process-exit` and
 * `printed-failure` — the shapes each flags, the shapes that stay clean, the
 * owner list and the file scoping.
 */

import { assertEquals } from '@std/assert'
import plugin, { inCommandScope, inPackageScope } from './exit_contract.ts'

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
const PACKAGE_FILE = '/repo/packages/x/mod.ts'

const EXIT_POSITIVES: ReadonlyArray<readonly [string, string]> = [
    ['Deno.exit(1)', 'Deno.exit(1)'],
    ['Deno.exit() with no status', 'Deno.exit()'],
    ['Deno.exit inside a handler', 'async function h() { Deno.exit(code) }'],
    ['an assignment to Deno.exitCode', 'Deno.exitCode = 1'],
    ['a compound assignment to Deno.exitCode', 'Deno.exitCode ||= 1'],
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
]

for (const [label, source] of EXIT_NEGATIVES) {
    Deno.test(`process-exit - leaves ${label} alone`, () => {
        assertEquals(hits('process-exit', source, PACKAGE_FILE), 0)
    })
}

Deno.test('process-exit - Deno.exit is allowed only in its two owners', () => {
    const source = 'Deno.exit(1)'
    assertEquals(
        hits('process-exit', source, '/repo/packages/core/http/server.ts'),
        0,
    )
    assertEquals(
        hits('process-exit', source, '/repo/packages/core/kernel/signals.ts'),
        0,
    )
    assertEquals(
        hits('process-exit', source, '/repo/packages/cli/report.ts'),
        1,
    )
})

Deno.test('process-exit - Deno.exitCode is allowed only in cli/report.ts', () => {
    const source = 'Deno.exitCode = status'
    assertEquals(
        hits('process-exit', source, '/repo/packages/cli/report.ts'),
        0,
    )
    assertEquals(
        hits('process-exit', source, '/repo/packages/core/http/server.ts'),
        1,
    )
    assertEquals(hits('process-exit', source, '/repo/packages/cli/entry.ts'), 1)
})

Deno.test('process-exit - reports nothing in tests, stubs or outside packages', () => {
    const source = 'Deno.exit(1)'
    assertEquals(hits('process-exit', source, '/repo/packages/x/tests/a.ts'), 0)
    assertEquals(hits('process-exit', source, '/repo/packages/x/a.test.ts'), 0)
    assertEquals(hits('process-exit', source, '/repo/packages/x/a_test.ts'), 0)
    assertEquals(hits('process-exit', source, '/repo/packages/x/a.test.tsx'), 0)
    assertEquals(
        hits('process-exit', source, '/repo/packages/x/stubs/make/a.ts'),
        0,
    )
    assertEquals(hits('process-exit', source, '/repo/scripts/gate.ts'), 0)
    assertEquals(hits('process-exit', source, '/repo/app/kernel.ts'), 0)
})

// ---------------------------------------------------------------------------
// printed-failure
// ---------------------------------------------------------------------------

/** A command file inside the rule's scope. */
const COMMAND_FILE = '/repo/packages/x/cli_commands.ts'

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
            '/repo/packages/cli/commands/make/action.ts',
            '/repo/packages/cli/commands/queue_commands.ts',
            '/repo/packages/mail/cli_commands.ts',
            '/repo/packages/openapi/install.ts',
            '/repo/packages/drizzle/generators/model_generator.ts',
            '/repo/packages/cli/core_commands.ts',
            '/repo/packages/core/cli/compile_command.ts',
            '/repo/packages/ui/mod.ts',
            '/repo/packages/upgrade/mod.ts',
            '/repo/packages/init/mod.ts',
        ]
    ) {
        assertEquals(hits('printed-failure', source, file), 1, file)
    }
})

Deno.test('printed-failure - reports nothing outside command code', () => {
    const source = "console.error('❌ Failed')"
    for (
        const file of [
            '/repo/packages/cli/mod.ts',
            '/repo/packages/cli/report.ts',
            '/repo/packages/core/mod.ts',
            '/repo/packages/core/exceptions/formatter.ts',
            '/repo/packages/queue/worker.ts',
            '/repo/packages/drizzle/mod.ts',
            '/repo/packages/cli/tests/commands/a.ts',
            '/repo/packages/x/commands/a.test.ts',
            '/repo/packages/cli/stubs/commands/a.ts',
            '/repo/scripts/commands/a.ts',
        ]
    ) {
        assertEquals(hits('printed-failure', source, file), 0, file)
    }
})

// ---------------------------------------------------------------------------
// scoping helpers
// ---------------------------------------------------------------------------

Deno.test('exit-contract - the scopes read Windows separators', () => {
    assertEquals(inPackageScope('C:\\repo\\packages\\x\\mod.ts'), true)
    assertEquals(inPackageScope('C:\\repo\\packages\\x\\tests\\a.ts'), false)
    assertEquals(inCommandScope('C:\\repo\\packages\\x\\cli_commands.ts'), true)
    assertEquals(inCommandScope('C:\\repo\\packages\\x\\mod.ts'), false)
})
