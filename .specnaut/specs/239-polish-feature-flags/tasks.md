# Tasks: Polish — feature flags, search, mail depth

**Feature**: `239-polish-feature-flags` | **Epic**: [#239](https://github.com/locknessland/lockness-monorepo/issues/239) | **Children**: [#240](https://github.com/locknessland/lockness-monorepo/issues/240), [#241](https://github.com/locknessland/lockness-monorepo/issues/241), [#242](https://github.com/locknessland/lockness-monorepo/issues/242)

**One `tasks.md`, one branch, one flat merge.** Each child is one commit
(`type(T<NN>): subject (#child)` + `Epic: #239` trailer). The three children are
**independent** — the order below is by number, not dependency. TDD per child,
full gate before each commit. **Decisions**: app-supplied flag scope; mail-side
native preview handler; memory-only search engine.

---

## Phase 1: Feature flags — new `@lockness/features` (child #240, US1)

- [x] T001 [US1] Create `packages/features/deno.json` (name `@lockness/features`, exports `./mod.ts`, hard dep `@lockness/contract` pinned) + register the workspace member + `lockness.packages += "features"` in root `deno.jsonc`; add `features` to `deps.policy.jsonc` (`allow: [contract]`) and `tests/package_structure.test.ts` — the deps entry on its own `chore(deps)`
- [x] T002 [P] [US1] Write `packages/features/tests/features.test.ts` — SC-001/001a/002: rollout stable per scope; override wins (override→definition→default off); unknown flag → off; a throwing resolver / erroring driver → false, no throw (S6); a distribution check over N scopes (S002)
- [x] T003 [US1] Implement `packages/features/rollout.ts` (one stable-hash `(flag, scopeKey) → side`, no `Math.random`) + `driver.ts` (`FlagDriver`) + `drivers/memory.ts`
- [x] T004 [US1] Implement `packages/features/features.ts` (`configureFeatures`, `features()`, `active`/`value`/`activate`/`deactivate`; resolution order + `scopeKey` one home; fail-closed FR-001a) + `mod.ts` + `AGENTS.md`/`README.md` (docs: flags are not an authz boundary, scope must be verified, FR-003a)
- [x] T005 [US1] Implement `packages/features/cli_commands.ts` (`registerFeaturesCommands`, `make:flag`, structural `Cli`, shape+containment) + `stubs/`
- [x] T006 [US1] Full gate for #240, then commit `feat(T01): feature flags + rollout + memory driver (#240)` with `Epic: #239`

## Phase 2: Full-text search — new `@lockness/search` (child #241, US2)

- [x] T007 [US2] Create `packages/search/deno.json` (`@lockness/search`, `allow: [contract]`) + workspace member + `lockness.packages += "search"` + deps.policy entry (own `chore(deps)`) + package_structure
- [x] T008 [P] [US2] Write `packages/search/tests/search.test.ts` — SC-003/003a: index+query ranked; re-index replaces (no dup); delete removes; no-match → empty; a regex-metachar query matched as literal tokens (never a regex, S7); over-length query / over-large doc bounded
- [x] T009 [US2] Implement `packages/search/driver.ts` (`SearchDriver`) + `drivers/memory.ts` (one shared linear tokeniser for index+query; inverted index; caps on query/token/doc size, S7)
- [x] T010 [US2] Implement `packages/search/search.ts` (`configureSearch`, `search(index)` facade + `Searchable` contract + `search().index(searchable)` overload, L2) + `mod.ts` + `AGENTS.md`/`README.md` (index-sync is the app's responsibility, M2; `reindex`)
- [x] T011 [US2] Implement `packages/search/cli_commands.ts` (`registerSearchCommands`, `make:searchable`, shape+containment) + `stubs/`
- [x] T012 [US2] Full gate for #241, then commit `feat(T02): full-text search abstraction + memory driver (#241)` with `Epic: #239`

## Phase 3: Mail depth — extend `@lockness/mail` (child #242, US3)

- [x] T013 [US3] Add `mail.soft += markdown, queue` to `deps.policy.jsonc` (own `chore(deps)`; mail's `allow` stays `[]`)
- [x] T014 [P] [US3] Write `packages/mail/tests/mailable.test.ts` — SC-004: a markdown mailable renders markdown→HTML via a fake importer through mail's local `tryImport`; a missing `@lockness/markdown` → the fixed install error (H1, no value/type import)
- [x] T015 [P] [US3] Write `packages/mail/tests/queued.test.ts` — SC-005/005a: a queued mailable enqueues one identifiers-only job (fake queue), no rendered HTML/recipient in the payload; the job rehydrates via the allowlist registry + sends in `handle()`; an unregistered mailable is rejected without instantiation (S3)
- [x] T016 [P] [US3] Write `packages/mail/tests/preview.test.ts` — SC-006/006a: capture on/off; bounded ring buffer (keep most-recent N, S4); a `<script>` subject/body renders inert (sandboxed iframe + encoded metadata, S1); `APP_ENV=production` → handler 404s + captures nothing even if enabled (S2)
- [x] T017 [US3] Implement `packages/mail/optional.ts` (mail's OWN local `tryImport`, mirrors notification/optional.ts — never from core/notification, H1) + `mailable.ts` (`Mailable`; markdown body via local `tryImport`, render result `unknown`)
- [x] T018 [US3] Implement `packages/mail/queued.ts` (identifiers-only job + `registerMailable(name, factory)` allowlist registry, app-explicit; schema-validated payload; unregistered → clear error, S3/M1)
- [x] T019 [US3] Implement `packages/mail/preview.ts` (bounded capture store + enabled-toggle + send→capture tap + native `mailPreviewHandler` with sandboxed-iframe body, encoded metadata, request-time prod fail-closed, auth-gate note, S1/S2/S4/M4) + wire the send→capture tap in `mail.ts`
- [x] T020 [US3] Implement `packages/mail/cli_commands.ts` (`registerMailCommands`, `make:mail`, shape+containment, S9) + `stubs/`; export the new surface via `mod.ts`; `lockness.packages += "mail"` if needed for `make:mail`; update `AGENTS.md`/`README.md`
- [x] T021 [US3] Full gate for #242, then commit `feat(T03): markdown mailables + queued mail + dev preview (#242)` with `Epic: #239`

## Phase 4: Polish & cross-cutting

- [x] T022 Add `docs/polish.md` (or three sections: feature flags, search, mail depth) + link from the AGENTS.md docs index; `deno task agents:brief` regenerate; final full gate on the whole branch before the review handoff

---

## Dependencies & order

- The three children are **independent**; done in number order for clarity. Each is a self-contained commit.
- Within a child, `[P]` test tasks are written first (TDD), then implementation.

## Parallel opportunities

- #240: T002 alone. #241: T008 alone. #242: T014 ∥ T015 ∥ T016.

## MVP

Any one child is a shippable increment; there is no MVP dependency between them.

## Independent test criteria

- **#240**: rollout stable per scope + distribution; override wins; fail-closed.
- **#241**: index/query/delete + re-index replace; query is literal tokens, bounded.
- **#242**: markdown body renders; queued job is identifiers-only + allowlist-rehydrated; preview inert + prod-fail-closed + bounded.
