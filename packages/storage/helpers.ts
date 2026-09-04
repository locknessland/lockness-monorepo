/**
 * @fileoverview Process-global storage instance and the free-function facade.
 *
 * Holds the single `globalStorage` singleton (kept here and nowhere else so
 * there is exactly one global store) plus the `configureStorage` / `storage`
 * accessors and the quick `put` / `get` / `deleteFile` / `exists` wrappers.
 *
 * @module @lockness/storage/helpers
 */

// deno-lint-ignore-file require-await

import { Storage } from './storage.ts'
import type { StorageConfig } from './types.ts'

/**
 * Global storage instance
 */
let globalStorage: Storage | null = null

/**
 * Configure global storage
 */
export function configureStorage(config: StorageConfig): Storage {
    globalStorage = new Storage(config)
    return globalStorage
}

/**
 * Get the global storage instance
 */
export function storage(): Storage {
    if (!globalStorage) {
        throw new Error(
            'Storage not configured. Call configureStorage() first.',
        )
    }
    return globalStorage
}

/**
 * Quick file put
 */
export async function put(
    path: string,
    content: string | Uint8Array | ReadableStream,
): Promise<void> {
    return storage().put(path, content)
}

/**
 * Quick file get
 */
export async function get(path: string): Promise<string> {
    return storage().get(path)
}

/**
 * Quick file delete
 */
export async function deleteFile(path: string): Promise<void> {
    return storage().delete(path)
}

/**
 * Quick file exists check
 */
export async function exists(path: string): Promise<boolean> {
    return storage().exists(path)
}
