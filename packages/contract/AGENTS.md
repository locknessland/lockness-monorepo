# `@lockness/contract` — agent brief

Shared types, interfaces and decorator declarations, plus the few runtime
helpers every layer needs and only the foundation can offer: the log encoder
(`safeForLog`, `renderError`), the routes-file generator, the environment
readers, and `importAppFile` on `@lockness/contract/app-file/internal`, the one
way the framework imports a file of the user's app (#477). It exists to break
dependency cycles: if something is needed by two packages that must not know
about each other, it belongs here.

It is not dependency-free — it takes Hono's types through the `hono` alias in
its own `deno.json`. Every one of those is an `import type`, so the edge erases
at compile time and the package still emits no runtime import. That distinction
is the invariant, not "imports nothing".

User-facing documentation: [README.md](README.md). This brief does not repeat
it.

## Invariants

- **Every `@lockness/*` import here must be `import type`.** The package takes
  Hono's types through the `hono` alias in its own `deno.json`; because those
  are type-only they erase at compile time and the package emits no runtime
  import. A single value import would turn the framework's cycle-breaker into a
  cycle participant. `deno task deps:analyze` marks the edge _(type-only)_ — if
  that annotation disappears, the invariant broke.
- **Renaming an exported symbol is a breaking change for every importer at
  once**, because the whole workspace ships on one version.

## Dependency contract

<!-- generated:deps -->

| Direction                                 | Packages                                                                                                                                                                                                                                                                                                                                |
| :---------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports (static)                          | `hono` _(type-only)_                                                                                                                                                                                                                                                                                                                    |
| Imports (soft, loaded at runtime by name) | —                                                                                                                                                                                                                                                                                                                                       |
| Imported by                               | `auth`, `cache`, `cli`, `container`, `core`, `crypto`, `devtools`, `drizzle`, `events`, `logger`, `mail`, `notification`, `openapi`, `queue`, `realtime`, `redis`, `session`, `socialite`, `sse`, `telemetry`                                                                                                                           |
| **Must never import**                     | `auth`, `auth-provider`, `cache`, `cli`, `container`, `core`, `crypto`, `devtools`, `drizzle`, `events`, `init`, `logger`, `mail`, `notification`, `openapi`, `queue`, `realtime`, `redis`, `session`, `socialite`, `sse`, `telemetry`, `testing`, `ui`, `upgrade` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `KeyMaterialError`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| function  | `Cache`, `CacheKey`, `CacheTTL`, `ComposeMiddleware`, `Controller`, `DeclareMiddleware`, `Middleware`, `Static`, `Throttle`, `ThrottleApi`, `ThrottleHeavy`, `ThrottleLogin`, `ThrottleSensitive`, `Use`, `UseMiddleware`, `clampPage`, `clampPerPage`, `compose`, `composeMiddleware`, `decodeBase64`, `deregisterDisposable`, `deregisterHealthCheck`, `deriveJsonSchema`, `disposableCount`, `encodeBase64`, `generateAppKey`, `generateRoutesContent`, `generateRoutesFile`, `healthCheckCount`, `isDevelopment`, `isExplicitlyDevelopment`, `isProduction`, `paginateCursor`, `paginateOffset`, `parseTimeWindow`, `readPaginationParams`, `registerDisposable`, `registerHealthCheck`, `renderError`, `resolveEnvName`, `resolveKeyMaterial`, `safeForLog`, `scanControllers`, `toPaginationProps` |
| interface | `CacheContract`, `CacheOptions`, `ContainerContract`, `ContainerRegistration`, `ControllerInfo`, `ControllerMetadata`, `ControllerWithMetadata`, `CursorEnvelope`, `CursorLinks`, `CursorMeta`, `Disposable`, `DisposableHandle`, `GenerateRoutesResult`, `HealthCheck`, `HealthCheckHandle`, `HealthResult`, `JsonSchema`, `MiddlewareContract`, `OffsetEnvelope`, `OffsetLinks`, `OffsetMeta`, `PaginationComponentProps`, `PaginationParams`, `RenderErrorOptions`, `ResourceSchema`, `Route`, `RouteMetadata`, `RouteOptions`, `StaticOptions`, `ThrottleConfig`, `ThrottleOptions`, `ThrottleStoreContract`                                                                                                                                                                                         |
| typeAlias | `ComposableMiddleware`, `Constructor`, `Context`, `ControllerClass`, `FileExtension`, `KeyRejection`, `MiddlewareClass`, `MiddlewareHandler`, `MiddlewareInput`, `MiddlewareRegistry`, `Next`, `PaginationEnvelope`, `PaginationMeta`, `QuerySource`, `ServiceToken`, `ThrottleKey`, `TimeWindow`, `ValidationTargets`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| variable  | `CacheServiceToken`, `DEFAULT_CURSOR_PARAM`, `DEFAULT_PAGE_PARAM`, `DEFAULT_PER_PAGE`, `Delete`, `Get`, `KEY_BYTES`, `KEY_PREFIX`, `MAX_PER_PAGE`, `MIDDLEWARE_NAME_KEY`, `Patch`, `Post`, `Put`, `REJECTED_KEYS`, `declaredMiddlewares`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                          | Path           |
| -------------------------------- | -------------- |
| Cross-package interfaces         | `types.ts`     |
| HTTP-layer contracts             | `http/*.ts`    |
| Routing contracts and decorators | `routing/*.ts` |

