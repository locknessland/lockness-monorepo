# Contributing to Lockness

Lockness is a monorepo containing multiple libraries. Contributing to the core
of the framework requires understanding how the workspace is structured.

## Monorepo Structure

The project uses **Deno Workspaces** to manage multiple internal libraries. All
core libraries are located in the `packages/` directory:

- `@lockness/core`: The web framework core (routing, controllers, etc.)
- `@lockness/auth`: Authentication system
- `@lockness/cli`: CLI engine
- `@lockness/drizzle`: Database integration
- ...and more.

## Development Workflow

### Deno Workspaces

Deno Workspaces allow you to use the final import names (e.g., `@lockness/core`)
in your code. Deno automatically resolves these to the local folders in the
workspace.

You don't need to change any imports when switching between development and
production.

### Naming Convention

Each library in the workspace follows the Deno convention for its entry point:

- **`mod.ts`**: This is the main entry point of the library. It exports the
  public API.
- **`deno.json`**: Each library has its own configuration and versioning.

### `mod.ts` is a barrel, not a home for implementation

A package's `mod.ts` is its **public-surface barrel**: it re-exports the names
the package publishes and holds no implementation of its own. Implementation
lives in named modules beside it, grouped by reason-to-change, and `mod.ts`
re-exports them:

```ts
// packages/<pkg>/mod.ts — a barrel
export * from './rules/mod.ts'
export * from './sanitisers/mod.ts'
export type { ValidationResult } from './validation.ts'
```

```ts
// packages/<pkg>/rules/mod.ts — the actual code
export function email(): Rule {/* … */}
```

This is the pattern `core`, `auth` and `session` already follow, and the one the
rest of the workspace is normalised to (epic #225). It keeps the public surface
readable in one place, lets each concern change without re-touching an unrelated
one, and means a reader can learn what a package exposes by reading its `mod.ts`
alone.

**Why it matters:**

- **Cohesion** — a 700-line `mod.ts` braids validators, sanitisers and the Zod
  bridge into one file that changes for five unrelated reasons. Splitting along
  those reasons is the whole point.
- **Stable surface** — because `mod.ts` only re-exports, moving a function
  between internal modules never changes what consumers import. The barrel is
  the contract; the modules behind it are free to move.
- **No hidden singletons** — module-level mutable state that leaks out through a
  `reset*()` test hook belongs on an owning object, not in the barrel. If a
  `mod.ts` needs a reset export to be testable, that state is in the wrong
  place.

**Exempt** are files that are legitimately not barrels: a composition
root/bootstrap facade (e.g. `core/app.ts`), pure type-declaration modules, and
cohesive single-component files (e.g. `ui/components/*/mod.tsx`).

### Running Tests

To ensure your changes don't break the framework, run the global test suite:

```bash
deno task test
```

This will run all tests for all libraries in the workspace.

### Version Management

When releasing a new version of Lockness, all packages in the monorepo need to
be bumped to the same version. Use the `bump` command with an increment:

```bash
deno task bump --patch    # or --minor / --major, or a bare: minor
```

It delegates to Deno's native `deno bump-version` (Deno ≥ 2.8) in workspace
mode, which automatically:

- Updates the `version` field in all workspace packages' `deno.json`
- Updates all inter-package dependencies (e.g., `@lockness/core@^0.1.0` →
  `@lockness/core@^0.2.0`), preserving version prefixes (`^` / `~`) and subpath
  exports (`@lockness/hono@^0.2.0/jsx-runtime`)
- Preserves the comments in the root `deno.jsonc`

An absolute `deno task bump 0.3.0` is accepted when it is exactly one step from
the current version. For an arbitrary jump, use `deno task bump:legacy 0.3.0`
(the pre-adoption script, kept as a fallback — see
[releasing.md](releasing.md)).

**After bumping:**

1. Review changes: `git diff`
2. Run tests: `deno task test`
3. Commit: `git commit -am "chore: bump version to 0.2.0"`
4. Publish packages: `deno publish` (in each package directory)

## Contributing

1. **Fork the repository**:
   [locknessland/lockness-monorepo](https://github.com/locknessland/lockness-monorepo)
2. **Create a branch**: `git checkout -b feature/my-new-feature`
3. **Make your changes**: Ensure you follow the `mod.ts` convention for exports.
4. **Test your changes**: Run `deno task test` to verify everything works.
5. **Submit a Pull Request**: Describe your changes and why they are needed.

## Local Development linking

If you want to test your local changes in another project, you can use the
`imports` section of your project's `deno.json` to point to your local clones of
the Lockness libraries, or better, use the workspace feature if your project is
also a monorepo.
