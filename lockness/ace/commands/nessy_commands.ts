import { type Ace, Stub } from '../cli.ts'
import { dirname, fromFileUrl, join } from '@std/path'

const currentDir = dirname(fromFileUrl(import.meta.url))
const STUBS_PATH = join(currentDir, '..', 'stubs')

export function registerNessyCommands(ace: Ace) {
    ace.register('nessy:install', async () => {
        console.log('')
        console.log('🦕 Installing Nessy - Your Lockness CLI companion!')
        console.log('')

        try {
            // Check if ace.ts exists
            const acePath = join(Deno.cwd(), 'ace.ts')
            try {
                await Deno.stat(acePath)
            } catch {
                console.error('❌ ace.ts not found in the current directory')
                console.error('   Make sure you run this command from your project root')
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
            console.log('💡 Tip: Add nessy to your PATH for even easier access!')
            console.log('')

            // Check if .gitignore exists and warn if nessy is not ignored
            try {
                const gitignorePath = join(Deno.cwd(), '.gitignore')
                const gitignoreContent = await Deno.readTextFile(gitignorePath)

                if (!gitignoreContent.includes('nessy')) {
                    console.log('⚠️  Remember to add "nessy" to your .gitignore file')
                    console.log('')
                }
            } catch {
                // .gitignore doesn't exist, no problem
            }

        } catch (error) {
            console.error(`❌ Error installing Nessy: ${(error as Error).message}`)
        }
    }, 'Install Nessy CLI wrapper for faster commands')
}
