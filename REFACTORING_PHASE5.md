# Phase 5 Refactoring: @lockness/storage

**Date**: 2025-01-XX\
**Status**: ✅ **COMPLETE**

## Overview

Extracted file storage functionality into a standalone `@lockness/storage`
package with support for Local filesystem, AWS S3, and Cloudflare R2.

## Motivation

- **Reusability**: Storage abstraction useful for any Deno application
- **Multi-driver support**: Unified API across Local, S3, and R2
- **Stream support**: Efficient handling of large files
- **Signed URLs**: Temporary access to private files (S3/R2)
- **Framework independence**: Zero Lockness dependencies

## Package Details

### Location

- **Path**: `lockness/storage/`
- **Entry point**: `storage.ts`
- **Tests**: `tests/storage.test.ts`
- **Test count**: 26 tests
- **Line count**: ~609 lines

### Dependencies

- `@aws-sdk/client-s3@^3.709.0` - AWS S3 operations
- `@aws-sdk/s3-request-presigner@^3.709.0` - Signed URL generation
- `@std/path` - Path utilities
- `@std/fs` - File system operations

## Implementation

### Core Components

#### 1. **StorageDriver Interface**

Defines unified API for all drivers:

```typescript
interface StorageDriver {
    put(
        path: string,
        content: string | Uint8Array | ReadableStream,
    ): Promise<void>
    get(path: string): Promise<string>
    getBytes(path: string): Promise<Uint8Array>
    getStream(path: string): Promise<ReadableStream>
    exists(path: string): Promise<boolean>
    delete(path: string): Promise<void>
    metadata(path: string): Promise<FileMetadata>
    list(prefix?: string): Promise<FileMetadata[]>
    copy(source: string, destination: string): Promise<void>
    move(source: string, destination: string): Promise<void>
    signedUrl(path: string, expiresIn?: number): Promise<string>
    publicUrl(path: string): string
}
```

#### 2. **LocalStorageDriver**

- Stores files on local filesystem
- Uses `@std/fs` for file operations
- Supports nested directories
- Stream support with `Deno.open()`
- No signed URLs (throws error)

#### 3. **S3StorageDriver**

- AWS S3 integration via AWS SDK v3
- Supports all S3-compatible services
- Signed URL generation with expiration
- Configurable endpoint for custom S3
- Stream upload/download support

#### 4. **R2StorageDriver**

- Cloudflare R2 (extends S3StorageDriver)
- S3-compatible API
- Custom R2 endpoint configuration
- R2-specific public URL format

#### 5. **Storage Manager**

- Facade for driver operations
- Factory pattern for driver selection
- Additional helpers: `putFile()`, `download()`

#### 6. **Helper Functions**

- `configureStorage()` - Set up global instance
- `storage()` - Get global instance
- Note: Helpers `put()`, `get()`, `exists()`, `deleteFile()` NOT exported from
  lockness core (conflict with cache helpers)

### Configuration

#### Local Storage

```typescript
{
    driver: 'local',
    root: './uploads',              // Required: Base directory
    publicUrl?: 'https://...',      // Optional: Public URL prefix
}
```

#### S3 Storage

```typescript
{
    driver: 's3',
    bucket: 'my-bucket',            // Required: S3 bucket name
    region: 'us-east-1',            // Required: AWS region
    accessKeyId: '...',             // Required: AWS access key
    secretAccessKey: '...',         // Required: AWS secret key
    endpoint?: 'https://...',       // Optional: Custom S3 endpoint
    publicUrl?: 'https://...',      // Optional: CDN URL
}
```

#### R2 Storage

```typescript
{
    driver: 'r2',
    bucket: 'my-bucket',            // Required: R2 bucket name
    accountId: 'account123',        // Required: Cloudflare account ID
    accessKeyId: '...',             // Required: R2 access key
    secretAccessKey: '...',         // Required: R2 secret key
    endpoint?: 'https://...',       // Optional: Custom endpoint
    publicUrl?: 'https://...',      // Optional: Custom domain
}
```

## Usage Examples

### Basic Usage

```typescript
import { configureStorage, storage } from '@lockness/storage'

// Configure once
configureStorage({
    driver: 'local',
    root: './uploads',
})

// Use globally
await storage().put('avatar.jpg', imageBytes)
const url = storage().publicUrl('avatar.jpg')
```

### File Upload (Hono)

```typescript
app.post('/upload', async (c) => {
    const body = await c.req.parseBody()
    const file = body.file as File

    const filename = `${crypto.randomUUID()}-${file.name}`
    await storage().putFile(`uploads/${filename}`, file)

    return c.json({
        url: storage().publicUrl(`uploads/${filename}`),
    })
})
```

### Signed URLs

```typescript
// Generate temporary download link (S3/R2 only)
const url = await storage().signedUrl('private/document.pdf', 3600)
// Valid for 1 hour

return c.json({ downloadUrl: url })
```

### Stream Processing

```typescript
// Download large file as stream
const stream = await storage().getStream('large-video.mp4')

// Process stream
const processed = await processVideo(stream)

// Upload result
await storage().put('processed/video.mp4', processed)
```

### Multiple Storage Instances

```typescript
const localStorage = new Storage({ driver: 'local', root: './temp' })
const s3Storage = new Storage({ driver: 's3', ... })

await localStorage.put('temp.txt', 'temporary')
await s3Storage.put('backup.txt', 'permanent')
```

## Integration

### Workspace Configuration

Added to `deno.json`:

```json
{
    "workspace": [
        "...",
        "./lockness/storage"
    ],
    "imports": {
        "@lockness/storage": "./lockness/storage/storage.ts"
    }
}
```

### Core Re-export

