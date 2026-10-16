# `@lockness/transform` — agent brief

Runs a Lockness app's TypeScript (TC39 decorators, `.tsx`) on Node: the
`@lockness/transform/register` entry, loaded with `node --import`, installs a
`module.registerHooks` load hook that emits each app file through TypeScript 6
`transpileModule`. The constraints that shape it: it loads before every other
module, so it imports no `@lockness/*` package; the compiler options have one
home, the app's `tsconfig.json`; and its cache holds code the process will run,
so it is project-local and private. Plan 274 §5 ("Node transform", "TS compiler
options for user code"), audits A10 and S9.

## Invariants

- **The dependency contract above is binding.** Importing anything outside it
  fails `deno task deps:analyze`, and the failure is a design question, not a
  lint to silence. Here it is stricter than a lint: the hook is installed before
  the app's first import, so any `@lockness/*` module it pulled in would load
  untransformed and outside the app's own module graph.
- **No compiler option is spelled in this package.** `transpile` takes the
  options `readCompilerOptions` read from the app's `tsconfig.json`. The single
  override is `module: ESNext` (with `moduleResolution` dropped), because both
  consumers — the hook and `lockness build` — load the output as an ES module.
  Adding a default `target` or `jsx` here creates a second home (audit A10).
- **`lockness build` reuses `transpile`, it does not re-implement it.** That is
  why the emit is exported from `mod.ts` and the hook is not: dev and production
  must emit the same code.
- **The cache is a code-injection surface.** Every entry is JavaScript the
  process executes. It lives at `<app>/node_modules/.cache/lockness-transform`
  (never a shared temp dir), the directory is 0700, owned by the current user
  and not a symlink, entries are 0600 and renamed into place. Loosening any of
  these lets another local user plant code in the app (audit S9).
- **The key covers everything the emit depends on**: SHA-256 over the canonical
  JSON array `[transformer version, compiler options, file name, source]`. The
  transformer version is this package's `VERSION` plus TypeScript's. The file
  name is there beside the plan's three inputs because the same bytes parse
  differently as `.ts` and `.tsx`, and a source map names the file. Dropping a
  field makes a stale hit possible.
- **Only app files are transformed**: `file:` URLs ending `.ts` / `.tsx` (not
  `.d.ts`) with no `node_modules` segment. A published dependency ships
  JavaScript; transforming it would hide a broken package.
- **`APP_ENV=production` refuses at import time**, before the hook is installed.
  Production runs built output.

## Design decisions (C07)

- **Which `tsconfig.json`.** The nearest one to the file, walking up — the
  language service's rule. Memoised per directory, parsed once per
  `tsconfig.json`, with `extends` followed and the file list never enumerated. A
  file with none is refused rather than given TypeScript's defaults: a silent
  default would make the dev emit differ from `lockness build`'s.
- **Where the cache lives.** Beside that `tsconfig.json` (the app root), not
  under the working directory, so a process started from a subdirectory reuses
  the same cache.
- **A `.tsx` under an unrunnable `jsx`** (unset, `preserve`, `react-native`)
  throws a message naming the option, instead of handing Node JSX it would
  reject with an unlocated `SyntaxError`.
- **Errors are not cached.** Any error-category diagnostic, syntactic or
  option-level (including TypeScript 6 deprecations such as `target: es5`),
  throws with `file:line:column`.
- **Hook and entry are split** (`hook.ts` builds, `register.ts` installs) so the
  hook is testable as a function without installing it into the test process.

## Dependency contract

<!-- generated:deps -->

| Direction                                 | Packages                                 |
| :---------------------------------------- | :--------------------------------------- |
| Imports (static)                          | —                                        |
| Imports (soft, loaded at runtime by name) | —                                        |
| Imported by                               | —                                        |
| **Must never import**                     | nothing — no package depends on this one |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
an optional peer in this package's `package.json`, never a dependency: the
consuming application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind     | Exports                                            |
| :------- | :------------------------------------------------- |
| function | `findTsconfig`, `readCompilerOptions`, `transpile` |
| variable | `TYPESCRIPT_VERSION`                               |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Intent                                                       | File                   |
| :----------------------------------------------------------- | :--------------------- |
| Change the emit, the tsconfig read or the error message      | `transform.ts`         |
| Change the cache key, location or permission checks          | `cache.ts`             |
| Change which files the hook takes, or the production refusal | `hook.ts`              |
| Change how the hook is installed                             | `register.ts`          |
| Change what `lockness build` can import                      | `mod.ts`               |
| The pinned TypeScript version                                | `package.json` (exact) |

The subpath `@lockness/transform/register` is a side-effect entry and exports
nothing, so the generated surface above does not list it.

## Pitfalls

- **The `APP_ENV` read is a second copy of the contract resolver's rule**
  (trimmed, lower-cased), because this package may import nothing. When T019
  (plan 274) extends the `env_signal` lint to `process.env.APP_ENV`,
  `packages/transform/hook.ts` must join the rule's owners list, not import
  contract. (2026-10-16)
- **Deno answers for a missing `node`.** `child_process.spawn('node')` under
  Deno runs Deno itself when no `node` is on PATH, printing `deno x.y.z` for
  `--version`. `tests/register_e2e.test.ts` detects that and skips with the
  reason; a probe that only checked the exit status would have run the e2e under
  Deno. (2026-10-16)
- **`module: nodenext` in an app's tsconfig emits CommonJS for a lone `.ts`**
  under `transpileModule` (it has no `package.json` to read). That is why
  `transpile` forces `module: ESNext`. (2026-10-16)
- **TypeScript 7 has no JavaScript API** (#612): the pin is exact, `6.0.3`, the
  same pin the npm build uses (plan 274 F1, F6). A range would let the hook and
  the build emit with different compilers.

## Tests

<!-- generated:tests -->

4 test files for 6 source files:

- `packages/transform/tests/cache.test.ts`
- `packages/transform/tests/hook.test.ts`
- `packages/transform/tests/register_e2e.test.ts`
- `packages/transform/tests/transform.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno task gate             # the full gate, as the pre-push hook runs it
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 4 test files directly —

```bash
deno test -A packages/transform/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface, tests and closing gate are generated by
`deno task agents:brief` from the code itself — fix the code, not those blocks.
Everything else is hand-written and preserved._
