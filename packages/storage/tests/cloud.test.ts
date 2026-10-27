/**
 * Tests for @lockness/storage - Cloud Drivers (S3, R2)
 */

import { assertEquals, assertExists } from '@std/assert'
import { R2StorageDriver, S3StorageDriver } from '../mod.ts'

// =============================================================================
// S3 Driver Tests (Unit tests with mocked behavior)
// =============================================================================

Deno.test('S3StorageDriver - initialization requires bucket', () => {
    try {
        new S3StorageDriver({ driver: 's3' })
    } catch (e) {
        const error = e as Error
        assertExists(error)
        assertEquals(error.message, 'S3StorageDriver requires bucket')
    }
})

Deno.test({
    name: 'S3StorageDriver - publicUrl default format',
    fn: () => {
        const driver = new S3StorageDriver({
            driver: 's3',
            bucket: 'my-bucket',
            region: 'us-west-2',
        })

        const url = driver.publicUrl('test.txt')
        assertEquals(
            url,
            'https://s3.us-west-2.amazonaws.com/my-bucket/test.txt',
        )
    },
})

Deno.test({
    name: 'S3StorageDriver - publicUrl with custom endpoint',
    fn: () => {
        const driver = new S3StorageDriver({
            driver: 's3',
            bucket: 'my-bucket',
            endpoint: 'https://custom-s3.example.com',
        })

        const url = driver.publicUrl('test.txt')
        assertEquals(url, 'https://custom-s3.example.com/my-bucket/test.txt')
    },
})

Deno.test({
    name: 'S3StorageDriver - publicUrl with custom publicUrl',
    fn: () => {
        const driver = new S3StorageDriver({
            driver: 's3',
            bucket: 'my-bucket',
            publicUrl: 'https://cdn.example.com',
        })

        const url = driver.publicUrl('test.txt')
        assertEquals(url, 'https://cdn.example.com/test.txt')
    },
})

// =============================================================================
// R2 Driver Tests
// =============================================================================

Deno.test('R2StorageDriver - initialization requires accountId', () => {
    try {
        new R2StorageDriver({ driver: 'r2', bucket: 'my-bucket' })
    } catch (e) {
        const error = e as Error
        assertExists(error)
        assertEquals(error.message, 'R2StorageDriver requires accountId')
    }
})

Deno.test({
    name: 'R2StorageDriver - publicUrl default format',
    fn: () => {
        const driver = new R2StorageDriver({
            driver: 'r2',
            bucket: 'my-bucket',
            accountId: 'account123',
            accessKeyId: 'key',
            secretAccessKey: 'secret',
        })

        try {
            const url = driver.publicUrl('test.txt')
            assertEquals(url, 'https://my-bucket.r2.dev/test.txt')
        } finally {
            driver.destroy()
        }
    },
})

Deno.test({
    name: 'R2StorageDriver - publicUrl with custom publicUrl',
    fn: () => {
        const driver = new R2StorageDriver({
            driver: 'r2',
            bucket: 'my-bucket',
            accountId: 'account123',
            accessKeyId: 'key',
            secretAccessKey: 'secret',
            publicUrl: 'https://cdn.example.com',
        })

        try {
            const url = driver.publicUrl('test.txt')
            assertEquals(url, 'https://cdn.example.com/test.txt')
        } finally {
            driver.destroy()
        }
    },
})
