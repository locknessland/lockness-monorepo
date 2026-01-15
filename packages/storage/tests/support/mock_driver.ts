/**
 * Mock Storage Driver for Testing
 *
 * In-memory storage driver that avoids filesystem I/O.
 * Implements the StorageDriver interface for fast, hermetic tests.
 */

import type { FileMetadata, StorageDriver } from '../../mod.ts'

/**
 * In-memory storage driver for fast unit tests
 */
export class MemoryStorageDriver implements StorageDriver {
    private store = new Map<string, Uint8Array>()

    async put(
        path: string,
        content: string | Uint8Array | ReadableStream,
    ): Promise<void> {
        let bytes: Uint8Array

        if (typeof content === 'string') {
            bytes = new TextEncoder().encode(content)
        } else if (content instanceof Uint8Array) {
            bytes = content
        } else {
            // ReadableStream - convert to Uint8Array
            const reader = content.getReader()
            const chunks: Uint8Array[] = []
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                chunks.push(value)
            }
            const totalLength = chunks.reduce(
                (acc, chunk) => acc + chunk.length,
                0,
            )
            bytes = new Uint8Array(totalLength)
            let offset = 0
            for (const chunk of chunks) {
                bytes.set(chunk, offset)
                offset += chunk.length
            }
        }

        this.store.set(path, bytes)
    }

    get(path: string): Promise<string> {
        const bytes = this.store.get(path)
        if (!bytes) {
            throw new Error(`File not found: ${path}`)
        }
        return Promise.resolve(new TextDecoder().decode(bytes))
    }

    getBytes(path: string): Promise<Uint8Array> {
        const bytes = this.store.get(path)
        if (!bytes) {
            throw new Error(`File not found: ${path}`)
        }
        return Promise.resolve(bytes)
    }

    getStream(path: string): Promise<ReadableStream> {
        const bytes = this.store.get(path)
        if (!bytes) {
            throw new Error(`File not found: ${path}`)
        }
        return Promise.resolve(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(bytes)
                    controller.close()
                },
            }),
        )
    }

    exists(path: string): Promise<boolean> {
        return Promise.resolve(this.store.has(path))
    }

    delete(path: string): Promise<void> {
        this.store.delete(path)
        return Promise.resolve()
    }

    metadata(path: string): Promise<FileMetadata> {
        const bytes = this.store.get(path)
        if (!bytes) {
            throw new Error(`File not found: ${path}`)
        }
        return Promise.resolve({
            path,
            size: bytes.length,
            lastModified: new Date(),
        })
    }

    list(prefix = ''): Promise<FileMetadata[]> {
        const results: FileMetadata[] = []
        for (const [path, bytes] of this.store.entries()) {
            if (path.startsWith(prefix)) {
                results.push({
                    path,
                    size: bytes.length,
                    lastModified: new Date(),
                })
            }
        }
        return Promise.resolve(results)
    }

    copy(source: string, destination: string): Promise<void> {
        const bytes = this.store.get(source)
        if (!bytes) {
            throw new Error(`File not found: ${source}`)
        }
        // Copy bytes to new key
        this.store.set(destination, new Uint8Array(bytes))
        return Promise.resolve()
    }

    move(source: string, destination: string): Promise<void> {
        return this.copy(source, destination).then(() => {
            this.store.delete(source)
        })
    }

    signedUrl(_path: string, _expiresIn?: number): Promise<string> {
        return Promise.reject(
            new Error('Signed URLs are not supported for memory storage'),
        )
    }

    publicUrl(path: string): string {
        return `memory://${path}`
    }

    /**
     * Clear all stored files (test helper)
     */
    clear(): void {
        this.store.clear()
    }
}

/**
 * Create a new in-memory storage driver for testing
 */
export function createMockStorage(): MemoryStorageDriver {
    return new MemoryStorageDriver()
}
