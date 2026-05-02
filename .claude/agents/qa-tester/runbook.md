# qa-tester runbook

## Purpose recap

Verify that what the developer shipped matches what the issue asked for.
Integration + e2e + manual. No unit tests, no production-code edits.

## Test taxonomy in this project

- **Unit tests** (developer): in `tests/<feature>.test.ts` next to the
  package or in the package's `tests/` directory. Mocked dependencies. Fast.
  → **Not your responsibility.**
- **Integration tests** (you): test multiple components together —
  controller + service + repository, middleware composition, kernel boot
  with a config. Often still mocked at the system boundary (DB, HTTP).
- **E2E tests** (you, when applicable): full request → response cycle.
  Spin up the kernel with a test config; hit endpoints with `fetch` against
  the in-process app.
- **Manual golden paths** (you, when applicable): run dev server, CLI
  commands, observe UI.

## Validation flow

1. **Read the issue + acceptance criteria.** Each criterion gets a row in
   your final report.
2. **Read the diff** to understand what changed. If something changed that
   isn't covered by an acceptance criterion, flag it (could be scope creep
   or hidden side-effect).
3. **For each criterion**, pick a verification path:
   - Behavioral / API change → integration test.
   - End-to-end user flow → e2e test.
   - CLI command output → manual run + capture output.
   - UI behavior → manual `deno task dev` + browser exercise.
4. **Add integration/e2e tests** under the appropriate `tests/` directory.
   Same `Deno.test` style as unit tests; difference is scope, not syntax.
5. **Run the full suite**: `deno task test`. Run format/lint/check too —
   they should already pass from the developer, but verify.
6. **Manual runs** (when relevant): take notes, attach output excerpts to
   your report.
7. **Produce the report.**

## Manual golden paths reference

| What | Command | Observe |
|---|---|---|
| Dev server | `deno task dev` | Boot logs clean, target route renders, no console errors |
| CSS watcher | `deno task css:watch` | File changes trigger rebuild |
| Routes generation | `deno task routes:generate` | `app/routes.ts` updated, no diff noise |
| CLI `make:controller` | `deno task cli make:controller <Name>` | File created, structure matches stub |
| CLI `db:migrate` | `deno task cli db:migrate` | Migrations run, schema applied |
| Compile binary | `deno task compile` | `_dist/lockness` produced, runs |
| Tinker REPL | `deno task cli tinker` | REPL boots, services injectable |

## Mocks vs live

- Database: never hit a live DB. Mock per `docs/testing.md` or use the
  in-memory test driver.
- Network: mock with `globalThis.fetch` overrides or the project's HTTP
  test helpers.
- Time: use the deterministic time helpers from `docs/testing.md`.

## Conventions

- Test file naming: `*.test.ts` for unit-style tests; integration tests
  often live in `tests/integration/` or the package's `tests/`. Follow
  the existing convention in the package you're touching.
- Test names: `Deno.test('<unit> - <behavior under condition>', ...)`.
- Mark slow tests explicitly with `{ name: '...', ignore: !env.SLOW }`.

## Gotchas

- `deno test` permissions: many tests need `-A` or specific
  `--allow-net=...` / `--allow-read=...`. Check the package's `deno task
  test` task definition.
- Fast tests are the goal: aim < 50ms per test on average. If a test takes
  seconds, it should be in an opt-in slow suite.
- The dev server hot-reloads on file changes — restart it after dependency
  changes.

## References

- `docs/testing.md`
- `docs/getting-started.md` (for golden-path commands)
- `AGENTS.md`
- `.claude/CLAUDE.md`
