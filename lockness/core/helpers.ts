import { join } from 'node:path'

let manifest: any = null

/**
 * Returns the parsed manifest object.
 */
export function getManifest(): any {
    if (!manifest) {
        try {
            const manifestPath = join(Deno.cwd(), 'dist', 'static', '.vite', 'manifest.json')
            manifest = JSON.parse(Deno.readTextFileSync(manifestPath))
        } catch (_e) {
            try {
                const legacyPath = join(Deno.cwd(), 'dist', 'static', 'manifest.json')
                manifest = JSON.parse(Deno.readTextFileSync(legacyPath))
            } catch (__e) {
                return {}
            }
        }
    }
    return manifest
}

/**
 * Resolves the path to an asset.
 * In development, it points to the source file.
 * In production, it resolves the versioned file from the manifest.
 */
export function asset(path: string): string {
    const isDev = !!Deno.env.get('VITE')

    // Normalize path to remove leading slash
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path

    if (isDev) {
        // In development, Vite serves files directly
        return `/${normalizedPath}`
    }

    const currentManifest = getManifest()
    const entry = currentManifest[normalizedPath]
    if (entry) {
        return `/${entry.file}`
    }

    return `/${normalizedPath}`
}
