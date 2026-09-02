# Vite integration (`@lockness/vite`)

`@lockness/vite` is the Deno-native Vite integration for Lockness (epic
[#64](https://github.com/locknessland/lockness-monorepo/issues/64)). It is a
**standalone, opt-in** package: it never imports `@lockness/core`, and `core`
never imports it. The app is handed to it by injection (`App.fetch()`), so the
dependency graph stays acyclic.

It gives a Vite-enabled app two things:

- a **dev server** that serves both your Vite assets and your SSR pages from one
  process (no second `css:watch` terminal), with HMR and CSS injection; and
- a **build** that emits a single hashed-asset manifest, resolved at render time
  by `viteAssets()`.

> **Status.** The package ships the plugins, the asset helper, an e2e test (dev
> SSR + a real production build), and a runnable demo. Standalone
> `deno task dev` and `vite build` work with **`--configLoader native`** (see
> [Deno interop notes](#deno-interop-notes)). One CSS gap remains — see
> [Known limitation](#known-limitation).

## Installation

Add the package to your app's `deno.json` imports. Because Vite has no JSR
build, `@lockness/vite` declares the single `npm:` exception the framework
allows (documented inline in its `deno.json`):

```jsonc
{
    "imports": {
        "@lockness/vite": "jsr:@lockness/vite@^0.2.0",
        "vite": "npm:vite@^8"
    },
    "nodeModulesDir": "auto"
}
```

`nodeModulesDir: "auto"` is required — Vite (and its Rolldown bundler) resolve
native dependencies through `node_modules`.

## Setup

One call wires the whole integration. Inject your app into `lockness()` and
export the plugin array:

```typescript
// vite.config.ts
import { lockness } from '@lockness/vite'
import app from './main.ts' // your createApp(...) default export

export default {
    plugins: lockness({ app }),
}
```

`lockness()` composes six plugins in order: the Deno specifier resolver, the
`lockness:client-entry` virtual module, the CSS/Tailwind plugin, the dev-server
bridge, the HMR/server-reload plugin, and the production build config. For
advanced use, each factory is also exported individually.

Render the asset tags in your layout with `viteAssets()`:

```tsx
import { viteAssets } from '@lockness/vite'

const { html } = await viteAssets('app/client.ts', { nonce })
// inject `html` into your document <head>
```

## Configuration

`defineViteConfig(partial)` merges your overrides over the defaults; pass the
same `config` to `lockness({ app, config })`. Every field:

| Option         | Default                             | Meaning                                                            |
| -------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `serverEntry`  | `main.ts`                           | The Deno server entry — referenced for reloads, never bundled.     |
| `clientEntry`  | `app/client.ts`                     | The single client entry Vite bundles.                              |
| `routeDir`     | `app/controller`                    | Directory scanned for controllers (drives server-reload watching). |
| `outDir`       | `public/assets`                     | Output directory for built client assets.                          |
| `manifestPath` | `public/assets/.vite/manifest.json` | Path to the Vite build manifest.                                   |
| `devServerUrl` | `http://localhost:5173`             | Client-facing dev server URL used by `viteAssets` in dev.          |
| `cssInput`     | `app/view/assets/app.css`           | The Tailwind entry the dev watcher rebuilds.                       |
| `port`         | `5173`                              | Port the dev server listens on.                                    |

## Dev vs production behaviour

`viteAssets()` resolves differently by mode, and mode is **dev-server-context
first** (a leftover manifest never flips a running dev session to production):

|                  | Dev (under the Vite dev server)                                      | Production (built)                                                     |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Asset URLs       | point at `devServerUrl` (`/@vite/client`, `/<entry>`)                | hashed URLs read from the manifest via `ManifestReader`                |
| CSS              | rebuilt by the Tailwind watcher and injected into HTML by the bridge | emitted as a hashed asset under `outDir`, referenced from the manifest |
| Missing manifest | not consulted                                                        | throws a clear, descriptive error (never a blank page)                 |

Server reloads: a change under `app/controller/**`, `app/service/**`,
`app/middleware/**`, `app/routes.ts`, or `config/**` triggers a full reload and
re-initialises the app. A pure `.css`/`.tsx` view edit does not — and where a
`.tsx` matches both sets (e.g. under `app/controller/`), **the server reload
wins** (it already refreshes the page and its CSS).

## CSP + nonce recipe

For an app sending a strict Content-Security-Policy, pass a `nonce` to
`viteAssets()`. It is applied — attribute-encoded — to **every** emitted tag,
`<script>` and `<link>` alike:

```tsx
const nonce = crypto.randomUUID()
const { html } = await viteAssets('app/client.ts', { nonce })
// every <script>/<link> in `html` now carries nonce="<nonce>"
// send: Content-Security-Policy: script-src 'nonce-<nonce>'; style-src 'nonce-<nonce>'
```

The nonce value is opaque and caller-supplied — `viteAssets()` never mints or
caches one.

In **development**, the dev bridge widens a strict CSP so the Vite client and
HMR socket load: when a forwarded response carries a `Content-Security-Policy`
header, the dev origin is appended to its `script-src`, `style-src`, and
`connect-src` directives (`connect-src` also gets the `ws://` origin for HMR).
Only directives already present are widened; an absent one is left to your
`default-src`. This widening lives **only** in the dev middleware, so
`localhost:5173` is structurally absent from production output (asserted by
test).

> **CSP-hash mode is out of scope.** This package supports nonce-based CSP only;
> it does not compute or enforce script/style hashes.

## Deno interop notes

- **Run Vite with `--configLoader native`.** Vite 8 otherwise pre-bundles
  `vite.config.ts` with esbuild before any plugin runs, and that step cannot
  resolve the config's bare `@lockness/*` specifiers or the `@lockness/core` JSX
  runtime (it emits `react/jsx-runtime` and treats `@lockness/*` as external).
  `native` loads the config through Deno's own runtime, so Deno resolves them:
  ```bash
  deno run -A npm:vite --configLoader native            # dev
  deno run -A npm:vite build --configLoader native      # build
  ```
  The dev-server bridge sets `appType: 'custom'`, so Vite yields every non-asset
  request to `App.fetch()` instead of serving its own HTML fallback.
- **`nodeModulesDir: "auto"`** must be set (see Installation) — Vite/Rolldown
  need a `node_modules` layout for their native deps.
- **Permissions.** Running Vite needs broad permissions (`deno run -A` is the
  simplest); a Vite dev/build touches the filesystem, the network (dev server),
  environment, and spawns subprocesses.
- **`https:` / `jsr:` specifiers** are resolved through Deno by the resolver
  plugin, which **delegates to Deno's own cache and performs no custom fetch**
  (build-time SSRF-safe). Pin and lock remote imports as usual (`deno.lock`) so
  a build is reproducible; a `https:` import that is not in Deno's cache is
  fetched by Deno under its normal integrity checks, not by this package.
- **Loopback by default.** The dev server binds `127.0.0.1` and keeps Vite
  `server.fs.strict` on; a non-loopback host is honoured but warns loudly,
  because Vite serves your source over `/@fs` without authentication.

## Known limitation

The production build emits the Tailwind **theme + preflight** but not the
compiled **utilities**: Vite's default CSS handling does not run the Tailwind v4
engine, which is what expands `@tailwind utilities` against your source. Full
Tailwind-in-build needs the `@tailwindcss/vite` plugin wired into `lockness()` —
an architectural addition tracked as a follow-up. The **dev** watcher already
compiles Tailwind through the Tailwind CLI, so `deno task dev` shows utilities;
the gap is production-build-only, and an app that ships its own compiled CSS is
unaffected.

The config-bootstrap gap that previously blocked standalone `deno task dev` /
`vite build` is **resolved** — run Vite with `--configLoader native` (see
[Deno interop notes](#deno-interop-notes)). A real `vite build` is exercised by
the e2e test (`packages/vite/tests/e2e_smoke_test.ts`).

## Troubleshooting

| Symptom                                                          | Cause / fix                                                                                                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Import "@lockness/core" not a dependency` when running the demo | You are running with a config that shadows the workspace. Run within the workspace, or declare the specifiers in that config's import map.                  |
| `Could not resolve 'react/jsx-runtime'` during `vite build`      | Vite bundled the config with esbuild instead of Deno. Add `--configLoader native` (see [Deno interop notes](#deno-interop-notes)).                          |
| `/` returns 404 / `index.html` not found in dev                  | Vite is serving its own HTML fallback. The bridge sets `appType: 'custom'` to prevent this — ensure `lockness()` (or `devServerBridge`) is in your plugins. |
| Production render throws on the manifest                         | The manifest is missing or malformed at `manifestPath`. Run the build first; the error names the path.                                                      |
| Assets 404 in production                                         | The entry key is not in the manifest. `viteAssets()` does a keyed lookup (never a path built from the argument); pass the same entry you built.             |
| CSP blocks the dev client                                        | Declare `script-src`/`style-src`/`connect-src` in your dev CSP so the bridge can widen them (an absent directive is left to `default-src`).                 |

## See also

- The runnable example: `packages/vite/demo/` (and its `README.md`).
- The package brief: `packages/vite/AGENTS.md`.
- Multi-mount / routing docs the demo builds on:
  `packages/core/docs/routing.md`.
