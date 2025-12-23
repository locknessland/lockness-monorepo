import { join } from 'node:path'

interface ManifestEntry {
    file: string
    src?: string
    css?: string[]
    isEntry?: boolean
}

let manifest: Record<string, ManifestEntry> | null = null

/**
 * Returns the parsed manifest object.
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
            manifest = JSON.parse(Deno.readTextFileSync(manifestPath))
        } catch (_e) {
            return {}
        }
    }
    return manifest || {}
}

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
