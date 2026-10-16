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
- **No semantic compiler option is spelled in this package.** `target`, class
  fields, `jsx*`, `verbatimModuleSyntax` come from the app's `tsconfig.json`
  through `readCompilerOptions`. Adding a default `target` or `jsx` here creates
  a second home (audit A10).
- **Placement options have one table, `PLACEMENT` in `transform.ts`** (#619
  disposition): where the emit and its map go and how specifiers are written.
  `transpileForLoad` (the hook) keeps `./a.ts` and inlines the map;
  `transpileForBuild` (`lockness build`) rewrites `.ts`/`.tsx` to `.js` and
  returns an external map whose `sourceRoot` resolves. Both force
  `module: ESNext` and drop `moduleResolution` and the layout options. They run
  over one private emit; `transpile` is private. A `consumer` flag, build-side
  specifier post-processing or a `.js` → `.ts` resolve hook were rejected.
- **Option diagnostics fail closed.** An unknown option or an invalid value
  throws, because TypeScript drops a rejected value and the emit would change
  silently. The one exception is a value diagnostic on `lib` / `types`
  (`"deno.ns"`), located through the source-file API. Never use
  `ts.transpileOptionValueCompilerOptions`.
- **The cache is a code-injection surface** (audit S9, #618). Every entry is
  JavaScript the process executes. It lives at
  `<app>/node_modules/.cache/lockness-transform` (never a shared temp dir).
  Every access walks the path from the app root: no symlink, owned by the uid,
  not group/other-writable unless sticky. The cache directory is created 0700
  and refused, never narrowed, if it has any group/other bit. Each entry is
  opened `O_RDONLY | O_NOFOLLOW` and `fstat`-ed: a regular file owned by the uid
  with no group/other bit, or a miss. Entries are 0600 and renamed into place. A
  failed write warns and keeps the emit. The build never reads it.
- **The `tsconfig.json` search is bounded** at the nearest `package.json`,
  `deno.json` or `deno.jsonc`, and a `tsconfig.json` owned by another user or
  group/other-writable is refused (#618). Its `extends` targets are not checked.
- **The key covers everything the emit depends on**: SHA-256 over the canonical
  JSON array `[transformer version, compiler options, file name, source]`. The
  transformer version is this package's `VERSION` plus TypeScript's. The file
  name is there beside the plan's three inputs because the same bytes parse
  differently as `.ts` and `.tsx`, and a source map names the file. Dropping a
  field makes a stale hit possible.
- **Only app files are transformed**: `file:` URLs ending `.ts` / `.tsx` (not
  `.d.ts`) with no `node_modules` segment. A published dependency ships
  JavaScript; transforming it would hide a broken package. `.mts` / `.cts` are
  unsupported and documented as such: they fall through to Node's type
  stripping, which rejects decorators.
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

| Kind      | Exports                                                                        |
| :-------- | :----------------------------------------------------------------------------- |
| function  | `findTsconfig`, `readCompilerOptions`, `transpileForBuild`, `transpileForLoad` |
| interface | `BuildEmit`                                                                    |

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
  under `transpileModule` (it has no `package.json` to read). That is why the
  placement table forces `module: ESNext`. (2026-10-16)
- **`transpileModule` validates every key it is given**, so a dropped placement
  option is deleted, not set to `undefined` (which raises TS6046 on
  `moduleResolution`). (2026-10-16)
- **A group-writable app tree is refused** by the cache walk: under a `002`
  umask, `node_modules` is 0775 and the hook throws naming it. That is the #618
  rule, not a bug; `chmod g-w` fixes it. (2026-10-16)
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
