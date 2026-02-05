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

## Theming

The Hero component can be customized using CSS variables. This allows you to
change the appearance of hero sections globally or override specific instances.

### Available CSS Variables

| Variable                       | Default   | Description                         |
| ------------------------------ | --------- | ----------------------------------- |
| `--hero-padding-y`             | `4rem`    | Vertical padding                    |
| `--hero-padding-x`             | `1.5rem`  | Horizontal padding                  |
| `--hero-title-font-size`       | `3rem`    | Title font size (base)              |
| `--hero-title-font-size-md`    | `4rem`    | Title font size (medium screens)    |
| `--hero-title-font-size-lg`    | `5rem`    | Title font size (large screens)     |
| `--hero-subtitle-font-size`    | `1.25rem` | Subtitle font size (base)           |
| `--hero-subtitle-font-size-md` | `1.5rem`  | Subtitle font size (medium screens) |
| `--hero-gap`                   | `1.5rem`  | Gap between hero elements           |

### Theming Examples

#### Global Customization

Customize all hero sections by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    /* Increase padding for more spacious heroes */
    --hero-padding-y: 6rem;
    --hero-padding-x: 2rem;

    /* Larger title sizes */
    --hero-title-font-size: 3.5rem;
    --hero-title-font-size-md: 4.5rem;
    --hero-title-font-size-lg: 6rem;

    /* Adjust subtitle size */
    --hero-subtitle-font-size: 1.5rem;
    --hero-subtitle-font-size-md: 1.75rem;

    /* More spacing between elements */
    --hero-gap: 2rem;
}
```

#### Local Overrides

Override CSS variables for specific hero instances:

```tsx
<div style="--hero-padding-y: 2rem; --hero-title-font-size: 2rem;">
    <Hero>
        {/* Compact hero with smaller text */}
        <HeroTitle>Welcome</HeroTitle>
    </Hero>
</div>

<div style="--hero-title-font-size-lg: 7rem; --hero-gap: 3rem;">
    <Hero size="xl">
        {/* Extra large hero with massive title */}
        <HeroTitle>Big Announcement</HeroTitle>
    </Hero>
</div>
```

#### Component-Specific Theming

Create themed sections with different hero styles:

```tsx
<div class="landing-hero" style={{
    '--hero-padding-y': '8rem',
    '--hero-title-font-size': '4rem',
    '--hero-title-font-size-lg': '6rem',
    '--hero-gap': '2.5rem'
}}>
    <Hero background="gradient" size="xl">
        {/* Large, spacious landing page hero */}
        <HeroTitle>Build Amazing Things</HeroTitle>
        <HeroSubtitle>Start building today</HeroSubtitle>
    </Hero>
</div>

<div class="compact-hero" style={{
    '--hero-padding-y': '2rem',
    '--hero-padding-x': '1rem',
    '--hero-title-font-size': '2rem',
    '--hero-subtitle-font-size': '1rem',
    '--hero-gap': '1rem'
}}>
    <Hero size="sm">
        {/* Compact hero for internal pages */}
        <HeroTitle>Dashboard</HeroTitle>
        <HeroSubtitle>Manage your account</HeroSubtitle>
    </Hero>
</div>
```

## Examples

### Basic Example

```tsx
// Add example here
```
