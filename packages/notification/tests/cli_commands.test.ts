/**
 * @fileoverview Tests for `make:notification` — SC-003.
 *
 * The command scaffolds `./app/notification/<name>_notification.ts` and
 * registers under the package-command pattern. Runs in a temp cwd so no project
 * file is touched.
 *
 * notification may not import `@lockness/cli` at runtime, so a rejected name
 * throws the package's local failure class, recognised by shape (`exitCode`).
 * The conformance test drives the **real** `Cli.dispatch` — `@lockness/cli` is
 * a test-only dependency, invisible to the dependency scan — so a drifted
 * local class fails here rather than exiting 0 in a user's script (#436).
 *
 * @module @lockness/notification/tests/cli_commands
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { Cli as RealCli } from '@lockness/cli'
import {
    type Cli,
    handleMakeNotification,
    notificationNaming,
    registerNotificationCommands,
} from '../cli_commands.ts'

Deno.test('notificationNaming derives PascalCase class + snake file name', () => {
    assertEquals(notificationNaming('invoicePaid'), {
        className: 'InvoicePaid',
        fileName: 'invoice_paid',
    })
    assertEquals(notificationNaming('Welcome'), {
        className: 'Welcome',
        fileName: 'welcome',
    })
})

Deno.test('SC-003: make:notification scaffolds the class file', async () => {
    const dir = await Deno.makeTempDir()
    const prevCwd = Deno.cwd()
    Deno.chdir(dir)
    try {
        const path = await handleMakeNotification(['InvoicePaid'])
        assertEquals(path, './app/notification/invoice_paid_notification.ts')

        const written = await Deno.readTextFile(
            `${dir}/app/notification/invoice_paid_notification.ts`,
        )
        assert(
            written.includes('export class InvoicePaid extends Notification'),
        )
        assert(written.includes("from '@lockness/notification'"))
    } finally {
        Deno.chdir(prevCwd)
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('registerNotificationCommands registers make:notification', () => {
    const registered: string[] = []
    const cli: Cli = {
        register: (name) => {
            registered.push(name)
        },
    }
    registerNotificationCommands(cli)
    assert(registered.includes('make:notification'))
})

/** Run `fn` with `console.error` recorded instead of printed. */
async function captureErrors<T>(
    fn: () => Promise<T>,
): Promise<{ result: T; errors: unknown[][] }> {
    const errors: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => void errors.push(args)
    try {
        return { result: await fn(), errors }
    } finally {
        console.error = original
    }
}

/** Assert `error` is the notification package's one-line failure, exit 1. */
function assertCommandFailure(error: Error, fragment: string): void {
    assertEquals(error.name, 'NotificationCommandError')
    assertEquals((error as Error & { exitCode?: unknown }).exitCode, 1)
    assert(!error.message.includes('\n'), 'a failure message is one line')
    assert(
        error.message.includes(fragment),
        `"${error.message}" should mention "${fragment}"`,
    )
}

Deno.test('make:notification with no name throws a failure with exitCode 1 and prints nothing', async () => {
    const { result: error, errors } = await captureErrors(() =>
        assertRejects(() => handleMakeNotification([]), Error)
    )
    assertCommandFailure(error, 'Please provide a notification name')
    assertEquals(errors.length, 0, 'the dispatcher is the only printer')
})

Deno.test('make:notification with a traversal name throws and writes nothing', async () => {
    const dir = await Deno.makeTempDir()
    const prevCwd = Deno.cwd()
    Deno.chdir(dir)
    try {
        const error = await assertRejects(
            () => handleMakeNotification(['../../etc/x']),
            Error,
        )
        assertCommandFailure(error, '"../../etc/x"')
        const entries = await Array.fromAsync(Deno.readDir(dir))
        assertEquals(entries.length, 0)
    } finally {
        Deno.chdir(prevCwd)
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('make:notification through the real Cli.dispatch exits 1 with exactly one ❌ line', async () => {
    const cli = new RealCli()
    registerNotificationCommands(cli)
    const { result: status, errors } = await captureErrors(() =>
        cli.dispatch(['make:notification'])
    )
    assertEquals(status, 1)
    assertEquals(errors.length, 1)
    const line = String(errors[0][0])
    assert(line.startsWith('❌ '), line)
    assertEquals(line.split('\n').length, 1)
    assert(line.includes('Please provide a notification name'), line)
})
