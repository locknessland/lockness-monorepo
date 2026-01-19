# Technical Task: Implement Customizable Pricing Component

## 📋 Task Overview

Create a comprehensive, customizable Pricing component for the `@lockness/ui`
package. The component should support multiple layouts (two-tier, three-tier,
feature comparison), different visual styles (emphasized tiers, featured
badges), and be fully themeable using CSS variables. The pricing component is
essential for SaaS landing pages, product websites, and any application
requiring tier-based pricing displays.

## 🎯 Objectives

1. **Primary Objective**: Create flexible Pricing components that support 2-tier
   and 3-tier layouts with customizable styling
2. **Secondary Objective**: Implement feature comparison tables for detailed
   tier comparisons
3. **Additional Objective**: Support monthly/yearly billing toggle with price
   calculations
4. **Quality Objective**: Ensure full accessibility (ARIA labels, keyboard
   navigation) and responsive design
5. **Documentation Objective**: Create comprehensive documentation with examples
   and a showcase page at `/ui/pricing`

## 📁 Affected File Paths

### New Files to Create

- `/packages/ui/components/Pricing.tsx` - Main Pricing component with all
  sub-components
- `/app/view/pages/ui/pricing.tsx` - Documentation/showcase page

### Framework Files to Extend

- `/packages/ui/components.ts` - Export new Pricing components and types
- `/packages/ui/mod.ts` - Re-export from components.ts (if needed)

### Files to Modify

- `/app/controller/ui_controller.tsx` - Add route for `/ui/pricing`
- `/app/view/components/ui-sidebar.tsx` - Add Pricing link to navigation

### Test Files

- `/packages/ui/tests/pricing.test.tsx` - Unit tests for Pricing components

## 🏗️ Architecture Principles

### Component Composition Pattern

The Pricing component should follow the compound component pattern used
throughout `@lockness/ui`:

```typescript
// Usage example - mirrors pattern from Hero, Newsletter, Gallery
<PricingSection>
    <PricingHeader>
        <PricingBadge>Pricing</PricingBadge>
        <PricingTitle>Choose the right plan for you</PricingTitle>
        <PricingDescription>
            Choose an affordable plan that's packed with features.
        </PricingDescription>
    </PricingHeader>
    <PricingGrid>
        <PricingTier featured>
            <PricingTierName>Pro</PricingTierName>
            <PricingTierPrice>$29</PricingTierPrice>
            <PricingTierDescription>
                Perfect for growing teams
            </PricingTierDescription>
            <PricingTierFeatures>
                <PricingFeature>Unlimited projects</PricingFeature>
                <PricingFeature>Priority support</PricingFeature>
            </PricingTierFeatures>
            <PricingTierCTA href='#'>Get started</PricingTierCTA>
        </PricingTier>
    </PricingGrid>
</PricingSection>
```

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- `PricingSection` - Container with background/layout
- `PricingHeader` - Title, badge, description block
- `PricingGrid` - Tier layout grid
- `PricingTier` - Individual pricing card
- `PricingFeature` - Single feature item
- `PricingToggle` - Monthly/yearly switcher
- `PricingComparison` - Feature comparison table

**2. Open/Closed Principle (OCP)**

- Use variant props for styling variations
- Allow custom className for extension
- Support render props for custom content

**3. Interface Segregation Principle (ISP)**

```typescript
// Separate props interfaces for each component
interface PricingTierProps {
    featured?: boolean
    variant?: 'default' | 'featured' | 'popular'
    // ... tier-specific props only
}

interface PricingFeatureProps {
    included?: boolean
    // ... feature-specific props only
}
```

### CSS Variable Integration

All components must use the global `--radius` and theme CSS variables:

```typescript
const roundedVariants = {
    none: 'rounded-none',
    default: 'rounded-(--radius)',
    sm: 'rounded-sm',
    // ...
}
```

## 🎨 Proposed API Design

### Target User-Facing API (Simple Version)

```typescript
import { 
  PricingSection, 
  PricingGrid, 
  PricingTier 
} from '@lockness/ui/components'

<PricingSection>
  <PricingGrid cols={2}>
    <PricingTier
      name="Hobby"
      price="$29"
      description="Perfect for side projects"
      features={['5 projects', 'Basic analytics']}
      ctaText="Get started"
      ctaHref="#"
    />
    <PricingTier
      name="Pro"
      price="$99"
      description="For growing businesses"
      features={['Unlimited projects', 'Advanced analytics']}
      ctaText="Get started"
      ctaHref="#"
      featured
    />
  </PricingGrid>
</PricingSection>
```

