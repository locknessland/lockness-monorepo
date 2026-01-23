# CodeBlock

A collection of components for displaying code with syntax highlighting and
copy-to-clipboard functionality. Supports multiple themes and various display
formats.

## Installation

```bash
deno run -A jsr:@lockness/ui add codeblock
```

## Components

The CodeBlock package exports four components:

- **InlineCode** - For inline code snippets within text
- **Command** - For displaying terminal commands with copy button
- **CommandBlock** - Full code block styled for terminal commands
- **CodeBlock** - Full code block with syntax highlighting

## Usage

```tsx
import {
    CodeBlock,
    Command,
    CommandBlock,
    InlineCode,
} from '@lockness/ui/components'
```

---

## InlineCode

For inline code within paragraphs.

```tsx
<p>
    Use the <InlineCode>deno run</InlineCode> command to execute scripts.
</p>
```

### Props

| Prop       | Type     | Default        | Description                |
| ---------- | -------- | -------------- | -------------------------- |
| `children` | `string` | -              | The code text to display   |
| `id`       | `string` | auto-generated | Optional HTML id attribute |

### CSS Variables

InlineCode can be styled using CSS variables:

```css
:root {
    --inline-code-background: oklch(0.26 0.01 260);
    --inline-code-foreground: oklch(0.85 0.1 140);
    --inline-code-font-size: 0.875rem;
    --inline-code-padding-x: 0.375rem;
    --inline-code-padding-y: 0.125rem;
    --inline-code-border-radius: 0.25rem;
}
```

---

## Command

Displays a command with a copy button, ideal for one-liner terminal commands.

```tsx
<Command>deno run -A main.ts</Command>
```

### Props

| Prop       | Type     | Default        | Description                 |
| ---------- | -------- | -------------- | --------------------------- |
| `children` | `string` | -              | The command text to display |
| `id`       | `string` | auto-generated | Optional HTML id attribute  |

---

## CommandBlock

A full code block styled for terminal commands with header and copy button.

```tsx
<CommandBlock lang='bash'>
    npm install @lockness/ui
</CommandBlock>
```

### Props

| Prop       | Type        | Default     | Description                                  |
| ---------- | ----------- | ----------- | -------------------------------------------- |
| `children` | `string`    | -           | The code content to display                  |
| `lang`     | `string`    | `'bash'`    | Programming language for syntax highlighting |
| `theme`    | `ThemeName` | `'default'` | Syntax highlighting theme                    |

---

## CodeBlock

Full code block with syntax highlighting, language label, and copy button.

```tsx
<CodeBlock lang='typescript'>
    {`const greeting = "Hello, World!";
console.log(greeting);`}
</CodeBlock>
```

### Props

| Prop       | Type        | Default        | Description                                  |
| ---------- | ----------- | -------------- | -------------------------------------------- |
| `children` | `string`    | -              | The code content to display                  |
| `lang`     | `string`    | `'typescript'` | Programming language for syntax highlighting |
| `theme`    | `ThemeName` | `'default'`    | Syntax highlighting theme                    |

---

## Themes

Four built-in themes are available:

| Theme     | Description                             |
| --------- | --------------------------------------- |
| `default` | Neutral dark theme with balanced colors |
| `monokai` | Classic warm theme inspired by Monokai  |
| `github`  | Clean minimal theme inspired by GitHub  |
| `nord`    | Arctic, north-bluish color palette      |

### Default Theme

```tsx
<CodeBlock lang='typescript' theme='default'>
    {`function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`}
</CodeBlock>
```

### Monokai Theme

```tsx
<CodeBlock lang='typescript' theme='monokai'>
    {`function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`}
</CodeBlock>
```

### GitHub Theme

```tsx
<CodeBlock lang='typescript' theme='github'>
    {`function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`}
</CodeBlock>
```

### Nord Theme

```tsx
<CodeBlock lang='typescript' theme='nord'>
    {`function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`}
</CodeBlock>
```

---

## Language Support

Syntax highlighting is powered by highlight.js. Common supported languages
include:

- `typescript` / `javascript`
- `python`
- `rust`
- `go`
- `bash` / `shell`
- `json`
- `html` / `css`
- `sql`
- And many more...

---

## Examples

### Displaying TypeScript Code

```tsx
<CodeBlock lang='typescript' theme='monokai'>
    {`interface User {
  id: number;
  name: string;
  email: string;
}

const users: User[] = await fetchUsers();
console.log(users);`}
</CodeBlock>
```

### Terminal Commands

```tsx
<CommandBlock lang='bash' theme='nord'>
    {`# Clone the repository
git clone https://github.com/lockness/app.git

# Install dependencies
deno install

# Start the development server
deno task dev`}
</CommandBlock>
```

### Inline Code in Text

```tsx
<p>
    Run <InlineCode>deno task build</InlineCode>{' '}
    to create a production build. The output will be in the{' '}
    <InlineCode>dist/</InlineCode> directory.
</p>
```

### Mixed Usage

```tsx
<div>
    <p>First, install the package:</p>
    <Command>deno add @lockness/ui</Command>

    <p>Then import and use the components:</p>
    <CodeBlock lang='tsx'>
        {`import { Button } from '@lockness/ui/components'

export function App() {
  return <Button>Click me</Button>
}`}
    </CodeBlock>
</div>
```
