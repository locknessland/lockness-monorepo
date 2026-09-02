# Markdown

Render Markdown content to JSX with a plain-HTML default component map
(standalone), or with `@lockness/ui` components via `@lockness/ui/markdown`.

This package provides seamless integration between Markdown documentation and
the Lockness design system, automatically converting Markdown content into
beautiful, themed JSX components.

## Features

- **Optional design-system output**: render with `@lockness/ui` components via
  `@lockness/ui/markdown`
- **GFM Support**: Full GitHub Flavored Markdown support via `@libs/markdown`
- **Syntax Highlighting**: Code blocks with automatic syntax highlighting
- **Customizable**: Override any component with your own implementation
- **Zero CSS Required**: Styles come from your existing Lockness theme

## Security: URI-scheme allowlist

Link `href` and image `src` are **scheme-sanitised at parse time** (issue #148).
Only `http`, `https`, `mailto`, and schemeless URIs (relative paths, fragments,
queries, `//host`) are kept; any other scheme — notably `javascript:`, `data:`,
`vbscript:`, `file:` — is neutralised to an **empty** `href`/`src`, so the link
text and image `alt` are preserved but nothing dangerous is clickable or loaded.

```text
[click](javascript:alert(1))          ->  <a href="">click</a>
![logo](data:text/html,<script>…)     ->  <img src="" alt="logo">
[docs](/guide)  ·  [mail](mailto:a@b) ->  unchanged
```

The check is case-insensitive and resistant to control-character, whitespace and
HTML-entity obfuscation of the scheme. It lives in one place — `sanitizeUrl` in
`parser.ts` — so it applies to **every** renderer (the plain default map and the
styled `@lockness/ui/markdown` map alike); component overrides do not need to,
and must not, re-implement it.

**Scope of the guarantee.** `parseHtmlToAst` scheme-sanitises `LinkNode.href`
and `ImageNode.src`, **and** allowlist-sanitises `CodeBlockNode.html` — the
`dangerouslySetInnerHTML` sink the styled map's highlighted code block uses.
`sanitizeCodeHtml` (parser.ts) escapes every `<`/`>` in that field and re-admits
only the highlighter's own `<span class="hljs-…">`/`</span>` structure, so no
author element survives even if the upstream engine failed to escape it, while
syntax highlighting is preserved. This **closes deferred item S4** (raised in
the #80 blog plan, tracked as #159).

The copy fields — `CodeBlockNode.value` and the styled block's `data-plain`
attribute — need no allowlist: they are plain text, JSX-escaped by the runtime,
never a raw sink. Do not mirror the code-HTML treatment onto them.

**One residual, out of scope of #159.** The guarantee is anchored to the parse
path. A caller that hand-builds an AST, or passes untrusted HTML **directly** to
the exported `HighlightedCodeBlock html={…}` component, bypasses the parser and
must not assume that field is safe.

## Installation

```typescript
import { Markdown, renderMarkdown } from '@lockness/markdown'
```

## Usage

### Async Rendering (Recommended)

Use the `renderMarkdown` function for full Markdown processing:

```tsx
import { renderMarkdown } from '@lockness/markdown'

// In your controller/route handler
const content = await Deno.readTextFile('docs/guide.md')
const jsx = await renderMarkdown(content)

// Render without the first H1 (useful when title is shown separately)
const jsxWithoutTitle = await renderMarkdownWithoutTitle(content)
```

### Sync Rendering (Pre-rendered HTML)

If you've already rendered Markdown to HTML, use the `Markdown` component:

```tsx
import { Markdown } from '@lockness/markdown'
import { Renderer } from '@libs/markdown'

// Pre-render the HTML
const renderer = await Renderer.with({ plugins: [gfm] })
const html = await renderer.render(content)

// Use the component
<Markdown html={html} stripTitle />
```

### Custom Components

Override default components with your own:

```tsx
import { renderMarkdown } from '@lockness/markdown'

const jsx = await renderMarkdown(content, {
    components: {
        // Custom code block with different styling
        CodeBlock: ({ language, children }) => (
            <pre class='my-custom-code'>
                <code>{children}</code>
            </pre>
        ),
        // Custom blockquote as a callout
        Blockquote: ({ children }) => (
            <div class='callout callout-info'>
                {children}
            </div>
        ),
    },
})
```

## Component Mapping

| Markdown Element | Default Component        |
| ---------------- | ------------------------ |
| `# Heading`      | `<Title level={n}>`      |
| `Paragraph`      | `<p>` with prose styling |
| `` `code` ``     | `<InlineCode>`           |
| `` ```lang ``    | `<HighlightedCodeBlock>` |
| `> Quote`        | `<Alert>`                |
| `                | Table                    |
| `- List`         | Styled `<ul>/<ol>`       |
| `[Link](url)`    | `<Link>`                 |
| `---`            | `<Separator>`            |

## API Reference

### `renderMarkdown(content, options?)`

Renders Markdown content to JSX asynchronously.

| Parameter | Type                      | Description          |
| --------- | ------------------------- | -------------------- |
| `content` | `string`                  | Raw Markdown content |
| `options` | `MarkdownRendererOptions` | Rendering options    |

Returns: `Promise<JSX.Element>`

### `renderMarkdownWithoutTitle(content, options?)`

Same as `renderMarkdown` but strips the first H1 heading. Useful when the page
layout already displays the title.

### `<Markdown html={html} />`

Sync component for pre-rendered HTML.

| Prop         | Type                 | Default | Description                             |
| ------------ | -------------------- | ------- | --------------------------------------- |
| `html`       | `string`             | -       | Pre-rendered HTML from `@libs/markdown` |
| `components` | `ComponentOverrides` | -       | Custom component overrides              |
| `stripTitle` | `boolean`            | `false` | Remove first H1 heading                 |
| `class`      | `string`             | -       | Additional CSS classes                  |

### `parseHtmlToAst(html)`

Low-level function to parse HTML into an AST for custom rendering.

| Parameter | Type     | Description          |
| --------- | -------- | -------------------- |
| `html`    | `string` | HTML string to parse |

Returns: `MarkdownNode[]`

## Types

### `MarkdownRendererOptions`

```typescript
interface MarkdownRendererOptions {
    components?: ComponentOverrides
    stripTitle?: boolean
    class?: string
}
```

### `ComponentOverrides`

```typescript
interface ComponentOverrides {
    Heading?: FC<{ level: number; children: unknown }>
    Paragraph?: FC<{ children: unknown }>
    CodeBlock?: FC<{ language?: string; children: string; html?: string }>
    InlineCode?: FC<{ children: unknown }>
    Link?: FC<{ href: string; title?: string; children: unknown }>
    Blockquote?: FC<{ children: unknown }>
    Table?: FC<{ children: unknown }>
    List?: FC<{ ordered: boolean; children: unknown }>
    ListItem?: FC<{ children: unknown }>
    HorizontalRule?: FC
    Image?: FC<{ src: string; alt?: string; title?: string }>
}
```

## Example: Documentation Page

```tsx
// app/controller/docs_controller.tsx
import { Context, Controller, Get } from '@lockness/core'
import { renderMarkdownWithoutTitle } from '@lockness/markdown'

@Controller('/docs')
export class DocsController {
    @Get('/:slug')
    async page(c: Context) {
        const slug = c.req.param('slug')
        const content = await Deno.readTextFile(`docs/${slug}.md`)
        const jsx = await renderMarkdownWithoutTitle(content)

        return c.html(
            <DocsLayout title={slug}>
                {jsx}
            </DocsLayout>,
        )
    }
}
```
