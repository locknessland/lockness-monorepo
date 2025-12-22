import { parseArgs } from '@std/cli/parse-args'
import { dirname, fromFileUrl, join } from '@std/path'
import { Stub } from '@lockness/ace'

const ARGS = parseArgs(Deno.args)
const PROJECT_NAME = ARGS._[0] || 'lockness-app'

async function main() {
    const currentFile = fromFileUrl(import.meta.url)
    const stubsDir = join(dirname(currentFile), 'stubs', 'init')

    console.log(`🌊 Scaffolding Lockness project in ${PROJECT_NAME}...`)

    try {
        await Stub.scaffoldFrom(stubsDir, String(PROJECT_NAME), {
            projectName: String(PROJECT_NAME),
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
            await Deno.mkdir(`${PROJECT_NAME}/${dir}`, { recursive: true })
        }

        // Copy .env.exemple to .env
        try {
            const envContent = await Deno.readTextFile(
                `${PROJECT_NAME}/.env.exemple`,
            )
            await Deno.writeTextFile(`${PROJECT_NAME}/.env`, envContent)
        } catch {
            // Ignore if .env.exemple doesn't exist
        }

        console.log('\n✅ Done! To get started:')
        console.log(`  cd ${PROJECT_NAME}`)
        console.log('  deno task dev')
    } catch (error) {
        console.error(`❌ Initialization failed: ${(error as Error).message}`)
    }
}

if (import.meta.main) {
    await main()
}
