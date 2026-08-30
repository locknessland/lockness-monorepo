# code-reviewer runbook

## Purpose recap

Block bad merges. Approve clean ones. Be specific, terse, and actionable.

## Review checklist (in order)

1. **Imports**
   - [ ] No `import * from 'hono'` or `import {...} from 'hono'` anywhere.
   - [ ] All Lockness imports use `jsr:@lockness/...`.
   - [ ] All stdlib uses `jsr:@std/...`.
   - [ ] `npm:` specifiers only where a JSR alternative does not exist; flag
         each occurrence and ask if justified.
2. **Type safety**
   - [ ] No `any` in exported declarations. If present, must have
         `// deno-lint-ignore no-explicit-any` with a one-line justification.
   - [ ] Public functions have explicit return types.
   - [ ] Generics used where appropriate; readonly used for immutable props.
3. **JSDoc**
   - [ ] Every exported class/function/method/interface/type has a description.
   - [ ] `@param`, `@returns`, `@throws`, `@example` present where relevant.
   - [ ] File-level `@fileoverview` and `@module` on public modules.
4. **Architecture**
   - [ ] Controllers thin. No direct DB queries inside controllers.
   - [ ] Services contain business logic; repositories handle persistence.
   - [ ] No new circular deps (cf. `docs/dependencies.md`).
5. **Tests**
   - [ ] New code paths have unit tests. Test files end in `.test.ts`.
   - [ ] Tests do not hit live DB; use mocks (cf. `docs/testing.md`).
6. **Stubs and docs**
   - [ ] If the change affects generated code patterns, stubs in
         `packages/cli/stubs/make/` or `packages/init/stubs/` are updated (cf.
         `docs/STUBS.md`).
   - [ ] Public-API changes carry corresponding doc updates (delegate the actual
         writing to docs-writer; just flag the gap).
7. **Pre-completion gate**
   - [ ] Confirm `deno fmt --check && deno lint && deno task test` passes on the
         branch (run them yourself; do not trust commit messages).

## Conventions

- Quote line numbers as `<path>:<start>-<end>` (matches Claude Code's navigation
  hint format).
- Keep findings ≤ 2 lines each unless the issue genuinely requires more.
- Group findings by file in the order they appear in the diff.

## Gotchas

- A green local test run does not imply CI green — check the workflow file if
  the CI matrix includes anything not in your local run.
- Drizzle migrations live in `app/database/migrations/` — schema changes there
  should be reviewed against `docs/models.md`.
- Controllers may legitimately be thin wrappers around services that handle I/O;
  do not flag this as anti-pattern.

## References

- `docs/contribution.md`
- `docs/architecture.md`
- `docs/dependencies.md`
- `docs/STUBS.md`
- `docs/testing.md`
- `AGENTS.md` (project hard rules)