### Target User-Facing API (Advanced Version)

```typescript
import {
  PricingSection,
  PricingHeader,
  PricingBadge,
  PricingTitle,
  PricingDescription,
  PricingToggle,
  PricingGrid,
  PricingTier,
  PricingTierName,
  PricingTierPrice,
  PricingTierDescription,
  PricingTierFeatures,
  PricingFeature,
  PricingTierCTA,
  PricingComparison,
  PricingComparisonSection,
  PricingComparisonRow,
} from '@lockness/ui/components'

<PricingSection background="gradient">
  <PricingHeader>
    <PricingBadge>Pricing</PricingBadge>
    <PricingTitle>Choose the right plan for you</PricingTitle>
    <PricingDescription>
      Choose an affordable plan that's packed with features.
    </PricingDescription>
    <PricingToggle 
      options={['Monthly', 'Yearly']} 
      discount="Save 20%"
    />
  </PricingHeader>
  
  <PricingGrid cols={3}>
    <PricingTier>
      <PricingTierName>Starter</PricingTierName>
      <PricingTierPrice amount={19} period="month" />
      <PricingTierDescription>
        Everything you need to get started.
      </PricingTierDescription>
      <PricingTierFeatures>
        <PricingFeature>Custom domains</PricingFeature>
        <PricingFeature>Edge delivery</PricingFeature>
        <PricingFeature disabled>Priority support</PricingFeature>
      </PricingTierFeatures>
      <PricingTierCTA variant="outline" href="#">
        Get started
      </PricingTierCTA>
    </PricingTier>
    
    <PricingTier featured badge="Most Popular">
      <PricingTierName>Growth</PricingTierName>
      <PricingTierPrice amount={49} period="month" />
      <PricingTierDescription>
        All the extras for your growing team.
      </PricingTierDescription>
      <PricingTierFeatures>
        <PricingFeature>Everything in Starter</PricingFeature>
        <PricingFeature>Advanced analytics</PricingFeature>
        <PricingFeature>Priority support</PricingFeature>
      </PricingTierFeatures>
      <PricingTierCTA variant="primary" href="#">
        Get started
      </PricingTierCTA>
    </PricingTier>
    
    <PricingTier>
      <PricingTierName>Scale</PricingTierName>
      <PricingTierPrice amount={99} period="month" />
      <PricingTierDescription>
        Added flexibility at scale.
      </PricingTierDescription>
      <PricingTierFeatures>
        <PricingFeature>Everything in Growth</PricingFeature>
        <PricingFeature>SSO</PricingFeature>
        <PricingFeature>Custom integrations</PricingFeature>
      </PricingTierFeatures>
      <PricingTierCTA variant="outline" href="#">
        Contact sales
      </PricingTierCTA>
    </PricingTier>
  </PricingGrid>
</PricingSection>
```

### Feature Comparison Table API

```typescript
<PricingComparison tiers={['Starter', 'Growth', 'Scale']}>
    <PricingComparisonSection name='Features'>
        <PricingComparisonRow
            feature='Custom domains'
            values={{ Starter: '1', Growth: '3', Scale: 'Unlimited' }}
        />
        <PricingComparisonRow
            feature='SSO'
            values={{ Starter: false, Growth: false, Scale: true }}
        />
    </PricingComparisonSection>
    <PricingComparisonSection name='Support'>
        <PricingComparisonRow
            feature='24/7 support'
            values={{ Starter: true, Growth: true, Scale: true }}
        />
    </PricingComparisonSection>
</PricingComparison>
```

## 📝 Detailed Implementation Steps

### Phase 1: Core Components

**Step 1.1: Create Pricing.tsx with base components**

File: `/packages/ui/components/Pricing.tsx`

```typescript
import type { FC, PropsWithChildren } from '@lockness/core'
import { cn } from '../lib/utils.ts'

// ============================================================================
// PricingSection - Main container
// ============================================================================

export interface PricingSectionProps {
    /** Background style */
    background?: 'none' | 'gradient' | 'muted' | 'pattern'
    /** Additional class names */
    class?: string
}

export const PricingSection: FC<PropsWithChildren<PricingSectionProps>> = ({
    background = 'none',
    class: className,
    children,
}) => {
    // Implementation
}

// ============================================================================
// PricingHeader - Title block
// ============================================================================

export interface PricingHeaderProps {
    /** Text alignment */
    align?: 'center' | 'left'
    /** Additional class names */
    class?: string
}

export const PricingHeader: FC<PropsWithChildren<PricingHeaderProps>> = ({
    align = 'center',
    class: className,
    children,
}) => {
    // Implementation
}

// Continue with all sub-components...
```

