# @lockness/markdown

Markdown to JSX renderer with a plain-HTML default component map. Renders
standalone with no UI-library dependency; opt into design-system output via
`@lockness/ui/markdown`.

This package provides seamless integration between Markdown documentation and
the Lockness design system, automatically converting Markdown content into
beautiful, themed JSX components.

## Features

- 🎨 **Optional design-system output**: pair with `@lockness/ui/markdown` to
  render using `@lockness/ui` components
- 📝 **GFM Support**: Full GitHub Flavored Markdown support via `@libs/markdown`
- 🌈 **Syntax Highlighting**: Code blocks with automatic syntax highlighting
- 🔧 **Customizable**: Override any component with your own implementation
- 🚀 **Zero CSS Required**: Styles come from your existing Lockness theme

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
const jsxWithoutTitle = await renderMarkdown(content, { stripTitle: true })
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
| `` ```lang ``    | `<CodeBlock>`            |
| `> Quote`        | `<Alert>`                |
| `                | Table                    |
| `- List`         | Styled `<ul>/<ol>`       |
| `[Link](url)`    | `<Link>`                 |
| `---`            | `<Separator>`            |

## API Reference

### `renderMarkdown(content, options?)`

Renders Markdown content to JSX asynchronously.

**Parameters:**

- `content: string` - Raw Markdown content
- `options?: MarkdownRendererOptions` - Rendering options

**Returns:** `Promise<JSX.Element>`

### `renderMarkdownWithoutTitle(content, options?)`

Same as `renderMarkdown` but strips the first H1 heading.

### `<Markdown html={html} />`

Sync component for pre-rendered HTML.

**Props:**

- `html: string` - Pre-rendered HTML from `@libs/markdown`
- `components?: ComponentOverrides` - Custom component overrides
- `stripTitle?: boolean` - Remove first H1 heading
- `class?: string` - Additional CSS classes

### `parseHtmlToAst(html)`

Low-level function to parse HTML into an AST.

**Parameters:**

- `html: string` - HTML string to parse

**Returns:** `MarkdownNode[]`

## Security

Two guarantees are enforced at parse time, both in `parser.ts` and nowhere else:

- **Link/image URI schemes** — only `http`, `https`, `mailto` and schemeless
  URIs are kept; `javascript:`, `data:` and other schemes are neutralised to an
  empty attribute (the link text / image `alt` are preserved).
- **Code-block HTML** — `CodeBlockNode.html` (the raw-HTML sink the styled
  `@lockness/ui/markdown` map feeds into `dangerouslySetInnerHTML`) is reduced
  to allowlisted highlighter markup only: every `<`/`>` is escaped and only the
  highlighter's own `<span class="hljs-…">`/`</span>` structure is re-admitted,
  so no author element can survive — independent of the upstream engine's own
  escaping (issue #159). Syntax highlighting is preserved.

See [docs/DOCS.md](docs/DOCS.md#security-uri-scheme-allowlist).

## License

MIT
