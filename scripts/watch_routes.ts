/**
 * Watch app/controller/ directory and auto-regenerate routes.ts
 *
 * Usage: deno run -A scripts/watch_routes.ts
 */

import { generateRoutesFile } from '@lockness/cli'

const CONTROLLER_DIR = './app/controller'
const OUTPUT_FILE = './app/routes.ts'
const WATCH_EXTENSIONS = ['tsx', 'ts']

async function regenerate() {
    try {
        await generateRoutesFile(CONTROLLER_DIR, OUTPUT_FILE)
    } catch (error) {
        console.error(`❌ Error generating routes: ${(error as Error).message}`)
    }
}

async function watchControllers() {
    console.log('👀 Watching for controller changes...')

    // Generate initial routes
    await regenerate()

    // Watch for changes
    const watcher = Deno.watchFs(CONTROLLER_DIR)

    // Debounce mechanism to avoid multiple rapid regenerations
    let debounceTimer: number | null = null

    for await (const event of watcher) {
        // Only react to create, modify, remove events on controller files
        if (
            event.kind === 'create' || event.kind === 'modify' ||
            event.kind === 'remove'
        ) {
            const isControllerFile = event.paths.some((path) =>
                WATCH_EXTENSIONS.some((ext) => path.endsWith(`.${ext}`))
            )

            if (isControllerFile) {
                // Clear existing timer
                if (debounceTimer !== null) {
                    clearTimeout(debounceTimer)
                }

                // Set new timer (debounce 200ms)
                debounceTimer = setTimeout(() => {
                    regenerate()
                    debounceTimer = null
                }, 200)
            }
        }
    }
}

if (import.meta.main) {
    await watchControllers()
}
