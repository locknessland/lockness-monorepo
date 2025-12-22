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

/**
 * Parse CLI flags from args array
 * Supports: -r, -s, -c, -a, --repository, --seeder, --controller, --all
 */
function parseFlags(args: string[]): {
    name: string | undefined
    repository: boolean
    seeder: boolean
    controller: boolean
} {
    const name = args.find((a) => !a.startsWith('-'))
    const hasFlag = (short: string, long: string) =>
        args.includes(short) || args.includes(long)

    const all = hasFlag('-a', '--all')

    return {
        name,
        repository: all || hasFlag('-r', '--repository'),
        seeder: all || hasFlag('-s', '--seeder'),
        controller: all || hasFlag('-c', '--controller'),
    }
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
                    ) as { new (): { run(): Promise<void> } } | undefined

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
                        | { new (): { run(): Promise<void> } }
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

    ace.register('make:model', async (args) => {
        const { name, repository, seeder, controller } = parseFlags(args)

        if (!name) {
            console.error('❌ Please provide a model name (e.g., Post)')
            console.log('')
            console.log('Usage: deno task ace make:model <Name> [options]')
            console.log('')
            console.log('Options:')
            console.log('  -r, --repository    Create a repository')
            console.log('  -s, --seeder        Create a seeder')
            console.log('  -c, --controller    Create a CRUD controller')
            console.log(
                '  -a, --all           Create all (repository, seeder, controller)',
            )
            return
        }

        // Naming conventions
        const modelName = name.charAt(0).toUpperCase() + name.slice(1) // User
        const tableName = name.toLowerCase() + 's' // users
        const fileName = name.toLowerCase() // user
        const route = tableName // users
        const repositoryName = `${modelName}Repository`
        const repositoryVar = `${fileName}Repository`

        const createdFiles: string[] = []

        // Always create the model
        try {
            const stubContent = await Deno.readTextFile(
                join(STUBS_PATH, 'model.stub'),
            )

            const content = stubContent
                .replace(/\{\{ModelName\}\}/g, modelName)
                .replace(/\{\{tableName\}\}/g, tableName)

            const dirPath = './src/model'
            const filePath = `${dirPath}/${fileName}.ts`

            await Deno.mkdir(dirPath, { recursive: true })
            await Deno.writeTextFile(filePath, content)
            createdFiles.push(filePath)
        } catch (error) {
            console.error(
                `❌ Failed to create model: ${(error as Error).message}`,
            )
            return
        }

        // Create repository if requested
        if (repository) {
            try {
                const stubContent = await Deno.readTextFile(
                    join(STUBS_PATH, 'repository.stub'),
                )

                const content = stubContent
                    .replace(/\{\{ModelName\}\}/g, modelName)
                    .replace(/\{\{tableName\}\}/g, tableName)
                    .replace(/\{\{fileName\}\}/g, fileName)
                    .replace(/\{\{RepositoryName\}\}/g, repositoryName)

                const dirPath = './src/repository'
                const filePath = `${dirPath}/${fileName}_repository.ts`

                await Deno.mkdir(dirPath, { recursive: true })
                await Deno.writeTextFile(filePath, content)
                createdFiles.push(filePath)
            } catch (error) {
                console.error(
                    `❌ Failed to create repository: ${
                        (error as Error).message
                    }`,
                )
            }
        }

        // Create seeder if requested
        if (seeder) {
            try {
                const stubContent = await Deno.readTextFile(
                    join(STUBS_PATH, 'seeder.stub'),
                )

                const content = stubContent.replace(
                    /\{\{className\}\}/g,
                    modelName,
                )

                const dirPath = './src/seeder'
                const filePath = `${dirPath}/${fileName}_seeder.ts`

                await Deno.mkdir(dirPath, { recursive: true })
                await Deno.writeTextFile(filePath, content)
                createdFiles.push(filePath)
            } catch (error) {
                console.error(
                    `❌ Failed to create seeder: ${(error as Error).message}`,
                )
            }
        }

        // Create controller if requested
        if (controller) {
            try {
                const stubContent = await Deno.readTextFile(
                    join(STUBS_PATH, 'controller.stub'),
                )

                const content = stubContent
                    .replace(/\{\{ModelName\}\}/g, modelName)
                    .replace(/\{\{tableName\}\}/g, tableName)
                    .replace(/\{\{fileName\}\}/g, fileName)
                    .replace(/\{\{route\}\}/g, route)
                    .replace(/\{\{RepositoryName\}\}/g, repositoryName)
                    .replace(/\{\{repositoryVar\}\}/g, repositoryVar)

                const dirPath = './src/controller'
                const filePath = `${dirPath}/${fileName}_controller.ts`

                await Deno.mkdir(dirPath, { recursive: true })
                await Deno.writeTextFile(filePath, content)
                createdFiles.push(filePath)
            } catch (error) {
                console.error(
                    `❌ Failed to create controller: ${
                        (error as Error).message
                    }`,
                )
            }
        }

        // Summary
        console.log(`✅ Created ${createdFiles.length} file(s):`)
        createdFiles.forEach((f) => console.log(`   ${f}`))

        if (createdFiles.length === 1) {
            console.log('')
            console.log('💡 Use flags to generate related files:')
            console.log(
                '   -r  repository   -s  seeder   -c  controller   -a  all',
            )
        }
    })
}
