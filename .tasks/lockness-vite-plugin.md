# Technical Task: Lockness Vite Plugin (Fresh-style)

## 📋 Task Overview

Implement a Vite plugin for Lockness, inspired by Fresh v2, to modernize the
developer experience. The goal is to replace the current split workflow (dev
server + CSS watcher) with a single Vite-driven dev server that handles HMR,
CSS, and builds for both server and client.

Reference material:

- https://fresh.deno.dev/docs/advanced/vite
- https://github.com/denoland/fresh/tree/main/packages/plugin-vite
- https://jsr.io/@fresh/plugin-vite

## ✅ What is missing in Lockness today

- No Vite plugin package.
- No Vite dev server middleware integration with `App.fetch()`.
- No virtual entry modules for SSR + client runtime.
- No build output separation (client/server manifests).
- No asset/CSS injection during SSR in dev.
- No Deno-first module resolver in Vite (jsr:, npm:, http(s):).

## 🎯 Objectives

1. **Single Dev Command**: `deno task dev` must start Vite dev server with HMR,
   build CSS/JS automatically, and reload server on backend changes.
2. **Adonis-first Build**: Use a single Vite build output (no SSR build
   environment). Only bundle client assets and manifest.
3. **Deno-First Resolution**: Support jsr:, npm:, http(s):, file, and local.
4. **HMR & CSS**: HMR for app modules and CSS handling in dev.
5. **Minimal API for App**: Integrate with Lockness `App` without changes to
   userland app code.
6. **Docs + Templates**: Provide docs and example `vite.config.ts`.

## 📁 Affected File Paths

### New Package (Recommended)

- /packages/vite/deno.json
- /packages/vite/README.md
- /packages/vite/mod.ts
- /packages/vite/src/
  - mod.ts
  - shared.ts
  - utils.ts
  - plugins/
    - deno.ts
    - dev_server.ts
    - server_entry.ts
    - client_entry.ts
    - build_id.ts (optional)
    - server_snapshot.ts (optional)
    - client_snapshot.ts (optional)

### Core Integration (Minimal)

- /packages/core/app.ts (if required for SSR entry or fetch bridge)
- /packages/core/mod.ts (export any helpers needed by plugin)

### App Template (Optional)

- /app/client.ts (default client entry)
- /app/server.ts (default server entry)
- /vite.config.ts (example)

### Docs

- /docs/vite.md (new)
- /README.md (link to Vite docs)

## 🧭 Fresh Concepts to Borrow (Deno + DX only)

From `@fresh/plugin-vite`:

- Deno loader-based resolution (`plugins/deno.ts`)
- Dev server middleware to forward requests to SSR app
- CSS collection injected into HTML in dev

## 🧠 AdonisJS Vite Patterns to Borrow

From `@adonisjs/vite` (see `_adonisjs-vite/`):

- **Single package** that owns Vite config + dev server + asset tags.
- **Middleware bridge**: forwards HTTP requests to Vite dev server and only
  falls through to app when Vite does not handle the request.
- **Config helper**: a `defineConfig` helper that sets sensible defaults for
  build, manifest, and asset URLs.
- **Vite class**: central service to generate tags, read manifest, and expose
  `assetsUrl()`.

We should mirror the concepts but adapt to Deno + Lockness:

- Provide a small **service module** to generate asset tags and read manifests.
- Provide a **Vite middleware bridge** that wraps `App.fetch()`.
- Provide a **defineConfig** helper for Vite defaults.

We should implement Lockness equivalents (Adonis-style):

- `lockness:client-entry` (virtual module)
- `lockness:client-entry-user` (optional)

## 🧩 Lockness-specific Design Decisions (Locked)

- Use `jsxImportSource: "@lockness/core"`.
- Dev server proxies to `App.fetch(request)`.
- Output directory: `public/assets` (single build output, Adonis-style).
- No SSR build output and no server manifest.
- Client entry re-exports Lockness client runtime and user entry if present.
- Provide `defineViteConfig()` helper (Lockness-flavored defaults).
- Provide `ViteAssets` helper to generate script/style tags (manifest-aware).
- Align conventions with AdonisJS (single build, manifest usage, helpers).

## ✅ Behavior Rules (No Ambiguity)

