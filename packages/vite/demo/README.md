# `@lockness/vite` demo

A minimal Lockness app wired to Vite through `@lockness/vite` (epic #64,
sub-issue #115). It exists to prove the integration end-to-end and to serve as a
copy-paste starting point.

## What it contains

| File                                 | Role                                                                      |
| :----------------------------------- | :------------------------------------------------------------------------ |
| `main.ts`                            | Boots `DemoKernel` into an `App`; default-exports it for the Vite config. |
| `kernel.ts`                          | The smallest possible `@Kernel` — one controller, no DB/session/devtools. |
| `app/controller/home_controller.tsx` | Renders the SSR home page; calls `viteAssets()` for the asset tags.       |
| `app/view/home.tsx`                  | The JSX page, server-rendered through `@lockness/core`.                   |
| `app/client.ts`                      | The client entry (imports the CSS); Vite bundles it in production.        |
| `app/view/assets/app.css`            | The Tailwind entry (`DEFAULTS.cssInput`).                                 |
| `vite.config.ts`                     | `plugins: lockness({ app })` — the whole integration in one call.         |

## Automated proof (runs in CI)

The deterministic, browser-free proof lives in
`packages/vite/tests/e2e_smoke_test.ts` and runs with the normal suite:

```bash
deno test -A packages/vite/tests/e2e_smoke_test.ts
```

It asserts, in-process:

- **Dev SSR** — `App.fetch('/')` renders the JSX home page through
  `@lockness/core`, and the dev bridge forwards a non-asset request while never
  forwarding a Vite-internal one.
- **Production asset resolution** — `viteAssets('app/client.ts')` resolves the
  entry to hashed JS + CSS URLs from a built-shape manifest, with the CSP nonce
  on every tag and no dev-server origin leaking (S-F5).

## Manual / runnable steps — and a known limitation

The demo tasks (run from **this** directory) are:

```bash
deno task dev     # LOCKNESS_VITE_DEV=1 deno run -A npm:vite
deno task build   # deno run -A npm:vite build
```

> **Known limitation (tracked follow-up).** Under Vite 8, `vite` bundles
> `vite.config.ts` with esbuild before any plugin runs. Because the config
> imports the app (`./main.ts` → the JSX controller/view), that pre-bundle step
> needs to resolve the bare `@lockness/*` specifiers and the `@lockness/core`
> JSX runtime — which the Deno↔Vite config bootstrap does not yet do (it emits
> `react/jsx-runtime` and treats `@lockness/*` as external). So a standalone
> `deno task dev` / `deno task build` does **not** complete today. The
> integration itself is proven by the automated e2e test above; closing this gap
> (a Deno-aware config loader, e.g. a `@deno/vite-plugin`-style bootstrap) is a
> follow-up on epic #64. This is the Deno↔Vite interop risk called out in the
> epic plan (§9).
