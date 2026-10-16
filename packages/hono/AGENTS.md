# `@lockness/hono` — agent brief

The pinned Hono re-export layer and the reason hard rule #1 exists. One file per
Hono concern, each re-exporting a vetted subset. Bottom of the dependency graph:
imports nothing. The table below is the current list of importers — do not
restate a count here, it goes stale.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Invariants

- **This package imports nothing, and that must stay true.** It is the pinned
  boundary between the framework and Hono; an inbound dependency here would put
  a package underneath the thing everything else sits on.
- **No other package may import `hono` directly** (framework hard rule #1). They
  import from here, or from `@lockness/core`, so the pinned version stays the
  single home of the Hono contract.

## Dependency contract

<!-- generated:deps -->

| Direction                                 | Packages                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| :---------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports (static)                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Imports (soft, loaded at runtime by name) | —                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Imported by                               | `auth`, `contract`, `core`, `devtools`, `events`, `i18n`, `inertia`, `markdown`, `openapi`, `realtime`, `session`, `socialite`, `telemetry`, `testing`, `ui`, `validator`                                                                                                                                                                                                                                                                      |
| **Must never import**                     | `auth`, `auth-provider`, `cache`, `cli`, `container`, `contract`, `core`, `crypto`, `deprecation-contracts`, `devtools`, `drizzle`, `events`, `features`, `i18n`, `inertia`, `init`, `logger`, `mail`, `markdown`, `notification`, `openapi`, `queue`, `realtime`, `redis`, `search`, `session`, `socialite`, `sse`, `telemetry`, `testing`, `ui`, `upgrade`, `validator` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
an optional peer in this package's `package.json`, never a dependency: the
consuming application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `Context`, `DetailedError`, `Factory`, `HTTPException`, `Hono`, `HonoRequest`, `ThrottleMemoryStore`, `WSContext`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| function  | `detectFromHeader`, `detectFromPath`, `jsx`, `parseResponse`, `rateLimiter`, `wrapTime`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| interface | `ClientResponse`, `ConnInfo`, `ContextRenderer`, `ContextVariableMap`, `CreateHandlersInterface`, `DetectorOptions`, `ExecutionContext`, `IPRestrictionRules`, `LanguageVariables`, `NotFoundResponse`, `UpgradeWebSocket`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| namespace | `JSX`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| reference | `jsxTemplate`, `jsxs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| typeAlias | `AddressType`, `CacheType`, `Child`, `ClientRequest`, `ClientRequestOptions`, `ContentSecurityPolicyOptionHandler`, `DetectorType`, `Env`, `ErrorHandler`, `FC`, `Fetch`, `GetConnInfo`, `HTTPExceptionFunction`, `Handler`, `IPRestrictionRule`, `InferRequestType`, `InferResponseType`, `Input`, `JwtVariables`, `MiddlewareHandler`, `Next`, `NotFoundHandler`, `PropsWithChildren`, `RateLimiterConfig`, `RequestIdVariables`, `Schema`, `SecureHeadersVariables`, `ThrottleStore`, `TimingVariables`, `ToSchema`, `TypedResponse`, `ValidationFunction`, `ValidationTargets`, `WSReadyState`                                                                                                                                                                                                                                                 |
| variable  | `Fragment`, `NONCE`, `RETAINED_304_HEADERS`, `appendTrailingSlash`, `basicAuth`, `bearerAuth`, `bodyLimit`, `cache`, `compress`, `contextStorage`, `cors`, `createFactory`, `createMiddleware`, `csrf`, `css`, `decode`, `deleteCookie`, `detectFromCookie`, `detectFromQuery`, `endTime`, `etag`, `getContext`, `getCookie`, `getRuntimeKey`, `getSignedCookie`, `hc`, `html`, `ipRestriction`, `jsxAttr`, `jsxEscape`, `jsxRenderer`, `jwk`, `jwt`, `languageDetector`, `logger`, `methodOverride`, `poweredBy`, `prettyJSON`, `raw`, `requestId`, `secureHeaders`, `serveStatic`, `setCookie`, `setMetric`, `setSignedCookie`, `sign`, `ssgParams`, `startTime`, `streamSSE`, `streamText`, `testClient`, `timeout`, `timing`, `trimTrailingSlash`, `tryGetContext`, `useRequestContext`, `validator`, `verify`, `verifyWithJwks`, `zValidator` |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                     | Path                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| Exposing a new Hono API     | the matching `*.ts`, then `mod.ts`, then `deno.json` exports        |
| Security middleware surface | `security.ts`                                                       |
| JSX runtime plumbing        | `jsx.ts`, `jsx_runtime.ts`, `jsx_dev_runtime.ts`, `jsx_renderer.ts` |
| Per-runtime adapters        | `deno.ts`, `bun.ts`, `node.ts` — subpaths only, never `mod.ts`      |

## Pitfalls

- Its README calls it an internal infrastructure package. User applications
  import `@lockness/core`, never this.
- The Hono version is pinned deliberately. Bumping it is a framework-wide
  compatibility decision, not a dependency refresh.
- **`hono/deno` and `hono/bun` read their runtime's global at import time.**
  `deno.ts` and `bun.ts` load on that runtime only, so neither may be reached
  from `mod.ts`: one import from the barrel breaks `@lockness/hono` on the other
  two runtimes. `node.ts` loads everywhere.
- The JSX runtimes import Hono's real `hono/jsx/jsx-*` paths, not a Deno
  import-map alias, so they resolve on Bun and Node as well.

## Tests

<!-- generated:tests -->

4 test files for 25 source files:

- `packages/hono/tests/adapters.test.ts`
- `packages/hono/tests/bun_adapter.test.ts`
- `packages/hono/tests/deno_adapter.deno.test.ts`
- `packages/hono/tests/reexport_contract.test.ts`

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
deno test -A packages/hono/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
