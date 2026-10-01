# `@lockness/auth-provider` — agent brief

ORM-agnostic user providers for `@lockness/auth`. Each subdirectory is a
separate export path: `base/` holds the abstract classes carrying the shared
logic, `drizzle/` and `kysely/` bind them to a persistence layer. Nothing here
decides authentication policy — that is `@lockness/auth`'s job.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Invariants

- **The dependency contract above is binding.** Importing anything outside it
  fails `deno task deps:analyze`, and the failure is a design question, not a
  lint to silence.

- **A stored access-token hash verifies exactly while it is unexpired and not
  revoked.** `TokenProviderBase` owns that decision as a Template Method; a
  binding supplies only the five storage steps and must never override
  `createToken` / `verifyToken` / `deleteToken` / `deleteAllTokens`. If
  verification and revocation disagree, a revoked credential stays live. Expiry
  is compared in JS against one clock read, and a `null` or Invalid Date expiry
  denies.
- **A token's plaintext is never persisted.** Only its SHA-256 hash is stored;
  the plaintext exists in `createToken`'s returned `value` and nowhere else — a
  verified token carries `value: ''`, and no log line may include it. Break this
  and a database leak is a set of working credentials.
- **Verification fails closed on any error.** A storage step that throws makes
  `verifyToken` reject (the guard then denies with a 500), never resolve to a
  user; swallowing it into `null` hides an outage behind 401s. The one
  deliberate exception is the `lastUsedAt` write: it runs after the decision,
  and its failure is logged without denying.
- **Revocation is scoped by owner.** `deleteTokenRecord` deletes by token id
  _and_ user id; a binding that drops the user id lets any user revoke anyone's
  token. Only the live api-kit suite (`scripts/kit_token_flow_live_test.ts`)
  executes the Drizzle query that enforces it.

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                 |
| :--------------------------------------------- | :--------------------------------------- |
| Imports (static)                               | `auth` _(type-only)_                     |
| Imports (soft, via `tryImportOptionalPackage`) | —                                        |
| Imported by                                    | —                                        |
| **Must never import**                          | nothing — no package depends on this one |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind  | Exports                                                             |
| :---- | :------------------------------------------------------------------ |
| class | `BasicAuthProviderBase`, `SessionProviderBase`, `TokenProviderBase` |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                | Path           |
| ---------------------- | -------------- |
| Shared provider logic  | `base/*.ts`    |
| Drizzle-backed lookups | `drizzle/*.ts` |
| Kysely-backed lookups  | `kysely/*.ts`  |

## Pitfalls

- Each ORM directory is its own export specifier
  (`@lockness/auth-provider/drizzle`). Adding one means adding an entry to
  `deno.json`'s export map, not just a file.
- The `kysely/` directory exists while `@lockness/kysely` itself does not yet
  (see issue #26) — it targets the library directly.
- `DrizzleTokenProvider` reads the application's table through its property
  names (`id`, `userId`, `name`, `hash`, `expiresAt`, `lastUsedAt`,
  `createdAt`); `assertAccessTokensTable` refuses anything else at construction.
  The `db` handle is viewed through one `unknown` cast to the builder subset pg,
  mysql and sqlite share — mysql and sqlite are type-checked, never executed
  live.
- The token lifecycle is unit-tested through the in-memory binding in
  `tests/memory_token_provider.ts`; the Drizzle queries only run in the live
  suite (`deno task test:postgres`), which the local gate does not run.

## Tests

<!-- generated:tests -->

4 test files for 14 source files:

- `packages/auth-provider/tests/deny_paths.test.ts`
- `packages/auth-provider/tests/drizzle_multidialect.test.ts`
- `packages/auth-provider/tests/remember_preservation.test.ts`
- `packages/auth-provider/tests/token_provider_base.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno task gate             # the full gate, as the pre-push hook runs it
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 4 test files directly —

```bash
deno test -A packages/auth-provider/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
