/**
 * @fileoverview Public type vocabulary for the Lockness storage system.
 *
 * The configuration, file-metadata and driver contracts shared by every
 * driver, the {@link Storage} facade and the helper functions. Dependency-free
 * so the whole package can import from here without a cycle.
 *
 * @module @lockness/storage/types
 */

/**
 * Storage configuration
 */
export interface StorageConfig {
    driver: 'local' | 's3' | 'r2'
    root?: string // For local driver
    bucket?: string // For s3/r2 driver
    region?: string // For s3 driver
    endpoint?: string // For r2 driver or custom S3 endpoint
    accessKeyId?: string
    secretAccessKey?: string
    accountId?: string // For R2
    publicUrl?: string // Base URL for public files
}

/**
 * File metadata
 */
export interface FileMetadata {
    path: string
    size: number
    lastModified: Date
    contentType?: string
    etag?: string
}

/**
 * Storage driver interface
 */
export interface StorageDriver {
    /**
     * Write a file
     */
    put(
        path: string,
        content: string | Uint8Array | ReadableStream,
    ): Promise<void>

    /**
     * Read a file as text
     */
    get(path: string): Promise<string>

    /**
     * Read a file as Uint8Array
     */
    getBytes(path: string): Promise<Uint8Array>

    /**
     * Read a file as stream
     */
    getStream(path: string): Promise<ReadableStream>

    /**
     * Check if file exists
     */
    exists(path: string): Promise<boolean>

    /**
     * Delete a file
     */
    delete(path: string): Promise<void>

    /**
     * Get file metadata
     */
    metadata(path: string): Promise<FileMetadata>

    /**
     * List files in a directory
     */
    list(prefix?: string): Promise<FileMetadata[]>

    /**
     * Copy a file
     */
    copy(source: string, destination: string): Promise<void>

    /**
     * Move a file
     */
    move(source: string, destination: string): Promise<void>

    /**
     * Get a temporary signed URL for a file
     */
    signedUrl(path: string, expiresIn?: number): Promise<string>

    /**
     * Get public URL for a file
     */
    publicUrl(path: string): string
}
