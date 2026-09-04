/**
 * Lockness Storage - File Storage Abstraction
 *
 * Multi-driver file storage system supporting Local, S3, and Cloudflare R2.
 * Provides unified API for file operations with streaming support.
 *
 * @module @lockness/storage
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

export type { FileMetadata, StorageConfig, StorageDriver } from './types.ts'

// =============================================================================
// Drivers
// =============================================================================

export { LocalStorageDriver } from './drivers/local.ts'
export { S3StorageDriver } from './drivers/s3.ts'
export { R2StorageDriver } from './drivers/r2.ts'

// =============================================================================
// Storage Manager
// =============================================================================

export { Storage } from './storage.ts'

// =============================================================================
// Helper Functions
// =============================================================================

export {
    configureStorage,
    deleteFile,
    exists,
    get,
    put,
    storage,
} from './helpers.ts'