**Step 1.2: Implement PricingGrid and PricingTier**

```typescript
// ============================================================================
// PricingGrid - Tier layout container
// ============================================================================

export interface PricingGridProps {
    /** Number of columns */
    cols?: 2 | 3 | 4
    /** Gap between tiers */
    gap?: 'sm' | 'md' | 'lg'
    /** Additional class names */
    class?: string
}

// ============================================================================
// PricingTier - Individual pricing card
// ============================================================================

export interface PricingTierProps {
    /** Mark as featured/highlighted tier */
    featured?: boolean
    /** Badge text for featured tiers */
    badge?: string
    /** Visual variant */
    variant?: 'default' | 'dark' | 'gradient'
    /** Border radius */
    rounded?: 'none' | 'default' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
    /** Additional class names */
    class?: string
}
```

**Step 1.3: Implement Feature components**

```typescript
// ============================================================================
// PricingFeature - Single feature item with check icon
// ============================================================================

export interface PricingFeatureProps {
    /** Feature is disabled/not included */
    disabled?: boolean
    /** Custom icon */
    icon?: 'check' | 'x' | 'minus'
    /** Additional class names */
    class?: string
}

const CheckIcon: FC = () => (
    <svg class='size-5 shrink-0' viewBox='0 0 20 20' fill='currentColor'>
        <path
            fill-rule='evenodd'
            d='M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z'
            clip-rule='evenodd'
        />
    </svg>
)
```

### Phase 2: Advanced Components

**Step 2.1: PricingToggle for billing period**

```typescript
// ============================================================================
// PricingToggle - Monthly/Yearly switcher
// ============================================================================

export interface PricingToggleProps {
    /** Toggle options */
    options?: [string, string]
    /** Discount badge text */
    discount?: string
    /** Default selected option */
    defaultValue?: 0 | 1
    /** Additional class names */
    class?: string
}

export const PricingToggle: FC<PricingToggleProps> = ({
    options = ['Monthly', 'Yearly'],
    discount,
    defaultValue = 0,
    class: className,
}) => {
    // Client-side toggle implementation
    // Use data attributes for JS hydration
}

export const PricingToggleScript: FC = () => {
    // JavaScript for toggle functionality
}
```

**Step 2.2: PricingComparison table**

```typescript
// ============================================================================
// PricingComparison - Feature comparison table
// ============================================================================

export interface PricingComparisonProps {
    /** Tier names for column headers */
    tiers: string[]
    /** Additional class names */
    class?: string
}

export interface PricingComparisonRowProps {
    /** Feature name */
    feature: string
    /** Values per tier - boolean for check/x, string for text */
    values: Record<string, boolean | string>
    /** Additional class names */
    class?: string
}
```

### Phase 3: Shorthand Component

**Step 3.1: Simple PricingCard for quick usage**

```typescript
// ============================================================================
// PricingCard - All-in-one shorthand component
// ============================================================================

export interface PricingCardProps {
    /** Tier name */
    name: string
    /** Price display */
    price: string | number
    /** Price period */
    period?: 'month' | 'year' | 'once'
    /** Tier description */
    description?: string
    /** Feature list */
    features: (string | { text: string; disabled?: boolean })[]
    /** CTA button text */
    ctaText?: string
    /** CTA button link */
    ctaHref?: string
    /** Mark as featured */
    featured?: boolean
    /** Featured badge text */
    badge?: string
    /** CTA variant */
    ctaVariant?: 'primary' | 'secondary' | 'outline' | 'gradient'
    /** Additional class names */
    class?: string
}

export const PricingCard: FC<PricingCardProps> = (props) => {
    // Compose from individual components
    return (
        <PricingTier featured={props.featured} badge={props.badge}>
            <PricingTierName>{props.name}</PricingTierName>
            <PricingTierPrice>{props.price}</PricingTierPrice>
            {/* ... */}
        </PricingTier>
    )
}
```

### Phase 4: Documentation Page

**Step 4.1: Create showcase page**

