import { parseArgs } from '@std/cli/parse-args'
import { dirname, fromFileUrl, join } from '@std/path'
import { type Cli, Stub } from '@lockness/cli'

// Explicit file list for JSR (when running from https://)
const INIT_STUB_FILES = [
    '.dockerignore.stub',
    '.env.exemple.stub',
    '.gitignore.stub',
    'cli.ts.stub',
    'data/todo.json.stub',
    'deno.json.stub',
    'Dockerfile.stub',
    'main.ts.stub',
    'README.md.stub',
    'scripts/dev.sh.stub',
    'scripts/generate_routes.ts.stub',
    'scripts/watch_routes.ts.stub',
    'src/controller/todo_controller.ts.stub',
    'src/kernel.tsx.stub',
    'src/routes.ts.stub',
    'src/view/app.ts.stub',
    'src/view/assets/landing.css.stub',
    'src/view/assets/style.css.stub',
    'src/view/components/ui.tsx.stub',
    'src/view/layouts/main_layout.tsx.stub',
    'src/view/pages/home.tsx.stub',
]

export function registerInitCommand(cli: Cli) {
    cli.register('init', async (args: string[]) => {
        const projectName = args[0] || 'lockness-app'

        // Handle both local file:// and remote https:// URLs
        let stubsDir: string
        const isRemote = !import.meta.url.startsWith('file://')

        if (import.meta.url.startsWith('file://')) {
            const currentFile = fromFileUrl(import.meta.url)
            stubsDir = join(dirname(currentFile), 'stubs', 'init')
        } else {
            // When running from JSR, use URL
            stubsDir = new URL('./stubs/init', import.meta.url).href
        }

        console.log(`🌊 Scaffolding Lockness project in ${projectName}...`)

        try {
            await Stub.scaffoldFrom(
                stubsDir,
                String(projectName),
                { projectName: String(projectName) },
                isRemote ? INIT_STUB_FILES : undefined,
            )

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
    }, 'Initialize a new Lockness project')
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
