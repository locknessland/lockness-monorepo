# Tasks: i18n / translation layer

**Feature**: `202-i18n-translation-layer` | **Epic**: [#202](https://github.com/locknessland/lockness-monorepo/issues/202) | **Children**: [#203](https://github.com/locknessland/lockness-monorepo/issues/203), [#204](https://github.com/locknessland/lockness-monorepo/issues/204), [#205](https://github.com/locknessland/lockness-monorepo/issues/205)

**One `tasks.md`, one branch, one flat merge.** Each child is one commit
(`type(T<NN>): subject (#child)` + `Epic: #202` trailer). The `T00N` counter is
the task counter, **not** the commit scope position — see `phases/epic-loop.md`.
TDD per child, full gate before each commit. **Decisions**: ALS accessor for
ambient `t()`; ICU MVP subset (interpolation + cardinal plural + select).

---

## Phase 1: Setup — new package (child #203)

- [ ] T001 [US1] Create `packages/i18n/deno.json` (name `@lockness/i18n`, exports `./mod.ts`, hard deps `@lockness/contract` + `@lockness/hono` pinned JSR-bare) and register the workspace member + `lockness.packages += "i18n"` in root `deno.jsonc`
- [ ] T002 [US1] Add the `i18n` entry to `deps.policy.jsonc` — tier implementation, `allow: [contract, hono]` — and `core.soft += "i18n"`, committed on its own as `chore(deps)`
- [ ] T003 [US1] Add `i18n` to `tests/package_structure.test.ts` PACKAGES list

## Phase 2: Catalog + Translator + ICU (child #203, US1)

**Goal (US1)**: `t(key, params)` with interpolation, ICU cardinal plural + select, and per-key language-cascade fallback. **Independent test**: SC-001/002/003/007/009.

- [ ] T004 [P] [US1] Write `packages/i18n/tests/icu.test.ts` — SC-001/002/009: `{count, plural, one {# item} other {# items}}` via `Intl.PluralRules`; `{g, select, …}`; `{name}` interpolation; a malformed message + an over-depth/over-length message fail cleanly at **parse** (S4)
- [ ] T005 [P] [US1] Write `packages/i18n/tests/translator.test.ts` — SC-001/003/007: missing key → key string (no throw); per-key language cascade `en-us`→`en`→default; `t()` returns a plain `string` (not `HtmlEscapedString`) and a param containing `{x}` is **not** re-interpolated (S1)
- [ ] T006 [US1] Implement `packages/i18n/icu.ts` — parser (string→AST, depth+length bounds, S4) + renderer (AST+params+`Intl.PluralRules`/`NumberFormat`→string); params substituted as **literal AST text**, never re-parsed (S1, FR-012)
- [ ] T007 [US1] Implement `packages/i18n/translator.ts` — `Translator` (`t`/`trans`), parse-once/memoised AST, plain-`string` return (FR-001, FR-002, FR-012)
- [ ] T008 [US1] Implement `packages/i18n/registry.ts` (`CatalogRegistry` — memoises locale→Translator, per-key cascade) + `config.ts` (`configureI18n({ catalogs, defaultLocale, fallbackLocale })`, derives default from `config/i18n.ts`, FR-004/A-M3)
- [ ] T009 [US1] Create `packages/i18n/mod.ts` (public surface so far), `AGENTS.md`, `README.md`; `@fileoverview`/`@module`
- [ ] T010 [US1] Full gate for #203 (`run-gate.sh full`), then commit `feat(T01): i18n catalog loader + t() + ICU plurals (#203)` with `Epic: #202`

## Phase 3: Lazy locale resolver + accessors + boot (child #204, US2)

**Goal (US2)**: lazy `getLocale(c)`/`getTranslator(c)` (route→cookie→header→default), validated + bounded, ALS ambient `t()`, and boot wiring. **Independent test**: SC-004/005/008.

- [ ] T011 [P] [US2] Write `packages/i18n/tests/resolver.test.ts` — SC-004/005/008: fake context, `localeKey` pre-set so route wins over cookie over header over default; a hostile/over-cap `Accept-Language`/cookie falls back to default and never indexes a catalog raw (S5); a fallback diagnostic over `en%0aFAKE` logs one `safeForLog`-encoded line (S3)
- [ ] T012 [P] [US2] Write `packages/i18n/tests/context.test.ts` — `getTranslator(c)` memoises + throws when unconfigured (getSession precedent); `runWithLocale(locale, fn)` makes ambient `t()` resolve inside the ALS scope; the pure Translator never reads ALS (A-L1)
- [ ] T013 [US2] Implement `packages/i18n/resolver.ts` — lazy resolution (route from `c.get('localeKey')` → cookie → header → default, order configurable), validate against the configured set before lookup, bounds + `safeForLog` (FR-005/FR-006/FR-006a); optional eager pre-warm middleware (runs inner of the mount)
- [ ] T014 [US2] Implement `packages/i18n/context.ts` — `getLocale(c)`/`getTranslator(c)` accessors (memoise on `c`), the `AsyncLocalStorage` scope + `runWithLocale`, and an **optional** `@lockness/hono` `ContextVariableMap` augmentation with optional keys (A-M2)
- [ ] T015 [US2] Implement `packages/i18n/step.ts` (`i18nStep`, order ~115) + add the local `I18nConfig` interface + `KernelConfig.i18n` field to `@lockness/core` (`kernel_decorators.ts`), register `i18nStep` in `getDefaultSteps()` (`registry.ts`), keeping it ascending (A-M1, FR-007)
- [ ] T016 [US2] Export the resolver/accessor/step surface via `mod.ts`; update `AGENTS.md`/`README.md`; regenerate the core reexport baseline if the core surface grew
- [ ] T017 [US2] Full gate for #204 (incl. `bootstrap_steps` sorted assertion + core reexport baseline), then commit `feat(T02): per-request locale resolver + accessors + boot (#204)` with `Epic: #202`

## Phase 4: make:lang + i18n:extract (child #205, US3)

**Goal (US3)**: scaffold catalogs + extract keys. **Independent test**: SC-006.

- [ ] T018 [P] [US3] Write `packages/i18n/tests/cli_commands.test.ts` — SC-006: `make:lang fr-fr` scaffolds `resources/lang/fr_fr.ts` + registers; `make:lang '../../etc/x'` is **rejected** (shape allowlist + containment) and writes nothing (S2); temp-cwd hermetic
- [ ] T019 [P] [US3] Write `packages/i18n/tests/extract.test.ts` — `i18n:extract` finds `t('a.b')`/`trans('c')` string-literal keys in a fixture, reports a missing + an unused key, flags a dynamic key as un-extractable (never guessed); walk bounded to the project (S2)
- [ ] T020 [US3] Implement `packages/i18n/extract.ts` — source walk (bounded root), string-literal key scan, missing/unused diff (FR-009)
- [ ] T021 [US3] Implement `packages/i18n/cli_commands.ts` (`registerI18nCommands`, structural `Cli`, local stub reader) + `stubs/lang.stub` — `make:lang` (shape allowlist + path containment, S2) + `i18n:extract`
- [ ] T022 [US3] Full gate for #205, then commit `feat(T03): make:lang + message-extraction tooling (#205)` with `Epic: #202`

## Phase 5: Polish & cross-cutting

- [ ] T023 Add `docs/i18n.md` (catalogs, t()/ICU subset, lazy resolver + accessors, ALS ambient t(), make:lang/extract, the config/i18n.ts bridge + single-source-of-truth) + link from the AGENTS.md docs index
- [ ] T024 `deno task agents:brief` regenerate; final full gate on the whole branch before the review handoff

---

## Dependencies & order

- **#203 → #204 → #205** (strict): the resolver/accessors need the registry + translator; the commands scaffold catalogs the registry consumes.
- Within a child, `[P]` test tasks are written together, then implementation.

## Parallel opportunities

- #203: T004 ∥ T005. #204: T011 ∥ T012. #205: T018 ∥ T019.

## MVP

**US1 (#203)** alone is the MVP checkpoint — catalogs + `t()` + ICU against provided catalogs. US2/US3 are the full path in the same branch.

## Independent test criteria

- **US1**: plural/select/interpolation render; missing key → key; cascade fallback; `t(): string` escaped in JSX.
- **US2**: accessor picks route>cookie>header>default; hostile input → default; ambient `t()` via ALS.
- **US3**: `make:lang` scaffolds + rejects traversal; `i18n:extract` finds/diffs keys.
