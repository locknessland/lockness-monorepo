# Kbd

Documentation for the Kbd component.

## Installation

```bash
deno run -A jsr:@lockness/ui add kbd
```

## Usage

```tsx
import { Kbd } from '@lockness/ui/components'

<p>
  Press <Kbd>⌘</Kbd> + <Kbd>K</Kbd> to open the command palette
</p>
```

## Props

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| children | `unknown` | -       | Keyboard key content       |
| class    | `string`  | -       | Additional CSS class names |
| id       | `string`  | -       | Element id attribute       |
| ...props | `unknown` | -       | Additional HTML attributes |
