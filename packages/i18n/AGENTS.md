# `@lockness/i18n` — agent brief

The translation layer. Message catalogs, `t()`/`trans()` with `{name}`
interpolation + ICU cardinal-plural/select on Deno's built-in
`Intl.PluralRules`, a `CatalogRegistry` with per-key language-cascade fallback,
a lazy per-request locale resolver + accessors, and `make:lang` /
`i18n:extract`. Core soft-loads it at boot.

## Invariants

- **The dependency contract below is binding.** Importing anything outside it
  fails `deno task deps:analyze`. Zero message-format dependency — ICU runs on
  built-in `Intl`.
- **`t()` returns a plain `string`** — never a Hono `HtmlEscapedString` /
  `raw()`. Message text + params are **data**; the view layer escapes (Hono JSX
  auto-escapes). Params are substituted into the parsed AST as **literal text**,
  never re-parsed as ICU (security S1).
- **Locale resolution is lazy** — `getLocale(c)` / `getTranslator(c)` resolve at
  access time (after the mount `i18nMiddleware` set `localeKey`); never an eager
  global middleware (which runs outer of the mount and reads an empty
  `localeKey`, A1). The accessor is the primary API (the `getSession(c)`
  precedent).
- **A resolved locale is always in the configured set** — a raw
  header/cookie/route value is validated first, unknown → default; never a raw
  catalog key or path segment (security S1/S6). Header/cookie bounded; the
  resolver never logs a raw locale (`safeForLog`, S3).
- **The ICU parser is bounded** — max depth + max length, parse-once/memoised,
  clear parse-time error (S4).
- **One source of truth** — `configureI18n`'s default/locale set derives from /
  agrees with `config/i18n.ts`.
- **`KernelConfig.i18n` is typed by a LOCAL interface in core** — never an
  `import('@lockness/i18n')` type edge (A-M1).
- **No `any` in exported signatures; JSDoc on every export; no direct `hono`.**

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                                                    |
| :--------------------------------------------- | :-------------------------------------------------------------------------- |
| Imports (static)                               | —                                                                           |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                           |
| Imported by                                    | `core`                                                                      |
| **Must never import**                          | `core` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                    |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `CatalogRegistry`, `ICUParseError`, `Translator`                                                                                           |
| function  | `configureI18n`, `flattenMessages`, `getI18nConfig`, `getRegistry`, `isI18nConfigured`, `languageOf`, `parseICU`, `renderICU`, `resetI18n` |
| interface | `CatalogRegistryOptions`, `I18nConfig`, `Messages`                                                                                         |
| typeAlias | `ICUNode`, `TranslateParams`                                                                                                               |
| variable  | `MAX_ICU_DEPTH`, `MAX_ICU_LENGTH`                                                                                                          |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Task                                            | File                                                    |
| :---------------------------------------------- | :------------------------------------------------------ |
| ICU parse + render (subset)                     | `icu.ts` (parser + renderer, bounded)                   |
| Translator (`t`/`trans`, cascade, memoised AST) | `translator.ts`                                         |
| Catalog storage + locale→translator             | `registry.ts`                                           |
| App config + the registry singleton             | `config.ts`                                             |
| Lazy resolver + accessors + ALS                 | `resolver.ts`, `context.ts`                             |
| Boot step + `KernelConfig.i18n`                 | `step.ts` (+ core `kernel_decorators.ts`/`registry.ts`) |
| `make:lang` / `i18n:extract`                    | `cli_commands.ts`, `extract.ts`, `stubs/`               |

## Pitfalls

- Catalogs must be **statically enumerable** (TS modules given to
  `configureI18n`) — SSG expands locales at build time; a `Deno.readTextFile`
  catalog keyed by locale would break that and open a path-injection surface.
- ICU subset is MVP (interpolation + cardinal plural + select); ordinal/nested/
  number-date skeletons are a scoped follow-up.
- Nothing imports `i18n` (core soft-loads it) — keep it a sink.

## Tests

<!-- generated:tests -->

2 test files for 5 source files:

- `packages/i18n/tests/icu.test.ts`
- `packages/i18n/tests/translator.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 2 test files directly —

```bash
deno test -A packages/i18n/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface, tests and closing gate are generated by
`deno task agents:brief` from the code itself — fix the code, not those blocks.
Everything else is hand-written and preserved._
