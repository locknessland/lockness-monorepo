# `@lockness/crypto` — agent brief

Application cryptography keyed by `APP_KEY`: `Crypt` (AES-256-GCM), `Hash`
(PBKDF2), and HMAC `sign`/`verify`. Foundation-tier and pure WebCrypto — it
imports only `@lockness/contract` (for the single-home key validator and
base64).

## Invariants

- **The dependency contract below is binding.** Importing anything outside it
  fails `deno task deps:analyze`.
- **The `APP_KEY` validator is NOT here.** It is single-homed in
  `@lockness/contract` (`resolveKeyMaterial`); this package reads `APP_KEY`
  through it and applies the fail-closed production rule (`resolveAppKey`).
  Never re-implement the validation.
- **Fail closed.** The per-process ephemeral key is used **only** on an explicit
  development signal (`isExplicitlyDevelopment()`); an unset/ambiguous env
  resolves to production and a missing/invalid key throws.
- **HKDF `info` labels are domain-separated.** `Crypt` and `sign` derive with
  distinct `info` (registry in `key.ts`), none equal to the session cookie's
  `lockness/session/cookie/v1`. A collision reuses one derived value across
  purposes.
- **`Crypt` is authenticated and fails closed.** AES-256-GCM with a fresh
  per-call HKDF salt + random IV, version prefix as GCM AAD; `decrypt` returns
  `null` on any tamper/wrong-key/malformed input — never partial plaintext.
- **`Hash` has no `APP_KEY` pepper.** Random per-hash salt, self-describing
  output; a key-derived pepper would make rotation a data-loss migration.

## Dependency contract

<!-- generated:deps -->
<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->
<!-- /generated:surface -->

## Where to work

- `crypt.ts` — `Crypt.encrypt`/`decrypt`.
- `hash.ts` — `Hash.make`/`check`/`needsRehash`.
- `sign.ts` — `sign`/`verify`.
- `key.ts` — `resolveAppKey` (fail-closed), the `HKDF_INFO` label registry.
- `mod.ts` — the package barrel; re-exports the contract key helpers.

## Pitfalls

- Do not add a second `APP_KEY` validator — delegate to `@lockness/contract`.
- Do not force the ad-hoc SHA-256 sites (`redis`/`socialite`/`auth-provider`)
  onto `Hash` — they are coincidental similarity, not password hashing.
- `@lockness/auth`'s `password.ts` and `@lockness/session`'s `cookie_seal.ts`
  converge onto this package in follow-ups; until then, do not duplicate their
  logic here beyond what the facades need.
