# developer runbook

## Purpose recap

Implement clean Lockness code with green tests, every commit. TDD first, last,
always.

## Branch hygiene at start

When you create a feature branch off `main`, the repo's pre-commit hook may have
left unstaged formatting drift in `docs/` or other files from a previous commit
on `main` (the linter reformats post-commit; the new working-tree version isn't
auto-staged). Right after `git checkout -b feat/<slug>`:

1. Run `git status --short` — if you see `M` on files outside the scope of your
   task, run `git checkout -- <path>` to discard the drift on this branch. The
   drift will be re-swept on `main` later.
2. Only then start the TDD cycle below.

This avoids accidentally committing stray formatting changes alongside your
feature, which would muddy the diff for the code-reviewer.

## TDD cycle (per slice)

1. **Branch**: `git checkout -b feat/<slug>` (or `fix/<slug>`) off `main`.
2. **Failing test**: write the smallest test that captures the behavior.
3. **Run it red**: `deno test <path>` — confirm the failure mode is what you
   expect (not a typo).
4. **Implement minimum**: the simplest code that turns the test green.
5. **Run all tests for the package**: `deno task test packages/<pkg>/tests/`.
6. **Format + lint + check**:
   ```bash
   deno fmt <changed-files>
   deno lint <changed-files>
   deno check <changed-files>
   ```
7. **Commit**: focused, one logical change per commit. Conventional commit
   prefix: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.

## Lockness coding rules

- Imports: `jsr:@lockness/...` and `jsr:@std/...`. Never `import "hono"`.
- Types: explicit return types on exports. No `any` without
  `// deno-lint-ignore no-explicit-any` + justification.
- JSDoc on every exported declaration (description + `@param`/`@returns`/
  `@throws`/`@example` where relevant).
- MVC layering:
  - Controller: thin, delegates to service.
  - Service: business logic.
  - Repository/model: persistence.
- Tailwind v4 syntax: `bg-(--var)` for variables, `bg-[value]` for literals.
- Tests: `*.test.ts` next to source or in `tests/`. Use `Deno.test`. Mock
  external deps (DB, network).

## Pre-completion gate

Before declaring a slice or the whole task done:

```bash
deno fmt --check
deno lint
deno check <all-changed-files>
deno task test
```

All four must pass. If any fail, fix and re-run. Never declare done red.

## Branch and commit conventions

- Branch: `feat/<slug>`, `fix/<slug>`, `refactor/<slug>`, `docs/<slug>`.
- Commit message format:
  ```
  <type>(<scope>): <imperative summary>

  <optional body>
  ```
  Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- One logical change per commit. Don't bundle unrelated edits.

## Stubs

If a change affects generated code patterns (CLI scaffolding, init templates),
the corresponding `.stub` file in `packages/cli/stubs/make/`,
`packages/init/stubs/init/`, or a package-specific `stubs/` must be updated. See
`docs/STUBS.md` for the mapping. If unsure, escalate — do not silently skip a
stub.

## Gotchas

- `deno.lock` is generated. Never edit by hand.
- Decorators: this project uses TC39 Stage 3 decorators (Deno-native), not
  TypeScript experimental decorators. The `deno.json` `compilerOptions.jsx` is
  `precompile` with `jsxImportSource: @lockness/core` — don't change it.
- `deno task test` runs the whole workspace suite. Use
  `deno task test packages/<pkg>/tests/` to scope while iterating.
- `deno task dev` runs the app; `deno task css:watch` runs the Tailwind watcher.
  Both are needed for UI work.

## References

- `docs/getting-started.md`
- `docs/middleware.md`
- `docs/models.md`
- `docs/testing.md`
- `docs/STUBS.md`
- `AGENTS.md`
- `.claude/CLAUDE.md`
