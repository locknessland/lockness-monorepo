/**
 * @fileoverview Nessy CLI wrapper installation commands.
 *
 * Provides commands to install the Nessy shell wrapper for
 * faster CLI access without typing `deno task cli` every time.
 *
 * @module @lockness/cli/commands/nessy
 */

import { type Cli, Stub } from '../mod.ts'
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

        try {
            // Check if cli.ts exists
            const acePath = join(Deno.cwd(), 'cli.ts')
            try {
                await Deno.stat(acePath)
            } catch {
                console.error('❌ cli.ts not found in the current directory')
                console.error(
                    '   Make sure you run this command from your project root',
                )
                return
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

            // Check if .gitignore exists and warn if nessy is not ignored
            try {
                const gitignorePath = join(Deno.cwd(), '.gitignore')
                const gitignoreContent = await Deno.readTextFile(gitignorePath)

                if (!gitignoreContent.includes('nessy')) {
                    console.log(
                        '⚠️  Remember to add "nessy" to your .gitignore file',
                    )
                    console.log('')
                }
            } catch {
                // .gitignore doesn't exist, no problem
            }
        } catch (error) {
            console.error(
                `❌ Error installing Nessy: ${(error as Error).message}`,
            )
        }
    }, 'Install Nessy CLI wrapper for faster commands')
}
