/**
 * @fileoverview Nessy CLI wrapper installation commands.
 *
 * Provides commands to install the Nessy shell wrapper for
 * faster CLI access without typing `deno task cli` every time.
 *
 * @module @lockness/cli/commands/nessy
 */

import { type Cli, Stub } from '../mod.ts'
import { CommandFailedError } from '../command_failure.ts'
import { dirname, fromFileUrl, join } from '@std/path'

/**
 * Path to CLI stubs directory.
 * @internal
 */
let STUBS_PATH: string

if (import.meta.url.startsWith('file://')) {
    const currentDir = dirname(fromFileUrl(import.meta.url))
    STUBS_PATH = join(currentDir, '..', 'stubs')
} else {
    // When running from JSR, use relative URLs
    STUBS_PATH = new URL('../stubs', import.meta.url).href
}

/**
 * Register Nessy CLI wrapper commands.
 *
 * Commands registered:
 * - nessy:install - Install the Nessy shell wrapper script
 *
 * `nessy:install` throws a `CommandFailedError` when there is no `cli.ts` in
 * the working directory; a failed write reaches `Cli.dispatch()`'s catch-all
 * (#436). A `.gitignore` that exists but cannot be read is a warning: the
 * wrapper is installed by then.
 *
 * @param cli - The CLI instance to register commands on
 *
 * @example
 * ```bash
 * # Install Nessy wrapper
 * deno task cli nessy:install
 *
 * # Then use Nessy directly
 * ./nessy make:controller User
 * ```
 */
export function registerNessyCommands(cli: Cli): void {
    cli.register('nessy:install', async () => {
        console.log('')
        console.log('🦕 Installing Nessy - Your Lockness CLI companion!')
        console.log('')

        // Check if cli.ts exists
        const acePath = join(Deno.cwd(), 'cli.ts')
        try {
            await Deno.stat(acePath)
        } catch (error) {
            // Only a missing cli.ts is expected; anything else propagates.
            if (!(error instanceof Deno.errors.NotFound)) throw error
            throw new CommandFailedError(
                'cli.ts not found in the current directory. Run this command from your project root',
            )
        }

        // Determine the OS to create appropriate wrapper
        const isWindows = Deno.build.os === 'windows'
        const scriptName = isWindows ? 'nessy.cmd' : 'nessy'
        const scriptPath = join(Deno.cwd(), scriptName)

        console.log(`📝 Creating ${scriptName} wrapper...`)
        console.log('')

        // Load wrapper script from stub
        const stubName = isWindows ? 'nessy.cmd' : 'nessy'
        const scriptContent = await Stub.renderFrom(
            STUBS_PATH,
            'nessy',
            stubName,
            {},
        )

        await Deno.writeTextFile(scriptPath, scriptContent)

        // Make executable on Unix systems
        if (!isWindows) {
            await Deno.chmod(scriptPath, 0o755)
        }

        console.log('✅ Nessy wrapper created successfully!')
        console.log('')
        console.log('🎉 You can now use Nessy for ALL commands:')
        console.log('')

        if (isWindows) {
            console.log('   .\\nessy list')
            console.log('   .\\nessy make:controller User')
            console.log('   .\\nessy db:migrate')
            console.log('   .\\nessy router:list')
        } else {
            console.log('   ./nessy list')
            console.log('   ./nessy make:controller User')
            console.log('   ./nessy db:migrate')
            console.log('   ./nessy router:list')
        }

        console.log('')
        console.log(
            '💡 Tip: Add nessy to your PATH for even easier access!',
        )
        console.log('')

        // Warn if nessy is not ignored. The wrapper is already installed, so
        // an unreadable .gitignore is a warning, never a failure.
        let gitignoreContent: string | undefined
        try {
            gitignoreContent = await Deno.readTextFile(
                join(Deno.cwd(), '.gitignore'),
            )
        } catch (error) {
            // Only a missing .gitignore is expected: nothing to check.
            if (!(error instanceof Deno.errors.NotFound)) {
                console.warn(
                    '⚠️  Could not read .gitignore: check that "nessy" is in it',
                )
            }
        }
        if (
            gitignoreContent !== undefined &&
            !gitignoreContent.includes('nessy')
        ) {
            console.log('⚠️  Remember to add "nessy" to your .gitignore file')
            console.log('')
        }
    }, 'Install Nessy CLI wrapper for faster commands')
}
