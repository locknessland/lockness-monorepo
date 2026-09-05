/**
 * @fileoverview The `make:seeder` scaffolding handler.
 *
 * Lives in its own module (not inline in `cli_commands.ts`) so every `make:*`
 * generator sits under `generators/`, matching the factory and model generators
 * (architecture A-F5). It reuses `cli_commands.ts`'s
 * `processStub`/`createFile`/`getErrorMessage` helpers and the shared
 * `SEEDERS_DIR` constant, so the stub-render logic is not duplicated.
 *
 * @module @lockness/drizzle/generators/seeder_generator
 * @since 0.2.2
 */

import {
    createFile,
    getErrorMessage,
    processStub,
    SEEDERS_DIR,
} from '../cli_commands.ts'

/**
 * Handle `make:seeder <Name>` — create a new seeder file under
 * `./database/seeders`. When the name is `Database` (case-insensitive) the
 * orchestrating `DatabaseSeeder` stub is emitted instead of a plain seeder.
 *
 * @param args - CLI args; `args[0]` is the seeder name (e.g. `User`).
 */
export async function handleMakeSeeder(args: string[]): Promise<void> {
    const name = args[0]
    if (!name) {
        console.error('❌ Please provide a seeder name (e.g., User)')
        return
    }

    const className = name.charAt(0).toUpperCase() + name.slice(1)
    const fileName = `${name.toLowerCase()}_seeder.ts`
    const filePath = `${SEEDERS_DIR}/${fileName}`

    const isDatabase = name.toLowerCase() === 'database'
    const stubName = isDatabase ? 'database_seeder' : 'seeder'

    try {
        const content = await processStub(stubName, { className })
        await createFile(filePath, content)

        console.log(`✅ Seeder created at ${filePath}`)

        if (isDatabase) {
            console.log(
                '💡 Add your seeders to the `seeders` array in DatabaseSeeder',
            )
        }
    } catch (error) {
        console.error(`❌ Failed to create seeder: ${getErrorMessage(error)}`)
    }
}
