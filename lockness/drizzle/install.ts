#!/usr/bin/env -S deno run -A
/**
 * Drizzle Package Installer
 *
 * Automatically configures the @lockness/drizzle package in your project.
 *
 * Usage:
 *   deno run -A jsr:@lockness/drizzle/install
 *   or
 *   deno task cli package:install drizzle
 */

import { addPackage, Stub } from '@lockness/cli'
import { dirname, fromFileUrl, join } from '@std/path'
import postgres from 'postgres'

async function createDrizzleConfig() {
    const configPath = './drizzle.config.ts'

    try {
        await Deno.stat(configPath)
        console.log('ℹ️  drizzle.config.ts already exists, skipping...')
        return false
    } catch {
        const currentDir = dirname(fromFileUrl(import.meta.url))
        const stubsDir = join(currentDir, 'stubs')

        const content = await Stub.renderFrom(
            stubsDir,
            '',
            'drizzle.config.ts',
            {},
        )

        await Deno.writeTextFile(configPath, content)
        console.log('✓ Created drizzle.config.ts')
        return true
    }
}

async function createDirectories() {
    const directories = [
        './database/migrations',
        './database/seeders',
        './src/model',
        './src/repository',
    ]

    for (const dir of directories) {
        try {
            await Deno.mkdir(dir, { recursive: true })
            console.log(`✓ Created ${dir}`)
        } catch (error) {
            if (!(error instanceof Deno.errors.AlreadyExists)) {
                console.error(
                    `✗ Failed to create ${dir}:`,
                    (error as Error).message,
                )
            }
        }
    }
}

async function createDatabaseSeeder() {
    const seederPath = './database/seeders/database_seeder.ts'

    try {
        await Deno.stat(seederPath)
        console.log('ℹ️  database_seeder.ts already exists, skipping...')
        return false
    } catch {
        const currentDir = dirname(fromFileUrl(import.meta.url))
        const stubsDir = join(currentDir, 'stubs')

        const content = await Stub.renderFrom(
            stubsDir,
            '',
            'database_seeder',
            {},
        )

        await Deno.writeTextFile(seederPath, content)
        console.log('✓ Created database/seeders/database_seeder.ts')
        return true
    }
}

async function updateEnvFile() {
    const envPath = './.env'
    const envExample = './.env.example'
    const databaseUrl =
        'DATABASE_URL=postgres://user:password@localhost:5432/mydb'

    // Check .env file
    try {
        const envContent = await Deno.readTextFile(envPath)
        if (envContent.includes('DATABASE_URL')) {
            console.log('ℹ️  DATABASE_URL already exists in .env')
        } else {
            await Deno.writeTextFile(
                envPath,
                `${envContent}\n\n# Database\n${databaseUrl}\n`,
            )
            console.log('✓ Added DATABASE_URL to .env')
        }
    } catch {
        // Create .env if it doesn't exist
        await Deno.writeTextFile(envPath, `# Database\n${databaseUrl}\n`)
        console.log('✓ Created .env with DATABASE_URL')
    }

    // Check .env.example file
    try {
        const envExampleContent = await Deno.readTextFile(envExample)
        if (envExampleContent.includes('DATABASE_URL')) {
            console.log('ℹ️  DATABASE_URL already exists in .env.example')
        } else {
            await Deno.writeTextFile(
                envExample,
                `${envExampleContent}\n\n# Database\n${databaseUrl}\n`,
            )
            console.log('✓ Added DATABASE_URL to .env.example')
        }
    } catch {
        // Create .env.example if it doesn't exist
        await Deno.writeTextFile(
            envExample,
            `# Database\n${databaseUrl}\n`,
        )
        console.log('✓ Created .env.example with DATABASE_URL')
    }
}

async function checkProjectStructure() {
    const checks = [
        { path: './src', name: 'src directory' },
        { path: './deno.json', name: 'deno.json' },
    ]

    for (const check of checks) {
        try {
            await Deno.stat(check.path)
        } catch {
            console.error(
                `✗ Missing ${check.name}. Please run this command from your project root.`,
            )
            Deno.exit(1)
        }
    }
}

async function testDatabaseConnection() {
    const databaseUrl = Deno.env.get('DATABASE_URL')

    if (!databaseUrl) {
        console.log(
            '\n⚠️  DATABASE_URL not set. Please configure your database connection in .env',
        )
        return
    }

    console.log('\n🔌 Testing database connection...')

    try {
        const sql = postgres(databaseUrl)

        await sql`SELECT 1`
        await sql.end()

        console.log('✓ Database connection successful!')
    } catch (error) {
        console.log('✗ Database connection failed:', (error as Error).message)
        console.log(
            '\n💡 Make sure your database is running and DATABASE_URL is correct',
        )
    }
}

function showNextSteps() {
    console.log('\n📦 @lockness/drizzle installation complete!\n')
    console.log('Next steps:')
    console.log(
        '  1. Update DATABASE_URL in .env with your database credentials',
    )
    console.log('  2. Create your first model:')
    console.log('     deno task cli make:model User -a')
    console.log('  3. Generate and run migrations:')
    console.log('     deno task cli db:generate')
    console.log('     deno task cli db:migrate')
    console.log('  4. Explore with Drizzle Studio:')
    console.log('     dx drizzle-kit studio')
    console.log('\n📖 Documentation: https://lockness.dev/docs/models')
}

if (import.meta.main) {
    console.log('🔧 Installing @lockness/drizzle...\n')

    await checkProjectStructure()
    await createDirectories()
    await createDrizzleConfig()
    await createDatabaseSeeder()
    await updateEnvFile()

    // Register package
    await addPackage('drizzle')

    await testDatabaseConnection()
    await showNextSteps()
}
