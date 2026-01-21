import { assertEquals, assertExists } from '@std/assert'
import {
    ChannelManager,
    createCustomSSEHandler,
    createSSEStream,
    SSEChannel,
    sseHandler,
} from '../mod.ts'

// =============================================================================
// SSEChannel Tests
// =============================================================================

Deno.test('SSEChannel - should create channel with name', () => {
    const channel = new SSEChannel('test')
    assertEquals(channel.name, 'test')
    assertEquals(channel.clientCount, 0)
})

Deno.test('SSEChannel - should use default options', () => {
    const channel = new SSEChannel('test')
    assertEquals(channel.options.heartbeatInterval, 30000)
    assertEquals(channel.options.maxClients, Infinity)
})

Deno.test('SSEChannel - should use custom options', () => {
    const channel = new SSEChannel('test', {
        heartbeatInterval: 5000,
        maxClients: 100,
        headers: { 'X-Custom': 'value' },
    })
    assertEquals(channel.options.heartbeatInterval, 5000)
    assertEquals(channel.options.maxClients, 100)
    assertEquals(channel.options.headers['X-Custom'], 'value')
})

Deno.test('SSEChannel - should track client count', () => {
    const channel = new SSEChannel('test', { heartbeatInterval: 0 })

    // Mock controller
    const controller = {
        enqueue: () => { },
        close: () => { },
    } as unknown as ReadableStreamDefaultController<Uint8Array>

    channel.addClient('client1', controller)
    assertEquals(channel.clientCount, 1)

    channel.addClient('client2', controller)
    assertEquals(channel.clientCount, 2)

    channel.removeClient('client1')
    assertEquals(channel.clientCount, 1)

    channel.close()
    assertEquals(channel.clientCount, 0)
})

Deno.test('SSEChannel - should respect maxClients', () => {
    const channel = new SSEChannel('test', {
        heartbeatInterval: 0,
        maxClients: 2,
    })

    const controller = {
        enqueue: () => { },
        close: () => { },
    } as unknown as ReadableStreamDefaultController<Uint8Array>

    assertEquals(channel.addClient('c1', controller), true)
    assertEquals(channel.addClient('c2', controller), true)
    assertEquals(channel.addClient('c3', controller), false) // Rejected

    assertEquals(channel.clientCount, 2)
    channel.close()
})

Deno.test('SSEChannel - should check client existence', () => {
    const channel = new SSEChannel('test', { heartbeatInterval: 0 })

    const controller = {
        enqueue: () => { },
        close: () => { },
    } as unknown as ReadableStreamDefaultController<Uint8Array>

    channel.addClient('client1', controller, { userId: 123 })

    assertEquals(channel.hasClient('client1'), true)
    assertEquals(channel.hasClient('client2'), false)

    const clientInfo = channel.getClient('client1')
    assertExists(clientInfo)
    assertEquals(clientInfo.id, 'client1')
    assertEquals(clientInfo.metadata?.userId, 123)

    channel.close()
})

Deno.test('SSEChannel - should return client IDs', () => {
    const channel = new SSEChannel('test', { heartbeatInterval: 0 })

    const controller = {
        enqueue: () => { },
        close: () => { },
    } as unknown as ReadableStreamDefaultController<Uint8Array>

    channel.addClient('a', controller)
    channel.addClient('b', controller)
    channel.addClient('c', controller)

    const ids = channel.clientIds
    assertEquals(ids.length, 3)
    assertEquals(ids.includes('a'), true)
    assertEquals(ids.includes('b'), true)
    assertEquals(ids.includes('c'), true)

    channel.close()
})

Deno.test('SSEChannel - broadcast should return sent count', () => {
    const channel = new SSEChannel('test', { heartbeatInterval: 0 })
    const messages: string[] = []

    const controller = {
        enqueue: (data: Uint8Array) => {
            messages.push(new TextDecoder().decode(data))
        },
        close: () => { },
    } as unknown as ReadableStreamDefaultController<Uint8Array>

    channel.addClient('c1', controller)
    channel.addClient('c2', controller)

    const count = channel.broadcast('test-event', { hello: 'world' })
    assertEquals(count, 2)
    assertEquals(messages.length, 2)

    // Check message format
    const msg = messages[0]
    assertEquals(msg.includes('event: test-event'), true)
    assertEquals(msg.includes('data: {"hello":"world"}'), true)

    channel.close()
})

