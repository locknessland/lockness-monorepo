/**
 * @fileoverview Cloudflare R2 storage driver.
 *
 * R2 speaks the S3 API, so this extends {@link S3StorageDriver}, pointing it at
 * the account's R2 endpoint and overriding public-URL generation.
 *
 * @module @lockness/storage/drivers/r2
 */

import { S3StorageDriver } from './s3.ts'
import type { StorageConfig } from '../types.ts'

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