## Pitfalls

- **Never add a runtime `@lockness/*` import here.** This package is the bottom
  of the graph; such an import turns a clean tree into a cycle. `@std/*` value
  imports are fine — `app_file_url.ts` and `routing/generator.ts` use
  `@std/path`.
- **`core` re-exports this root with `export *`, so a runtime helper meant only
  for packages goes on an `/internal` entry point, never in `mod.ts`.** Anything
  in `mod.ts` reaches every app through `@lockness/core`.
- **Every app-file import of the framework goes through `importAppFile`**, from
  `@lockness/contract/app-file/internal` (`app_file.ts`). Its one `import()` is
  the only app-file site `deps.policy.jsonc` inventories, and the
  `lockness/app-file-specifier` lint rule (`scripts/lint/`) rejects a hand-built
  specifier anywhere else. It swallows nothing: whether a missing file is normal
  and how a broken one is reported belong to each caller. It translates exactly
  one failure — a file that does not compile or link becomes an
  `AppFileCompileError` (file relative to the root, line, column, **no
  `cause`**), because the runtime's message quotes the failing source line
  (#478). Everything else, "Module not found" included, is rethrown untouched.
- **Which `name=value` pairs carry a credential is decided once, in
  `logging/credential_params.ts`** (on `@lockness/contract/logging/internal`).
  `renderError` replaces such a value by shape; drizzle's `probe()` holds the
  DSN's values and withholds a message that echoes one (#438). Add a stem or a
  code qualifier there, never a second list beside a caller — two lists drift on
  the first vendor name somebody adds to only one.
- **Short numeric secrets are stems, and `code` needs a qualifier** (#497).
  `pin`, `otp`, `cvv` and `cvc` are ends-with stems with no digit exemption
  (`pin=4821` masks; `max_pins=8` is never a count); the pinned over-match is
  `spin`, `hairpin`, `gpio_pin`, like `monkey=`. A name ending in `code` or
  `codes` with something before it is a credential only when that leftover ends
  in a credential stem or a factor word (`CODE_QUALIFIERS`: `mfa`, `2fa`, `sms`,
  `onetime`, `security`, `verification`, `verify`, `recovery`, `backup`,
  `access`), so `pin_code` and `mfa_code` mask anywhere while `status_code`,
  `exit_code` and `zip_code` render. Factor words alone are not credentials
  (`mfa=required` renders). A bare `code` keeps its own rule, below.
- **What the `renderError` net does not see.** It is a shape rule for
  `name=value` (quoted values, spaces around `=` and ANSI-coloured names
  included). It does not see a JSON `"token":"…"`, a header- or YAML-style
  `name: value`, an `Authorization: Bearer …` header, a bare token with no name,
  a doubly encoded separator (`%253D`), or a session id under a name it does not
  know. Those need a source-side fix where the value is known; do not widen the
  net to guess at them.
- **Two non-secrets the net keeps on purpose**, because an operator needs them,
  except after a cut inside a masked value (below). A known count name
  (`max_tokens`, `max-keys`: a `tokens` or `keys` plural containing `max`,
  `prompt`, `completion` or `total`) keeps an unquoted all-digit value; every
  other plural is masked whatever its value. A bare `code` is an OAuth code only
  in a URL query, after `&amp;`, or in a form body (`code=…&grant_type=…`);
  elsewhere (`status code=503`, `exit code=1`) it renders. Only that `code`
  decision ends a value at `&amp;` unconditionally; any other name after `&amp;`
  keeps the raw end, or an HTML-escaped value shows its tail, and a raw value
  stops at `&amp;` only before a credential pair. Known residue of that raw end:
  `?a=1&amp;max_tokens=4096&amp;b=2` masks the count.
- **A raw value ends early only before another credential pair** (#500, #525).
  Raw termination (whitespace or a quote) also stops at one of four separators —
  `&`, `&amp;`, `;` or `,` (`CUT_SEPARATORS`) — whose lookahead is a credential
  `name=` by `classifyName`, so that pair is masked by its own rule; eating it
  would hide the name and show a quoted value (`Pwd=…;Token="…"`). Never cut at
  a non-credential lookahead (`password=…&lt;…`, `--password=ab&cd`,
  `Pwd=ab;cd`), never in URL mode, and never at `%26`, `%3B` or `%2C`: each
  would show the rest of the value. `separatorEnd()` is the one home of a
  separator's width.
- **A pair a cut starts inside a masked value inherits the raw end** (#524). It
  keeps the raw end and the cut check and takes no exemption: never URL mode,
  and a bare `code` or a count digit run is masked there. Its value is the rest
  of the value before it, so any of those would show it
  (`--password=ab&token=cd&ef` renders `--password=***&token=***`). Every cut
  sets the marker, whatever value it ends, an empty one included (#528):
  `pwd=A;token=;code=B` renders `pwd=***;token=;code=***`, and
  `--password=,code=B,retry=C` renders `--password=,code=***`. Only a kept count
  or an exempt bare `code` leaves the scan before the marker, so a pair after a
  kept count keeps its own rule (`max_tokens=4096;code=23505` renders whole).
  The cost, pinned: an empty raw credential value before a separator and a bare
  `code` or a count masks that pair (`token=;code=23505` → `token=;code=***`).
  Leftover leaks, pinned by the accepted-cost test: the cut shows its separator
  and name (`Pwd=ab;token=cd` → `Pwd=***;token=***`, likewise a password holding
  `&pin=`, `;pin=` or `,pin=`); a quoted value after a cut ends at its quote
  (`Pwd=ab;key="x"yz` shows `yz`); a URL-mode value is not cut
  (`?password=A;token="B"` shows `"B"`); an unnamed pair is no cut
  (`Pwd=ab;x= cd` shows `cd`); and a form body with a secret before `code` loses
  the code's neighbours (`client_secret=cs&code=xyz&grant_type=…` →
  `client_secret=***&code=***`).
- **A bracket is a name character, and only `classifyName` reads the structure**
  (#526). `[` and `]` sit in `STRIPPED`, so the walk left and the cut lookahead
  cross them, raw or as `%5B`/`%5D`, through the one `isNameCharacter`
  predicate; neither walk pairs a `[` with its `]`, and none may start to — two
  parsers of one grammar break the cut's `inherited` identity check, and a
  pairing search is quadratic on `x]=` repeated. A bracketed name is classified
  by its field segment (`fieldSegment`: the last bracket segment holding a
  letter) with every existing rule: `card[cvc]`, `user[password]`, `card[cvc][]`
  mask, and `user[code]` takes the bare `code` rule (masked in a URL, after
  `&amp;` or in a form body). An index segment (`[]`, `[0]`) is skipped; a name
  of indexes only reads as its path, so `password[0]` masks. The whole path,
  read as a dotted name is, can only raise the result to `stem`
  (`verification[code]`, `pin[code]`, `password[confirmation]`), never lower it
  (`max[api_tokens]` stays masked). An outer segment alone never classifies:
  `token[type]`, `api_key[id]` and `card[number]` render. `fieldSegment` reads
  each name once from its end; a scan to the end of the name at every bracket is
  quadratic (battery row). Known residue, each case pinned by a `#526` test (the
  over-matches by the path test, the rest by the accepted-cost test): a
  credential container with a generic field renders (`password[value]`,
  `token[raw]`, as `password_value` does); a segment holding a blank, `:`, `/`,
  `@`, `+` or non-ASCII ends the walk inside the brackets (`user[pass word]=x`
  renders); a doubly encoded bracket is not seen (`%255B`, like `%253D`); an
  unqualified container's `code` renders in free text (`user[code]=x`, and
  `two_factor[code]=x`, since `two_factor` is no `CODE_QUALIFIERS` word, #527);
  a dotted path keeps its single compound reading (`user.code=X&a=b` renders);
  outside a URL a raw credential value eats the bracket pair after it
  (`card[cvc]=314&card[number]=4242` → `card[cvc]=***`); a query name that
  begins with a bracket, or has one before its field segment, takes URL mode, so
  the text after the next `&` shows (`?[x]password=A&B` → `?[x]password=***&B`;
  likewise `&a[b]password=`, `&x]token=` and `#V[key=`); `[` and `]` join the
  run a cut can show (#529); and `[auth]code=23505`, `config[key]=v` and, in a
  URL or form body, `error[code]=E_X` are pinned over-matches.
- **A compile failure is recognised by its message shape, never by class or
  `code`** (`logging/compile_diagnostic.ts`). Deno reports a parse failure as a
  `TypeError` with `ERR_MODULE_NOT_FOUND`, the same pair "Module not found"
  carries. If Deno's format changes, the real-file tests in
  `tests/compile_diagnostic.test.ts` are what notice. The V8 phrases the net
  also keys on (`V8_COMPILE_PHRASES`) were measured on Deno 2.9.6 and are V8's
  wording, not a contract: re-measure them on every Deno upgrade.
- **`code` is the one property `renderError` shows besides `name` and
  `message`** (#491), as `Name [CODE]: message` on every rendered link, and only
  when `isShowableErrorCode` (`logging/error_code.ts`) accepts its spelling:
  SQLSTATE, POSIX errno, or upper-snake with an underscore, at most 48
  characters. That check limits the code's shape, not its secrecy. Never render
  `detail`, `hint` or any other property here: they carry row data no redaction
  recognises. Widening the pattern needs a measured real code it misses, and its
  rejected list in `tests/error_code_491.test.ts` must still fail.
- It has tests (`tests/`) but no `docs/` — JSDoc is the documentation, so it is
  not optional on any exported symbol.
- Renaming an exported type here is a breaking change for eight packages at
  once.

## Tests

<!-- generated:tests -->

15 test files for 35 source files:

- `packages/contract/tests/app_file.test.ts`
- `packages/contract/tests/compile_diagnostic.test.ts`
- `packages/contract/tests/crypto_key.test.ts`
- `packages/contract/tests/disposables.test.ts`
- `packages/contract/tests/environment.test.ts`
- `packages/contract/tests/environment_legacy.test.ts`
- `packages/contract/tests/error_code_491.test.ts`
- `packages/contract/tests/error_frames_488.test.ts`
- `packages/contract/tests/health.test.ts`
- `packages/contract/tests/log_sanitize.test.ts`
- `packages/contract/tests/pagination.test.ts`
- `packages/contract/tests/query_credentials.test.ts`
- `packages/contract/tests/render_message.test.ts`
- `packages/contract/tests/resource_derive.test.ts`
- `packages/contract/tests/static_decorator.test.ts`

6 mutation batteries — **`deno test` does not run these.** Each is an executable
that mutates a source file and re-runs the suites that should notice. Run them
with `deno task mutate` (all of them, one at a time) or
`deno task mutate <name>` (one); nightly CI runs the full sweep. See
[testing.md](../../docs/testing.md#mutation-batteries).

- `packages/contract/tests/mutations/bidi_292.ts`
- `packages/contract/tests/mutations/dsn_redaction_301_303.ts`
- `packages/contract/tests/mutations/env_signal_504.ts`
- `packages/contract/tests/mutations/error_code_491.ts`
- `packages/contract/tests/mutations/error_frames_488.ts`
- `packages/contract/tests/mutations/query_credentials_478.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno task gate             # the full gate, as the pre-push hook runs it
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 15 test files directly —

```bash
deno test -A packages/contract/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
