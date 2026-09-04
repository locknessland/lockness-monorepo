/**
 * @fileoverview Mail's OWN soft-load seam.
 *
 * Vendored here (mirroring `packages/notification/optional.ts`) rather than
 * imported from `@lockness/core` (an upward layer violation) or
 * `@lockness/notification` (a cycle). It loads a backing package through a
 * **variable** specifier so `deps:analyze` sees a `soft` edge; a value or
 * `import type` of markdown/queue would harden the edge and fail the gate.
 *
 * @module @lockness/mail/optional
 */

/** A module importer (dynamic `import` in production; a fake in tests). */
export type ModuleImporter = (specifier: string) => Promise<unknown>

/** Raised when a mailable/queue backing package is not installed. */
export class MailPackageMissingError extends Error {
    /**
     * @param packageName - The missing package.
     * @param feature - The feature that needed it.
     */
    constructor(readonly packageName: string, readonly feature: string) {
        super(`install ${packageName} for ${feature}`)
        this.name = 'MailPackageMissingError'
    }
}

const NOT_FOUND = [
    'Cannot resolve',
    'not a dependency',
    'not in import map',
    'Module not found',
]

/**
 * Load a backing package on demand (soft edge).
 *
 * @typeParam T - The expected module shape (a minimal structural interface).
 * @param packageName - The backing package specifier.
 * @param feature - The feature needing it (for the install message).
 * @param importer - The importer; defaults to dynamic `import`.
 * @returns The imported module.
 * @throws {MailPackageMissingError} When not installed.
 */
export async function tryImport<T = unknown>(
    packageName: string,
    feature: string,
    importer: ModuleImporter = (s) => import(s),
): Promise<T> {
    try {
        return await importer(packageName) as T
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (NOT_FOUND.some((s) => message.includes(s))) {
            throw new MailPackageMissingError(packageName, feature)
        }
        throw error
    }
}
