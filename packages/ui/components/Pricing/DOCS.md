# Pricing

Documentation for the Pricing component.

## Installation

```bash
deno run -A jsr:@lockness/ui add pricing
```

## Usage

```tsx
import {
  PricingSection,
  PricingCard,
  PricingCardHeader,
  PricingCardPrice,
  PricingCardFeatures,
  PricingCardFeature,
  PricingCardAction
} from '@lockness/ui/components'

<PricingSection columns={2}>
  <PricingCard>
    <PricingCardHeader title="Starter" />
    <PricingCardPrice price={0} description="Free forever" />
    <PricingCardFeatures>
      <PricingCardFeature>Up to 3 projects</PricingCardFeature>
      <PricingCardFeature>1 GB storage</PricingCardFeature>
    </PricingCardFeatures>
    <PricingCardAction href="/signup" variant="outline">
      Get Started Free
    </PricingCardAction>
  </PricingCard>

  <PricingCard featured>
    <PricingCardHeader title="Pro" badge="Popular" />
    <PricingCardPrice price={29} period="month" />
    <PricingCardFeatures>
      <PricingCardFeature>Unlimited projects</PricingCardFeature>
      <PricingCardFeature>50 GB storage</PricingCardFeature>
    </PricingCardFeatures>
    <PricingCardAction href="/signup">Start Free Trial</PricingCardAction>
  </PricingCard>
</PricingSection>
```

## Props

### PricingCard

| Prop     | Type      | Default | Description                                              |
| -------- | --------- | ------- | -------------------------------------------------------- |
| children | `unknown` | -       | Card content (PricingCardHeader, PricingCardPrice, etc.) |
| class    | `string`  | -       | Additional CSS class names                               |
| featured | `boolean` | `false` | Whether this tier is emphasized/featured                 |

### PricingCardHeader

| Prop         | Type                    | Default      | Description                                   |
| ------------ | ----------------------- | ------------ | --------------------------------------------- |
| title        | `string`                | **required** | Tier name displayed as the card title         |
| badge        | `string`                | -            | Optional badge text displayed above the title |
| badgeVariant | `BadgeProps['variant']` | `'default'`  | Visual variant for the badge                  |
| class        | `string`                | -            | Additional CSS class names                    |

### PricingCardPrice

| Prop          | Type               | Default      | Description                                               |
| ------------- | ------------------ | ------------ | --------------------------------------------------------- |
| price         | `number \| string` | **required** | Price amount to display                                   |
| currency      | `CurrencySymbol`   | `'$'`        | Currency symbol displayed before the price                |
| period        | `BillingPeriod`    | -            | Billing period displayed after the price                  |
| originalPrice | `number \| string` | -            | Original price for showing discounts (with strikethrough) |
| description   | `string`           | -            | Additional description text below the price               |
| class         | `string`           | -            | Additional CSS class names                                |

### PricingCardDescription

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| children | `unknown` | -       | Description text content   |
| class    | `string`  | -       | Additional CSS class names |

### PricingCardFeatures

| Prop     | Type      | Default | Description                                   |
| -------- | --------- | ------- | --------------------------------------------- |
| children | `unknown` | -       | Feature items (PricingCardFeature components) |
| class    | `string`  | -       | Additional CSS class names                    |

### PricingCardFeature

| Prop     | Type      | Default | Description                                                          |
| -------- | --------- | ------- | -------------------------------------------------------------------- |
| children | `unknown` | -       | Feature text content                                                 |
| included | `boolean` | `true`  | Whether the feature is included (check icon if true, cross if false) |
| class    | `string`  | -       | Additional CSS class names                                           |

### PricingCardAction

| Prop     | Type                     | Default     | Description                                              |
| -------- | ------------------------ | ----------- | -------------------------------------------------------- |
| children | `unknown`                | -           | Button text content                                      |
| href     | `string`                 | -           | Button href (renders as link with up-follow if provided) |
| variant  | `ButtonProps['variant']` | `'primary'` | Button visual variant                                    |
| class    | `string`                 | -           | Additional CSS class names                               |

### PricingToggle

| Prop         | Type                    | Default     | Description                                              |
| ------------ | ----------------------- | ----------- | -------------------------------------------------------- |
| selected     | `'monthly' \| 'yearly'` | `'monthly'` | Currently selected billing period                        |
| monthlyLabel | `string`                | `'Monthly'` | Label for monthly option                                 |
| yearlyLabel  | `string`                | `'Yearly'`  | Label for yearly option                                  |
| yearlyBadge  | `string`                | -           | Optional badge text for yearly option (e.g., "Save 20%") |
| class        | `string`                | -           | Additional CSS class names                               |

## Examples

### Basic Example

```tsx
// Add example here
```
