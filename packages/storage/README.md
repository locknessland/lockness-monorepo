# @lockness/storage

File storage abstraction for Lockness with support for multiple drivers (Local,
AWS S3, Cloudflare R2).

## Features

- 🔌 **Multiple Drivers**: Local filesystem, AWS S3, and Cloudflare R2
- 📁 **Unified API**: Same interface across all storage backends
- 🌊 **Stream Support**: Handle large files efficiently with streams
- 🔗 **Signed URLs**: Generate temporary download/upload URLs (S3/R2)
- 📦 **TypeScript**: Fully typed API with comprehensive interfaces
- 🧪 **Well-tested**: 26 tests covering all operations

## Installation

```typescript
import { configureStorage, Storage } from '@lockness/storage'
// or from main package
import { configureStorage, Storage } from 'lockness/core'
```

## Quick Start

### Local Storage

```typescript
import { configureStorage, storage } from '@lockness/storage'

// Configure once
configureStorage({
    driver: 'local',
    root: './uploads',
    publicUrl: 'https://example.com/uploads', // Optional
})

// Use globally
await storage().put('avatar.jpg', imageBytes)
const url = storage().publicUrl('avatar.jpg')
```

### AWS S3

```typescript
configureStorage({
    driver: 's3',
    bucket: 'my-bucket',
    region: 'us-west-2',
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
})

// Upload file
await storage().put('documents/report.pdf', pdfBytes)

// Get signed URL (valid for 1 hour)
const signedUrl = await storage().signedUrl('documents/report.pdf', 3600)
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

## API Reference

### Storage Manager

#### put(path, content)

Write a file.

```typescript
// String content
await storage().put('file.txt', 'Hello, World!')

// Binary content
await storage().put('image.jpg', new Uint8Array([...]))

// Stream content (for large files)
const stream = file.stream()
await storage().put('video.mp4', stream)
```

#### get(path)

Read a file as text.

```typescript
const content = await storage().get('file.txt')
console.log(content) // "Hello, World!"
```

#### getBytes(path)

Read a file as bytes.

```typescript
const bytes = await storage().getBytes('image.jpg')
console.log(bytes) // Uint8Array
```

#### getStream(path)

Read a file as stream.

```typescript
const stream = await storage().getStream('video.mp4')
// Process stream...
```

#### exists(path)

Check if a file exists.

```typescript
const exists = await storage().exists('file.txt')
console.log(exists) // true or false
```

#### delete(path)

Delete a file.

```typescript
await storage().delete('old-file.txt')
```

#### metadata(path)

Get file metadata.

```typescript
const meta = await storage().metadata('file.txt')
console.log(meta)
// {
//   path: 'file.txt',
//   size: 1024,
//   lastModified: Date,
//   contentType: 'text/plain',
//   etag: '"abc123"'
// }
```

#### list(prefix?)

List files in a directory.

```typescript
const files = await storage().list('documents/')
for (const file of files) {
    console.log(file.path, file.size)
}
```

#### copy(source, destination)

Copy a file.

```typescript
await storage().copy('original.txt', 'backup.txt')
```

#### move(source, destination)

Move a file.

```typescript
await storage().move('temp.txt', 'final.txt')
```

#### signedUrl(path, expiresIn?)

Generate a temporary signed URL (S3/R2 only).

```typescript
// Expires in 1 hour (default: 3600 seconds)
const url = await storage().signedUrl('private/document.pdf', 3600)

// Share with users for temporary access
return c.json({ downloadUrl: url })
```

#### publicUrl(path)

Get public URL for a file.

```typescript
const url = storage().publicUrl('avatar.jpg')
// Returns: https://example.com/uploads/avatar.jpg
```

#### putFile(path, file)

Upload a file from a File object.

```typescript
// In a Hono controller
app.post('/upload', async (c) => {
    const body = await c.req.parseBody()
    const file = body.file as File

    await storage().putFile(`uploads/${file.name}`, file)

    return c.json({ url: storage().publicUrl(`uploads/${file.name}`) })
})
```

#### download(path)

Download a file as Blob.

```typescript
const blob = await storage().download('file.pdf')
const arrayBuffer = await blob.arrayBuffer()
```

### Helper Functions

```typescript
import { deleteFile, exists, get, put } from '@lockness/storage'

