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

| Direction                                      | Packages                                                                                                                                                                                                                                                                                                                                 |
| :--------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports (static)                               | —                                                                                                                                                                                                                                                                                                                                        |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                                                                                                                                                                                                                                                                                        |
| Imported by                                    | `auth`, `contract`, `core`, `devtools`, `events`, `inertia`, `markdown`, `openapi`, `session`, `socialite`, `telemetry`, `testing`, `ui`, `validator`                                                                                                                                                                                    |
| **Must never import**                          | `auth`, `auth-provider`, `cache`, `cli`, `container`, `contract`, `core`, `crypto`, `devtools`, `drizzle`, `events`, `inertia`, `init`, `logger`, `markdown`, `openapi`, `queue`, `redis`, `session`, `socialite`, `sse`, `telemetry`, `testing`, `ui`, `validator` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `Context`, `DetailedError`, `Factory`, `HTTPException`, `Hono`, `HonoRequest`, `ThrottleMemoryStore`, `WSContext`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| function  | `detectFromHeader`, `detectFromPath`, `jsx`, `parseResponse`, `rateLimiter`, `wrapTime`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| interface | `ClientResponse`, `ConnInfo`, `ContextRenderer`, `ContextVariableMap`, `CreateHandlersInterface`, `DetectorOptions`, `ExecutionContext`, `IPRestrictionRules`, `LanguageVariables`, `NotFoundResponse`, `UpgradeWebSocket`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| namespace | `JSX`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| reference | `jsxTemplate`, `jsxs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| typeAlias | `AddressType`, `CacheType`, `Child`, `ClientRequest`, `ClientRequestOptions`, `ContentSecurityPolicyOptionHandler`, `DetectorType`, `Env`, `ErrorHandler`, `FC`, `Fetch`, `GetConnInfo`, `HTTPExceptionFunction`, `Handler`, `IPRestrictionRule`, `InferRequestType`, `InferResponseType`, `Input`, `JwtVariables`, `MiddlewareHandler`, `Next`, `NotFoundHandler`, `PropsWithChildren`, `RateLimiterConfig`, `RequestIdVariables`, `Schema`, `SecureHeadersVariables`, `ThrottleStore`, `TimingVariables`, `ToSchema`, `TypedResponse`, `ValidationFunction`, `ValidationTargets`, `WSReadyState`                                                                                                                                                                                                                                                                                   |
| variable  | `Fragment`, `NONCE`, `RETAINED_304_HEADERS`, `appendTrailingSlash`, `basicAuth`, `bearerAuth`, `bodyLimit`, `cache`, `compress`, `contextStorage`, `cors`, `createFactory`, `createMiddleware`, `csrf`, `css`, `decode`, `deleteCookie`, `denoServeStatic`, `detectFromCookie`, `detectFromQuery`, `endTime`, `etag`, `getConnInfo`, `getContext`, `getCookie`, `getRuntimeKey`, `getSignedCookie`, `hc`, `html`, `ipRestriction`, `jsxAttr`, `jsxEscape`, `jsxRenderer`, `jwk`, `jwt`, `languageDetector`, `logger`, `methodOverride`, `poweredBy`, `prettyJSON`, `raw`, `requestId`, `secureHeaders`, `serveStatic`, `setCookie`, `setMetric`, `setSignedCookie`, `sign`, `ssgParams`, `startTime`, `streamSSE`, `streamText`, `testClient`, `timeout`, `timing`, `trimTrailingSlash`, `tryGetContext`, `useRequestContext`, `validator`, `verify`, `verifyWithJwks`, `zValidator` |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                     | Path                                                         |
| --------------------------- | ------------------------------------------------------------ |
| Exposing a new Hono API     | the matching `*.ts`, then `mod.ts`, then `deno.json` exports |
| Security middleware surface | `security.ts`                                                |
| JSX runtime plumbing        | `jsx.ts`, `jsx_runtime.ts`, `jsx_renderer.ts`                |

## Pitfalls

- Its README calls it an internal infrastructure package. User applications
  import `@lockness/core`, never this.
- The Hono version is pinned deliberately. Bumping it is a framework-wide
  compatibility decision, not a dependency refresh.
- **Zero tests** for 22 files of re-exports — a dropped export is caught only by
  `packages/core/tests/hono_reexports.test.ts` downstream.

## Tests

<!-- generated:tests -->

1 test file for 22 source files:

- `packages/hono/tests/reexport_contract.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 1 test file directly —

```bash
deno test -A packages/hono/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