File: `/app/view/pages/ui/pricing.tsx`

```typescript
import {
    Card,
    CardContent,
    CodeBlock,
    PricingBadge,
    PricingCard,
    PricingDescription,
    PricingFeature,
    PricingGrid,
    PricingHeader,
    PricingSection,
    PricingTier,
    PricingTierCTA,
    PricingTierDescription,
    PricingTierFeatures,
    PricingTierName,
    PricingTierPrice,
    PricingTitle,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const PricingPage = () => {
    return (
        <PageUiLayout title='Pricing - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        PRICING
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Customizable pricing sections for SaaS and product
                        pages.
                    </p>
                </header>

                {/* Two Tiers Example */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TWO TIERS - EMPHASIZED RIGHT
                    </h2>
                    {/* Demo and code */}
                </section>

                {/* Three Tiers Example */}
                {/* Feature Comparison Example */}
                {/* Props Reference */}
            </div>
        </PageUiLayout>
    )
}
```

### Phase 5: Integration

**Step 5.1: Export components**

File: `/packages/ui/components.ts`

```typescript
// Add after Hero exports
export {
    PricingBadge,
    PricingCard,
    PricingComparison,
    PricingComparisonRow,
    PricingComparisonSection,
    PricingDescription,
    PricingFeature,
    PricingGrid,
    PricingHeader,
    PricingSection,
    PricingTier,
    PricingTierCTA,
    PricingTierDescription,
    PricingTierFeatures,
    PricingTierName,
    PricingTierPrice,
    PricingTitle,
    PricingToggle,
    PricingToggleScript,
} from './components/Pricing.tsx'
export type {
    PricingCardProps,
    PricingComparisonProps,
    PricingComparisonRowProps,
    PricingFeatureProps,
    PricingGridProps,
    PricingHeaderProps,
    PricingSectionProps,
    PricingTierProps,
} from './components/Pricing.tsx'
```

**Step 5.2: Add route and sidebar link**

File: `/app/controller/ui_controller.tsx`

```typescript
import { PricingPage } from '@view/pages/ui/pricing.tsx'

// Add route
@Get('/pricing', { name: 'ui.pricing' })
pricing(c: Context) {
  return c.render(<PricingPage />)
}
```

File: `/app/view/components/ui-sidebar.tsx`

```typescript
// Add to navSections
{ title: 'Pricing', href: '/ui/pricing' },
```

## 🧪 Testing Strategy

### Unit Tests

File: `/packages/ui/tests/pricing.test.tsx`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import { render } from './test_utils.ts'
import {
    PricingCard,
    PricingGrid,
    PricingSection,
    PricingTier,
} from '../components/Pricing.tsx'

Deno.test('PricingSection - renders with default props', () => {
    const html = render(
        <PricingSection>
            <div>Content</div>
        </PricingSection>,
    )
    assertExists(html)
})

Deno.test('PricingTier - applies featured styles', () => {
    const html = render(<PricingTier featured>Pro</PricingTier>)
    // Assert featured classes applied
})

Deno.test('PricingCard - renders all props correctly', () => {
    const html = render(
        <PricingCard
            name='Pro'
            price='$29'
            description='For teams'
            features={['Feature 1', 'Feature 2']}
            ctaText='Get started'
            ctaHref='#'
        />,
    )
    // Assert all elements present
})

Deno.test('PricingFeature - shows disabled state', () => {
    const html = render(<PricingFeature disabled>SSO</PricingFeature>)
    // Assert disabled styling applied
})
```

### Manual Testing Checklist

- [ ] Two-tier layout displays correctly
- [ ] Three-tier layout displays correctly
- [ ] Featured tier has emphasis styling
- [ ] Feature comparison table aligns properly
- [ ] Responsive design works on mobile
- [ ] Dark mode styling works correctly
- [ ] `--radius` variable is respected
- [ ] All CTAs are clickable and accessible
- [ ] Keyboard navigation works
- [ ] Screen reader announces content correctly

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Add JSDoc comments to all exported components
- [ ] Document all props with TypeScript interfaces
- [ ] Add usage examples in comments

### User Documentation (Web Docs)

- [ ] Create `/app/view/pages/ui/pricing.tsx` showcase page
- [ ] Include examples for all variants
- [ ] Add props reference tables
- [ ] Include code snippets for copy/paste

### Package Updates

- [ ] Export all components from `/packages/ui/components.ts`
- [ ] Update `/packages/ui/README.md` with Pricing section

## 🔍 Quality Checks

### Before Marking Complete

```bash
# Type check
deno check packages/ui/components/Pricing.tsx app/view/pages/ui/pricing.tsx