// Quick operations without calling storage()
await put('file.txt', 'content')
const content = await get('file.txt')
const fileExists = await exists('file.txt')
await deleteFile('file.txt')
```

### Direct Driver Usage

If you need multiple storage instances:

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

## Configuration

### Local Driver

```typescript
{
    driver: 'local',
    root: './storage',           // Required: Base directory
    publicUrl?: 'https://...',   // Optional: Public URL prefix
}
```

### S3 Driver

```typescript
{
    driver: 's3',
    bucket: 'my-bucket',         // Required: S3 bucket name
    region: 'us-east-1',         // Required: AWS region
    accessKeyId: '...',          // Required: AWS access key
    secretAccessKey: '...',      // Required: AWS secret key
    endpoint?: 'https://...',    // Optional: Custom S3 endpoint
    publicUrl?: 'https://...',   // Optional: Custom public URL (CDN)
}
```

### R2 Driver

```typescript
{
    driver: 'r2',
    bucket: 'my-bucket',         // Required: R2 bucket name
    accountId: 'account123',     // Required: Cloudflare account ID
    accessKeyId: '...',          // Required: R2 access key
    secretAccessKey: '...',      // Required: R2 secret key
    endpoint?: 'https://...',    // Optional: Custom endpoint
    publicUrl?: 'https://...',   // Optional: Custom domain
}
```

## Use Cases

### File Uploads

```typescript
import { Hono } from 'hono'
import { storage } from '@lockness/storage'

const app = new Hono()

app.post('/upload', async (c) => {
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
})
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
app.get('/share/:fileId', async (c) => {
    const fileId = c.req.param('fileId')
    const filePath = `private/${fileId}`

    if (!(await storage().exists(filePath))) {
        return c.notFound()
    }

    // Generate signed URL valid for 15 minutes
    const url = await storage().signedUrl(filePath, 900)

    return c.redirect(url)
})
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

### Static Asset Management

```typescript
// Local development
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
        publicUrl: 'https://cdn.example.com', // CloudFront
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    })
}
```

## Testing

Run the test suite:

```bash
cd lockness/storage
deno task test
```

## Best Practices

1. **Use streams for large files** (>10MB)
   ```typescript
   const stream = file.stream()
   await storage().put('large-video.mp4', stream)
   ```

2. **Set up proper CORS for S3/R2**
   - Configure bucket CORS settings
   - Allow necessary origins and methods

3. **Use signed URLs for private files**
   ```typescript
   // Don't expose private files directly
   const url = await storage().signedUrl('private/document.pdf', 3600)
   ```

4. **Organize with prefixes**
   ```typescript
   await storage().put('users/123/avatar.jpg', image)
   await storage().put('documents/invoices/2024-01.pdf', pdf)
   ```

5. **Clean up temporary files**
   ```typescript
   try {
       const tempFile = 'temp/' + crypto.randomUUID()
       await storage().put(tempFile, data)
       // Process...
   } finally {
       await storage().delete(tempFile)
   }
   ```

6. **Handle errors gracefully**
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

## Migration Guide

### From filesystem to S3

1. Update configuration:
   ```typescript
   // Old
   configureStorage({ driver: 'local', root: './uploads' })

   // New
   configureStorage({
       driver: 's3',
       bucket: 'my-bucket',
       region: 'us-east-1',
       accessKeyId: '...',
       secretAccessKey: '...',
   })
   ```

2. Migrate existing files:
   ```typescript
   const localStorage = new Storage({ driver: 'local', root: './uploads' })
   const s3Storage = new Storage({ driver: 's3', ... })

   const files = await localStorage.list()
   for (const file of files) {
       const content = await localStorage.getBytes(file.path)
       await s3Storage.put(file.path, content)
   }
   ```

## License

MIT
