# Components

Lockness uses JSX for building UI components. Generate reusable components with
the Cli CLI.

## Creating Components

Use the `make:component` command to scaffold new JSX components:

```bash
deno task cli make:component Button
```

This creates `src/view/components/button.tsx`:

```typescript
export const Button = (props: { children?: any }) => {
    return (
        <button>
            {props.children}
        </button>
    )
}
```

**Naming conventions:**

- **Component class name:** PascalCase (e.g., `Button`, `UserCard`)
- **File name:** snake_case (e.g., `button.tsx`, `user_card.tsx`)
- **Props interface:** `<ComponentName>Props`

## Nested Components

Create components in subdirectories for better organization:

```bash
deno task cli make:component ui/Card
deno task cli make:component forms/Input
```

This creates:

- `src/view/components/ui/card.tsx`
- `src/view/components/forms/input.tsx`

## Component Props

Define typed props for your components:

```typescript
interface ButtonProps {
    variant?: 'primary' | 'secondary' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    onClick?: () => void
    children?: any
}

export const Button = (props: ButtonProps) => {
    const variant = props.variant || 'primary'
    const size = props.size || 'md'

    return (
        <button
            class={`btn btn-${variant} btn-${size}`}
            disabled={props.disabled}
            onClick={props.onClick}
        >
            {props.children}
        </button>
    )
}
```

## Using Components

Import and use components in your pages:

```typescript
import { Button } from '@view/components/button.tsx'
import { Card } from '@view/components/ui/card.tsx'

export const HomePage = () => {
    return (
        <div>
            <Card>
                <h1>Welcome</h1>
                <Button variant='primary' size='lg'>
                    Get Started
                </Button>
            </Card>
        </div>
    )
}
```

## JSX Features

**✓ TypeScript support** - Full type checking for props and JSX

**✓ Server-side rendering** - Components render on the server for fast initial
load

**✓ Children support** - Pass children to components like React

## Component Structure

Organize your components by feature or type:

```plaintext
src/view/components/
├── ui/
│   ├── button.tsx
│   ├── card.tsx
│   └── badge.tsx
├── forms/
│   ├── input.tsx
│   ├── select.tsx
│   └── textarea.tsx
├── layout/
│   ├── header.tsx
│   ├── footer.tsx
│   └── sidebar.tsx
└── docs_sidebar.tsx
```

## Best Practices

**✓ Keep components small and focused** - Each component should do one thing
well

**✓ Use TypeScript interfaces for props** - Define clear contracts for component
APIs

**✓ Export const arrow functions** - Consistent with Lockness conventions

**✓ Group related components** - Use subdirectories for organization

## Next Steps

Now that you know how to create components, learn how to use them in pages and
layouts:

- [Routing & Controllers](/docs/routing)
- [Getting Started Guide](/docs/getting-started)
- [CLI Commands](/docs/cli)
