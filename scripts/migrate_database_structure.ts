#!/usr/bin/env -S deno run -A
/**
 * Migration script to move files to new database/ structure
 *
 * Usage: deno run -A scripts/migrate_database_structure.ts
 */

console.log('📦 Migrating to new database structure...\n')

// Create new directories
console.log('Creating new directory structure...')
try {
    await Deno.mkdir('database/migrations', { recursive: true })
    console.log('✓ Created database/migrations')
} catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
        console.error('✗ Failed to create database/migrations:', error.message)
    }
}

try {
    await Deno.mkdir('database/seeders', { recursive: true })
    console.log('✓ Created database/seeders')
} catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
        console.error('✗ Failed to create database/seeders:', error.message)
    }
}

// Move migrations
console.log('\nMigrating migrations...')
try {
    const oldMigrationsExist = await Deno.stat('migrations').then(() => true)
        .catch(() => false)

    if (oldMigrationsExist) {
        for await (const entry of Deno.readDir('migrations')) {
            if (entry.isFile) {
                const oldPath = `migrations/${entry.name}`
                const newPath = `database/migrations/${entry.name}`
                await Deno.rename(oldPath, newPath)
                console.log(`✓ Moved ${entry.name}`)
            }
            if (entry.isDirectory && entry.name === 'meta') {
                // Move meta directory
                await Deno.rename('migrations/meta', 'database/migrations/meta')
                console.log('✓ Moved meta directory')
            }
        }

        // Remove old migrations directory
        try {
            await Deno.remove('migrations', { recursive: true })
            console.log('✓ Removed old migrations/ directory')
        } catch (error) {
            console.warn(
                '⚠ Could not remove old migrations/ directory:',
                error.message,
            )
        }
    } else {
        console.log('ℹ️  No migrations/ directory found, skipping')
    }
} catch (error) {
    console.error('✗ Error migrating migrations:', error.message)
}

// Move seeders
console.log('\nMigrating seeders...')
try {
    const oldSeedersExist = await Deno.stat('src/seeder').then(() => true)
        .catch(() => false)

    if (oldSeedersExist) {
        for await (const entry of Deno.readDir('src/seeder')) {
            if (entry.isFile && entry.name.endsWith('.ts')) {
                const oldPath = `src/seeder/${entry.name}`
                const newPath = `database/seeders/${entry.name}`
                await Deno.rename(oldPath, newPath)
                console.log(`✓ Moved ${entry.name}`)
            }
        }

        // Remove old seeder directory
        try {
            await Deno.remove('src/seeder', { recursive: true })
            console.log('✓ Removed old src/seeder/ directory')
        } catch (error) {
            console.warn(
                '⚠ Could not remove old src/seeder/ directory:',
                error.message,
            )
        }
    } else {
        console.log('ℹ️  No src/seeder/ directory found, skipping')
    }
} catch (error) {
    console.error('✗ Error migrating seeders:', error.message)
}

// Update imports in moved seeder files
console.log('\nUpdating imports in seeder files...')
try {
    for await (const entry of Deno.readDir('database/seeders')) {
        if (entry.isFile && entry.name.endsWith('.ts')) {
            const filePath = `database/seeders/${entry.name}`
            let content = await Deno.readTextFile(filePath)

            // Update imports: ../model -> ../../src/model
            if (content.includes("from '../model/")) {
                content = content.replaceAll(
                    "from '../model/",
                    "from '../../src/model/",
                )
                await Deno.writeTextFile(filePath, content)
                console.log(`✓ Updated imports in ${entry.name}`)
            }
        }
    }
} catch (error) {
    console.error('✗ Error updating imports:', error.message)
}

console.log('\n✅ Migration complete!\n')
console.log('Next steps:')
console.log('  1. Verify the new structure in database/')
console.log('  2. Run migrations: deno task cli db:migrate')
console.log('  3. Test seeders: deno task cli db:seed')