Modified `lockness/core/core.ts`:

```typescript
// Selective export to avoid conflicts with cache helpers
export {
    configureStorage,
    type FileMetadata,
    LocalStorageDriver,
    R2StorageDriver,
    S3StorageDriver,
    Storage,
    storage,
    type StorageConfig,
    type StorageDriver,
} from '@lockness/storage'
```

**Note**: Helper functions `put()`, `get()`, `exists()` from storage NOT
exported to avoid conflicts with cache helpers. Users should:

- Use `storage().put()` directly
- Or import from `@lockness/storage` explicitly

## Testing

### Test Coverage

- 26 tests covering all operations
- All tests passing ✅

### Test Categories

1. **Local Driver** (11 tests)
   - Text/binary/stream operations
   - CRUD operations
   - Directory listing
   - Copy/move operations
   - Public URL generation
   - Nested directories

2. **S3 Driver** (3 tests)
   - Initialization validation
   - Public URL formats
   - Custom endpoint support

3. **R2 Driver** (2 tests)
   - Initialization validation
   - R2-specific URL format

4. **Storage Manager** (5 tests)
   - Driver integration
   - File upload/download
   - Blob handling
   - Error handling

5. **Global Storage** (2 tests)
   - Configuration
   - Helper functions

6. **Integration** (3 tests)
   - Stream operations
   - CRUD workflow
   - Copy/move operations

### Running Tests

```bash
# Storage tests only
cd lockness/storage
deno task test

# All project tests
deno task test
```

**Result**: 660 total tests passing (1727 steps) 🎉

## Benefits

### For Lockness

1. **File uploads**: Native file storage support
2. **Cloud storage**: S3/R2 integration for scalability
3. **Development**: Local storage for development, cloud for production
4. **Flexibility**: Switch drivers without code changes

### For External Use

1. **Standalone package**: Can be used in any Deno project
2. **Multi-cloud**: S3, R2, or local storage with same API
3. **TypeScript**: Full type safety
4. **Stream support**: Efficient large file handling
5. **Signed URLs**: Secure temporary access
6. **Well-documented**: Comprehensive README

## Driver Comparison

| Feature         | Local           | S3                    | R2                     |
| --------------- | --------------- | --------------------- | ---------------------- |
| **Cost**        | Free            | Pay per GB + requests | Pay per GB (no egress) |
| **Speed**       | Very fast       | Network dependent     | Network dependent      |
| **Scalability** | Limited by disk | Unlimited             | Unlimited              |
| **Signed URLs** | ❌              | ✅                    | ✅                     |
| **Public URLs** | ✅ (custom)     | ✅                    | ✅ (custom domain)     |
| **Streaming**   | ✅              | ✅                    | ✅                     |

## Use Cases

1. **File Uploads**
   - User avatars
   - Document management
   - Media uploads

2. **Content Delivery**
   - Static assets
   - CDN integration
   - Public files

3. **Temporary Files**
   - Processing pipelines
   - Export generation
   - Cache files

4. **Backups**
   - Database dumps
   - Application backups
   - Log archival

5. **Private Files**
   - User documents
   - Signed URL access
   - Time-limited downloads

## API Surface

### Classes

- `Storage` - Main storage manager
- `LocalStorageDriver` - Local filesystem driver
- `S3StorageDriver` - AWS S3 driver
- `R2StorageDriver` - Cloudflare R2 driver

### Interfaces

- `StorageDriver` - Driver interface
- `StorageConfig` - Configuration options
- `FileMetadata` - File information

### Functions

- `configureStorage()` - Configure global storage
- `storage()` - Get global instance

### Helper Functions (not in lockness core)

- `put()` - Quick file write
- `get()` - Quick file read
- `deleteFile()` - Quick file delete
- `exists()` - Quick existence check

## Future Enhancements

Possible additions:

1. **Additional drivers**
   - Google Cloud Storage
   - Azure Blob Storage
   - Backblaze B2

2. **Advanced features**
   - Multipart upload
   - Compression support
   - Image manipulation
   - Automatic retry

3. **Performance**
   - Connection pooling
   - Request batching
   - Caching layer

4. **Security**
   - Encryption at rest
   - Access control
   - Virus scanning

## Migration Notes

No migration needed - this is a new package. To start using:

1. **Configure storage**:

```typescript
import { configureStorage } from 'lockness'

configureStorage({
    driver: 'local',
    root: './uploads',
})
```

2. **Use in controllers**:

```typescript
import { storage } from 'lockness'

await storage().put('file.txt', content)
```

3. **Or import directly**:

```typescript
import { get, put, storage } from '@lockness/storage'

await put('file.txt', 'content')
const content = await get('file.txt')
```

## Project Statistics

### Before Phase 5

- 6 standalone libs
- 3,126 lines of lib code
- 106 lib tests
- 634 total tests

### After Phase 5

- **7 standalone libs** (+1)
- **3,735 lines of lib code** (+609)
- **132 lib tests** (+26)
- **660 total tests** (+26)

## Conclusion

Phase 5 successfully extracted storage functionality into `@lockness/storage`,
providing:

- ✅ Multi-driver file storage (Local, S3, R2)
- ✅ Unified API with stream support
- ✅ Signed URL generation (S3/R2)
- ✅ Zero dependencies on Lockness
- ✅ 26 comprehensive tests
- ✅ Production-ready documentation

The storage package is framework-agnostic and can be published to JSR as a
standalone utility.

## Next Steps

Potential Phase 6 options:

1. **@lockness/events** (~200 lines) - Event emitter system
2. **@lockness/logger** (~300 lines) - Structured logging
3. **Conclude extraction project** - 7 libs is substantial
