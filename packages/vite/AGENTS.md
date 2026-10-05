# `@lockness/vite` — agent brief

_One or two sentences: what this package does, and the two or three constraints
that shape it._

## Invariants

- **The dependency contract above is binding.** Importing anything outside it
  fails `deno task deps:analyze`, and the failure is a design question, not a
  lint to silence.

_Add the domain invariants — what must stay true inside this package, and what
breaks when it does not. A statement that could have been guessed from the file
names does not belong here._

## Dependency contract

<!-- generated:deps -->

| Direction                                 | Packages                                 |
| :---------------------------------------- | :--------------------------------------- |
| Imports (static)                          | —                                        |
| Imports (soft, loaded at runtime by name) | —                                        |
| Imported by                               | —                                        |
| **Must never import**                     | nothing — no package depends on this one |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                               |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `ManifestReader`                                                                                                                                                                                                      |
| function  | `buildConfigPlugin`, `buildCssPlugin`, `clientEntry`, `compileCss`, `createCssCollector`, `cssPlugin`, `defineViteConfig`, `denoResolver`, `devServerBridge`, `hmrPlugin`, `lockness`, `viteAssets`                   |
| interface | `AppFetchHandler`, `ClientEntryOptions`, `CssCollector`, `DevServerOptions`, `HmrOptions`, `LocknessPluginOptions`, `LocknessViteConfig`, `ManifestChunk`, `ViteAssetTag`, `ViteAssetsOptions`, `ViteAssetsTagResult` |
| typeAlias | `CssCompiler`, `DenoScheme`, `ViteManifest`, `ViteMode`                                                                                                                                                               |
| variable  | `DEFAULTS`                                                                                                                                                                                                            |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

_Intent → file. The section that stops an agent grepping the whole package._

## Pitfalls

_None recorded yet. Add one when something here costs you time — with the
mechanism and the date. An entry that could have been guessed does not belong._

## Tests

<!-- generated:tests -->

11 test files for 20 source files:

- `packages/vite/tests/build.test.ts`
- `packages/vite/tests/client_entry.test.ts`
- `packages/vite/tests/css.test.ts`
- `packages/vite/tests/define_config.test.ts`
- `packages/vite/tests/deno_resolver.test.ts`
- `packages/vite/tests/dev_server.test.ts`
- `packages/vite/tests/e2e_smoke.test.ts`
- `packages/vite/tests/hmr.test.ts`
- `packages/vite/tests/offline.test.ts`
- `packages/vite/tests/shared.test.ts`
- `packages/vite/tests/vite_assets.test.ts`

<!-- /generated:tests -->

### The offline classifier (`tests/offline.ts`)

**Not counted above as a test, and not internal.** `isOffline` is the one answer
to "did this command fail because the machine is offline?" — the only reason a
toolchain suite may skip instead of fail (#157). It started in
`e2e_smoke.test.ts` and was copied twice into `scripts/`; #450 gave it this one
home. **Consumers outside the package**: `scripts/kit_migrations_test.ts` and
`scripts/kit_instructions_test.ts`. A change to what it recognises changes when
those suites skip.

A refused connection counts only with `{ refused: true }`, for a command whose
sole connection is to a package registry. `kit_instructions_test.ts` leaves it
off on purpose: it points `PG*` at a closed port, so a refusal there is a fault.
The option gates only a **bare** refusal: Deno's HTTP client wraps a refused
registry in "error sending request … tcp connect error: Connection refused", and
that counts as offline either way.

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno task gate             # the full gate, as the pre-push hook runs it
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 11 test files directly —

```bash
deno test -A packages/vite/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface, tests and closing gate are generated by
`deno task agents:brief` from the code itself — fix the code, not those blocks.
Everything else is hand-written and preserved._
