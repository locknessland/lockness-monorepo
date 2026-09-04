# Plan: i18n / translation layer

**Branch**: `202-i18n-translation-layer` | **Date**: 2026-09-05 | **Backlog item**: [#202 — i18n / translation layer](https://github.com/locknessland/lockness-monorepo/issues/202) (epic; children [#203](https://github.com/locknessland/lockness-monorepo/issues/203), [#204](https://github.com/locknessland/lockness-monorepo/issues/204), [#205](https://github.com/locknessland/lockness-monorepo/issues/205))

**This is the epic's one planning document** — one decision table, one stop, covering all three children.

---

## 1. Why this exists

Competitive gap #4. Lockness's `config/i18n.ts` is **locale validation + URL routing only** — supported languages/countries, guards, and a mount pattern (`/:langId/:countryId`) that sets `c.set('localeKey', …)`. There are **no message catalogs, no `t()`, no pluralization, no interpolation, and no per-request locale resolution beyond the URL prefix**. Real localization needs all of those. Laravel, Rails, Symfony and Django all ship them first-class; Lockness ships none. The concept is greenfield (grep found zero `Intl.PluralRules` / messageformat usage anywhere; no `lang/`/`locales/` directory).

## 2. User scenarios

### US1 — Translate a key with interpolation and plurals (P1)

**Given** a catalog for a locale and a `Translator` bound to it
**When** the app calls `t('cart.items', { count: 3 })` against a message `'{count, plural, one {# item} other {# items}}'`
**Then** it returns `'3 items'` — the ICU plural branch chosen via `Intl.PluralRules`, `#`/`{count}` interpolated — and a missing key returns a clear fallback (the key itself, or the fallback-locale message), never throwing.

### US2 — Resolve the request's locale automatically (P1)

**Given** the resolver installed and catalogs configured
**When** a request arrives on `/fr/ca/...`, or with an `Accept-Language: fr` header, or a `locale` cookie
**Then** the locale is resolved (route → cookie → header → default, order configurable), **validated against the configured locales** (an unknown/hostile value falls back, never reaches a catalog lookup as-is), stored on the request, and a locale-bound `t` is made available to controllers.

### US3 — Scaffold and maintain catalogs (P2)

**Given** `nessy make:lang <locale>` and `nessy i18n:extract`
**When** the developer runs them
**Then** `make:lang` scaffolds a catalog file for the locale, and `i18n:extract` walks the source for `t('…')` / `trans('…')` calls and reports/merges the key set (flagging missing and unused keys) so catalogs stay in sync with the code.

### Edge cases

- A message key absent in the active catalog → fall back to the fallback locale, then to the key string itself; never throw.
- A resolved locale with a catalog but a missing key vs no catalog at all → both fall back cleanly.
- A hostile `Accept-Language` / `locale` cookie (`../../etc`, a 5 KB string, an injection) → normalised/validated against the configured locale set; an unknown value is **rejected to the default**, never used to index a catalog or build a path.
- A malformed ICU message (unbalanced braces) → a clear, bounded error at load/parse time (or a safe literal render), never a crash mid-request.
- The compound-vs-language locale mismatch (`en-us` route key vs an `en` catalog) → language-level fallback (`en-us` → `en` → default).

## 3. Requirements

- **FR-001** (#203): A `@lockness/i18n` package provides a `Translator` (`t(key, params?)` + `trans` alias) over a **catalog** (a nested/dot-keyed message map) for one locale. Fallback is a **single, per-key cascade through the language chain** (`en-us` → `en` → fallback locale → the key string) — one semantics shared by the registry and the translator, not two mechanisms (architecture A-M4). No throw on a missing key.
- **FR-002** (#203): **Interpolation** — `{name}` placeholders replaced from `params`; a missing param renders a bounded placeholder, not `undefined`. Interpolated values are strings/numbers formatted via `Intl.NumberFormat` where numeric.
- **FR-003** (#203): **ICU pluralization + select** via built-in `Intl.PluralRules` (zero dependency): `{count, plural, one {…} other {…}}` (cardinal; `#` renders the count) and `{var, select, … other {…}}`. The supported ICU subset is documented; an unsupported construct fails clearly at parse, not silently. The parser enforces a **maximum nesting depth and a maximum template length**, failing with the same clear parse-time error rather than a stack overflow (security S4). Each message is **parsed once at configure/load time and the AST memoised** — never re-parsed per request; the renderer re-renders from the AST. `icu.ts` is internally a parser (string→AST) + a renderer (AST+params+`Intl`→string) (architecture A-L3).
- **FR-004** (#203): **Catalog loading** is data-first: `configureI18n({ catalogs, defaultLocale, fallbackLocale })` takes `catalogs` as a `Record<locale, Messages>` (statically importable — SSG expands locales at build time from the mount pattern, so catalogs must be enumerable, not hidden behind `Deno.readTextFile`). A `CatalogRegistry` resolves a locale (with language-level fallback) to its `Translator`.
- **FR-005** (#204): Per-request locale resolution is **lazy, via accessors** — `getLocale(c)` / `getTranslator(c)` resolve on first call and memoise on the context, picking the locale from **route → cookie → header → default** (order configurable). **Route is read from `c.get('localeKey')`** (set by the existing mount-point `i18nMiddleware`). Lazy resolution is what makes the route source work: the mount middleware runs before the controller/view, so `localeKey` is populated by the time an accessor is called — a resolver installed as an *eager global* middleware would run **outer** of the mount middleware and read an empty `localeKey` (architecture A1). The accessor is the **primary API** (matching `getSession(c)`), typed to throw a clear error when i18n is unconfigured; a `ContextVariableMap` augmentation, if shipped, is on `@lockness/hono`'s map and its keys are **optional** (never asserts presence). An **optional eager middleware** may pre-warm the accessor + set a response `Vary`/cookie; if installed it must run **inner** of the mount middleware.
- **FR-006** (#204, security): The resolved locale is **validated against the configured locale set** before any catalog/registry lookup — an `Accept-Language`/cookie/route value that is not a configured locale is normalised (BCP-47 language match) or **falls back to the default**; it is never used to index a catalog by raw string or to construct a path (the registry lookup is a `Map`/`Record` get by a *validated* locale — **never** an `import(\`./lang/${locale}\`)` or file read keyed by the request, security S1-guardrail). Header/cookie are bounded: **≤ 256 bytes and ≤ N parsed language ranges**, over-cap short-circuits to default without full parse (security S5). Any cache key / `Vary` / persisted value uses the **resolved** locale (the bounded configured set), never the raw header/cookie (S5).
- **FR-006a** (#204, security S3): The resolver **logs no raw request-derived locale value**. The resolved locale (from the configured set, control-free) may be logged directly; any diagnostic that logs the *requested/rejected* value routes it through `safeForLog` (re-exported by `@lockness/core` from `@lockness/contract`) — carrying forward the existing `i18nMiddleware`'s fixed-string log discipline.
- **FR-007** (#204): The package ships a `configureI18n` + an `i18nStep` bootstrap step (order ~115, after session), gated on a new `KernelConfig.i18n` field, that soft-loads and configures i18n — the session/cache/telemetry model. `@lockness/core` gains the `i18n` config field + the step + a `core.soft` edge. **`KernelConfig.i18n` is typed by a LOCAL `I18nConfig` interface owned by core** (mirroring `SessionConfig`/`CacheConfig`), **not** an `import('@lockness/i18n')` type — an import-type edge core→i18n is not in core's `allow` and would fail `deps:analyze` (architecture A-M1). The default locale + locale set in `configureI18n` **derive from / must agree with `config/i18n.ts`** (`defaultLocale`, `validLanguages`) — one source of truth; catalog absence for a routable locale is intentionally handled by fallback (architecture A-M3).
- **FR-008** (#205, security S2): `make:lang <locale>` scaffolds a catalog file (a TS module under `resources/lang/`) from a stub, via `registerI18nCommands(cli)` (the package-command pattern, discovered through `lockness.packages`) using a local stub reader + a **structural `Cli` interface** (no `@lockness/cli` import — the drizzle/notification precedent). The locale argument is **validated against a strict shape** (`/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/`) and **rejected** before any path construction; the resolved output path is **verified contained within `resources/lang/`** (resolve + is-relative-to check, not naive concatenation) — no dev-time path traversal from a hostile locale.
- **FR-009** (#205): `i18n:extract` walks the project source (walk root **bounded to the project directory**, security S2) for `t('…')` / `trans('…')` **string-literal** keys and reports the set — missing keys (used but absent from a catalog) and unused keys (present but not referenced) — and can merge missing keys into a catalog as empty entries. Dynamic (non-literal) keys are reported as un-extractable, never guessed; extracted content is **reported, never evaluated**.
- **FR-010**: Ambient `t()` in views — see §12 Q1. The chosen mechanism is homed once (either an `AsyncLocalStorage` accessor or documented prop-threading).
- **FR-011**: JSDoc on every export (#7); no `any` in exported signatures (#3 — catalog/param values `unknown` + guards at the boundary); JSR-bare specifiers pinned (#2); no direct `hono` import — `@lockness/core`/`@lockness/hono` only (#1).
- **FR-012** (#203, security S1): `t()`/`trans()` return a **plain `string`**, never a Hono `HtmlEscapedString` / `raw()` / `html\`\`` value — message text and interpolated params are **data**; output encoding is the view layer's job (Hono JSX auto-escapes string children). Params are substituted into the **parsed ICU AST as literal text** and are **never re-parsed as ICU** or re-interpolated (no second-order `{…}`/`#` expansion). Any future rich-markup message feature uses a separately-named API + a real HTML sanitizer — never the default `t()`.

## 4. Success criteria

- **SC-001** (US1): `t('cart.items', { count: 1 })` → `'1 item'`, `{ count: 3 }` → `'3 items'` (ICU plural via `Intl.PluralRules`); `{name}` interpolation works; a missing key returns the key string; no throw.
- **SC-002** (US1): a `{g, select, male {he} female {she} other {they}}` message resolves each branch; a malformed message fails clearly at parse.
- **SC-003** (US1): language-level fallback — a request for `en-us` with only an `en` catalog resolves via `en`; then default.
- **SC-004** (US2): the lazy accessor `getLocale(c)`/`getTranslator(c)` picks route over cookie over header over default (proven with a fake context for each source, `localeKey` pre-set to prove route wins); `getTranslator(c)` returns a translator bound to the resolved locale and memoises.
- **SC-005** (US2/security): a hostile `Accept-Language`/cookie (`'../../x'`, a 10 KB string, `'en; DROP'`) resolves to the default and never indexes a catalog by the raw value; an over-cap header short-circuits to default without full parse; an unknown-but-well-formed locale falls back; a configured one is honoured.
- **SC-006** (US3): `make:lang fr-fr` scaffolds `resources/lang/fr_fr.ts` (or the documented path) and the command registers; `make:lang '../../etc/x'` is **rejected** (shape/containment) and writes nothing; `i18n:extract` finds `t('a.b')` keys in a fixture and reports a missing key and an unused key.
- **SC-007** (S1): `t('greet', { name: '<script>' })` rendered in JSX produces the **escaped** literal (Hono auto-escape), and `t()`'s return type is `string` (not `HtmlEscapedString`); a param containing `{x}` is not re-interpolated.
- **SC-008** (S3): a fallback diagnostic over `Accept-Language: en%0aFAKE` produces a **single, encoded** log line (via `safeForLog`), not a forged second line.
- **SC-009** (S4): an ICU message nested beyond the depth cap (or over the length cap) fails cleanly at **parse**, not with a stack overflow.
- **SC-010**: Full gate green (`deno fmt && deno lint && deno check && deno task test && deno task deps:analyze && deno task agents:brief --check && deno task publish:check`).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The translator + missing-key/fallback rule | `packages/i18n/translator.ts` (`Translator`, `t`/`trans`) | A controller re-implementing key lookup / fallback |
| The ICU parse + render (interpolation, plural, select) | `packages/i18n/icu.ts` (one parser + renderer over `Intl.PluralRules`/`NumberFormat`) | A second regex interpolation in a channel/view |
| Catalog storage + locale→translator resolution (per-key language cascade) | `packages/i18n/registry.ts` (`CatalogRegistry`, **memoises locale→Translator**) + `configureI18n` (`config.ts`) | A per-request `new Translator` built ad-hoc; a second fallback chain; whole-catalog selection instead of a per-key cascade |
| The configured locale set + validation | `config.ts` (`configureI18n` holds the set) + `resolver.ts` (validates against it) | A resolver trusting a raw header/cookie/route value |
| Per-request locale resolution (route→cookie→header→default), **lazy** | `packages/i18n/resolver.ts` — resolves + memoises on first `getLocale(c)`/`getTranslator(c)` (runs after the mount middleware, so `localeKey` is set); optional eager middleware runs **inner** of the mount | A controller re-reading the header; a second resolution order; an eager global middleware (reads empty `localeKey`, A1) |
| The bridge to existing routing | `resolver.ts` reads `c.get('localeKey')` (set by the app's `i18nMiddleware`) at access time | Re-parsing `langId`/`countryId` from the URL in the resolver |
| The request-locale/`t` accessor (primary API) | `packages/i18n/context.ts` — `getLocale(c)` / `getTranslator(c)` (the `getSession(c)` precedent; throws when unconfigured); an optional `ContextVariableMap` augmentation on **`@lockness/hono`**'s map with **optional** keys | `c.set('t')` typed non-optional; augmenting `@lockness/core`; asserting presence when the resolver did not run |
| `KernelConfig.i18n` typing | a **local `I18nConfig`** interface in `@lockness/core` (mirrors `SessionConfig`) | `import type { I18nConfig } from '@lockness/i18n'` in core (hardens the soft edge, fails `deps:analyze`) |
| The one source of truth for locales + default | `config/i18n.ts` (`defaultLocale`, `validLanguages`); `configureI18n` derives from / must agree with it | `configureI18n` declaring a second default that can diverge from the routing default |
| `t()` output type + param handling | `translator.ts`/`icu.ts` — returns plain `string`; params substituted as literal AST text, never re-parsed (S1) | `t()` returning `HtmlEscapedString`/`raw()`; a param re-interpolated as ICU |
| `make:lang` locale-argument validation | `cli_commands.ts` — shape allowlist + output-path containment check (S2) | Naive `resources/lang/` + `<locale>` concatenation |
| Boot-time install | `packages/i18n/step.ts` (`i18nStep`) + `KernelConfig.i18n` + `core.soft += i18n` | The app hand-wiring the resolver when `config.i18n` is set |
| Ambient `t()` in views | **§12 Q1** — one home: an ALS accessor (`context.ts`) **or** documented prop-threading. If ALS: the pure `Translator`/`icu`/`registry` **never read ALS** (presentation-only), and a `runWithLocale(locale, fn)` test helper ships (A-L1) | `t()` reading `c` from inside JSX two different ways; the pure core reaching for ALS |
| The `make:lang` / `i18n:extract` commands | `packages/i18n/cli_commands.ts` (`registerI18nCommands`) + `stubs/` | Adding them to `cli/commands/make/`; a second key-extractor |
| The catalog file format | TS modules under `resources/lang/` (statically importable — SSG-aligned) | JSON loaded via `Deno.readTextFile` (not enumerable for SSG's build-time locale expansion) |

## 6. Technical context

**Language/Version**: Deno / TypeScript.
**Primary Dependencies**: hard — `@lockness/contract` (Context types + `safeForLog` + the `ContextVariableMap` augmentation), `@lockness/hono` (cookie/header helpers in the resolver). **No message-format dependency** — `Intl.PluralRules`/`NumberFormat` are built into Deno.
**Storage**: none; catalogs are app-provided TS modules.
**Testing**: `Deno.test`. The translator/ICU are pure (no context). The resolver is driven by a **fake context** (route/cookie/header sources). `make:lang`/`extract` run against a temp dir + fixtures.
**Target Platform**: Deno server (+ SSG build-time locale expansion).
**Project Type**: framework library (new package) + a small `@lockness/core` config/step addition.
**Constraints**: strict acyclic DAG; hard rules #1–#9. No cycle (`core` soft-loads `i18n`; `i18n` never imports `core`).
**Scale/Scope**: three children; one new package (`i18n`); a `KernelConfig.i18n` field + `i18nStep` + `core.soft` edge.

### Domain model

- **Bounded context**: message translation + per-request locale resolution.
- **Vocabulary**: *locale* (a BCP-47-ish key, compound `lang-country` or bare `lang`), *catalog* (a locale's message map), *message* (an ICU-subset template), *Translator* (`t` bound to a locale + fallback), *CatalogRegistry* (locale → translator, with language fallback), *resolver* (per-request locale picker).
- **Entities**: none persisted.
- **Value objects**: a locale key, a message template, a parsed ICU node, a resolved translation.
- **Invariants**: a resolved locale is always one of the configured set (or the default) — never a raw request value; a missing key never throws; the ICU parser rejects a malformed message at parse, not mid-render; catalogs are statically enumerable (SSG).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| #1 no direct hono | pass | cookie/header via `@lockness/hono`; Context types via `@lockness/contract` |
| #2 JSR-only, per-package | pass | zero message-format dep (built-in `Intl`); hard deps declared+pinned |
| #3 no `any` | pass | catalog/param values `unknown` + guards; ICU nodes typed |
| #4 Tailwind | pass (N/A) | no UI |
| #5 gate | pass | full gate per child |
| #6 deno.lock | pass | regenerated by deno |
| #7 JSDoc | pass | FR-011 |
| #8 MVC | pass | i18n is infrastructure; the resolver is a middleware; `t` is passed to views by the controller |
| #9 commits | pass | one per child + `chore(deps)` for the package + the core edge |
| DDD | pass | pure translator/ICU core; resolver is the request-boundary adapter |
| Domain Model gate | pass | §6 |

### Complexity tracking

The one notable choice is touching `@lockness/core` (a `KernelConfig.i18n` field + `i18nStep` + a `core.soft` edge) — justified: it is the established session/cache/telemetry auto-install pattern, and a locale resolver is request middleware that must install when configured. Zero message-format dependency is a deliberate simplicity win.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/i18n` (NEW, implementation) | yes | `Translator`, ICU parser/renderer, `CatalogRegistry`, `configureI18n`, the resolver middleware, `ContextVariableMap` augmentation, `i18nStep`, `make:lang`/`i18n:extract` |
| `@lockness/core` | yes | `KernelConfig.i18n` field; `i18nStep` added to `getDefaultSteps()`; `core.soft += "i18n"` — a small feat + a `chore(deps)` |
| `deps.policy.jsonc` | yes | new `i18n` entry (allow: contract, hono) + `core.soft += i18n` — a `chore(deps)` commit |
| Root `deno.jsonc` | yes | workspace member added; `lockness.packages += "i18n"` (so `make:lang` is discovered) |
| `config/i18n.ts` / `app/middleware/i18n_middleware.ts` | no | reused/bridged (the resolver reads `localeKey`); unchanged |
| SSG (`ssg/locales.ts`) | no | unchanged — catalogs are statically enumerable, matching its build-time expansion |
| Docs | yes | an i18n doc + `make:lang`/`i18n:extract` in the CLI reference |

### Documentation (this feature)

```text
.specnaut/specs/202-i18n-translation-layer/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A hostile Accept-Language/cookie indexes a catalog or builds a path (injection / traversal) | FR-006: validate against the configured set before any lookup; unknown → default; bounded length; the raw value is never a key or a path segment |
| A missing key or malformed message crashes a request | FR-001/FR-003: missing key → fallback → key string, no throw; ICU malformed → clear error at **parse/load**, not mid-render |
| Reinventing ICU invites bugs / scope creep | a **documented subset** (interpolation + cardinal plural + select) over built-in `Intl`; unsupported constructs fail clearly; fuller ICU is a scoped follow-up (§12 Q2) |
| Ambient `t()` in views tempts a second lookup path | §12 Q1 homes it once (ALS accessor or prop-threading); the decision table forbids a second |
| The compound-vs-language locale axes (`en-us` vs `en`) mismatch catalogs | language-level fallback (`en-us` → `en` → default); SC-003 proves it |
| Catalogs not enumerable break SSG's build-time locale expansion | FR-004: catalogs are statically-importable TS modules provided to `configureI18n`, not hidden behind runtime file reads |
| Touching `@lockness/core` risks the boot sequence | `i18nStep` mirrors `sessionStep` exactly (guard on config, soft-import, order ~115); `bootstrap_steps` test keeps the registry sorted; `KernelConfig.i18n` typed by a **local** `I18nConfig` (no core→i18n type edge, A-M1) |
| A boot-installed **global** resolver runs outer of the mount `i18nMiddleware` → route source is dead (A1 HIGH) | resolution is **lazy** (`getLocale(c)`/`getTranslator(c)` resolve at access time, after the mount middleware ran); SC-004 proves route wins with `localeKey` set; any eager middleware runs inner of the mount |
| A translation with inline markup / a user-influenced param becomes XSS (S1) | FR-012: `t()` returns plain `string` (never `HtmlEscapedString`/`raw()`); params are data the view escapes, substituted as literal AST text, never re-parsed; SC-007 proves the escaped render |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Verdict: **fail** — 0 critical, 1 HIGH, 4 MEDIUM, 3 LOW. Confirmed sound: i18n is a near-pure sink (2 hard edges contract+hono, 1 soft core→i18n, 0 cycle); the composition-root model (i18nStep + `KernelConfig.i18n` + `core.soft`) is correct (session/cache precedent); TS-module catalogs are SSG-aligned; the ICU subset (Q2a) is right-sized, not speculative.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | **HIGH** — a boot-installed **global** resolver runs outer of the per-mount `i18nMiddleware` that sets `localeKey`, so the route source is dead and route can never win over cookie/header — while §5 forbids re-parsing `langId`/`countryId` | **Plan changed.** FR-005 rewritten: resolution is **lazy via `getLocale(c)`/`getTranslator(c)`**, resolved at access time (after the mount middleware ran, so `localeKey` is set); any eager middleware runs **inner** of the mount. The "no re-parse" rule stands — the accessor reads `localeKey`, it does not re-parse |
| A-M1 | MED — `KernelConfig.i18n` typed by `import('@lockness/i18n')` would be a core→i18n type edge not in `allow` (fails `deps:analyze`) | **Plan changed.** FR-007 + §5 row: `KernelConfig.i18n` typed by a **local `I18nConfig`** in core, mirroring `SessionConfig`/`CacheConfig` |
| A-M2 | MED — the `ContextVariableMap` augmentation diverges from the `getSession(c)` accessor precedent and types a possibly-absent value as present under generic global keys | **Plan changed.** FR-005 + §5 row: the **`getLocale(c)`/`getTranslator(c)` accessor is the primary API** (throws when unconfigured); the augmentation, if kept, is on `@lockness/hono`'s map with **optional** keys |
| A-M3 | MED — two sources of truth for the locale set + default (`config/i18n.ts` vs `configureI18n`) | **Plan changed.** FR-007 + §5 row: `configureI18n` derives from / must agree with `config/i18n.ts`'s `defaultLocale`/`validLanguages`; catalog absence for a routable locale → fallback (intentional) |
| A-M4 | MED — fallback semantics ambiguous (catalog-selection vs per-key cascade) on a partial compound catalog | **Plan changed.** FR-001 + §5 row: a **single per-key cascade** through the language chain, one semantics shared by registry + translator |
| A-L1 | LOW — Q1(a) ALS is the sounder default but the "pure core never reads ALS" invariant + a test helper are unstated | **Recorded.** §5 Ambient-`t()` row: pure `Translator`/`icu`/`registry` never read ALS; ship `runWithLocale(locale, fn)`. Q1(a) recommended |
| A-L2 | LOW — parse-once/memoise lifecycle for messages + locale→translator implied, not homed | **Plan changed.** FR-003 + §5 rows: registry memoises locale→Translator; `icu.ts` parses each message once (AST cache), re-renders from AST |
| A-L3 | LOW — `icu.ts` homes parse + render (a divergent-change risk if the subset grows) | **Recorded.** FR-003: `icu.ts` internally split into parser + renderer; revisit as separate modules only if Q2(b) is ever taken |

**Verdict**: **fail** → folded. The one HIGH (resolver ordering) is closed by lazy resolution; the four MEDIUM are plan-home/typing/reconciliation fixes, all applied before code.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel. Verdict: **needs_followup** — 0 critical/high, 3 MEDIUM, 2 LOW. The runtime path is sound by construction: FR-006's validate-before-lookup + FR-004's static `Record` catalog close locale-injection/path-traversal. The gaps were security invariants not yet written down.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | MED (highest-priority — fix asymmetry) — `t()` output-encoding contract unspecified; a raw-HTML `t()` would bypass JSX auto-escaping (XSS) | **Plan changed.** FR-012 + SC-007: `t()` returns plain `string`, never `HtmlEscapedString`/`raw()`; params are data (view escapes), substituted as literal AST text, never re-parsed; rich markup needs a separate sanitised API |
| S2 | MED — `make:lang` builds a file path from an unvalidated locale (dev-time traversal write); FR-006 covered only the resolver | **Plan changed.** FR-008 + SC-006: shape allowlist + output-path containment check; FR-009 bounds `i18n:extract`'s walk root to the project |
| S3 | MED — the resolver lacked the fixed-string/`safeForLog` log discipline the existing `i18nMiddleware` enforces | **Plan changed.** FR-006a + SC-008: never log a raw request-derived locale; route any logged requested/rejected value through `safeForLog` |
| S4 | LOW — the ICU parser had no nesting-depth / template-size bound (self-DoS on a pathological catalog) | **Plan changed.** FR-003 + SC-009: max depth + max length, parse-once/memoise, clean parse-time error |
| S5 | LOW — no concrete `Accept-Language` cap; cache/`Vary` must key on the resolved locale | **Plan changed.** FR-006: ≤ 256 bytes / ≤ N ranges, over-cap short-circuits; cache keys on the resolved locale only |

**Verdict**: **needs_followup** → resolved in-plan. All five are one-FR/SC now vs a breaking change later; S1 is the priority (pin `t(): string`, params-as-data) — folded.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — ambient `t()` in views.** ALS accessor vs prop-threading. | **`AsyncLocalStorage` accessor** — `t()`/`getLocale()` work in deep JSX with no prop-drilling; the pure `Translator`/`icu`/`registry` never read ALS (presentation-only); a `runWithLocale(locale, fn)` test helper ships. | 2026-09-05 |
| **Q2 — ICU scope for the MVP.** MVP subset vs fuller ICU now. | **Interpolation + cardinal plural + select** over built-in `Intl` — a small bounded parser; ordinal/nested/skeletons are a scoped follow-up if asked. | 2026-09-05 |

### Folded from the audits (not user decisions)

- **A1 (HIGH) is folded as spec** — lazy accessor resolution kills the resolver-ordering break; not a question.
- **S1 (MED, priority)** — `t(): string` + params-as-data is a one-answer correctness invariant (FR-012), not a fork.
- **A-M1..A-M4, S2/S3/S4/S5, A-L1..A-L3** are all folded into FRs / SCs / §5. None reopens a design fork; the composition-root model, the SSG-aligned catalog format, and the ICU subset were confirmed sound.