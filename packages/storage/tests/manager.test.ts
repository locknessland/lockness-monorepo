/**
 * Tests for @lockness/storage - Storage Manager & Global Registry
 */

import { assertEquals, assertExists } from '@std/assert'
import {
    configureStorage,
    deleteFile,
    exists,
    get,
    put,
    Storage,
    storage,
} from '../mod.ts'
import { createMockStorage } from './support/mock_driver.ts'

Deno.test('Storage - local driver integration', async () => {
    const driver = createMockStorage()
    const store = new Storage({
        driver: 'local',
        root: './tmp/test-storage',
    }) // Override internal driver with mock
    ;(store as any).driver = driver

    await store.put('manager-test.txt', 'Manager content')
    const content = await store.get('manager-test.txt')

    assertEquals(content, 'Manager content')
})

Deno.test('Storage - putFile and download', async () => {
    const driver = createMockStorage()
    const store = new Storage({
        driver: 'local',
        root: './tmp/test-storage',
    }) // Override internal driver with mock
    ;(store as any).driver = driver

    // Create a mock File object
    const fileContent = 'File content'
    const blob = new Blob([fileContent], { type: 'text/plain' })
    const file = new File([blob], 'test.txt', { type: 'text/plain' })

    await store.putFile('uploaded.txt', file)

    const downloaded = await store.download('uploaded.txt')
    const downloadedText = await downloaded.text()

    assertEquals(downloadedText, fileContent)
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

Deno.test('configureStorage - sets global storage', async () => {
    const driver = createMockStorage()
    configureStorage({
        driver: 'local',
        root: './tmp/test-global',
    })

    // Override global storage driver with mock
    const globalStore = storage()
    ;(globalStore as any).driver = driver

    await put('global-test.txt', 'Global content')
    const content = await get('global-test.txt')

    assertEquals(content, 'Global content')

    // Test exists
    assertEquals(await exists('global-test.txt'), true)

    // Test delete
    await deleteFile('global-test.txt')
    assertEquals(await exists('global-test.txt'), false)
})

Deno.test('storage - returns global instance', () => {
    configureStorage({
        driver: 'local',
        root: './tmp/test-reset',
    })

    const store = storage()
    assertExists(store)
})

Deno.test('Storage - all CRUD operations', async () => {
    const driver = createMockStorage()
    const store = new Storage({
        driver: 'local',
        root: './tmp/test-crud',
    }) // Override internal driver with mock
    ;(store as any).driver = driver

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
    const driver = createMockStorage()
    const store = new Storage({
        driver: 'local',
        root: './tmp/test-ops',
    }) // Override internal driver with mock
    ;(store as any).driver = driver

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
})
