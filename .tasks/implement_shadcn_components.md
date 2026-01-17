# Technical Task: Implement shadcn-ui Components for @lockness/ui

## 📋 Task Overview

Analyser et implémenter progressivement tous les composants de la librairie
**shadcn-ui** pour le framework **Lockness UI**. L'objectif est de créer des
composants JSX compatibles avec Hono JSX, entièrement paramétrables via des
variables CSS (CSS Variables), et installables via un CLI Deno similaire à
`shadcn-ui`. Cette tâche massive transformera Lockness UI en une librairie de
composants complète et professionnelle.

### Différences clés avec shadcn-ui

**shadcn-ui (React)**:

- Utilise React et Radix UI (bibliothèques client-side interactives)
- Composants hautement interactifs côté client
- Hooks React pour la gestion d'état
- TypeScript avec types React

**Lockness UI (Hono JSX)**:

- Utilise Hono JSX (server-side rendering)
- Interactivité via Unpoly (progressive enhancement)
- Pas de hooks, rendu côté serveur
- TypeScript avec types Hono JSX
- Variables CSS pour la personnalisation complète
- Installation via CLI Deno (pas npm)

## 🎯 Objectifs

1. **Inventaire Complet**: Lister tous les 56+ composants UI de shadcn-ui
2. **Système de Variables CSS**: Implémenter un système de design tokens
   paramétrable
3. **CLI Robuste**: Étendre le CLI existant pour supporter tous les composants
4. **Server-Side Rendering**: Adapter les composants React en composants Hono
   JSX
5. **Progressive Enhancement**: Utiliser Unpoly pour l'interactivité sans
   JavaScript lourd
6. **Documentation Complète**: Documenter chaque composant avec exemples et cas
   d'usage

## 📁 Affected File Paths

### Structure Cible

