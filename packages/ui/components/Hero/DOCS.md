# Hero

Documentation for the Hero component.

## Installation

```bash
deno run -A jsr:@lockness/ui add hero
```

## Usage

```tsx
import {
  Hero,
  HeroTitle,
  HeroSubtitle,
  HeroActions,
  HeroCTA
} from '@lockness/ui/components'

<Hero background="gradient" size="lg">
  <HeroTitle>Build Something Amazing</HeroTitle>
  <HeroSubtitle>
    Start your next project with our powerful UI components.
  </HeroSubtitle>
  <HeroActions>
    <HeroCTA href="/get-started">Get Started</HeroCTA>
  </HeroActions>
</Hero>
```

## Props

### Hero

| Prop       | Type                                                    | Default     | Description                |
| ---------- | ------------------------------------------------------- | ----------- | -------------------------- |
| background | `'none' \| 'pattern' \| 'gradient' \| 'dots' \| 'grid'` | `'none'`    | Background style           |
| align      | `'center' \| 'left'`                                    | `'center'`  | Content alignment          |
| size       | `'sm' \| 'md' \| 'lg' \| 'xl'`                          | `'lg'`      | Vertical padding size      |
| maxWidth   | `'sm' \| 'md' \| 'lg' \| 'xl' \| 'default' \| 'full'`   | `'default'` | Container max width        |
| class      | `string`                                                | -           | Additional CSS class names |
| children   | `unknown`                                               | -           | Children content           |

### HeroAnnouncement

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| href     | `string`  | -       | Link URL                   |
| badge    | `string`  | -       | Badge text (shown in pill) |
| class    | `string`  | -       | Additional CSS class names |
| children | `unknown` | -       | Children content           |

### HeroTitle

| Prop           | Type                                                                     | Default     | Description                                             |
| -------------- | ------------------------------------------------------------------------ | ----------- | ------------------------------------------------------- |
| size           | `'sm' \| 'default' \| 'lg' \| 'xl'`                                      | `'default'` | Title size                                              |
| gradient       | `string`                                                                 | -           | Gradient text (wrap part of title in this)              |
| gradientColors | `'primary' \| 'blue-violet' \| 'green-teal' \| 'orange-red' \| 'custom'` | `'primary'` | Gradient colors                                         |
| gradientClass  | `string`                                                                 | -           | Custom gradient class (when gradientColors is 'custom') |
| class          | `string`                                                                 | -           | Additional CSS class names                              |
| children       | `unknown`                                                                | -           | Children content                                        |

### HeroSubtitle

| Prop     | Type                                     | Default | Description                |
| -------- | ---------------------------------------- | ------- | -------------------------- |
| maxWidth | `'sm' \| 'md' \| 'lg' \| 'xl' \| 'full'` | `'md'`  | Max width                  |
| class    | `string`                                 | -       | Additional CSS class names |
| children | `unknown`                                | -       | Children content           |

### HeroActions

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| class    | `string`  | -       | Additional CSS class names |
| children | `unknown` | -       | Children content           |

### HeroCTA

| Prop      | Type                                                  | Default      | Description                |
| --------- | ----------------------------------------------------- | ------------ | -------------------------- |
| href      | `string`                                              | -            | Link URL                   |
| variant   | `'gradient' \| 'primary' \| 'secondary' \| 'outline'` | `'gradient'` | Button variant             |
| size      | `'sm' \| 'default' \| 'lg'`                           | `'default'`  | Button size                |
| showArrow | `boolean`                                             | `true`       | Show arrow icon            |
| class     | `string`                                              | -            | Additional CSS class names |
| children  | `unknown`                                             | -            | Children content           |

### HeroCommand

| Prop    | Type     | Default      | Description                      |
| ------- | -------- | ------------ | -------------------------------- |
| command | `string` | **required** | Command text to display and copy |
| class   | `string` | -            | Additional CSS class names       |

### HeroFooter

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| class    | `string`  | -       | Additional CSS class names |
| children | `unknown` | -       | Children content           |

## Examples

### Basic Example

```tsx
// Add example here
```
