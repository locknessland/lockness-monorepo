/**
 * @fileoverview Local filesystem storage driver.
 *
 * Reads and writes files beneath a configured root directory, refusing any
 * caller path that escapes it (see {@link LocalStorageDriver.resolvePath}).
 *
 * @module @lockness/storage/drivers/local
 */

// deno-lint-ignore-file require-await

import { join, resolve, SEPARATOR } from '@std/path'
import { ensureDir } from '@std/fs'
import type { FileMetadata, StorageConfig, StorageDriver } from '../types.ts'

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
