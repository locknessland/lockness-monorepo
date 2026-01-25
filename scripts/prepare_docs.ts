/**
 * @fileoverview Application-specific script to sync package documentation for the Lockness site.
 *
 * This script scans the monorepo for package docs and copies them to the distribution folder.
 * Logic that was previously (wrongly) in the framework CLI is now here.
 */

import { dirname, join } from '@std/path'
import { copy, ensureDir, exists } from '@std/fs'

const DIST_DIR = '_dist'
const PACKAGES_DIR = 'packages'

async function syncDocs() {
    console.log('📚 [Site] Syncing package documentation...')

    if (!await exists(PACKAGES_DIR)) {
        console.error('❌ packages/ directory not found')
        return
    }

    for await (const entry of Deno.readDir(PACKAGES_DIR)) {
        if (entry.isDirectory) {
            const pkgDocsDir = join(PACKAGES_DIR, entry.name, 'docs')
            const pkgLlmsFile = join(PACKAGES_DIR, entry.name, 'llms.txt')

            // Copy docs
            if (await exists(pkgDocsDir)) {
                console.log(`  - Syncing docs for @lockness/${entry.name}...`)
                const targetDocsDir = join(
                    DIST_DIR,
                    'packages',
                    entry.name,
                    'docs',
                )
                await ensureDir(targetDocsDir)
                await copy(pkgDocsDir, targetDocsDir, { overwrite: true })
            }

            // Copy llms.txt
            if (await exists(pkgLlmsFile)) {
                console.log(
                    `  - Syncing llms.txt for @lockness/${entry.name}...`,
                )
                const targetLlmsFile = join(
                    DIST_DIR,
                    'packages',
                    entry.name,
                    'llms.txt',
                )
                await ensureDir(dirname(targetLlmsFile))
                await copy(pkgLlmsFile, targetLlmsFile, { overwrite: true })
            }
        }
    }

    console.log('✅ [Site] Package documentation synced.')
}

if (import.meta.main) {
    await syncDocs()
}
