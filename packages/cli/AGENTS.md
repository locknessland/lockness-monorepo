# `@lockness/cli` — agent brief

The command system behind `./nessy`. `mod.ts` exposes the `Cli` class and the
command registration API; `commands/` holds the built-in commands; `stubs/`
holds the templates `make:*` copies. Other packages register their own commands
into this registry rather than shipping their own binaries.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Invariants

- **The dependency contract above is binding.** Importing anything outside it
  fails `deno task deps:analyze`, and the failure is a design question, not a
  lint to silence.

- **A failed command never exits 0 (#428).** A handler reports failure by
  throwing; `Cli.dispatch()` is the one place that prints it (once) and maps it
  to a status, and `Cli.run()` writes a non-zero status to `Deno.exitCode`.
  Automation branches on that status, not on output text. Breaks when:
  - a handler prints `❌` and returns — the process exits 0 and CI reads the
    failure as success;
  - `run()` calls `Deno.exit()` — `finally` blocks (a `db.close()`) are skipped
    and buffered output is cut off;
  - the failure check becomes `instanceof CommandFailedError` — it is matched by
    **shape** (any `Error` with an integer `exitCode`) so packages that must not
    import cli (mail, features, search, scheduler, i18n) can meet it with a
    local subclass, and so two loaded copies of this package still agree.
- **`command_failure.ts` imports nothing.** It is published as
  `@lockness/cli/command-failure` so a package whose commands load at app boot
  (`@lockness/drizzle`) can throw `CommandFailedError` without pulling the
  barrel's ~260-module command graph into every web process.

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                                                                                                  |
| :--------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| Imports (static)                               | `contract`, `events`, `queue`                                                                                             |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                                                                         |
| Imported by                                    | `drizzle`, `init`, `openapi`                                                                                              |
| **Must never import**                          | `core`, `drizzle`, `init`, `notification`, `openapi` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                |
| :-------- | :----------------------------------------------------------------------------------------------------- |
| class     | `Cli`, `CommandFailedError`, `Stub`                                                                    |
| function  | `Command`, `addPackage`, `loadPackageCommands`, `registerAll`, `registerCoreCommands`, `removePackage` |
| interface | `CommandContext`, `CommandContract`, `CommandFailedErrorOptions`, `CommandMetadata`                    |
| typeAlias | `CommandClass`, `CommandFailure`, `CommandHandler`                                                     |
| variable  | `cli`                                                                                                  |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                                   | Path                                   |
| ----------------------------------------- | -------------------------------------- |
| Registering a new built-in command        | `core_commands.ts`                     |
| A `make:*` scaffold                       | `commands/make_commands.ts` + `stubs/` |
| Loading commands from installed packages  | `package_loader.ts`                    |
| Stub resolution and variable substitution | `stubs.ts`                             |

## Pitfalls

- A stub added under `stubs/` is not picked up until it is referenced from the
  command that emits it; there is no directory scan.
- `mod.ts` documents `@lockness/drizzle` in a JSDoc `@example`. That is a
  comment, not an import — this package does not depend on drizzle, drizzle
  depends on it.

## Tests

<!-- generated:tests -->

14 test files for 39 source files:

- `packages/cli/tests/app_file.test.ts`
- `packages/cli/tests/cli_dispatch.test.ts`
- `packages/cli/tests/debug_commands.test.ts`
- `packages/cli/tests/make_command.test.ts`
- `packages/cli/tests/make_component.test.ts`
- `packages/cli/tests/make_controller.test.ts`
- `packages/cli/tests/make_event.test.ts`
- `packages/cli/tests/make_job.test.ts`
- `packages/cli/tests/make_listener.test.ts`
- `packages/cli/tests/make_middleware.test.ts`
- `packages/cli/tests/make_resource.test.ts`
- `packages/cli/tests/make_service.test.ts`
- `packages/cli/tests/make_view.test.ts`
- `packages/cli/tests/queue_commands.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno task gate             # the full gate, as the pre-push hook runs it
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 14 test files directly —

```bash
deno test -A packages/cli/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
