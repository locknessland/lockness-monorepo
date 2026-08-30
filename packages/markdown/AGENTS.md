# `@lockness/markdown` — agent brief

Renders Markdown to Hono JSX using `@lockness/ui` components, so rendered
content inherits the design system instead of raw HTML tags. Powers the docs
pages.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

| Specifier            | File      |
| -------------------- | --------- |
| `@lockness/markdown` | `mod.tsx` |

## Dependencies

- **Imports:** `@lockness/ui`
- **Imported by:** `@lockness/ui`
- **Demo app:** used by `app/` — a change here is exercised by running it.

## Where to work

| Concern                      | Path           |
| ---------------------------- | -------------- |
| Element-to-component mapping | `renderer.tsx` |
| Markdown parsing             | `parser.ts`    |
| Public entry                 | `mod.tsx`      |

## Pitfalls

- **Circular dependency with `@lockness/ui`.** `markdown/renderer.tsx` imports
  `@lockness/ui/components`, while `ui/docs_renderer.tsx` imports
  `@lockness/markdown`. This is the only cycle in the workspace — do not deepen
  it.
- Entry point is `mod.tsx`, not `mod.ts`; tooling that assumes `.ts` misses it.
- **No tests.**

_4 source files, 0 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
