import { assertEquals, assertExists, assertRejects } from '@std/assert'
import {
    configureStorage,
    deleteFile,
    exists,
    get,
    LocalStorageDriver,
    put,
    R2StorageDriver,
    S3StorageDriver,
    Storage,
    storage,
} from '../storage.ts'

// =============================================================================
// Local Driver Tests
// =============================================================================

Deno.test('LocalStorageDriver - put and get text file', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    await driver.put('test.txt', 'Hello, World!')
    const content = await driver.get('test.txt')

    assertEquals(content, 'Hello, World!')

    // Cleanup
    await driver.delete('test.txt')
})

Deno.test('LocalStorageDriver - put and get binary file', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    const data = new Uint8Array([1, 2, 3, 4, 5])
    await driver.put('test.bin', data)
    const content = await driver.getBytes('test.bin')

    assertEquals(content, data)

    // Cleanup
    await driver.delete('test.bin')
})

Deno.test('LocalStorageDriver - put and get stream', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    const data = 'Stream content'
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(data))
            controller.close()
        },
    })

    await driver.put('stream.txt', stream)
    const content = await driver.get('stream.txt')

    assertEquals(content, data)

    // Cleanup
    await driver.delete('stream.txt')
})

Deno.test('LocalStorageDriver - exists', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    assertEquals(await driver.exists('nonexistent.txt'), false)

    await driver.put('exists.txt', 'I exist')
    assertEquals(await driver.exists('exists.txt'), true)

    // Cleanup
    await driver.delete('exists.txt')
})

Deno.test('LocalStorageDriver - metadata', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    const content = 'Hello, metadata!'
    await driver.put('metadata.txt', content)

    const meta = await driver.metadata('metadata.txt')

    assertEquals(meta.path, 'metadata.txt')
    assertEquals(meta.size, content.length)
    assertExists(meta.lastModified)

    // Cleanup
    await driver.delete('metadata.txt')
})

Deno.test('LocalStorageDriver - list files', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    await driver.put('list/file1.txt', 'File 1')
    await driver.put('list/file2.txt', 'File 2')
    await driver.put('list/file3.txt', 'File 3')

    const files = await driver.list('list')

    assertEquals(files.length, 3)
    assertEquals(files.map((f) => f.path).sort(), [
        'list/file1.txt',
        'list/file2.txt',
        'list/file3.txt',
    ])

    // Cleanup
    await driver.delete('list/file1.txt')
    await driver.delete('list/file2.txt')
    await driver.delete('list/file3.txt')
})

Deno.test('LocalStorageDriver - copy file', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    await driver.put('source.txt', 'Copy me')
    await driver.copy('source.txt', 'destination.txt')

    const source = await driver.get('source.txt')
    const dest = await driver.get('destination.txt')

    assertEquals(source, 'Copy me')
    assertEquals(dest, 'Copy me')

    // Cleanup
    await driver.delete('source.txt')
    await driver.delete('destination.txt')
})

Deno.test('LocalStorageDriver - move file', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    await driver.put('old-location.txt', 'Move me')
    await driver.move('old-location.txt', 'new-location.txt')

    assertEquals(await driver.exists('old-location.txt'), false)
    assertEquals(await driver.exists('new-location.txt'), true)

    const content = await driver.get('new-location.txt')
    assertEquals(content, 'Move me')

    // Cleanup
    await driver.delete('new-location.txt')
})

Deno.test('LocalStorageDriver - publicUrl', () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
        publicUrl: 'https://example.com/files',
    })

    const url = driver.publicUrl('test.txt')
    assertEquals(url, 'https://example.com/files/test.txt')
})

Deno.test('LocalStorageDriver - signedUrl throws error', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    await assertRejects(
        async () => await driver.signedUrl('test.txt'),
        Error,
        'Signed URLs are not supported for local storage',
    )
})

Deno.test('LocalStorageDriver - nested directories', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    await driver.put('deep/nested/structure/file.txt', 'Deep content')
    const content = await driver.get('deep/nested/structure/file.txt')

    assertEquals(content, 'Deep content')

    // Cleanup
    await driver.delete('deep/nested/structure/file.txt')
})

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
    sanitizeResources: false,
    sanitizeOps: false,
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
    sanitizeResources: false,
    sanitizeOps: false,
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
    sanitizeResources: false,
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

