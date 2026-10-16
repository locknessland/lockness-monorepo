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

Requires Node ≥ 22.15 (`module.registerHooks`). Every `.ts` / `.tsx` file of
your app is emitted as an ES module; files under `node_modules` are left to
Node.

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
needs a `jsx` emit Node can run (`react-jsx`, `react-jsxdev` or `react`). A file
with no `tsconfig.json` above it is refused.

## Cache

Transformed files are cached in `node_modules/.cache/lockness-transform` beside
your `tsconfig.json`, in a directory only your user can read or write (0700).
The key is a SHA-256 of the transformer version, the compiler options, the file
name and the source, so an edit, an option change or an upgrade never serves a
stale entry. Delete the directory to clear it.

## Programmatic emit

```ts
import {
    findTsconfig,
    readCompilerOptions,
    transpile,
} from '@lockness/transform'

const tsconfig = findTsconfig(appRoot)
if (tsconfig === null) throw new Error('no tsconfig.json')
const js = transpile(source, fileName, readCompilerOptions(tsconfig))
```

This is the emit `lockness build` is to reuse (it is not released yet), so a
build will produce the code the hook ran in development.

## Why TypeScript from npm

TypeScript has no JSR build, so `typescript` is this package's one npm
dependency, pinned exactly to `6.0.3`: TypeScript 7 has no JavaScript API.

## License

MIT
