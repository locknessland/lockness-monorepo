# `@lockness/validator` — agent brief

Validation with custom rules, async validators, sanitisers and a Zod decorator
bridge. Two source files, eight test files — the best-covered package here.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

Single entry point `@lockness/validator` → `mod.ts`.

## Dependencies

- **Imports:** `@lockness/hono`
- **Imported by:** no other package — it is consumed directly by applications
  (the demo app under `app/` uses it).

## Where to work

| Concern                               | Path               |
| ------------------------------------- | ------------------ |
| Rules, sanitisers, the validator core | `mod.ts`           |
| Zod schema decorator                  | `zod_decorator.ts` |

## Pitfalls

- Async validators change the return type. A rule added as sync and later made
  async silently changes every caller's signature.
- Sanitisers mutate the value before rules run. Ordering between the two is part
  of the contract, not an implementation detail.

_2 source files, 8 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
