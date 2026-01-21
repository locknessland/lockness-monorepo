# Technical Task: Create Search Bar UI Component #57

## 📋 Task Overview

Créer un composant **SearchBar** flexible et personnalisable pour le package
`@lockness/ui`. Le composant doit supporter différents styles visuels, tailles,
et options de personnalisation, tout en s'intégrant parfaitement avec Unpoly
pour la recherche en temps réel et le filtrage.

## 🎯 Objectifs

1. **Composant Principal**: Créer `SearchBar.tsx` avec différents variants
2. **Variants Visuels**: Implémenter les styles `default`, `ghost`, `outline`,
   `filled`
3. **Tailles Multiples**: Supporter `sm`, `md`, `lg`, `xl`
4. **Fonctionnalités Avancées**: Icône, bouton de clear, raccourci clavier,
   loading state
5. **Intégration Unpoly**: Support natif pour la recherche AJAX
6. **Accessibilité**: Support ARIA complet et navigation clavier
7. **Documentation**: JSDoc complet, README, llms.txt

## 📁 Affected File Paths

### New Files to Create

- `/packages/ui/components/SearchBar.tsx` - Composant principal
- `/packages/ui/tests/searchbar.test.tsx` - Tests unitaires
- `/packages/ui/llms/searchbar.txt` - Documentation LLM

### Files to Modify

- `/packages/ui/mod.ts` - Ajouter au registry CLI
- `/packages/ui/components.ts` - Export pour mode library
- `/packages/ui/llms.txt` - Ajouter documentation SearchBar
- `/packages/ui/README.md` - Ajouter documentation

## 🏗️ Architecture Principles

### Design Tokens

Le composant utilise les CSS Variables existantes pour garantir la cohérence :

```css
/* Variables utilisées */
--background
--foreground
--muted
--muted-foreground
--border
--input
--ring
--radius
```

### Pattern de Props

Suivre le pattern établi par Input et Button :

```typescript
export interface SearchBarProps {
    variant?: 'default' | 'ghost' | 'outline' | 'filled'
    size?: 'sm' | 'md' | 'lg' | 'xl'
    // ... autres props
}
```

## 🎨 Proposed API Design

### API Simple

```tsx
import { SearchBar } from '@view/components/ui/SearchBar.tsx'

// Usage basique
<SearchBar placeholder="Search..." />

// Avec variant
<SearchBar variant="filled" placeholder="Search products" />

// Avec taille
<SearchBar size="lg" placeholder="Search" />
```

### API Avancée

```tsx
// Avec icône personnalisée et clear button
<SearchBar
    placeholder="Search users..."
    showIcon
    showClear
    iconPosition="left"
    onClear="this.value=''"
/>

// Avec raccourci clavier
<SearchBar
    placeholder="Search..."
    shortcut="⌘K"
    showShortcut
/>

// État de chargement
<SearchBar
    placeholder="Searching..."
    loading
/>

// Intégration Unpoly (recherche AJAX)
<SearchBar
    placeholder="Search products..."
    up-autosubmit
    up-delay="300"
    up-target=".search-results"
    name="query"
/>

// Avec suggestions dropdown (via Unpoly layer)
<SearchBar
    placeholder="Search..."
    up-layer="popup"
    up-href="/api/suggestions?q={value}"
/>
```

### Composant SearchBarGroup (Optionnel)

```tsx
import {
    SearchBar,
    SearchBarGroup,
    SearchBarFilter,
} from '@view/components/ui/SearchBar.tsx'

// Barre de recherche avec filtres
<SearchBarGroup>
    <SearchBar placeholder="Search..." />
    <SearchBarFilter>
        <option value="all">All</option>
        <option value="products">Products</option>
        <option value="users">Users</option>
    </SearchBarFilter>
</SearchBarGroup>
```

## 📝 Detailed Implementation Steps

### Phase 1: Core Component

**Step 1.1: Create SearchBar Component**

File: `/packages/ui/components/SearchBar.tsx`

