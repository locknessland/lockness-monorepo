/**
 * Lockness Storage - File Storage Abstraction
 *
 * Multi-driver file storage system supporting Local, S3, and Cloudflare R2.
 * Provides unified API for file operations with streaming support.
 *
 * Note: Some methods are async for interface consistency even if they don't await
 */

// deno-lint-ignore-file require-await

import { join, resolve, SEPARATOR } from '@std/path'
import { ensureDir } from '@std/fs'
import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// =============================================================================
// Types & Interfaces
// =============================================================================

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

// =============================================================================
// Local Driver
// =============================================================================

export class LocalStorageDriver implements StorageDriver {
    constructor(private config: StorageConfig) {
        if (!config.root) {
            throw new Error('LocalStorageDriver requires root directory')
        }
    }

    /**
     * Resolve a caller-supplied path against the configured root, refusing any
     * result that escapes it.
     *
     * `join` alone collapses `..` segments but still lets the result climb above
     * the root (`join('root', '../../etc/passwd')`), and an absolute argument
     * replaces the root entirely — so a user-influenced path reaches arbitrary
     * files. Resolving both sides to absolute paths and requiring the target to
     * be the root or sit beneath `root + separator` closes that (H2, #166). The
     * guard lives here so every operation (including both ends of copy/move)
     * inherits it.
     *
     * @param path - The caller-supplied, possibly hostile, relative path.
     * @returns The absolute on-disk path, guaranteed inside the root.
     * @throws {Error} When the resolved path escapes the storage root.
     */
    private resolvePath(path: string): string {
        const root = resolve(this.config.root!)
        const full = resolve(root, path)
        if (full !== root && !full.startsWith(root + SEPARATOR)) {
            throw new Error(
                `Path escapes the storage root: ${path}`,
            )
        }
        return full
    }

    async put(
        path: string,
        content: string | Uint8Array | ReadableStream,
    ): Promise<void> {
        const fullPath = this.resolvePath(path)
        await ensureDir(join(fullPath, '..'))

        if (content instanceof ReadableStream) {
            const file = await Deno.open(fullPath, {
                write: true,
                create: true,
                truncate: true,
            })
            await content.pipeTo(file.writable)
        } else if (typeof content === 'string') {
            await Deno.writeTextFile(fullPath, content)
        } else {
            await Deno.writeFile(fullPath, content)
        }
    }

    async get(path: string): Promise<string> {
        const fullPath = this.resolvePath(path)
        return await Deno.readTextFile(fullPath)
    }

    async getBytes(path: string): Promise<Uint8Array> {
        const fullPath = this.resolvePath(path)
        return await Deno.readFile(fullPath)
    }

    async getStream(path: string): Promise<ReadableStream> {
        const fullPath = this.resolvePath(path)
        const file = await Deno.open(fullPath, { read: true })
        return file.readable
    }

    async exists(path: string): Promise<boolean> {
        try {
            const fullPath = this.resolvePath(path)
            await Deno.stat(fullPath)
            return true
        } catch {
            return false
        }
    }

    async delete(path: string): Promise<void> {
        const fullPath = this.resolvePath(path)
        await Deno.remove(fullPath)
    }

    async metadata(path: string): Promise<FileMetadata> {
        const fullPath = this.resolvePath(path)
        const stat = await Deno.stat(fullPath)

        return {
            path,
            size: stat.size,
            lastModified: stat.mtime || new Date(),
        }
    }

    async list(prefix = ''): Promise<FileMetadata[]> {
        const results: FileMetadata[] = []
        const searchPath = this.resolvePath(prefix)

        try {
            for await (const entry of Deno.readDir(searchPath)) {
                if (entry.isFile) {
                    const fullPath = join(searchPath, entry.name)
                    const stat = await Deno.stat(fullPath)
                    const relativePath = prefix
                        ? join(prefix, entry.name)
                        : entry.name

                    results.push({
                        path: relativePath,
                        size: stat.size,
                        lastModified: stat.mtime || new Date(),
                    })
                }
            }
        } catch {
            // Directory doesn't exist, return empty array
        }

        return results
    }

    async copy(source: string, destination: string): Promise<void> {
        const sourcePath = this.resolvePath(source)
        const destPath = this.resolvePath(destination)
        await ensureDir(join(destPath, '..'))
        await Deno.copyFile(sourcePath, destPath)
    }

    async move(source: string, destination: string): Promise<void> {
        const sourcePath = this.resolvePath(source)
        const destPath = this.resolvePath(destination)
        await ensureDir(join(destPath, '..'))
        await Deno.rename(sourcePath, destPath)
    }

    async signedUrl(_path: string, _expiresIn?: number): Promise<string> {
        throw new Error('Signed URLs are not supported for local storage')
    }

