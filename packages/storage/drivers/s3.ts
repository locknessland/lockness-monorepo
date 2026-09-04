/**
 * @fileoverview S3 storage driver.
 *
 * Backs the storage API with an AWS S3 bucket via the AWS SDK, including
 * presigned URL generation. Serves as the base class for the R2 driver.
 *
 * @module @lockness/storage/drivers/s3
 */

import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { FileMetadata, StorageConfig, StorageDriver } from '../types.ts'

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