```
packages/ui/
├── mod.ts                          # CLI entry point (existant)
├── components.ts                   # Library exports (existant)
├── deno.json                       # Package config
├── README.md                       # Documentation principale
├── components/                     # Composants sources
│   ├── Button.tsx                 # ✅ Existant
│   ├── Card.tsx                   # ✅ Existant
│   ├── RootLayout.tsx             # ✅ Existant
│   ├── Accordion.tsx              # 🆕 À créer
│   ├── Alert.tsx                  # 🆕 À créer
│   ├── AlertDialog.tsx            # 🆕 À créer
│   ├── AspectRatio.tsx            # 🆕 À créer
│   ├── Avatar.tsx                 # 🆕 À créer
│   ├── Badge.tsx                  # 🆕 À créer
│   ├── Breadcrumb.tsx             # 🆕 À créer
│   ├── ButtonGroup.tsx            # 🆕 À créer
│   ├── Calendar.tsx               # 🆕 À créer
│   ├── Carousel.tsx               # 🆕 À créer
│   ├── Chart.tsx                  # 🆕 À créer
│   ├── Checkbox.tsx               # 🆕 À créer
│   ├── Collapsible.tsx            # 🆕 À créer
│   ├── Command.tsx                # 🆕 À créer
│   ├── ContextMenu.tsx            # 🆕 À créer
│   ├── Dialog.tsx                 # 🆕 À créer
│   ├── Drawer.tsx                 # 🆕 À créer
│   ├── DropdownMenu.tsx           # 🆕 À créer
│   ├── Empty.tsx                  # 🆕 À créer
│   ├── Field.tsx                  # 🆕 À créer
│   ├── Form.tsx                   # 🆕 À créer
│   ├── HoverCard.tsx              # 🆕 À créer
│   ├── Input.tsx                  # 🆕 À créer
│   ├── InputGroup.tsx             # 🆕 À créer
│   ├── InputOTP.tsx               # 🆕 À créer
│   ├── Item.tsx                   # 🆕 À créer
│   ├── Kbd.tsx                    # 🆕 À créer
│   ├── Label.tsx                  # 🆕 À créer
│   ├── Menubar.tsx                # 🆕 À créer
│   ├── NavigationMenu.tsx         # 🆕 À créer
│   ├── NativeSelect.tsx           # 🆕 À créer
│   ├── Pagination.tsx             # 🆕 À créer
│   ├── Popover.tsx                # 🆕 À créer
│   ├── Progress.tsx               # 🆕 À créer
│   ├── RadioGroup.tsx             # 🆕 À créer
│   ├── Resizable.tsx              # 🆕 À créer
│   ├── ScrollArea.tsx             # 🆕 À créer
│   ├── Select.tsx                 # 🆕 À créer
│   ├── Separator.tsx              # 🆕 À créer
│   ├── Sheet.tsx                  # 🆕 À créer
│   ├── Sidebar.tsx                # 🆕 À créer (composant majeur)
│   ├── Skeleton.tsx               # 🆕 À créer
│   ├── Slider.tsx                 # 🆕 À créer
│   ├── Sonner.tsx                 # 🆕 À créer (toasts)
│   ├── Spinner.tsx                # 🆕 À créer
│   ├── Switch.tsx                 # 🆕 À créer
│   ├── Table.tsx                  # 🆕 À créer
│   ├── Tabs.tsx                   # 🆕 À créer
│   ├── Textarea.tsx               # 🆕 À créer
│   ├── Toggle.tsx                 # 🆕 À créer
│   ├── ToggleGroup.tsx            # 🆕 À créer
│   └── Tooltip.tsx                # 🆕 À créer
├── lib/
│   ├── utils.ts                   # ✅ cn() utility existant
│   └── design-tokens.ts           # 🆕 CSS Variables centralisées
├── styles/
│   ├── themes/
│   │   ├── stone.css              # 🆕 Thème Stone
│   │   ├── zinc.css               # 🆕 Thème Zinc
│   │   ├── neutral.css            # 🆕 Thème Neutral
│   │   ├── gray.css               # 🆕 Thème Gray
│   │   └── slate.css              # 🆕 Thème Slate
│   └── base.css                   # 🆕 Variables CSS de base
└── tests/                         # Tests pour tous les composants
    ├── accordion.test.tsx
    ├── alert.test.tsx
    └── ...
```

### Documentation Files

- `/packages/ui/README.md` - Guide principal avec liste complète des composants
- `/packages/ui/docs/` - Documentation détaillée par composant
- `/packages/ui/examples/` - Exemples d'utilisation pour chaque composant
- `/.tasks/components/` - Sous-tâches individuelles par composant

## 🏗️ Architecture Principles

### 1. Design Tokens via CSS Variables

Tous les composants doivent utiliser des variables CSS pour permettre une
personnalisation complète sans modification du code source :

```css
/* styles/base.css */
:root {
    /* Colors */
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --muted: oklch(0.97 0 0);
    --accent: oklch(0.97 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);

    /* Radius */
    --radius: 0.625rem;

    /* Typography */
    --font-sans: system-ui, -apple-system, sans-serif;
    --font-mono: 'Courier New', monospace;
}

[data-theme='dark'] {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    /* ... autres variables dark mode */
}
```

### 2. Composants Hono JSX Server-Side

Tous les composants sont rendus côté serveur avec Hono JSX :

```typescript
import type * as h from '@lockness/core/jsx'
import { cn } from '../lib/utils.ts'

interface ButtonProps extends h.JSX.HTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
}

export const Button = ({
    variant = 'default',
    size = 'md',
    class: className,
    children,
    ...props
}: ButtonProps) => {
    return (
        <button
            class={cn(
                'btn',
                `btn-${variant}`,
                `btn-${size}`,
                className,
            )}
            {...props}
        >
            {children}
        </button>
    )
}
```

### 3. Styles Tailwind avec Variables CSS

