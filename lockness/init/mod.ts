import { parseArgs } from '@std/cli/parse-args'
import { dirname, fromFileUrl, join } from '@std/path'
import { type Cli, Stub } from '@lockness/cli'

// Explicit file list for JSR (when running from https://)
const INIT_STUB_FILES = [
    '.dockerignore.stub',
    '.env.exemple.stub',
    '.gitignore.stub',
    'cli.ts.stub',
    'deno.json.stub',
    'Dockerfile.stub',
    'main.ts.stub',
    'public/img/lockness-logo.svg',
    'public/favicon.ico',
    'public/favicon-16x16.png',
    'public/favicon-32x32.png',
    'public/apple-touch-icon.png',
    'public/android-chrome-192x192.png',
    'public/android-chrome-512x512.png',
    'README.md.stub',
    'scripts/dev.sh.stub',
    'scripts/generate_routes.ts.stub',
    'scripts/watch_routes.ts.stub',
    'app/controller/app_controller.tsx.stub',
    'app/kernel.tsx.stub',
    'app/routes.ts.stub',
    'app/view/app.ts.stub',
    'app/view/assets/app.css.stub',
    'app/view/components/ui.tsx.stub',
    'app/view/layouts/main_layout.tsx.stub',
    'app/view/pages/home.tsx.stub',
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

            // Create .env.production.local
            try {
                await Deno.writeTextFile(
                    `${projectName}/.env.production.local`,
                    'APP_ENV=production\n',
                )
            } catch {
                console.error('⚠️  Could not create .env.production.local')
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
