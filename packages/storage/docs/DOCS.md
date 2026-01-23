# Lockness Storage

File storage abstraction with unified API for Local, AWS S3, and Cloudflare R2
drivers.

## Overview

@lockness/storage provides a consistent interface for file operations across
multiple storage backends. Features include stream support, signed URLs, and
comprehensive file management operations.

## Installation

```typescript
import { configureStorage, storage } from '@lockness/storage'
```

## Configuration

### Local Storage

```typescript
configureStorage({
    driver: 'local',
    root: './uploads',
    publicUrl: 'https://example.com/uploads', // Optional
})
```

### AWS S3

```typescript
configureStorage({
    driver: 's3',
    bucket: 'my-bucket',
    region: 'us-west-2',
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
    endpoint: 'https://s3.amazonaws.com', // Optional
    publicUrl: 'https://cdn.example.com', // Optional CDN URL
})
```

### Cloudflare R2

```typescript
configureStorage({
    driver: 'r2',
    bucket: 'my-bucket',
    accountId: 'your-account-id',
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY'),
    publicUrl: 'https://cdn.example.com', // Custom domain
})
```

## Basic Usage

### Upload Files

```typescript
// String content
await storage().put('file.txt', 'Hello, World!')

// Binary content
await storage().put('image.jpg', new Uint8Array([...]))

// Stream content (for large files)
const stream = file.stream()
await storage().put('video.mp4', stream)

// From File object
const file: File = body.file
await storage().putFile(`uploads/${file.name}`, file)
```

### Download Files

```typescript
// Get as text
const content = await storage().get('file.txt')

// Get as bytes
const bytes = await storage().getBytes('image.jpg')

// Get as stream
const stream = await storage().getStream('video.mp4')

// Get as Blob
const blob = await storage().download('file.pdf')
```

### File Operations

```typescript
// Check existence
const exists = await storage().exists('file.txt')

// Delete file
await storage().delete('old-file.txt')

// Copy file
await storage().copy('original.txt', 'backup.txt')

// Move file
await storage().move('temp.txt', 'final.txt')

// Get metadata
const meta = await storage().metadata('file.txt')
// { path, size, lastModified, contentType, etag }

// List files
const files = await storage().list('documents/')
for (const file of files) {
    console.log(file.path, file.size)
}
```

### URLs

```typescript
// Public URL
const url = storage().publicUrl('avatar.jpg')
// Returns: https://example.com/uploads/avatar.jpg

// Signed URL (S3/R2 only, expires in 1 hour)
const signedUrl = await storage().signedUrl('private/document.pdf', 3600)
```

## API Reference

### storage() Methods

- `put(path, content)` - Write file (string, bytes, or stream)
- `get(path)` - Read file as text
- `getBytes(path)` - Read file as bytes
- `getStream(path)` - Read file as stream
- `exists(path)` - Check if file exists
- `delete(path)` - Delete file
- `metadata(path)` - Get file metadata
- `list(prefix?)` - List files in directory
- `copy(source, destination)` - Copy file
- `move(source, destination)` - Move file
- `signedUrl(path, expiresIn?)` - Generate signed URL (S3/R2)
- `publicUrl(path)` - Get public URL
- `putFile(path, file)` - Upload from File object
- `download(path)` - Download as Blob

### Helper Functions

```typescript
import { deleteFile, exists, get, put } from '@lockness/storage'

await put('file.txt', 'content')
const content = await get('file.txt')
const fileExists = await exists('file.txt')
await deleteFile('file.txt')
```

## Common Use Cases

### File Upload Endpoint

```typescript
import { Controller, Post } from '@lockness/core'
import { storage } from '@lockness/storage'

@Controller('/upload')
export class UploadController {
    @Post('/')
    async upload(c: Context) {
        const body = await c.req.parseBody()
        const file = body.file as File

        if (!file) {
            return c.json({ error: 'No file provided' }, 400)
        }

        const filename = `${crypto.randomUUID()}-${file.name}`
        await storage().putFile(`uploads/${filename}`, file)

        return c.json({
            url: storage().publicUrl(`uploads/${filename}`),
        })
    }
}
```

### Image Processing Pipeline

```typescript
// Download from S3
const originalStream = await storage().getStream('uploads/original.jpg')

// Process (resize, compress, etc.)
const processed = await processImage(originalStream)

// Upload to different location
await storage().put('thumbnails/thumb.jpg', processed)
```

### Temporary File Sharing

```typescript
@Controller('/share')
export class ShareController {
    @Get('/:fileId')
    async share(c: Context) {
        const fileId = c.req.param('fileId')
        const filePath = `private/${fileId}`

        if (!(await storage().exists(filePath))) {
            return c.notFound()
        }

        // Generate signed URL valid for 15 minutes
        const url = await storage().signedUrl(filePath, 900)

        return c.redirect(url)
    }
}
```

### Backup System

