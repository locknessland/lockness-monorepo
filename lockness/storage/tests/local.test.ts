/**
 * Tests for @lockness/storage - Local Driver
 */

import { assertEquals, assertExists, assertRejects } from '@std/assert'
import { LocalStorageDriver } from '../mod.ts'

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