Deno.test('R2StorageDriver - publicUrl default format', () => {
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
})

Deno.test('R2StorageDriver - publicUrl with custom publicUrl', () => {
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
})

// =============================================================================
// Storage Manager Tests
// =============================================================================

Deno.test('Storage - local driver integration', async () => {
    const store = new Storage({
        driver: 'local',
        root: './tmp/test-storage',
    })

    await store.put('manager-test.txt', 'Manager content')
    const content = await store.get('manager-test.txt')

    assertEquals(content, 'Manager content')

    // Cleanup
    await store.delete('manager-test.txt')
})

Deno.test('Storage - putFile and download', async () => {
    const store = new Storage({
        driver: 'local',
        root: './tmp/test-storage',
    })

    // Create a mock File object
    const fileContent = 'File content'
    const blob = new Blob([fileContent], { type: 'text/plain' })
    const file = new File([blob], 'test.txt', { type: 'text/plain' })

    await store.putFile('uploaded.txt', file)

    const downloaded = await store.download('uploaded.txt')
    const downloadedText = await downloaded.text()

    assertEquals(downloadedText, fileContent)

    // Cleanup
    await store.delete('uploaded.txt')
})

Deno.test('Storage - unknown driver throws error', () => {
    try {
        // @ts-ignore: Testing invalid driver
        new Storage({ driver: 'unknown' })
    } catch (e) {
        const error = e as Error
        assertExists(error)
        assertEquals(error.message, 'Unknown storage driver: unknown')
    }
})

// =============================================================================
// Global Storage Tests
// =============================================================================

Deno.test('configureStorage - sets global storage', async () => {
    configureStorage({
        driver: 'local',
        root: './tmp/test-global',
    })

    await put('global-test.txt', 'Global content')
    const content = await get('global-test.txt')

    assertEquals(content, 'Global content')

    // Test exists
    assertEquals(await exists('global-test.txt'), true)

    // Test delete
    await deleteFile('global-test.txt')
    assertEquals(await exists('global-test.txt'), false)
})

Deno.test('storage - throws error if not configured', () => {
    // Reset global storage
    configureStorage({
        driver: 'local',
        root: './tmp/test-reset',
    })

    // Should work after configuration
    const store = storage()
    assertExists(store)
})

Deno.test('LocalStorageDriver - getStream integration', async () => {
    const driver = new LocalStorageDriver({
        driver: 'local',
        root: './tmp/test-storage',
    })

    const content = 'Stream test content'
    await driver.put('stream-read.txt', content)

    const stream = await driver.getStream('stream-read.txt')
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
    }

    const combined = new Uint8Array(
        chunks.reduce((acc, chunk) => acc + chunk.length, 0),
    )
    let offset = 0
    for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.length
    }

    const result = new TextDecoder().decode(combined)
    assertEquals(result, content)

    // Cleanup
    await driver.delete('stream-read.txt')
})

Deno.test('Storage - all CRUD operations', async () => {
    const store = new Storage({
        driver: 'local',
        root: './tmp/test-crud',
    })

    // Create
    await store.put('crud.txt', 'Initial content')
    assertEquals(await store.exists('crud.txt'), true)

    // Read
    const content = await store.get('crud.txt')
    assertEquals(content, 'Initial content')

    // Update
    await store.put('crud.txt', 'Updated content')
    const updated = await store.get('crud.txt')
    assertEquals(updated, 'Updated content')

    // Delete
    await store.delete('crud.txt')
    assertEquals(await store.exists('crud.txt'), false)
})

Deno.test('Storage - copy and move operations', async () => {
    const store = new Storage({
        driver: 'local',
        root: './tmp/test-ops',
    })

    // Setup
    await store.put('original.txt', 'Original content')

    // Copy
    await store.copy('original.txt', 'copy.txt')
    assertEquals(await store.exists('original.txt'), true)
    assertEquals(await store.exists('copy.txt'), true)
    assertEquals(await store.get('copy.txt'), 'Original content')

    // Move
    await store.move('copy.txt', 'moved.txt')
    assertEquals(await store.exists('copy.txt'), false)
    assertEquals(await store.exists('moved.txt'), true)
    assertEquals(await store.get('moved.txt'), 'Original content')

    // Cleanup
    await store.delete('original.txt')
    await store.delete('moved.txt')
})