```typescript
// Exemple: Button.tsx
export const Button = ({ variant, size, class: className, ...props }) => {
    return (
        <button
            class={cn(
                // Base styles
                'inline-flex items-center justify-center',
                'rounded-[var(--radius)]',
                'font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-[var(--ring)]',
                'disabled:pointer-events-none disabled:opacity-50',
                // Variant styles
                variant === 'default' &&
                    'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90',
                variant === 'secondary' &&
                    'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-90',
                variant === 'outline' &&
                    'border border-[var(--border)] bg-transparent hover:bg-[var(--accent)]',
                // Size styles
                size === 'sm' && 'h-8 px-3 text-sm',
                size === 'md' && 'h-10 px-4',
                size === 'lg' && 'h-12 px-6 text-lg',
                className,
            )}
            {...props}
        />
    )
}
```

### 4. Progressive Enhancement avec Unpoly

Pour les composants interactifs, utiliser les attributs Unpoly :

```typescript
// Exemple: Dialog.tsx
export const Dialog = ({ trigger, content }) => {
    return (
        <>
            <button up-layer='new' up-mode='modal' up-target='#dialog-content'>
                {trigger}
            </button>
            <div id='dialog-content' style='display:none'>
                {content}
            </div>
        </>
    )
}
```

## 📝 Liste Complète des Composants à Implémenter

### ✅ Composants Existants (3/56)

1. **Button** - ✅ Implémenté avec variants et tailles
2. **Card** - ✅ Système Card complet (Header, Title, Content, Footer)
3. **RootLayout** - ✅ Layout HTML de base avec Unpoly

### 🔴 Composants de Navigation (7)

4. **Breadcrumb** - Navigation hierarchique
5. **NavigationMenu** - Menu de navigation principal
6. **Menubar** - Barre de menu style application
7. **Pagination** - Navigation de pagination
8. **Sidebar** - Barre latérale (composant majeur, 16 variantes dans shadcn)
9. **Tabs** - Navigation par onglets
10. **ContextMenu** - Menu contextuel (clic droit)

### 🟡 Composants de Formulaire (16)

11. **Input** - Champ de texte basique
12. **InputGroup** - Input avec addons (préfixes/suffixes)
13. **InputOTP** - Input pour codes OTP
14. **Textarea** - Zone de texte multiligne
15. **Label** - Étiquette de formulaire
16. **Checkbox** - Case à cocher
17. **RadioGroup** - Groupe de boutons radio
18. **Switch** - Interrupteur on/off
19. **Select** - Sélecteur dropdown
20. **NativeSelect** - Select HTML natif
21. **Combobox** - Select avec recherche
22. **Slider** - Curseur de valeur
23. **Field** - Wrapper de champ avec label/erreur
24. **Form** - Gestion de formulaire complète
25. **Calendar** - Sélecteur de date (32 variantes dans shadcn!)
26. **Command** - Palette de commandes (⌘K)

### 🟢 Composants de Feedback (10)

27. **Alert** - Message d'alerte
28. **AlertDialog** - Dialogue de confirmation
29. **Dialog** - Modal dialogue
30. **Drawer** - Panneau coulissant
31. **Sheet** - Side panel
32. **Popover** - Info-bulle contextuelle
33. **Tooltip** - Info-bulle simple
34. **HoverCard** - Carte au survol
35. **Sonner** - Toast notifications
36. **Progress** - Barre de progression

### 🟣 Composants d'Affichage (13)

37. **Badge** - Badge/étiquette
38. **Avatar** - Photo de profil
39. **Skeleton** - Placeholder de chargement
40. **Spinner** - Indicateur de chargement
41. **Empty** - État vide
42. **Table** - Tableau de données
43. **Accordion** - Contenu repliable
44. **Collapsible** - Section repliable
45. **Separator** - Ligne de séparation
46. **AspectRatio** - Container avec ratio
47. **ScrollArea** - Zone scrollable
48. **Resizable** - Panneaux redimensionnables
49. **Chart** - Graphiques (via Recharts)

