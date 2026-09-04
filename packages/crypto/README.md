# @lockness/crypto

Application cryptography for Lockness — three facades keyed by `APP_KEY`:

- **`Crypt`** — authenticated symmetric encryption (AES-256-GCM, fresh HKDF salt
  per call, GCM-authenticated). `encrypt(data)` / `decrypt(token)`; a tampered
  token decrypts to `null`, never partial plaintext.
- **`Hash`** — password-grade one-way hash for arbitrary secrets
  (PBKDF2-SHA-256, ≥600k iterations, random per-hash salt, self-describing
  output). `make` / `check` / `needsRehash`. No `APP_KEY` pepper.
- **`sign` / `verify`** — HMAC-SHA-256 over a message, the primitive signed URLs
  are built on.

```ts
import { Crypt, Hash, sign, verify } from '@lockness/core'

const token = await Crypt.encrypt('secret data')
const plain = await Crypt.decrypt(token) // string | null

const stored = await Hash.make(apiKey)
const ok = await Hash.check(candidate, stored)

const sig = await sign('/verify?id=1')
const valid = await verify('/verify?id=1', sig)
```

## App key

All three read `APP_KEY` (form `base64:<32 random bytes>`) — generate one with
`nessy key:generate` (or `generateAppKey()`). In production a missing/invalid
key **fails closed**; in explicit development a per-process ephemeral key is
used (encrypted data / signed URLs then do not survive a restart). The `APP_KEY`
validator is single-homed in `@lockness/contract` (`resolveKeyMaterial`).
