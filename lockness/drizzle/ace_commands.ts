import type { Ace } from '@lockness/ace'
import { dirname, fromFileUrl, join } from '@std/path'
import { container } from '@lockness/core'
import { Database } from './database.ts'

const currentDir = dirname(fromFileUrl(import.meta.url))
const STUBS_PATH = join(currentDir, 'stubs')

async function initDatabase(): Promise<Database> {
    const db = container.get<Database>(Database)
    await db.connect(
        Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/lockness',
    )
    return db
}

export function registerDrizzleCommands(ace: Ace) {
    ace.register('db:generate', async () => {
        console.log('📦 Generating migrations...')
        const command = new Deno.Command('deno', {
            args: ['run', '-A', 'npm:drizzle-kit', 'generate'],
            stdout: 'inherit',
            stderr: 'inherit',
        })
        const { code } = await command.output()
        if (code === 0) {
            console.log('✅ Migrations generated successfully')
        } else {
            console.error('❌ Failed to generate migrations')
        }
    })

    ace.register('db:migrate', async () => {
        console.log('🚀 Running migrations...')
        const command = new Deno.Command('deno', {
            args: ['run', '-A', 'npm:drizzle-kit', 'migrate'],
            stdout: 'inherit',
            stderr: 'inherit',
        })
        const { code } = await command.output()
        if (code === 0) {
            console.log('✅ Migrations applied successfully')
        } else {
            console.error('❌ Failed to apply migrations')
        }
    })

    ace.register('db:push', async () => {
        console.log('🔄 Pushing schema to database...')
        const command = new Deno.Command('deno', {
            args: ['run', '-A', 'npm:drizzle-kit', 'push'],
            stdout: 'inherit',
            stderr: 'inherit',
        })
        const { code } = await command.output()
        if (code === 0) {
            console.log('✅ Schema pushed successfully')
        } else {
            console.error('❌ Failed to push schema')
        }
    })

    ace.register('db:studio', async () => {
        console.log('🎨 Starting Drizzle Studio...')
        const command = new Deno.Command('deno', {
            args: ['run', '-A', 'npm:drizzle-kit', 'studio'],
            stdout: 'inherit',
            stderr: 'inherit',
        })
        const { code } = await command.output()
        if (code !== 0) {
            console.error('❌ Failed to start Drizzle Studio')
        }
    })

    ace.register('db:seed', async (args) => {
        console.log('🌱 Running seeders...')

        // Initialize database connection
        const db = await initDatabase()

        const seederDir = './src/seeder'
        const specificSeeder = args[0]

        try {
            if (specificSeeder) {
                // Run a specific seeder
                const fileName = `${specificSeeder.toLowerCase()}_seeder.ts`
                const filePath = `${seederDir}/${fileName}`

                try {
                    const module = await import(
                        `file://${Deno.cwd()}/${filePath}`
                    )
                    const SeederClass = Object.values(module).find(
                        (v) =>
                            typeof v === 'function' &&
                            v.prototype?.run,
                    ) as { new(): { run(): Promise<void> } } | undefined

                    if (SeederClass) {
                        const seeder = new SeederClass()
                        await seeder.run()
                    } else {
                        console.error(`❌ No valid seeder found in ${filePath}`)
                    }
                } catch (e) {
                    console.error(
                        `❌ Failed to run seeder: ${(e as Error).message}`,
                    )
                }
            } else {
                // Run DatabaseSeeder (main orchestrator)
                const mainSeederPath = `${seederDir}/database_seeder.ts`

                try {
                    const module = await import(
                        `file://${Deno.cwd()}/${mainSeederPath}`
                    )
                    const DatabaseSeeder = module.DatabaseSeeder as
                        | { new(): { run(): Promise<void> } }
                        | undefined

                    if (DatabaseSeeder) {
                        const seeder = new DatabaseSeeder()
                        await seeder.run()
                    } else {
                        console.error(
                            '❌ DatabaseSeeder class not found. Run `deno task ace make:seeder Database` first.',
                        )
                    }
                } catch (e) {
                    const error = e as Error
                    if (error.message.includes('Module not found')) {
                        console.error(
                            '❌ No database_seeder.ts found. Run `deno task ace make:seeder Database` first.',
                        )
                    } else {
                        console.error(`❌ Seeding failed: ${error.message}`)
                        if (error.stack) {
                            console.error(error.stack)
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Seeding failed: ${(error as Error).message}`)
        } finally {
            // Close database connection
            await db.close()
        }
    })

    ace.register('make:seeder', async (args) => {
        const name = args[0]
        if (!name) {
            console.error('❌ Please provide a seeder name (e.g., User)')
            return
        }

        const className = name.charAt(0).toUpperCase() + name.slice(1)
        const fileName = `${name.toLowerCase()}_seeder.ts`
        const dirPath = './src/seeder'
        const filePath = `${dirPath}/${fileName}`

        // Determine which stub to use
        const isDatabase = name.toLowerCase() === 'database'
        const stubName = isDatabase ? 'database_seeder' : 'seeder'

        try {
            const stubContent = await Deno.readTextFile(
                join(STUBS_PATH, `${stubName}.stub`),
            )

            const content = stubContent.replace(/\{\{className\}\}/g, className)

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            console.log(`✅ Seeder created at ${filePath}`)

            if (isDatabase) {
                console.log(
                    '💡 Add your seeders to the `seeders` array in DatabaseSeeder',
                )
            }
        } catch (error) {
            console.error(
                `❌ Failed to create seeder: ${(error as Error).message}`,
            )
        }
    })
}
