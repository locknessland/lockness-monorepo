import type { Cli } from './mod.ts'

/**
 * Auto-register commands from all installed Lockness packages
 * 
 * Scans the lockness/ directory and automatically registers commands
 * from any package that exports a registerCommands function.
 */
export async function autoRegisterCommands(cli: Cli): Promise<void> {
    const locklessDir = new URL('../', import.meta.url).pathname

    try {
        for await (const entry of Deno.readDir(locklessDir)) {
            if (!entry.isDirectory) continue
            if (entry.name.startsWith('.')) continue

            // Try to import the package and check for registerCommands export
            try {
                const packagePath = `${locklessDir}${entry.name}`
                const denoJsonPath = `${packagePath}/deno.json`

                // Check if package has deno.json
                try {
                    await Deno.stat(denoJsonPath)
                } catch {
                    continue // Skip if no deno.json
                }

                // Read deno.json to get the main export
                const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath))
                const mainExport = typeof denoJson.exports === 'string'
                    ? denoJson.exports
                    : denoJson.exports?.['.']

                if (!mainExport) continue

                const modulePath = `${packagePath}/${mainExport}`
                const module = await import(modulePath)

                // Look for any function that registers commands
                // Convention: register*Commands, register*Command, or registerCommands
                for (const key of Object.keys(module)) {
                    if (
                        (key.startsWith('register') && (key.endsWith('Commands') || key.endsWith('Command'))) ||
                        key === 'registerCommands'
                    ) {
                        const registerFn = module[key]
                        if (typeof registerFn === 'function') {
                            await registerFn(cli)
                            console.log(`✓ Registered commands from @lockness/${entry.name}`)
                        }
                    }
                }
            } catch (error) {
                // Silently skip packages that don't have commands or can't be imported
                if (error instanceof Error && !error.message.includes('NotFound')) {
                    console.warn(`⚠ Could not load commands from ${entry.name}:`, error.message)
                }
            }
        }
    } catch (error) {
        console.error('Error during auto-registration:', error)
    }
}
