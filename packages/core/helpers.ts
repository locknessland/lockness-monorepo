/**
 * @fileoverview Asset Helpers Module
 *
 * Provides utilities for resolving asset paths in both development
 * and production environments. Integrates with Vite's manifest system.
 *
 * @module @lockness/core/helpers
 */

import { join } from 'node:path'

/**
 * Entry in the Vite manifest file.
 *
 * @see https://vitejs.dev/guide/backend-integration.html
 */
interface ManifestEntry {
    /** Output file path (hashed in production) */
    readonly file: string
    /** Original source file path */
    readonly src?: string
    /** Associated CSS files for this entry */
    readonly css?: readonly string[]
    /** Whether this is an entry point */
    readonly isEntry?: boolean
}

/** Cached manifest object */
let manifest: Record<string, ManifestEntry> | null = null

/**
 * Returns the parsed Vite manifest object.
 *
 * Loads and caches the manifest from `static/.vite/manifest.json`.
 * Returns an empty object if the manifest doesn't exist.
 *
 * @returns The manifest object mapping source paths to output info
 *
 * @example
 * ```typescript
 * const manifest = getManifest()
 * // { 'src/main.ts': { file: 'assets/main.abc123.js', isEntry: true } }
 * ```
 */
export function getManifest(): Record<string, ManifestEntry> {
    if (!manifest) {
        try {
            // When running in production, cwd is dist/
            const manifestPath = join(
                Deno.cwd(),
                'static',
                '.vite',
                'manifest.json',
            )
            manifest = JSON.parse(
                Deno.readTextFileSync(manifestPath),
            ) as Record<string, ManifestEntry>
        } catch {
            return {}
        }
    }
    return manifest || {}
}

/**
 * Resolves an asset path for use in HTML.
 *
 * In development (when `VITE` env var is set), returns the path as-is
 * for Vite's dev server to handle. In production, looks up the hashed
 * filename from the Vite manifest.
 *
 * @param path - Source asset path (e.g., 'src/main.ts', 'css/app.css')
 * @returns Resolved path for use in HTML src/href attributes
 *
 * @example Development mode
 * ```typescript
 * // VITE=true
 * asset('src/main.ts') // => '/src/main.ts'
 * ```
 *
 * @example Production mode
 * ```typescript
 * asset('src/main.ts') // => '/assets/main.abc123.js'
 * ```
 *
 * @example Fallback for non-bundled assets
 * ```typescript
 * asset('img/logo.png') // => '/img/logo.png'
 * ```
 */
export function asset(path: string): string {
    const isDev = !!Deno.env.get('VITE')

    // Normalize path: replace backslashes and remove leading slash
    const normalizedPath = path.replace(/\\/g, '/').replace(/^\//, '')

    if (isDev) {
        // In development, Vite serves files directly (usually with a prefix)
        return `/${normalizedPath}`
    }

    const currentManifest = getManifest()
    const entry = currentManifest[normalizedPath]

    if (entry) {
        // Use the bundled file path from manifest
        return `/${entry.file.replace(/^\//, '')}`
    }

    // Fallback: if it's a direct path to an asset that wasn't bundled (e.g. in public/)
    return `/${normalizedPath.replace(/^public\//, '')}`
}