# Lint
deno lint packages/ui/components/Pricing.tsx app/view/pages/ui/pricing.tsx

# Tests
deno test packages/ui/tests/pricing.test.tsx

# Format
deno fmt packages/ui/components/Pricing.tsx app/view/pages/ui/pricing.tsx
```

## ✅ Definition of Done

- [ ] All components implemented and exported
- [ ] Two-tier layout variant working
- [ ] Three-tier layout variant working
- [ ] Feature comparison table working
- [ ] PricingToggle with JS functionality
- [ ] PricingCard shorthand component
- [ ] Documentation page at `/ui/pricing`
- [ ] Route added to `ui_controller.tsx`
- [ ] Sidebar link added
- [ ] Unit tests passing
- [ ] `deno check` passes
- [ ] `deno lint` passes
- [ ] Responsive design verified
- [ ] Dark mode verified
- [ ] Accessibility verified (ARIA, keyboard nav)
- [ ] CSS variable integration (`--radius`)

## 🔗 Related Tasks

- `.tasks/implement_shadcn_components.md` - General component patterns
- `.tasks/create_ui_package.md` - UI package structure

## 📅 Timeline

- **Start Date**: [TBD]
- **Estimated Completion**: 2-3 days
- **Actual Completion**: [TBD]

## 📝 Notes

### Design Decisions

1. **Compound Components**: Following the pattern established by Hero,
   Newsletter, and Gallery components for maximum flexibility
2. **Shorthand Component**: PricingCard provides a quick way to render common
   pricing patterns without composing multiple components
3. **CSS Variables**: All border-radius uses `rounded-(--radius)` as default to
   respect the global theme
4. **Dark Mode**: Featured tiers invert colors in dark mode (dark bg in light
   mode, light-ish bg in dark mode) following Tailwind UI patterns

### Accessibility Considerations

- All interactive elements must have proper focus states
- Feature lists should use proper `<ul>` semantics
- Comparison tables must have proper `<th>` headers
- Toggle must be keyboard accessible
- Price announcements should be screen-reader friendly

### Performance Considerations

- PricingToggleScript should be minimal and not require heavy JS
- Consider using CSS-only toggle if possible (radio buttons)
- Lazy load comparison tables if they contain many rows

---

## Component Reference

### Components to Implement

| Component                  | Purpose                                |
| -------------------------- | -------------------------------------- |
| `PricingSection`           | Main container with background options |
| `PricingHeader`            | Title/description block                |
| `PricingBadge`             | Small label above title                |
| `PricingTitle`             | Main heading                           |
| `PricingDescription`       | Subtitle text                          |
| `PricingToggle`            | Monthly/yearly switcher                |
| `PricingToggleScript`      | JS for toggle functionality            |
| `PricingGrid`              | Tier layout grid (2-4 cols)            |
| `PricingTier`              | Individual pricing card                |
| `PricingTierName`          | Tier name heading                      |
| `PricingTierPrice`         | Price display                          |
| `PricingTierDescription`   | Tier description                       |
| `PricingTierFeatures`      | Feature list container                 |
| `PricingFeature`           | Single feature with icon               |
| `PricingTierCTA`           | Call-to-action button                  |
| `PricingCard`              | All-in-one shorthand                   |
| `PricingComparison`        | Feature comparison table               |
| `PricingComparisonSection` | Table section grouping                 |
| `PricingComparisonRow`     | Table row with values                  |

### Props Quick Reference

| Prop         | Components               | Values                                                  |
| ------------ | ------------------------ | ------------------------------------------------------- |
| `background` | PricingSection           | 'none', 'gradient', 'muted', 'pattern'                  |
| `cols`       | PricingGrid              | 2, 3, 4                                                 |
| `featured`   | PricingTier, PricingCard | boolean                                                 |
| `badge`      | PricingTier, PricingCard | string                                                  |
| `disabled`   | PricingFeature           | boolean                                                 |
| `variant`    | PricingTierCTA           | 'primary', 'secondary', 'outline', 'gradient'           |
| `rounded`    | PricingTier              | 'none', 'default', 'sm', 'md', 'lg', 'xl', '2xl', '3xl' |