    publicUrl(path: string): string {
        if (this.config.publicUrl) {
            return `${this.config.publicUrl}/${path}`
        }
        return `file://${this.resolvePath(path)}`
    }
}

// =============================================================================
// S3 Driver
// =============================================================================

export class S3StorageDriver implements StorageDriver {
    private client: S3Client
    protected config: StorageConfig

    constructor(config: StorageConfig) {
        if (!config.bucket) {
            throw new Error('S3StorageDriver requires bucket')
        }

        this.config = config

        this.client = new S3Client({
            region: config.region || 'us-east-1',
            endpoint: config.endpoint,
            credentials: config.accessKeyId && config.secretAccessKey
                ? {
                    accessKeyId: config.accessKeyId,
                    secretAccessKey: config.secretAccessKey,
                }
                : undefined,
        })
    }

    async put(
        path: string,
        content: string | Uint8Array | ReadableStream,
    ): Promise<void> {
        let body: Uint8Array | ReadableStream

        if (typeof content === 'string') {
            body = new TextEncoder().encode(content)
        } else {
            body = content
        }

        await this.client.send(
            new PutObjectCommand({
                Bucket: this.config.bucket,
                Key: path,
                Body: body,
            }),
        )
    }

    async get(path: string): Promise<string> {
        const bytes = await this.getBytes(path)
        return new TextDecoder().decode(bytes)
    }

    async getBytes(path: string): Promise<Uint8Array> {
        const response = await this.client.send(
            new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: path,
            }),
        )

        if (!response.Body) {
            throw new Error(`File not found: ${path}`)
        }

        return new Uint8Array(await response.Body.transformToByteArray())
    }

    async getStream(path: string): Promise<ReadableStream> {
        const response = await this.client.send(
            new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: path,
            }),
        )

        if (!response.Body) {
            throw new Error(`File not found: ${path}`)
        }

        return response.Body.transformToWebStream()
    }

    async exists(path: string): Promise<boolean> {
        try {
            await this.client.send(
                new HeadObjectCommand({
                    Bucket: this.config.bucket,
                    Key: path,
                }),
            )
            return true
        } catch {
            return false
        }
    }

    async delete(path: string): Promise<void> {
        await this.client.send(
            new DeleteObjectCommand({
                Bucket: this.config.bucket,
                Key: path,
            }),
        )
    }

    async metadata(path: string): Promise<FileMetadata> {
        const response = await this.client.send(
            new HeadObjectCommand({
                Bucket: this.config.bucket,
                Key: path,
            }),
        )

        return {
            path,
            size: response.ContentLength || 0,
            lastModified: response.LastModified || new Date(),
            contentType: response.ContentType,
            etag: response.ETag,
        }
    }

    async list(prefix = ''): Promise<FileMetadata[]> {
        const response = await this.client.send(
            new ListObjectsV2Command({
                Bucket: this.config.bucket,
                Prefix: prefix,
            }),
        )

        return (response.Contents || []).map((item) => ({
            path: item.Key || '',
            size: item.Size || 0,
            lastModified: item.LastModified || new Date(),
            etag: item.ETag,
        }))
    }

    async copy(source: string, destination: string): Promise<void> {
        // Read from source
        const content = await this.getBytes(source)
        // Write to destination
        await this.put(destination, content)
    }

    async move(source: string, destination: string): Promise<void> {
        await this.copy(source, destination)
        await this.delete(source)
    }

    async signedUrl(path: string, expiresIn = 3600): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: path,
        })

        return await getSignedUrl(this.client, command, { expiresIn })
    }

    publicUrl(path: string): string {
        if (this.config.publicUrl) {
            return `${this.config.publicUrl}/${path}`
        }

        const endpoint = this.config.endpoint ||
            `https://s3.${this.config.region}.amazonaws.com`
        return `${endpoint}/${this.config.bucket}/${path}`
    }

    /**
     * Destroy the S3 client and free resources
     */
    async destroy(): Promise<void> {
        await this.client.destroy()
    }
}

// =============================================================================
// R2 Driver (Cloudflare R2)
// =============================================================================

export class R2StorageDriver extends S3StorageDriver {
    constructor(config: StorageConfig) {
        if (!config.accountId) {
            throw new Error('R2StorageDriver requires accountId')
        }

        // R2 uses S3-compatible API
        super({
            ...config,
            endpoint: config.endpoint ||
                `https://${config.accountId}.r2.cloudflarestorage.com`,
            region: 'auto', // R2 uses 'auto' as region
        })
    }

    override publicUrl(path: string): string {
        if (this.config.publicUrl) {
            return `${this.config.publicUrl}/${path}`
        }

        // R2 public URL format (requires custom domain)
        return `https://${this.config.bucket}.r2.dev/${path}`
    }
}

// =============================================================================
// Storage Manager
// =============================================================================

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

// =============================================================================
// Helper Functions
// =============================================================================

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
