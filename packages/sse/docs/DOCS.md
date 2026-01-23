# Lockness SSE

Server-Sent Events (SSE) for real-time server-to-client communication with
broadcasting and channel management.

## Overview

@lockness/sse provides Server-Sent Events implementation for Lockness with
support for simple streaming, multi-client broadcasting, channel management, and
filtered messaging. Perfect for real-time notifications, progress updates, live
dashboards, and chat systems.

## Installation

```bash
deno task cli package:install sse
```

```typescript
import { createCustomSSEHandler, SSEChannel, sseHandler } from '@lockness/sse'
```

## Simple Streaming

For single-client scenarios (progress updates, log streaming):

```typescript
import { createCustomSSEHandler } from '@lockness/sse'
import { Controller, Get } from '@lockness/core'

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

## Broadcasting with Channels

For multi-client broadcasting (notifications, chat, live updates):

```typescript
import { SSEChannel, sseHandler } from '@lockness/sse'
import { type Context, Controller, Get, Post } from '@lockness/core'

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

## Common Use Cases

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
            metadata: { userId, roomId },
            onConnect: (client) => {
                // Broadcast user joined
                getRoom(roomId).broadcastTo(
                    (c) => c.id !== client.id,
                    'user-joined',
                    { userId },
                )
            },
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
const dashboardChannel = manager.getOrCreate('dashboard')

// Update all connected dashboards periodically
setInterval(() => {
    dashboardChannel.broadcast('stats', {
        activeUsers: getActiveUserCount(),
        requestsPerSecond: getRequestRate(),
        cpuUsage: getCpuUsage(),
        memoryUsage: getMemoryUsage(),
    })
}, 5000)

@Controller('/dashboard')
export class DashboardController {
    @Get('/stream')
    stream(c: Context) {
        return sseHandler(dashboardChannel, {
            onConnect: async (client) => {
                // Send initial data
                await dashboardChannel.send(client.id, 'initial', {
                    stats: await getCurrentStats(),
                })
            },
        })
    }
}
```

### Progress Tracking

```typescript
@Controller('/api')
export class TaskController {
    @Post('/tasks')
    async createTask(c: Context) {
        const taskId = crypto.randomUUID()
        const { data } = await c.req.json()

        // Start background processing
        processTask(taskId, data)

        return c.json({ taskId })
    }

    @Get('/tasks/:taskId/progress')
    async trackProgress(c: Context) {
        const taskId = c.req.param('taskId')

        return createCustomSSEHandler(async ({ send, close }) => {
            const unsubscribe = subscribeToTaskProgress(
                taskId,
                async (progress) => {
                    await send('progress', {
                        percent: progress.percent,
                        status: progress.status,
                    })

                    if (progress.completed) {
                        await send('complete', { result: progress.result })
                        close()
                        unsubscribe()
                    }
                },
            )
        })
    }
}
```

### Real-time Notifications

```typescript
const notificationChannels = new Map<number, SSEChannel>()

function getUserChannel(userId: number): SSEChannel {
    if (!notificationChannels.has(userId)) {
        notificationChannels.set(userId, new SSEChannel(`user:${userId}`))
    }
    return notificationChannels.get(userId)!
}

@Controller('/notifications')
export class NotificationController {
    @Get('/stream')
    @AuthRequired()
    stream(c: Context) {
        const userId = c.get('auth').user.id
        const channel = getUserChannel(userId)

        return sseHandler(channel, {
            metadata: { userId },
        })
    }
}

// Send notification from anywhere in your app
export async function notifyUser(userId: number, notification: Notification) {
    const channel = getUserChannel(userId)

    channel.broadcast('notification', {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        timestamp: new Date().toISOString(),
    })
}
```

### Log Streaming

```typescript
@Controller('/admin')
export class AdminController {
    @Get('/logs/stream')
    @AuthRequired()
    async streamLogs(c: Context) {
        const user = c.get('auth').user

        if (user.role !== 'admin') {
            return c.text('Forbidden', 403)
        }

        return createCustomSSEHandler(async ({ send, close }) => {
            const logWatcher = await watchLogFile('/var/log/app.log')

            for await (const line of logWatcher) {
                await send('log', { line, timestamp: Date.now() })
            }
        })
    }
}
```

## Best Practices

- Use channels for multi-client broadcasting scenarios
- Use createCustomSSEHandler for single-client streaming
- Set reasonable heartbeatInterval (30s default) for keep-alive
- Close connections properly to avoid memory leaks
- Use metadata to store user/connection info
- Implement onDisconnect to cleanup resources
- Use filtered broadcasting for targeted messages
- Monitor channel.clientCount to track connections
- Use ChannelManager for managing multiple channels
- Implement reconnection logic on client side
- Add error handling for network issues
- Use compression for large messages
- Consider rate limiting for broadcast endpoints
- Clean up empty channels periodically

## Browser Compatibility

SSE is supported in all modern browsers. For older browsers, use a polyfill like
[event-source-polyfill](https://www.npmjs.com/package/event-source-polyfill).

**Automatic Reconnection:** Browsers automatically reconnect on connection loss.
Control reconnection timing:

```typescript
channel.broadcast('update', {
    data: { ... },
    retry: 5000  // Reconnect after 5s on failure
})
```

## Testing

```typescript
import { SSEChannel } from '@lockness/sse'

Deno.test('SSE channel broadcasting', async () => {
    const channel = new SSEChannel('test')

    let received = false

    // Mock client connection would be tested with integration test
    // Unit test the channel methods
    assertEquals(channel.clientCount, 0)
    assertEquals(channel.name, 'test')

    channel.close()
})
```