- Vite `serve` must run Lockness SSR via Vite middlewares.
- Vite `build` must emit a single manifest for client assets only.
- CSS in dev must be collected and injected into HTML head.
- HMR must reload when SSR-only modules change.
- `deno task dev` must launch Vite dev server + HMR and trigger server reloads.
- CSS pipeline must watch `app/view/assets/app.css` and rebuild when any
  `app/**/*.ts` or `app/**/*.tsx` changes affect Tailwind classes.
- Tailwind sources are defined by `@source '../../**/*.tsx'` inside
  `app/view/assets/app.css` and must remain in sync with watcher globs.
- CSS build command in dev must match current Tailwind task:
  `deno run -A @tailwindcss/cli -i app/view/assets/app.css -o public/css/app.css --watch`.

## 📝 Detailed Implementation Steps

### Phase 1: Create Vite Plugin Package

1. Create `/packages/vite` package structure (see above).
2. Implement `mod.ts` that exports `lockness()` Vite plugin factory.
3. Add `deno.ts` plugin to resolve Deno specifiers (use Fresh `deno.ts` as
   reference).
4. Add `define_config.ts` helper similar to Adonis `defineConfig()`.
5. Add `vite_assets.ts` helper to generate script/style tags from manifest.
6. Add explicit watch globs for Tailwind in dev:
  - `app/view/assets/app.css`
  - `app/**/*.ts`
  - `app/**/*.tsx`

### Phase 2: Entry Modules (Client-only)

1. Implement `client_entry.ts` plugin:
   - Provide `lockness:client-entry` virtual module.
   - Import user entry if `/app/client.ts` exists.
   - Inject HMR client in dev.

### Phase 3: Dev Server Bridge

1. Implement `dev_server.ts` plugin:
   - Use Vite middleware to forward non-Vite requests to SSR app.
   - If response is HTML, inject collected CSS into `<head>`.
   - Send HMR reload if SSR-only module changed.
2. Add a middleware adapter for Lockness similar to Adonis `vite_middleware.ts`,
   but using `App.fetch()`.

### Phase 4: Build Outputs (Single)

1. Configure Vite build:

- Single build with manifest and `lockness:client-entry` input.
- Output to `public/assets`.

2. Use manifest to generate script/style tags via `viteAssets()`.

### Phase 5: Documentation

1. Create `/docs/vite.md` with setup steps.
2. Add example `vite.config.ts` snippet.
3. Update root README with dev/build commands.

## 🎨 Example `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import { lockness } from '@lockness/vite'

export default defineConfig({
    plugins: [lockness({
        serverEntry: 'main.ts',
        clientEntry: 'app/client.ts',
        routeDir: 'app/controller',
    })],
})
```

## 🧩 Example Asset Tags (Manifest-aware)

```ts
import { viteAssets } from '@lockness/vite'

// Render script + CSS tags for one entry
const tags = await viteAssets('app/client.ts')
// tags.html -> string with <script> + <link> tags
```

## 🧾 Exact API Signatures (Authoritative)

These signatures must be implemented exactly to avoid ambiguity.

```ts
export interface LocknessViteConfig {
    serverEntry?: string
    clientEntry?: string
    routeDir?: string
    outDirClient?: string
    outDirServer?: string
}

export interface ViteAssetsTagResult {
    html: string
    tags: Array<{ tag: 'script' | 'link'; attributes: Record<string, string> }>
}

export function lockness(config?: LocknessViteConfig): import('vite').Plugin[]

export function defineViteConfig(
    config: Partial<LocknessViteConfig>,
): Required<LocknessViteConfig>

export function viteAssets(
    entry: string,
    options?: { devServerUrl?: string },
): Promise<ViteAssetsTagResult>
```

## 🧪 Testing Strategy

- Add a small demo app under `/packages/vite/demo`.
- Verify dev server, HMR, and CSS injection.
- Verify build output structure and manifests.
- Verify `deno task dev` launches Vite and rebuilds CSS/JS automatically.

## 🔍 Quality Checks

- deno lint packages/vite/
- deno check packages/vite/**/*.ts
- deno test packages/vite/tests/

## ✅ Definition of Done

- Vite dev server runs Lockness app with HMR and CSS injection.
- Single client build generated under `public/assets` with manifest.
- Deno specifiers resolve correctly in dev and build.
- Docs and example config are in place.

## 📝 Note (Islands)

Lockness does NOT require an Island Components model. Islands support is
optional and not a prerequisite for Vite integration. The plugin should work for
standard server-rendered pages and progressive enhancement without any
islands-specific behavior.
