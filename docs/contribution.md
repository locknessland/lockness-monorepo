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
- **`package.json`**: Each library's one hand-edited manifest — name, version,
  dependencies, `engines`, exports, and a `lockness` key for what only Deno and
  JSR need. Membership is the root `package.json` `workspaces` list. Published
  runtime code imports only siblings, `node:` built-ins and npm packages, each
  declared here; `@std/*` and other JSR-only packages are for tests and tooling
  (hard rule #2 in [AGENTS.md](../AGENTS.md)).
- **`deno.json`** and **`tsconfig.json`**: generated from `package.json` by
  `deno task manifests` and committed. Never edit them by hand; the gate's
  `manifests --check` step fails on a stale one.

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

Before you push, run the full gate (`deno task gate`; the pre-push hook runs it
too). Besides Deno (`.dvmrc`), the gate needs **Node and npm** on your `PATH`,
at the version in `.node-version`: its `npm:build` and `npm:check` steps build
each package whose `engines` names bun or node with `tsc`, then pack, install
and import it as npm would ship it. Once such a package names Bun, the gate
needs Bun too (`.bun-version`). A missing runtime, or one at another major
version than its pin file, fails the step and names that file; nothing is
skipped. See [releasing.md](releasing.md#the-npm-build-and-npmcheck).

### Repository lint rules

The gate's `lint` step runs Deno's rules and the repository's own plugins,
registered in the root `deno.jsonc` under `lint.plugins`. Each lives in
`scripts/lint/`, and its rule file names its scope and its owners — the only
files allowed the form it forbids:

| Rule                                              | Forbids                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| :------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lockness/app-file-specifier`                     | a hand-built specifier for a file of the user's app in package source                                                                                                                                                                                                                                                                                                                                                                                              |
| `lockness-env/env-signal`                         | a raw read of `APP_ENV` or `DENO_ENV` (`Deno.env.get`, `process.env.APP_ENV`, any `.APP_ENV` read, a read-first assignment such as `??=`, or destructuring) outside the contract resolver and `@lockness/transform`'s `hook.ts`. Matching any object also reports a name that is not the process environment (`parsed.APP_ENV` on a parsed `.env` map, a DTO): such a site carries `// deno-lint-ignore lockness-env/env-signal` with the reason on the line above |
| `lockness-exit/process-exit`                      | `Deno.exit` / `process.exit`, `exit` destructured from `Deno` or `process` or imported from `node:process`, and `Deno.exitCode` / `process.exitCode` writes, in package code outside their owners                                                                                                                                                                                                                                                                  |
| `lockness-exit/printed-failure`                   | a `❌` print in command code: a command fails by throwing                                                                                                                                                                                                                                                                                                                                                                                                          |
| `lockness-runtime/no-deno` (`runtime_neutral.ts`) | in runtime-neutral code: the `Deno` global, `hono/deno`, and `@lockness/hono/{deno,bun,node}` outside `packages/runtime/`                                                                                                                                                                                                                                                                                                                                          |
| `lockness-runtime/neutral-imports`                | in a runtime-neutral script: a relative static import (type-only, re-exports and `import()` included) of a file outside the runtime-neutral scope. Bare specifiers are not checked                                                                                                                                                                                                                                                                                 |

Runtime-neutral code is, tests and stubs excluded:

- the source of every package whose `engines` names bun or node. Adding `bun` or
  `node` to a package's `engines` therefore puts its source under the rule; use
  a `node:` built-in or a web standard instead of `Deno.*`. A file that must
  stay Deno-only is exempted by its exact path in `EXEMPT_FILES`, with the
  reason beside it;
- every script under `scripts/`, by default, except the modules listed in
  `lint.plugins` (typed on `Deno.lint`, rewritten when the lint leaves Deno) and
  the baseline in `scripts/lint/deno_bound_scripts.ts`. A new script is in scope
  without opting in. The baseline holds the older scripts that still use Deno
  and **only shrinks**: a test fails on an entry that complies or no longer
  exists, so a script you migrate leaves the list in the same change. Adding an
  entry is refused in review unless the script needs a Deno-only runtime API,
  named in the commit.

To run the packages that declare Bun or Node in their `package.json` `engines`
on that runtime — what the `bun` and `node` CI lanes run — use:

```bash
deno task test:runtime --runtime=bun
deno task test:runtime --runtime=node --package=<pkg>
```

It needs the runtime on your `PATH` (the CI versions are in `.bun-version` and
`.node-version`). See
[testing.md](testing.md#running-on-bun-and-node-the-runtime-lanes).

### Version Management

When releasing a new version of Lockness, all packages in the monorepo need to
be bumped to the same version. Use the `bump` command with an increment:

```bash
deno task bump --patch    # or --minor / --major, or a bare: minor
```

It runs `scripts/bump.ts`, which:

- Updates the `version` field in every member's `package.json`, the source
  manifest
- Updates every `@lockness/*` range in their `dependencies`, `peerDependencies`
  and `devDependencies` (e.g. `^0.1.0` → `^0.2.0`), keeping the `^` / `~` prefix
- Updates the root `deno.jsonc` `version` and its `@lockness/*` imports,
  preserving its comments
- Regenerates every member's `deno.json` with `deno task manifests`

An absolute `deno task bump 0.3.0` is accepted for any jump. The command ends by
refreshing `deno.lock` with `deno install`; commit it with the manifests.
`--dry-run` previews it without writing. See [releasing.md](releasing.md).

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
