# @lockness/mail

Expressive email sending library with multiple driver support.

## Features

- 🚀 Fluent API for building emails
- 🎨 Multiple drivers: SMTP, Resend, Console, Memory
- 📧 Full email features: CC, BCC, Reply-To, Attachments
- 🧪 Testing utilities with Memory driver
- 🎯 TypeScript support

## Installation

```typescript
import { configureMail, mail } from '@lockness/mail'
```

## Configuration

```typescript
configureMail({
    driver: 'console', // or 'smtp', 'resend', 'memory'
    from: { email: 'noreply@example.com', name: 'My App' },
    smtp: {
        host: 'smtp.example.com',
        port: 587,
        auth: {
            user: 'username',
            pass: 'password',
        },
    },
    resend: {
        apiKey: 'your-api-key',
    },
})
```

## Usage

### Simple Email

```typescript
await mail()
    .to('user@example.com')
    .subject('Welcome!')
    .html('<h1>Hello World!</h1>')
    .send()
```

### Full Example

```typescript
await mail()
    .from('sender@example.com', 'Sender Name')
    .to('recipient@example.com')
    .cc('cc@example.com')
    .bcc('bcc@example.com')
    .replyTo('reply@example.com')
    .subject('Test Email')
    .text('Plain text version')
    .html('<strong>HTML version</strong>')
    .attach('file.txt', 'File content')
    .send()
```

### With JSX

```typescript
await mail()
    .to('user@example.com')
    .subject('Welcome!')
    .view(<EmailTemplate name='John' />)
    .send()
```

## Drivers

### Console Driver (Development)

Prints emails to console instead of sending them.

```typescript
configureMail({ driver: 'console' })
```

### Memory Driver (Testing)

Stores emails in memory for testing.

```typescript
import { MemoryMailDriver } from '@lockness/mail'

configureMail({ driver: 'memory' })

// Send email
await mail().to('test@example.com').subject('Test').send()

// Get sent emails
const emails = MemoryMailDriver.getSentEmails()
const lastEmail = MemoryMailDriver.getLastEmail()

// Clear
MemoryMailDriver.clear()
```

### SMTP Driver

```typescript
configureMail({
    driver: 'smtp',
    smtp: {
        host: 'smtp.gmail.com',
        port: 587,
        auth: {
            user: 'your-email@gmail.com',
            pass: 'your-password',
        },
    },
})
```

### Resend Driver

```typescript
configureMail({
    driver: 'resend',
    resend: {
        apiKey: process.env.RESEND_API_KEY,
    },
})
```

## License

MIT