````tsx
/**
 * @fileoverview Search bar component with multiple variants and sizes.
 *
 * Supports customizable styling, icons, keyboard shortcuts,
 * and Unpoly integration for AJAX search.
 *
 * @module @lockness/ui/components/searchbar
 */

import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'
import { LoaderIcon, SearchIcon, XIcon } from '../icons.tsx'

/**
 * SearchBar variant styles
 */
export type SearchBarVariant = 'default' | 'ghost' | 'outline' | 'filled'

/**
 * SearchBar size options
 */
export type SearchBarSize = 'sm' | 'md' | 'lg' | 'xl'

/**
 * Icon position within the search bar
 */
export type IconPosition = 'left' | 'right'

/**
 * SearchBar component props
 */
export interface SearchBarProps {
    /**
     * Visual style variant
     * @default 'default'
     */
    variant?: SearchBarVariant
    /**
     * Component size
     * @default 'md'
     */
    size?: SearchBarSize
    /**
     * Placeholder text
     * @default 'Search...'
     */
    placeholder?: string
    /**
     * Input name attribute
     */
    name?: string
    /**
     * Input value
     */
    value?: string
    /**
     * Show search icon
     * @default true
     */
    showIcon?: boolean
    /**
     * Icon position
     * @default 'left'
     */
    iconPosition?: IconPosition
    /**
     * Show clear button when input has value
     * @default false
     */
    showClear?: boolean
    /**
     * Keyboard shortcut to display
     * @example '⌘K' or 'Ctrl+K'
     */
    shortcut?: string
    /**
     * Show keyboard shortcut badge
     * @default false
     */
    showShortcut?: boolean
    /**
     * Loading state
     * @default false
     */
    loading?: boolean
    /**
     * Disable input
     * @default false
     */
    disabled?: boolean
    /**
     * Full width mode
     * @default false
     */
    fullWidth?: boolean
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Container class names
     */
    containerClass?: string
    /**
     * Element id attribute
     */
    id?: string
    /**
     * Autocomplete attribute
     * @default 'off'
     */
    autocomplete?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

const variantStyles: Record<SearchBarVariant, string> = {
    default: `
        border border-(--input) bg-(--background)
        focus-within:ring-2 focus-within:ring-(--ring) focus-within:ring-offset-2
    `,
    ghost: `
        bg-transparent
        focus-within:bg-(--muted)
    `,
    outline: `
        border-2 border-(--border) bg-transparent
        focus-within:border-(--ring)
    `,
    filled: `
        bg-(--muted) border-transparent
        focus-within:bg-(--background) focus-within:ring-2 focus-within:ring-(--ring)
    `,
}

const sizeStyles: Record<
    SearchBarSize,
    { container: string; input: string; icon: number }
> = {
    sm: {
        container: 'h-8 px-2 gap-1.5',
        input: 'text-xs',
        icon: 14,
    },
    md: {
        container: 'h-10 px-3 gap-2',
        input: 'text-sm',
        icon: 16,
    },
    lg: {
        container: 'h-12 px-4 gap-2.5',
        input: 'text-base',
        icon: 18,
    },
    xl: {
        container: 'h-14 px-5 gap-3',
        input: 'text-lg',
        icon: 20,
    },
}

/**
 * SearchBar Component
 *
 * A customizable search input with icons, clear button, keyboard shortcuts,
 * and Unpoly integration for AJAX search.
 *
 * @example
 * ```tsx
 * // Basic search bar
 * <SearchBar placeholder="Search products..." />
 *
 * // Filled variant with clear button
 * <SearchBar variant="filled" showClear placeholder="Search..." />
 *
 * // With keyboard shortcut
 * <SearchBar shortcut="⌘K" showShortcut placeholder="Quick search..." />
 *
 * // Large size with loading state
 * <SearchBar size="lg" loading placeholder="Searching..." />
 *
 * // Unpoly AJAX search
 * <SearchBar
 *   name="q"
 *   up-autosubmit
 *   up-delay="300"
 *   up-target=".results"
 *   placeholder="Search..."
 * />
 * ```
 */
export const SearchBar: FC<SearchBarProps> = ({
    variant = 'default',
    size = 'md',
    placeholder = 'Search...',
    name,
    value,
    showIcon = true,
    iconPosition = 'left',
    showClear = false,
    shortcut,
    showShortcut = false,
    loading = false,
    disabled = false,
    fullWidth = false,
    class: className,
    containerClass,
    id,
    autocomplete = 'off',
    ...props
}) => {
    const sizeConfig = sizeStyles[size]

    return (
        <div
            class={cn(
                'relative inline-flex items-center rounded-(--radius)',
                'transition-all duration-200',
                variantStyles[variant],
                sizeConfig.container,
                fullWidth && 'w-full',
                disabled && 'opacity-50 cursor-not-allowed',
                containerClass,
            )}
        >
            {/* Left Icon */}
            {showIcon && iconPosition === 'left' && (
                <span class='flex-shrink-0 text-(--muted-foreground)'>
                    {loading
                        ? (
                            <LoaderIcon
                                size={sizeConfig.icon}
                                class='animate-spin'
                            />
                        )
                        : <SearchIcon size={sizeConfig.icon} />}
                </span>
            )}

            {/* Input */}
            <input
                type='search'
                id={id}
                name={name}
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                autocomplete={autocomplete}
                class={cn(
                    'flex-1 bg-transparent border-0 outline-none',
                    'placeholder:text-(--muted-foreground)',
                    'disabled:cursor-not-allowed',
                    '[&::-webkit-search-cancel-button]:hidden',
                    '[&::-webkit-search-decoration]:hidden',
                    sizeConfig.input,
                    className,
                )}
                {...props}
            />

            {/* Right Icon (when position is right) */}
            {showIcon && iconPosition === 'right' && !loading && (
                <span class='flex-shrink-0 text-(--muted-foreground)'>
                    <SearchIcon size={sizeConfig.icon} />
                </span>
            )}

            {/* Loading indicator (right side) */}
            {loading && iconPosition === 'right' && (
                <span class='flex-shrink-0 text-(--muted-foreground)'>
                    <LoaderIcon size={sizeConfig.icon} class='animate-spin' />
                </span>
            )}

            {/* Clear Button */}
            {showClear && (
                <button
                    type='button'
                    class={cn(
                        'flex-shrink-0 p-0.5 rounded-sm',
                        'text-(--muted-foreground) hover:text-(--foreground)',
                        'hover:bg-(--muted) transition-colors',
                        'focus:outline-none focus:ring-1 focus:ring-(--ring)',
                    )}
                    aria-label='Clear search'
                    onclick="this.previousElementSibling.value=''; this.previousElementSibling.focus();"
                >
                    <XIcon size={sizeConfig.icon - 2} />
                </button>
            )}

            {/* Keyboard Shortcut Badge */}
            {showShortcut && shortcut && (
                <kbd
                    class={cn(
                        'flex-shrink-0 pointer-events-none',
                        'inline-flex items-center gap-1 px-1.5',
                        'rounded border border-(--border) bg-(--muted)',
                        'font-mono text-xs text-(--muted-foreground)',
                        size === 'sm' && 'text-[10px] px-1',
                        size === 'xl' && 'text-sm px-2',
                    )}
                >
                    {shortcut}
                </kbd>
            )}
        </div>
    )
}

/**
 * SearchBarGroup component for grouping search bar with filters
 */
export interface SearchBarGroupProps {
    /**
     * Children components (SearchBar + SearchBarFilter)
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * SearchBarGroup Component
 *
 * Groups a SearchBar with optional filter dropdowns.
 *
 * @example
 * ```tsx
 * <SearchBarGroup>
 *   <SearchBar placeholder="Search..." />
 *   <SearchBarFilter>
 *     <option value="all">All</option>
 *     <option value="products">Products</option>
 *   </SearchBarFilter>
 * </SearchBarGroup>
 * ```
 */
export const SearchBarGroup: FC<SearchBarGroupProps> = ({
    children,
    class: className,
}) => {
    return (
        <div
            class={cn(
                'inline-flex items-stretch',
                'rounded-(--radius) border border-(--input)',
                'overflow-hidden',
                'focus-within:ring-2 focus-within:ring-(--ring) focus-within:ring-offset-2',
                className,
            )}
        >
            {children}
        </div>
    )
}

/**
 * SearchBarFilter component for filter dropdown
 */
export interface SearchBarFilterProps {
    /**
     * Select options
     */
    children?: unknown
    /**
     * Select name attribute
     */
    name?: string
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * SearchBarFilter Component
 *
 * A filter dropdown to use alongside SearchBar in a SearchBarGroup.
 *
 * @example
 * ```tsx
 * <SearchBarFilter name="category">
 *   <option value="all">All Categories</option>
 *   <option value="electronics">Electronics</option>
 *   <option value="clothing">Clothing</option>
 * </SearchBarFilter>
 * ```
 */
export const SearchBarFilter: FC<SearchBarFilterProps> = ({
    children,
    name,
    class: className,
    ...props
}) => {
    return (
        <select
            name={name}
            class={cn(
                'h-full px-3 py-2',
                'bg-(--muted) border-l border-(--input)',
                'text-sm text-(--foreground)',
                'cursor-pointer',
                'focus:outline-none focus:bg-(--background)',
                'appearance-none',
                className,
            )}
            {...props}
        >
            {children}
        </select>
    )
}
````

**Step 1.2: Add LoaderIcon to icons.tsx**

File: `/packages/ui/icons.tsx` (ajouter)

```tsx
export const LoaderIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        <path d='M21 12a9 9 0 1 1-6.219-8.56' />
    </IconBase>
)
```

### Phase 2: CLI Integration

**Step 2.1: Update Registry**

File: `/packages/ui/mod.ts` (ajouter au REGISTRY)

```typescript
'search-bar': {
    name: 'search-bar',
    description: 'Customizable search bar with variants, sizes, and Unpoly integration',
    files: [
        {
            path: 'components/SearchBar.tsx',
            target: 'components/ui/SearchBar.tsx',
        },
    ],
    internalDependencies: ['utils', 'icons'],
},
```

**Step 2.2: Update components.ts exports**

File: `/packages/ui/components.ts`

```typescript
export {
    type IconPosition,
    SearchBar,
    SearchBarFilter,
    type SearchBarFilterProps,
    SearchBarGroup,
    type SearchBarGroupProps,
    type SearchBarProps,
    type SearchBarSize,
    type SearchBarVariant,
} from './components/SearchBar.tsx'
```

### Phase 3: Tests

**Step 3.1: Create Tests**

File: `/packages/ui/tests/searchbar.test.tsx`

```tsx
import { assertEquals, assertStringIncludes } from '@std/assert'
import { SearchBar, SearchBarGroup, SearchBarFilter } from '../components/SearchBar.tsx'

Deno.test('SearchBar - renders with default props', () => {
    const html = (<SearchBar /> as unknown as { toString(): string }).toString()
    assertStringIncludes(html, 'type="search"')
    assertStringIncludes(html, 'placeholder="Search..."')
})

Deno.test('SearchBar - renders with custom placeholder', () => {
    const html = (<SearchBar placeholder="Find users..." /> as unknown as { toString(): string }).toString()
    assertStringIncludes(html, 'placeholder="Find users..."')
})

Deno.test('SearchBar - renders different variants', () => {
    const variants = ['default', 'ghost', 'outline', 'filled'] as const
    for (const variant of variants) {
        const html = (<SearchBar variant={variant} /> as unknown as { toString(): string }).toString()
        assertStringIncludes(html, 'type="search"')
    }
})

Deno.test('SearchBar - renders different sizes', () => {
    const sizes = ['sm', 'md', 'lg', 'xl'] as const
    for (const size of sizes) {
        const html = (<SearchBar size={size} /> as unknown as { toString(): string }).toString()
        assertStringIncludes(html, 'type="search"')
    }
})

Deno.test('SearchBar - renders keyboard shortcut', () => {
    const html = (<SearchBar shortcut="⌘K" showShortcut /> as unknown as { toString(): string }).toString()
    assertStringIncludes(html, '⌘K')
    assertStringIncludes(html, '<kbd')
})

Deno.test('SearchBar - renders clear button', () => {
    const html = (<SearchBar showClear /> as unknown as { toString(): string }).toString()
    assertStringIncludes(html, 'Clear search')
})

Deno.test('SearchBar - renders with Unpoly attributes', () => {
    const html = (<SearchBar up-autosubmit up-delay="300" up-target=".results" /> as unknown as { toString(): string }).toString()
    assertStringIncludes(html, 'up-autosubmit')
    assertStringIncludes(html, 'up-delay="300"')
    assertStringIncludes(html, 'up-target=".results"')
})

Deno.test('SearchBarGroup - renders with children', () => {
    const html = (
        <SearchBarGroup>
            <SearchBar placeholder="Search..." />
            <SearchBarFilter name="category">
                <option value="all">All</option>
            </SearchBarFilter>
        </SearchBarGroup>
    as unknown as { toString(): string }).toString()
    assertStringIncludes(html, 'type="search"')
    assertStringIncludes(html, '<select')
})

Deno.test('SearchBarFilter - renders options', () => {
    const html = (
        <SearchBarFilter name="type">
            <option value="users">Users</option>
            <option value="posts">Posts</option>
        </SearchBarFilter>
    as unknown as { toString(): string }).toString()
    assertStringIncludes(html, 'name="type"')
    assertStringIncludes(html, 'Users')
    assertStringIncludes(html, 'Posts')
})
```

### Phase 4: Documentation

**Step 4.1: Create LLM Documentation**

File: `/packages/ui/llms/searchbar.txt`

```
# SearchBar Component

Customizable search bar for @lockness/ui with multiple variants, sizes, and Unpoly integration.

## Installation

deno run -A jsr:@lockness/ui add search-bar

## Basic Usage

import { SearchBar } from '@view/components/ui/SearchBar.tsx'

<SearchBar placeholder="Search..." />

## Variants

- default: Standard border with focus ring
- ghost: Transparent, shows background on focus
- outline: 2px border, no background
- filled: Muted background, changes on focus

<SearchBar variant="default" placeholder="Default" />
<SearchBar variant="ghost" placeholder="Ghost" />
<SearchBar variant="outline" placeholder="Outline" />
<SearchBar variant="filled" placeholder="Filled" />

## Sizes

- sm: Height 32px, text-xs
- md: Height 40px, text-sm (default)
- lg: Height 48px, text-base
- xl: Height 56px, text-lg

<SearchBar size="sm" />
<SearchBar size="md" />
<SearchBar size="lg" />
<SearchBar size="xl" />

## Features

### Search Icon
<SearchBar showIcon iconPosition="left" />
<SearchBar showIcon iconPosition="right" />
<SearchBar showIcon={false} />

### Clear Button
<SearchBar showClear />

### Keyboard Shortcut
<SearchBar shortcut="⌘K" showShortcut />
<SearchBar shortcut="Ctrl+K" showShortcut />

### Loading State
<SearchBar loading />

### Full Width
<SearchBar fullWidth />

### Disabled
<SearchBar disabled />

## Unpoly Integration

### Auto-submit with Debounce
<form up-submit up-target=".results">
    <SearchBar
        name="q"
        up-autosubmit
        up-delay="300"
        placeholder="Search products..."
    />
</form>

### Instant Search
<SearchBar
    name="query"
    up-autosubmit
    up-target="#search-results"
    up-watch-delay="200"
/>

### Search with Suggestions Popup
<a up-layer="popup" up-href="/suggestions?q=">
    <SearchBar placeholder="Search with suggestions..." />
</a>

## SearchBarGroup

Combine search bar with filters:

import { SearchBar, SearchBarGroup, SearchBarFilter } from '@view/components/ui/SearchBar.tsx'

<SearchBarGroup>
    <SearchBar placeholder="Search products..." />
    <SearchBarFilter name="category">
        <option value="all">All Categories</option>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
    </SearchBarFilter>
</SearchBarGroup>

## Props Reference

### SearchBarProps
- variant: 'default' | 'ghost' | 'outline' | 'filled'
- size: 'sm' | 'md' | 'lg' | 'xl'
- placeholder: string
- name: string
- value: string
- showIcon: boolean (default: true)
- iconPosition: 'left' | 'right' (default: 'left')
- showClear: boolean (default: false)
- shortcut: string
- showShortcut: boolean (default: false)
- loading: boolean (default: false)
- disabled: boolean (default: false)
- fullWidth: boolean (default: false)
- class: string
- containerClass: string
- id: string
- autocomplete: string (default: 'off')

### SearchBarGroupProps
- children: SearchBar + SearchBarFilter components
- class: string

### SearchBarFilterProps
- name: string
- children: option elements
- class: string

## Styling with CSS Variables

The component uses these CSS variables:
--background, --foreground, --muted, --muted-foreground
--border, --input, --ring, --radius

## Controller Example

@Controller('/products')
export class ProductController {
    @Get('/')
    async search(c: Context) {
        const query = c.req.query('q') || ''
        const category = c.req.query('category') || 'all'

        const products = await this.productService.search(query, category)

        return c.render(
            <Layout>
                <form up-submit up-target=".products-grid">
                    <SearchBarGroup>
                        <SearchBar
                            name="q"
                            value={query}
                            up-autosubmit
                            up-delay="300"
                            placeholder="Search products..."
                        />
                        <SearchBarFilter name="category">
                            <option value="all">All</option>
                            <option value="electronics">Electronics</option>
                        </SearchBarFilter>
                    </SearchBarGroup>
                </form>
                <div class="products-grid">
                    {products.map(p => <ProductCard product={p} />)}
                </div>
            </Layout>
        )
    }
}
```

**Step 4.2: Update llms.txt**

Ajouter une section SearchBar dans `/packages/ui/llms.txt`.

**Step 4.3: Update README.md**

Ajouter documentation SearchBar dans `/packages/ui/README.md`.

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test rendering avec props par défaut
- [ ] Test tous les variants (default, ghost, outline, filled)
- [ ] Test toutes les tailles (sm, md, lg, xl)
- [ ] Test showIcon avec iconPosition left/right
- [ ] Test showClear button
- [ ] Test shortcut badge
- [ ] Test loading state
- [ ] Test disabled state
- [ ] Test fullWidth
- [ ] Test SearchBarGroup avec SearchBarFilter
- [ ] Test attributs Unpoly passthrough

### Manual Testing

- [ ] Vérifier le rendu visuel de chaque variant
- [ ] Tester l'interaction clear button
- [ ] Tester avec Unpoly up-autosubmit
- [ ] Vérifier l'accessibilité (navigation clavier, ARIA)
- [ ] Tester les transitions et animations

## 🔍 Quality Checks

```bash
# Check specific files
deno check packages/ui/components/SearchBar.tsx

# Lint
deno lint packages/ui/components/SearchBar.tsx packages/ui/tests/searchbar.test.tsx

# Run tests
deno test -A packages/ui/tests/searchbar.test.tsx
```

## ✅ Definition of Done

- [ ] `SearchBar.tsx` créé avec tous les variants et tailles
- [ ] `SearchBarGroup` et `SearchBarFilter` implémentés
- [ ] `LoaderIcon` ajouté à `icons.tsx`
- [ ] Registry mis à jour dans `mod.ts`
- [ ] Exports ajoutés dans `components.ts`
- [ ] Tests unitaires passent (10+ tests)
- [ ] JSDoc complet sur toutes les interfaces et composants
- [ ] Documentation LLM créée (`llms/searchbar.txt`)
- [ ] `llms.txt` mis à jour
- [ ] `README.md` mis à jour
- [ ] `deno check` passe sans erreurs
- [ ] `deno lint` passe sans warnings
- [ ] Test manuel des variants visuels
- [ ] Test intégration Unpoly

## 🔗 Related

- Issue: #57
- Composants liés: `Input`, `Button`, `icons`
- Pattern similaire: shadcn/ui Command component

## 📅 Timeline

- **Estimated Duration**: 2-3 heures
- **Priority**: Medium
