# `@lockness/socialite` — agent brief

OAuth2 / OIDC social authentication — provider drivers, the redirect and
callback dance, and normalised user payloads. Standalone; it does not depend on
`@lockness/auth` and hands back a user shape for the app to persist.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/socialite` → `mod.ts`.

## Dependencies

- **Imports:** nothing — bottom of the dependency graph
- **Imported by:** nothing in this workspace. It is published for end users, so
  its public surface has no in-repo consumer to catch a break.

## Where to work

| Concern                       | Path     |
| ----------------------------- | -------- |
| Everything, including drivers | `mod.ts` |

## Pitfalls

- State and PKCE verification are security-critical. Do not relax them to make a
  provider work in local development.
- Provider user payloads differ in shape; normalisation happens here so callers
  never branch on provider identity.

_1 source files, 2 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
