import { parseArgs } from '@std/cli/parse-args'
import { dirname, fromFileUrl, join } from '@std/path'
import { type Cli, Stub } from '@lockness/cli'

export function registerInitCommand(cli: Cli) {
    cli.register('init', async (args: string[]) => {
        const projectName = args[0] || 'lockness-app'
        const currentFile = fromFileUrl(import.meta.url)
        const stubsDir = join(dirname(currentFile), 'stubs', 'init')

        console.log(`🌊 Scaffolding Lockness project in ${projectName}...`)

        try {
            await Stub.scaffoldFrom(stubsDir, String(projectName), {
                projectName: String(projectName),
            })

            // Create empty directories that might not be in stubs
            const dirs = [
                'src/model',
                'src/service',
                'src/middleware',
                'src/repository',
                'public',
            ]

            for (const dir of dirs) {
                await Deno.mkdir(`${projectName}/${dir}`, { recursive: true })
            }

            // Copy .env.exemple to .env
            try {
                const envContent = await Deno.readTextFile(
                    `${projectName}/.env.exemple`,
                )
                await Deno.writeTextFile(`${projectName}/.env`, envContent)
            } catch {
                // Ignore if .env.exemple doesn't exist
            }

            console.log('\n✅ Done! To get started:')
            console.log(`  cd ${projectName}`)
            console.log('  deno task dev')
        } catch (error) {
            console.error(
                `❌ Initialization failed: ${(error as Error).message}`,
            )
        }
    })
}

if (import.meta.main) {
    const args = parseArgs(Deno.args)
    const name = args._[0] || 'lockness-app'
    const cliMock = {
        register: (_name: string, handler: (args: string[]) => Promise<void>) =>
            handler([String(name)]),
    }
    registerInitCommand(cliMock as unknown as Cli)
}
