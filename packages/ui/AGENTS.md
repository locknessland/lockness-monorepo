# `@lockness/ui` — agent brief

The component library — 90 source files, one directory per component, each with
a `mod.tsx` and usually an `examples.tsx`. Built on Hono JSX and Tailwind v4.
`components.ts` is the barrel that `@lockness/ui/components` resolves to.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Public surface

| Specifier                 | File            |
| ------------------------- | --------------- |
| `@lockness/ui`            | `mod.ts`        |
| `@lockness/ui/components` | `components.ts` |

## Dependencies

- **Imports:** `@lockness/hono`, `@lockness/markdown`
- **Imported by:** `@lockness/markdown`
- **Demo app:** used by `app/` — a change here is exercised by running it.

## Where to work

| Concern               | Path                             |
| --------------------- | -------------------------------- |
| A component           | `components/<Name>/mod.tsx`      |
| Its showcase examples | `components/<Name>/examples.tsx` |
| Design tokens         | `lib/design_tokens.ts`           |
| Barrel export         | `components.ts`                  |
| Registry generation   | `registry_generator.ts`          |

## Pitfalls

- Hard rule #4: `bg-(--my-var)` with parentheses for variables, brackets only
  for literals like `px-[0.75rem]`.
- **Circular dependency with `@lockness/markdown`** through `docs_renderer.tsx`.
  The only cycle in the workspace.
- A new component needs three edits: its directory, `components.ts`, and the
  registry — a missing barrel entry fails only at the consumer.

_90 source files, 17 test files. Framework-wide rules live in the root
[AGENTS.md](../../AGENTS.md)._
