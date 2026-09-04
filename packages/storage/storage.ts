/**
 * @fileoverview The {@link Storage} facade.
 *
 * Selects a driver from configuration and delegates every file operation to
 * it, adding the `putFile` / `download` conveniences on top.
 *
 * @module @lockness/storage/storage
 */

// deno-lint-ignore-file require-await

import type { FileMetadata, StorageConfig, StorageDriver } from './types.ts'
import { LocalStorageDriver } from './drivers/local.ts'
import { S3StorageDriver } from './drivers/s3.ts'
import { R2StorageDriver } from './drivers/r2.ts'

export class Storage {
    private driver: StorageDriver

    constructor(config: StorageConfig) {
        switch (config.driver) {
            case 'local':
                this.driver = new LocalStorageDriver(config)
                break
            case 's3':
                this.driver = new S3StorageDriver(config)
                break
            case 'r2':
                this.driver = new R2StorageDriver(config)
                break
            default:
                throw new Error(`Unknown storage driver: ${config.driver}`)
        }
    }

    /**
     * Write a file
     */
    async put(
        path: string,
        content: string | Uint8Array | ReadableStream,
    ): Promise<void> {
        return this.driver.put(path, content)
    }

    /**
     * Read a file as text
     */
    async get(path: string): Promise<string> {
        return this.driver.get(path)
    }

    /**
     * Read a file as bytes
     */
    async getBytes(path: string): Promise<Uint8Array> {
        return this.driver.getBytes(path)
    }

    /**
     * Read a file as stream
     */
    async getStream(path: string): Promise<ReadableStream> {
        return this.driver.getStream(path)
    }

    /**
     * Check if file exists
     */
    async exists(path: string): Promise<boolean> {
        return this.driver.exists(path)
    }

    /**
     * Delete a file
     */
    async delete(path: string): Promise<void> {
        return this.driver.delete(path)
    }

    /**
     * Get file metadata
     */
    async metadata(path: string): Promise<FileMetadata> {
        return this.driver.metadata(path)
    }

    /**
     * List files
     */
    async list(prefix?: string): Promise<FileMetadata[]> {
        return this.driver.list(prefix)
    }

    /**
     * Copy a file
     */
    async copy(source: string, destination: string): Promise<void> {
        return this.driver.copy(source, destination)
    }

    /**
     * Move a file
     */
    async move(source: string, destination: string): Promise<void> {
        return this.driver.move(source, destination)
    }

    /**
     * Get signed URL
     */
    async signedUrl(path: string, expiresIn?: number): Promise<string> {
        return this.driver.signedUrl(path, expiresIn)
    }

    /**
     * Get public URL
     */
    publicUrl(path: string): string {
        return this.driver.publicUrl(path)
    }

    /**
     * Put a file from a File object
     */
    async putFile(path: string, file: File): Promise<void> {
        return this.put(path, file.stream())
    }

    /**
     * Download a file and return as Blob
     */
    async download(path: string): Promise<Blob> {
        const bytes = await this.getBytes(path)
        return new Blob([bytes as BlobPart])
    }
}
