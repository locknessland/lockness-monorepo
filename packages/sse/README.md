# @lockness/sse

Server-Sent Events (SSE) for Lockness - Real-time server-to-client
communication.

## Installation

```bash
deno task cli package:install sse
```

## Quick Start

### Simple Streaming

For single-client streaming scenarios (progress updates, log streaming):

```typescript
import { createCustomSSEHandler } from '@lockness/sse'
import { Controller, Get } from '@lockness/contract'

@Controller('/api')
export class StreamController {
    @Get('/progress')
    async progress() {
        return createCustomSSEHandler(async ({ send, close }) => {
            for (let i = 0; i <= 100; i += 10) {
                await send('progress', { percent: i })
                await new Promise((r) => setTimeout(r, 500))
            }
            await send('complete', { message: 'Done!' })
            close()
        })
    }
}
```

**Client-side:**

```javascript
const source = new EventSource('/api/progress')

source.addEventListener('progress', (e) => {
    const { percent } = JSON.parse(e.data)
    console.log(`Progress: ${percent}%`)
})

source.addEventListener('complete', (e) => {
    console.log('Complete!')
    source.close()
})
```

### Broadcasting with Channels

For multi-client broadcasting (notifications, chat, live updates):

```typescript
import { SSEChannel, sseHandler } from '@lockness/sse'
import { type Context, Controller, Get, Post } from '@lockness/contract'

// Create a channel
const notifications = new SSEChannel('notifications')

@Controller('/api')
export class NotificationController {
    // SSE endpoint - clients connect here
    @Get('/notifications/stream')
    stream(c: Context) {
        const userId = c.get('user')?.id

        return sseHandler(notifications, {
            metadata: { userId },
            onConnect: (client) => {
                console.log(`Client ${client.id} connected`)
            },
            onDisconnect: (client) => {
                console.log(`Client ${client.id} disconnected`)
            },
        })
    }

    // Broadcast endpoint - trigger notifications
    @Post('/notifications/send')
    async send(c: Context) {
        const { message, type } = await c.req.json()

        const count = notifications.broadcast('notification', {
            type,
            message,
            timestamp: new Date().toISOString(),
        })

        return c.json({ sent: count })
    }
}
```

**Client-side:**

```javascript
const source = new EventSource('/api/notifications/stream')

source.addEventListener('notification', (e) => {
    const notification = JSON.parse(e.data)
    showNotification(notification)
})

source.onerror = () => {
    console.log('Connection lost, reconnecting...')
}
```

## API Reference

### SSEChannel

Manages connected clients and message broadcasting.

```typescript
const channel = new SSEChannel('chat', {
    heartbeatInterval: 30000, // Keep-alive ping (default: 30s)
    maxClients: 1000, // Max concurrent connections
    headers: { // Custom response headers
        'X-Custom-Header': 'value',
    },
})

// Properties
channel.name // Channel name
channel.clientCount // Number of connected clients
channel.clientIds // Array of client IDs

// Methods
channel.broadcast(event, data) // Send to all clients
channel.send(clientId, event, data) // Send to specific client
channel.broadcastTo(filter, event, data) // Send to filtered clients
channel.hasClient(clientId) // Check if client exists
channel.getClient(clientId) // Get client info
channel.close() // Close all connections
```

### sseHandler

Creates an SSE response for a channel.

```typescript
return sseHandler(channel, {
    clientId: 'custom-id', // Optional custom ID
    metadata: { userId: 123 }, // Client metadata
    headers: { 'X-Custom': 'value' }, // Additional headers
    onConnect: (client) => {}, // Connection callback
    onDisconnect: (client) => {}, // Disconnection callback
})
```

### ChannelManager

Manages multiple channels centrally.

```typescript
import { ChannelManager } from '@lockness/sse'

const manager = new ChannelManager()

// Get or create channel
const chat = manager.getOrCreate('chat')
const notifications = manager.getOrCreate('notifications')

// Channel access
manager.get('chat') // Get existing or undefined
manager.has('chat') // Check existence
manager.channelNames // ['chat', 'notifications']
manager.totalClients // Total clients across all channels

// Broadcast to all channels
manager.broadcastAll('system', { status: 'maintenance' })

// Cleanup
manager.remove('chat') // Close and remove channel
manager.removeEmpty() // Remove empty channels
manager.closeAll() // Close all channels

// Stats
const stats = manager.getStats()
// { channels: 2, totalClients: 50, channelStats: [...] }
```

### createSSEStream

Low-level streaming with direct controller access.

```typescript
import { createSSEStream } from '@lockness/sse'

return createSSEStream(async (controller) => {
    const encoder = new TextEncoder()
    controller.enqueue(encoder.encode('event: ping\ndata: hello\n\n'))
    controller.close()
})
```

### createCustomSSEHandler

High-level streaming with helper functions.

```typescript
import { createCustomSSEHandler } from '@lockness/sse'

return createCustomSSEHandler(async ({ send, sendRaw, close }) => {
    await send('event-name', { any: 'data' })
    await sendRaw('data: raw message\n\n')
    close() // Optional - closes when handler returns
})
```

## Advanced Examples

### Filtered Broadcasting

Send to specific users:

```typescript
// Broadcast only to admins
channel.broadcastTo(
    (client) => client.metadata?.role === 'admin',
    'admin-alert',
    { message: 'New user registered' },
)

// Broadcast to specific user
channel.broadcastTo(
    (client) => client.metadata?.userId === targetUserId,
    'private',
    { message: 'Personal notification' },
)
```

### Room-based Chat

```typescript
const chatRooms = new Map<string, SSEChannel>()

function getRoom(roomId: string): SSEChannel {
    if (!chatRooms.has(roomId)) {
        chatRooms.set(roomId, new SSEChannel(`room:${roomId}`))
    }
    return chatRooms.get(roomId)!
}

@Controller('/chat')
export class ChatController {
    @Get('/rooms/:roomId/stream')
    join(c: Context) {
        const roomId = c.req.param('roomId')
        const userId = c.get('user').id

        return sseHandler(getRoom(roomId), {
            metadata: { userId },
        })
    }

    @Post('/rooms/:roomId/message')
    async message(c: Context) {
        const roomId = c.req.param('roomId')
        const { text } = await c.req.json()
        const user = c.get('user')

        getRoom(roomId).broadcast('message', {
            userId: user.id,
            userName: user.name,
            text,
            timestamp: Date.now(),
        })

        return c.json({ ok: true })
    }
}
```

### Live Dashboard Updates

```typescript
import { ChannelManager } from '@lockness/sse'

const manager = new ChannelManager()

// Anywhere in your app - broadcast stats updates
setInterval(() => {
    manager.broadcastAll('stats', {
        activeUsers: getActiveUserCount(),
        requestsPerSecond: getRequestRate(),
        cpuUsage: getCpuUsage(),
    })
}, 5000)
```

## Browser Compatibility

SSE is supported in all modern browsers. For older browsers, use a polyfill like
[event-source-polyfill](https://www.npmjs.com/package/event-source-polyfill).

**Automatic Reconnection:** Browsers automatically reconnect on connection loss.
Use the `retry` field to control reconnection timing:

```typescript
channel.broadcastEvent({
    event: 'update',
    data: { ... },
    retry: 5000  // Reconnect after 5s on failure
})
```

## License

MIT
