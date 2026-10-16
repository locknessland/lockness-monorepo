# `@lockness/transform`

Runs a [Lockness](https://lockness.land) app's TypeScript on Node — TC39
decorators and `.tsx` included — through TypeScript 6 `transpileModule`, with
the compiler options of your app's `tsconfig.json`.

Deno and Bun run TypeScript natively; Node needs this hook in development and
tests. Production never uses it: it refuses to run when `APP_ENV=production`.

## Usage

```bash
node --import @lockness/transform/register main.ts
```

Requires Node ≥ 24. Every `.ts` / `.tsx` file of your app is emitted as an ES
module; files under `node_modules` are left to Node. `.mts` and `.cts` files are
not supported: Node's own type stripping handles them and rejects decorators, so
name app files `.ts` / `.tsx`.

Your `tsconfig.json` decides the emit. For a Lockness app:

```json
{
    "compilerOptions": {
        "target": "es2022",
        "jsx": "react-jsx",
        "jsxImportSource": "@lockness/core"
    }
}
```

`target` must be below `esnext` so decorators are lowered, and a `.tsx` file
needs a `jsx` emit Node can run (`react-jsx`, `react-jsxdev` or `react`). The
`tsconfig.json` is the nearest one, never above the nearest `package.json` or
`deno.json`; it must be yours and writable by you alone. A file with none is
refused, and so is an unknown option or an invalid value (except a `lib` /
`types` value such as Deno's `"deno.ns"`, which a single-file emit ignores).

## Cache

Transformed files are cached in `node_modules/.cache/lockness-transform` beside
your `tsconfig.json`, in a directory only your user can read or write (0700).
Every directory from the app root down must be yours and not writable by others
(unless sticky); if one is not, the cache is disabled with one warning and
modules load uncached. The cache directory itself must have no group or other
permission at all, or it is refused with a message naming it. Each entry is
verified on the descriptor it is read from before it runs. A cache that cannot
be written only warns.

The cache's trust rests on your source tree. The directories above your app root
are trusted, and a tree that a shared group can write (a `002` umask) is exposed
through its sources, which no transform check can protect; group write is
therefore not refused. The descriptor check closes the check-then-use race for
reads, not for writes. The key is a SHA-256 of the transformer version, the
compiler options, the file name and the source, so an edit, an option change or
an upgrade never serves a stale entry. Delete the directory to clear it.

## Programmatic emit

```ts
import {
    findTsconfig,
    readCompilerOptions,
    transpileForBuild,
} from '@lockness/transform'

const tsconfig = findTsconfig(appRoot)
if (tsconfig === null) throw new Error('no tsconfig.json')
const { code, map } = transpileForBuild(
    source,
    fileName,
    outFile,
    readCompilerOptions(tsconfig),
)
```

`transpileForBuild` is the emit `lockness build` is to use (it is not released
yet): the same emit as the hook's `transpileForLoad`, with `.ts` specifiers
rewritten to `.js` and an external source map.

## Why TypeScript from npm

TypeScript has no JSR build, so `typescript` is this package's one npm
dependency, pinned exactly to `6.0.3`: TypeScript 7 has no JavaScript API.

## License

MIT