### 🔵 Composants de Mise en Page (5)

50. **ButtonGroup** - Groupe de boutons
51. **ToggleGroup** - Groupe de toggles
52. **Toggle** - Bouton toggle
53. **Item** - Élément de liste
54. **Carousel** - Carrousel d'images
55. **Kbd** - Raccourci clavier
56. **DropdownMenu** - Menu déroulant

## 📊 Matrice de Priorités

### Phase 1: Fondations (Priorité Haute) - 2 semaines

**Objectif**: Mettre en place le système de design tokens et les composants de
base

1. **Design Tokens System** (2 jours)
   - Créer `lib/design-tokens.ts`
   - Implémenter 5 thèmes (stone, zinc, neutral, gray, slate)
   - Créer `styles/base.css` avec toutes les variables CSS
2. **Composants Typographiques** (1 jour)
   - Label
   - Badge
   - Kbd
3. **Composants de Formulaire Basiques** (3 jours)
   - Input
   - Textarea
   - Checkbox
   - RadioGroup
   - Switch
4. **Composants de Feedback** (3 jours)
   - Alert
   - Spinner
   - Skeleton
   - Separator
5. **Documentation & Tests** (3 jours)
   - Mise à jour README.md
   - Tests unitaires pour tous les composants Phase 1
   - Exemples dans showcase `/ui`

### Phase 2: Composants Intermédiaires (Priorité Moyenne) - 3 semaines

6. **Composants de Formulaire Avancés** (5 jours)
   - Select
   - Field
   - InputGroup
   - NativeSelect
   - Slider
7. **Navigation** (4 jours)
   - Breadcrumb
   - Tabs
   - Pagination
   - NavigationMenu
8. **Composants de Layout** (4 jours)
   - Accordion
   - Collapsible
   - AspectRatio
   - ScrollArea
9. **Feedback Avancé** (4 jours)
   - Dialog
   - Sheet
   - Popover
   - Tooltip

### Phase 3: Composants Avancés (Priorité Basse) - 4 semaines

10. **Composants Complexes** (7 jours)
    - Calendar (32 variantes!)
    - Command Palette
    - Table
    - Resizable
11. **Composants Interactifs** (5 jours)
    - DropdownMenu
    - ContextMenu
    - HoverCard
    - Menubar
12. **Composants Spécialisés** (6 jours)
    - Sidebar (16 variantes!)
    - Carousel
    - Chart
    - Sonner (toasts)
13. **Composants Avancés** (6 jours)
    - AlertDialog
    - Drawer
    - ButtonGroup
    - ToggleGroup
    - Toggle
    - InputOTP
    - Empty
    - Avatar
    - Item
    - Combobox
    - Form

### Phase 4: Polish & Documentation (Priorité Finale) - 2 semaines

14. **Documentation Complète** (7 jours)
    - Guide par composant avec tous les exemples
    - Storybook-like showcase
    - Migration guide depuis shadcn-ui
15. **Tests & Qualité** (5 jours)
    - Tests unitaires pour tous les composants
    - Tests d'intégration
    - Accessibilité (a11y)
16. **CLI Enhancement** (2 jours)
    - Commande `list` améliorée avec catégories
    - Commande `search` pour trouver des composants
    - Templates et snippets

## 🎨 Proposed API Design

### CLI Usage

```bash
# Lister tous les composants disponibles
deno run -A jsr:@lockness/ui list

# Lister par catégorie
deno run -A jsr:@lockness/ui list --category forms
deno run -A jsr:@lockness/ui list --category navigation

# Ajouter un composant
deno run -A jsr:@lockness/ui add button
deno run -A jsr:@lockness/ui add input checkbox

# Ajouter tous les composants d'une catégorie
deno run -A jsr:@lockness/ui add --category forms

# Rechercher un composant
deno run -A jsr:@lockness/ui search "date picker"
# → calendar, input-group

# Informations sur un composant
deno run -A jsr:@lockness/ui info sidebar
# → Dependencies, variants, CSS variables, examples

# Initialiser un thème
deno run -A jsr:@lockness/ui init --theme zinc
```

