import { generateRoutesFile } from '@lockness/core'

/**
 * Script to manually trigger routes registry generation.
 * This is used by 'deno task routes:generate'
 */
async function run() {
    console.log('🗺️  Generating routes registry...')
    try {
        const result = await generateRoutesFile(
            './app/controller',
            './app/routes.ts',
        )
        console.log(
            `✅ Generated ./app/routes.ts (${result.count} controllers)`,
        )
    } catch (err) {
        console.error(`❌ Failed to generate routes: ${(err as Error).message}`)
        Deno.exit(1)
    }
}

run()
