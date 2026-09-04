# `@lockness/auth` — agent brief

Authentication: guards decide _how_ a request proves identity (session cookie,
bearer token, HTTP basic), providers decide _where_ the user record comes from.
The `Authenticator` binds the two and is what `@AuthRequired` / `@AuthGuard`
resolve through. User lookup itself lives in `@lockness/auth-provider`.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Invariants

- **The dependency contract above is binding.** Importing anything outside it
  fails `deno task deps:analyze`, and the failure is a design question, not a
  lint to silence.

_Add the domain invariants — what must stay true inside this package, and what
breaks when it does not. A statement that could have been guessed from the file
names does not belong here._

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                                                                        |
| :--------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| Imports (static)                               | `contract`, `events` _(type-only)_, `hono`, `session`                                           |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                                               |
| Imported by                                    | `auth-provider`, `testing`                                                                      |
| **Must never import**                          | `auth-provider`, `testing` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `AuthenticationError`, `AuthenticationRequiredError`, `Authenticator`, `AuthorizationError`, `BasicAuthGuard`, `Gate`, `InvalidCredentialsError`, `InvalidGuardConfigError`, `InvalidTokenError`, `SessionExpiredError`, `SessionGuard`, `StaticRoleRepository`, `TokenGuard`, `UnauthorizedAccessError`                                                                                                                                                                                                                                      |
| function  | `AuthGuard`, `AuthOptional`, `AuthRequired`, `Authorize`, `Guard`, `authGuard`, `authMiddleware`, `authOptional`, `authRequired`, `authorizeMiddleware`, `configurePasswordHashing`, `getAuth`, `getPasswordHashingConfig`, `guestMiddleware`, `hashPassword`, `initializeAuthMiddleware`, `rbacResolver`, `resetPasswordHashingConfig`, `useRbac`, `verifyPassword`, `withAuth`                                                                                                                                                              |
| interface | `AccessToken`, `AuthClientResponse`, `AuthConfig`, `AuthContext`, `AuthMiddlewareOptions`, `Authenticatable`, `BasicAuthGuardEvents`, `BasicAuthGuardOptions`, `BasicAuthUserProviderContract`, `GuardContract`, `PasswordHashConfig`, `RbacIdentity`, `RememberMeToken`, `Role`, `RoleRepository`, `SessionGuardContract`, `SessionGuardEvents`, `SessionGuardOptions`, `SessionUserProviderContract`, `SessionWithRememberMeProviderContract`, `TokenGuardEvents`, `TokenGuardOptions`, `TokenUserProviderContract`, `UserProviderContract` |
| reference | `Can`, `InjectGuard`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| typeAlias | `GateBeforeHook`, `GateCallback`, `GateFallback`, `GuardFactory`, `InferGuardUser`, `InferProviderUser`, `Permission`, `Policy`, `TypedSessionGuard`                                                                                                                                                                                                                                                                                                                                                                                          |
| variable  | `GUARD_KNOWN_EVENTS`, `PROVIDER_REAL_USER`, `gate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                                    | Path               |
| ------------------------------------------ | ------------------ |
| Guard implementations                      | `guards/*.ts`      |
| Decorators (`@AuthRequired`, `@AuthGuard`) | `decorators.ts`    |
| Guard resolution and the auth context      | `authenticator.ts` |
| Request-time wiring                        | `middleware/*.ts`  |
| Password hashing                           | `password.ts`      |

## Pitfalls

- `initialize_auth_middleware.ts` must run before any guard middleware, or the
  auth context is absent and guards fail closed rather than reporting why.
- Adding a guard means touching three places: the guard class, its entry in the
  authenticator's resolution map, and `types.ts`.

## Tests

<!-- generated:tests -->

17 test files for 14 source files:

- `packages/auth/tests/auth_decorators.test.ts`
- `packages/auth/tests/authenticator.test.ts`
- `packages/auth/tests/authorization_e2e.test.ts`
- `packages/auth/tests/authorize_decorator.test.ts`
- `packages/auth/tests/context_api.test.ts`
- `packages/auth/tests/decorator.test.ts`
- `packages/auth/tests/errors.test.ts`
- `packages/auth/tests/gate.test.ts`
- `packages/auth/tests/guards.test.ts`
- `packages/auth/tests/integration.test.ts`
- `packages/auth/tests/password.test.ts`
- `packages/auth/tests/policy.test.ts`
- `packages/auth/tests/providers.test.ts`
- `packages/auth/tests/rbac.test.ts`
- `packages/auth/tests/remember_absolute_lifetime.test.ts`
- `packages/auth/tests/session_logout_revocation.test.ts`
- `packages/auth/tests/user_revocation.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 17 test files directly —

```bash
deno test -A packages/auth/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