### Library Usage

```typescript
// Import direct (mode library pour tests rapides)
import { Button, Card, Input, Label } from '@lockness/ui/components'

export const LoginForm = () => {
    return (
        <Card>
            <Card.Header>
                <Card.Title>Login</Card.Title>
            </Card.Header>
            <Card.Content>
                <div class='space-y-4'>
                    <div>
                        <Label for='email'>Email</Label>
                        <Input
                            id='email'
                            type='email'
                            placeholder='you@example.com'
                        />
                    </div>
                    <div>
                        <Label for='password'>Password</Label>
                        <Input id='password' type='password' />
                    </div>
                </div>
            </Card.Content>
            <Card.Footer>
                <Button type='submit' class='w-full'>
                    Sign In
                </Button>
            </Card.Footer>
        </Card>
    )
}
```

### Theme Customization

```typescript
// app/view/assets/app.css
@import '@lockness/ui/styles/base.css';
@import '@lockness/ui/styles/themes/zinc.css';

/* Override variables */
:root {
    --radius: 1rem; /* Plus arrondi */
    --primary: oklch(0.5 0.3 240); /* Bleu personnalisé */
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Setup du Système de Design Tokens

**Step 1.1: Créer le fichier de design tokens**

File: `/packages/ui/lib/design-tokens.ts`

```typescript
/**
 * Design tokens centralisés pour Lockness UI
 * Basé sur le système shadcn-ui avec support des thèmes
 */

export const themes = {
    stone: {
        light: {
            background: 'oklch(1 0 0)',
            foreground: 'oklch(0.147 0.004 49.25)',
            primary: 'oklch(0.216 0.006 56.043)',
            // ... autres tokens
        },
        dark: {
            background: 'oklch(0.147 0.004 49.25)',
            foreground: 'oklch(0.985 0.001 106.423)',
            // ...
        },
    },
    zinc: {
        // ...
    },
    neutral: {
        // ...
    },
    gray: {
        // ...
    },
    slate: {
        // ...
    },
}

export type ThemeName = keyof typeof themes
export type ColorMode = 'light' | 'dark'
```

**Step 1.2: Générer les fichiers CSS de thèmes**

File: `/packages/ui/styles/base.css`

```css
/**
 * Variables CSS de base pour Lockness UI
 * Inspiré de shadcn-ui avec support natif OKLCH
 */

:root {
    /* Base colors */
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);

    /* Component colors */
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0 0);

    /* Interactive colors */
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --destructive-foreground: oklch(0.985 0 0);

    /* Borders */
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);

    /* Radius */
    --radius: 0.625rem;

    /* Charts */
    --chart-1: oklch(0.646 0.222 41.116);
    --chart-2: oklch(0.6 0.118 184.704);
    --chart-3: oklch(0.398 0.07 227.392);
    --chart-4: oklch(0.828 0.189 84.429);
    --chart-5: oklch(0.769 0.188 70.08);
}

[data-theme='dark'] {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    /* ... dark mode values */
}
```

### Phase 2: Implémentation Composant par Composant

Chaque composant suivra ce template :

**Step 2.X: Component Name**

File: `/packages/ui/components/ComponentName.tsx`

```typescript
import type * as h from '@lockness/core/jsx'
import { cn } from '../lib/utils.ts'

export interface ComponentNameProps
    extends h.JSX.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'secondary'
    size?: 'sm' | 'md' | 'lg'
}