Deno.test('SSEChannel - broadcastTo should filter clients', () => {
    const channel = new SSEChannel('test', { heartbeatInterval: 0 })
    const messages = new Map<string, string[]>()

    const createController = (id: string) => ({
        enqueue: (data: Uint8Array) => {
            if (!messages.has(id)) messages.set(id, [])
            messages.get(id)!.push(new TextDecoder().decode(data))
        },
        close: () => { },
    }) as unknown as ReadableStreamDefaultController<Uint8Array>

    channel.addClient('admin1', createController('admin1'), { role: 'admin' })
    channel.addClient('user1', createController('user1'), { role: 'user' })
    channel.addClient('admin2', createController('admin2'), { role: 'admin' })

    const count = channel.broadcastTo(
        (client) => client.metadata?.role === 'admin',
        'admin-only',
        { secret: true },
    )

    assertEquals(count, 2)
    assertEquals(messages.get('admin1')?.length, 1)
    assertEquals(messages.get('admin2')?.length, 1)
    assertEquals(messages.has('user1'), false)

    channel.close()
})

// =============================================================================
// ChannelManager Tests
// =============================================================================

Deno.test('ChannelManager - should get or create channels', () => {
    const manager = new ChannelManager()
    const ch1 = manager.getOrCreate('manager-test-1')
    const ch2 = manager.getOrCreate('manager-test-1') // Same channel

    assertEquals(ch1, ch2)
    assertEquals(manager.has('manager-test-1'), true)
    assertEquals(manager.has('nonexistent'), false)

    manager.remove('manager-test-1')
})

Deno.test('ChannelManager - should list channel names', () => {
    const manager = new ChannelManager()
    manager.getOrCreate('list-test-a')
    manager.getOrCreate('list-test-b')

    const names = manager.channelNames
    assertEquals(names.includes('list-test-a'), true)
    assertEquals(names.includes('list-test-b'), true)

    manager.remove('list-test-a')
    manager.remove('list-test-b')
})

Deno.test('ChannelManager - should remove channels', () => {
    const manager = new ChannelManager()
    manager.getOrCreate('remove-test')
    assertEquals(manager.has('remove-test'), true)

    const removed = manager.remove('remove-test')
    assertEquals(removed, true)
    assertEquals(manager.has('remove-test'), false)

    // Removing again returns false
    assertEquals(manager.remove('remove-test'), false)
})

// =============================================================================
// sseHandler Tests
// =============================================================================

Deno.test('sseHandler - should return SSE response', () => {
    const channel = new SSEChannel('handler-test', { heartbeatInterval: 0 })

    const response = sseHandler(channel)

    assertEquals(response.status, 200)
    assertEquals(response.headers.get('Content-Type'), 'text/event-stream')
    assertEquals(response.headers.get('Cache-Control'), 'no-cache')

    channel.close()
})

// =============================================================================
// createSSEStream Tests
// =============================================================================

Deno.test('createSSEStream - should return SSE response', async () => {
    const response = createSSEStream((controller) => {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('event: test\ndata: {"value":1}\n\n'))
        controller.enqueue(encoder.encode('event: test\ndata: {"value":2}\n\n'))
        controller.close()
    })

    assertEquals(response.status, 200)
    assertEquals(response.headers.get('Content-Type'), 'text/event-stream')

    // Read the stream
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const events: string[] = []

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        events.push(decoder.decode(value))
    }

    assertEquals(events.length, 2)
    assertEquals(events[0].includes('event: test'), true)
    assertEquals(events[0].includes('data: {"value":1}'), true)
})

Deno.test('createCustomSSEHandler - should provide helpers', async () => {
    const response = createCustomSSEHandler(async ({ send, close }) => {
        await send('count', { value: 1 })
        await send('count', { value: 2 })
        close()
    })

    assertEquals(response.status, 200)
    assertEquals(response.headers.get('Content-Type'), 'text/event-stream')

    // Read the stream
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const events: string[] = []

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        events.push(decoder.decode(value))
    }

    assertEquals(events.length >= 1, true)
    assertEquals(events[0].includes('event: count'), true)
})