```typescript
async function backupDatabase() {
    // Export database
    const dump = await exportDatabase()

    // Save to S3 with timestamp
    const timestamp = new Date().toISOString().split('T')[0]
    await storage().put(`backups/db-${timestamp}.sql`, dump)

    // Keep only last 7 days
    const files = await storage().list('backups/')
    const oldFiles = files
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
        .slice(7)

    for (const file of oldFiles) {
        await storage().delete(file.path)
    }
}
```

### Avatar Upload

```typescript
@Controller('/profile')
export class ProfileController {
    @Post('/avatar')
    @AuthRequired()
    async updateAvatar(c: Context) {
        const user = c.get('auth').user
        const body = await c.req.parseBody()
        const file = body.avatar as File

        if (!file || !file.type.startsWith('image/')) {
            return c.json({ error: 'Invalid image file' }, 400)
        }

        // Delete old avatar if exists
        if (user.avatar) {
            const oldPath = user.avatar.replace(storage().publicUrl(''), '')
            await storage().delete(oldPath)
        }

        // Upload new avatar
        const filename = `avatars/${user.id}-${Date.now()}.jpg`
        await storage().putFile(filename, file)

        // Update user
        await updateUser(user.id, {
            avatar: storage().publicUrl(filename),
        })

        return c.json({ avatar: storage().publicUrl(filename) })
    }
}
```

## Multiple Storage Instances

Use different storage for different purposes:

```typescript
import { Storage } from '@lockness/storage'

const localStorage = new Storage({
    driver: 'local',
    root: './uploads',
})

const s3Storage = new Storage({
    driver: 's3',
    bucket: 'backups',
    region: 'us-east-1',
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
})

// Use different storage for different purposes
await localStorage.put('temp.txt', 'temporary')
await s3Storage.put('backup.txt', 'permanent backup')
```

## Driver Comparison

| Feature         | Local           | S3                    | R2                     |
| --------------- | --------------- | --------------------- | ---------------------- |
| **Cost**        | Free            | Pay per GB + requests | Pay per GB (no egress) |
| **Speed**       | Very fast       | Network dependent     | Network dependent      |
| **Scalability** | Limited by disk | Unlimited             | Unlimited              |
| **Signed URLs** | ❌              | ✅                    | ✅                     |
| **Public URLs** | ✅ (custom)     | ✅                    | ✅ (custom domain)     |
| **Streaming**   | ✅              | ✅                    | ✅                     |

## Best Practices

### 1. Use Streams for Large Files

```typescript
// Good for files >10MB
const stream = file.stream()
await storage().put('large-video.mp4', stream)
```

### 2. Use Signed URLs for Private Files

```typescript
// Don't expose private files directly
const url = await storage().signedUrl('private/document.pdf', 3600)
```

### 3. Organize with Prefixes

```typescript
await storage().put('users/123/avatar.jpg', image)
await storage().put('documents/invoices/2024-01.pdf', pdf)
```

### 4. Clean Up Temporary Files

```typescript
try {
    const tempFile = 'temp/' + crypto.randomUUID()
    await storage().put(tempFile, data)
    // Process...
} finally {
    await storage().delete(tempFile)
}
```

### 5. Handle Errors Gracefully

```typescript
try {
    await storage().get('might-not-exist.txt')
} catch (error) {
    if (error instanceof Deno.errors.NotFound) {
        // File doesn't exist
    }
    throw error
}
```

### 6. Environment-Specific Configuration

```typescript
// Development
if (Deno.env.get('ENV') === 'development') {
    configureStorage({
        driver: 'local',
        root: './public/uploads',
        publicUrl: 'http://localhost:3000/uploads',
    })
} // Production with CDN
else {
    configureStorage({
        driver: 's3',
        bucket: 'assets',
        region: 'us-east-1',
        publicUrl: 'https://cdn.example.com',
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    })
}
```

## Testing

### Mock Storage Driver

For fast, hermetic unit tests:

```typescript
import { createMockStorage } from '@lockness/storage/tests/support/mock_driver.ts'

Deno.test('storage operations', async () => {
    const driver = createMockStorage()

    // All operations work in memory
    await driver.put('file.txt', 'content')
    assertEquals(await driver.get('file.txt'), 'content')

    // No cleanup needed - everything is in memory
})
```

**Benefits:**

- Tests run 10-100x faster (no disk I/O)
- No filesystem pollution
- Parallel-safe (no file conflicts)
- Hermetic (no side effects)

## Migration Guide

### From Local to S3

```typescript
const localStorage = new Storage({ driver: 'local', root: './uploads' })
const s3Storage = new Storage({
    driver: 's3',
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: '...',
    secretAccessKey: '...',
})

// Migrate existing files
const files = await localStorage.list()
for (const file of files) {
    const content = await localStorage.getBytes(file.path)
    await s3Storage.put(file.path, content)
}
```

## Environment Variables

```bash
# .env

# Storage Driver
STORAGE_DRIVER=s3

# Local
STORAGE_ROOT=./uploads
STORAGE_PUBLIC_URL=https://example.com/uploads

# AWS S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-west-2
AWS_BUCKET=my-bucket

# Cloudflare R2
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_ACCOUNT_ID=your-account-id
R2_BUCKET=my-bucket
R2_PUBLIC_URL=https://cdn.example.com
```