export const ComponentName = ({
    variant = 'default',
    size = 'md',
    class: className,
    children,
    ...props
}: ComponentNameProps) => {
    return (
        <div
            class={cn(
                'component-base-classes',
                variant === 'default' && 'variant-specific-classes',
                size === 'sm' && 'size-specific-classes',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}
```

File: `/packages/ui/tests/component-name.test.tsx`

```typescript
import { assertEquals } from '@std/assert'
import { ComponentName } from '../components/ComponentName.tsx'

Deno.test('ComponentName - renders correctly', () => {
    const html = <ComponentName>Test</ComponentName>
    assertExists(html)
})

Deno.test('ComponentName - applies variant classes', () => {
    const html = <ComponentName variant='secondary'>Test</ComponentName>
    // Test variant classes
})
```

### Phase 3: Extension du Registry CLI

**Step 3.1: Étendre le registry avec catégories**

File: `/packages/ui/mod.ts`

```typescript
interface RegistryItem {
    name: string
    description: string
    category:
        | 'navigation'
        | 'forms'
        | 'feedback'
        | 'display'
        | 'layout'
    files: Array<{ path: string; target: string }>
    internalDependencies?: string[]
    dependencies?: Record<string, string>
    cssVars?: string[] // Variables CSS utilisées
    variants?: string[] // Variantes disponibles
}

const REGISTRY: Record<string, RegistryItem> = {
    // ... composants existants
    accordion: {
        name: 'accordion',
        description: 'Vertically stacked set of collapsible sections',
        category: 'display',
        files: [
            {
                path: 'components/Accordion.tsx',
                target: 'components/ui/Accordion.tsx',
            },
        ],
        cssVars: ['--background', '--foreground', '--border'],
        variants: ['default', 'ghost'],
        internalDependencies: ['utils'],
    },
    // ... 55 autres composants
}
```

**Step 3.2: Ajouter commande de catégorisation**

```typescript
// Dans mod.ts, étendre la commande list
if (command === 'list') {
    const category = args.category as string | undefined

    if (category) {
        console.log(`\n📦 ${category} components:\n`)
        Object.entries(REGISTRY)
            .filter(([_, item]) => item.category === category)
            .forEach(([name, item]) => {
                console.log(`  ${name.padEnd(20)} - ${item.description}`)
            })
    } else {
        // Grouper par catégorie
        const categories = [
            'navigation',
            'forms',
            'feedback',
            'display',
            'layout',
        ]
        categories.forEach((cat) => {
            console.log(`\n📦 ${cat}:`)
            Object.entries(REGISTRY)
                .filter(([_, item]) => item.category === cat)
                .forEach(([name]) => {
                    console.log(`  - ${name}`)
                })
        })
    }
}
```

## 🧪 Testing Strategy

### Tests Unitaires (Pour chaque composant)

```typescript
Deno.test('ComponentName - renders with default props', () => {
    const component = <ComponentName>Content</ComponentName>
    assertExists(component)
})

Deno.test('ComponentName - applies custom className', () => {
    const component = <ComponentName class='custom'>Content</ComponentName>
    // Verify custom class is applied
})

Deno.test('ComponentName - forwards HTML attributes', () => {
    const component = (
        <ComponentName id='test' data-testid='component'>
            Content
        </ComponentName>
    )
    // Verify attributes are forwarded
})

Deno.test('ComponentName - renders all variants correctly', () => {
    const variants = ['default', 'secondary', 'outline']
    variants.forEach((variant) => {
        const component = (
            <ComponentName variant={variant}>Content</ComponentName>
        )
        assertExists(component)
    })
})
```

### Tests d'Intégration

```typescript
// Test showcase page
Deno.test('UI Showcase - displays all components', async () => {
    const response = await fetch('http://localhost:8000/ui')
    assertEquals(response.status, 200)
    const html = await response.text()
    // Verify all components are rendered
})
```

### Tests de Variables CSS

```typescript
Deno.test('Theme - all CSS variables are defined', () => {
    const requiredVars = [
        '--background',
        '--foreground',
        '--primary',
        '--secondary',
        '--muted',
        '--accent',
        '--destructive',
        '--border',
        '--input',
        '--ring',
        '--radius',
    ]
    // Verify variables exist in base.css
})
```

## 🔄 Migration Strategy

### Pour les utilisateurs existants de Lockness UI

```typescript
// Ancien (si composants customs existaient)
import { MyButton } from '@/components/ui/Button.tsx'

// Nouveau (après installation via CLI)
import { Button } from '@view/components/ui/Button.tsx'

// Ou mode library pour tests rapides
import { Button } from '@lockness/ui/components'
```

### Compatibilité avec shadcn-ui

Pour faciliter la migration depuis des projets React + shadcn-ui :

```typescript
// shadcn-ui (React)
import { Button } from '@/components/ui/button'
<Button variant='destructive' size='lg'>
    Delete
</Button>

// Lockness UI (Hono JSX) - API quasi-identique
import { Button } from '@view/components/ui/Button.tsx'
<Button variant='danger' size='lg'>
    Delete
</Button>
```

## ✅ Definition of Done

**Pour chaque composant** :

- [ ] Code TypeScript avec types Hono JSX appropriés
- [ ] Utilisation exclusive de CSS Variables pour la personnalisation
- [ ] Classes Tailwind avec support des variants
- [ ] Support de tous les attributs HTML standards via spread
- [ ] Tests unitaires passants (3+ tests minimum)
- [ ] Documentation inline (JSDoc)
- [ ] Exemple d'utilisation dans `/ui` showcase
- [ ] Entrée dans le Registry du CLI
- [ ] Export dans `components.ts`

**Pour le projet global** :

- [ ] 56+ composants implémentés
- [ ] CLI fonctionnel avec commandes list/add/info/search
- [ ] 5 thèmes CSS (stone, zinc, neutral, gray, slate)
- [ ] Système de variables CSS complet
- [ ] README.md avec documentation complète
- [ ] Tests passants pour tous les composants (>90% coverage)
- [ ] Page showcase `/ui` avec tous les composants
- [ ] Performance: Temps de compilation < 5s
- [ ] Taille bundle optimisée (tree-shaking)

## 📚 Resources

### Références shadcn-ui

- Registry JSON: `.shadcn-ui/apps/v4/registry.json`
- Composants sources: `.shadcn-ui/apps/v4/registry/new-york-v4/ui/`
- CLI shadcn: `.shadcn-ui/packages/shadcn/src/`

### Documentation Lockness

- Architecture framework: `GEMINI.md`
- Package UI actuel: `packages/ui/`
- Tasks connexes: `.tasks/create_ui_cli.md`, `.tasks/create_ui_package.md`

## 🎯 Success Metrics

1. **Couverture**: 56+ composants disponibles (100% de shadcn-ui core)
2. **Performance**: < 5s pour compiler un projet utilisant tous les composants
3. **DX**: Installation d'un composant en < 2s via CLI
4. **Flexibilité**: 100% personnalisable via CSS Variables
5. **Documentation**: Chaque composant documenté avec 3+ exemples
6. **Qualité**: > 90% de test coverage
7. **Adoption**: Utilisé dans 100% des nouveaux projets Lockness

## 🚀 Next Steps

1. **Créer les sous-tâches** : Générer une tâche individuelle pour chaque
   composant prioritaire
2. **Setup Phase 1** : Implémenter le système de design tokens (2 jours)
3. **Composants de base** : Input, Label, Badge, Separator (3 jours)
4. **Mise à jour showcase** : Afficher les nouveaux composants dans `/ui`
5. **Itération continue** : Implémenter 2-3 composants par jour

---

**Note** : Cette tâche massive est conçue pour être exécutée de manière
incrémentale sur plusieurs semaines. Chaque composant peut être implémenté
indépendamment, testé et documenté avant de passer au suivant. La priorité est
donnée aux composants les plus utilisés (forms, navigation, feedback) avant les
composants complexes (calendar avec 32 variantes, sidebar avec 16 variantes).
