# Technical Task: UI Components Documentation Colocation

## 📋 Task Overview

Déplacer la documentation des composants UI du dossier `app/view/pages/ui/` vers
les composants eux-mêmes dans `packages/ui/components/`. Chaque composant aura
un dossier avec son code et sa documentation. Le contrôleur chargera
dynamiquement la documentation depuis les packages.

> **Convention de nommage**: Chaque composant a un dossier avec `index.tsx`
> (composant) et `DOCS.md` (documentation). Les URLs restent `/ui/{component}`
> pour maintenir la compatibilité.

### Problème actuel

- La documentation est séparée du code du composant
- Quand on modifie un composant, on oublie souvent de mettre à jour sa doc
- Les pages dans `app/view/pages/ui/` dupliquent beaucoup de code
- Pas de lien évident entre un composant et sa documentation

### Solution proposée

- Chaque composant a un dossier avec `index.tsx` et `DOCS.md`
- Le contrôleur charge dynamiquement la documentation Markdown
- Le layout et le rendu sont gérés par un composant générique
- Convention over Configuration

## 🎯 Objectives

1. **Colocation**: Déplacer chaque doc dans le dossier de son composant
2. **Discovery automatique**: Le contrôleur découvre automatiquement les docs
3. **Simplification**: Réduire le code du contrôleur et supprimer les pages TSX
4. **DRY**: Un seul composant de rendu pour toutes les pages de doc
5. **Backward Compatibility**: Maintenir les mêmes URLs `/ui/*`

## 📁 Structure Proposée

### Avant (structure actuelle)

```
packages/ui/components/
├── Button.tsx
├── Card.tsx
├── Input.tsx
└── ...

app/view/pages/ui/
├── buttons.tsx      # Page de doc pour Button
├── cards.tsx        # Page de doc pour Card
├── forms.tsx        # Page de doc pour Input, Label, etc.
└── ...
```

### Après (structure colocalisée)

```
packages/ui/components/
├── Button/
│   ├── index.tsx    # Le composant Button
│   └── DOCS.md      # Documentation du composant
├── Card/
│   ├── index.tsx
│   └── DOCS.md
├── Input/
│   ├── index.tsx
│   └── DOCS.md
└── ...

app/view/pages/ui/
└── [slug].tsx       # Page générique qui charge DOCS.md
```

## 📋 Mapping des composants

| Page actuelle         | Composant(s)                     | Nouveau dossier             |
| --------------------- | -------------------------------- | --------------------------- |
| `buttons.tsx`         | Button                           | `Button/`                   |
| `cards.tsx`           | Card, FeatureCard                | `Card/`, `FeatureCard/`     |
| `forms.tsx`           | Input, Textarea, Label, Checkbox | `Input/`, `Textarea/`, etc. |
| `badges.tsx`          | Badge                            | `Badge/`                    |
| `alerts.tsx`          | Alert                            | `Alert/`                    |
| `accordion.tsx`       | Accordion                        | `Accordion/`                |
| `modal.tsx`           | Modal                            | `Modal/`                    |
| `table.tsx`           | Table                            | `Table/`                    |
| `tabs.tsx`            | Tabs                             | `Tabs/`                     |
| `progress.tsx`        | Progress, CircularProgress, etc. | `Progress/`, etc.           |
| `navigation.tsx`      | Breadcrumb, Link                 | `Breadcrumb/`, `Link/`      |
| `spinner.tsx`         | Spinner                          | `Spinner/`                  |
| `skeletons.tsx`       | Skeleton                         | `Skeleton/`                 |
| `separators.tsx`      | Separator                        | `Separator/`                |
| `gallery.tsx`         | Gallery                          | `Gallery/`                  |
| `hero.tsx`            | Hero                             | `Hero/`                     |
| `navbar-demo.tsx`     | Navbar                           | `Navbar/`                   |
| `newsletter.tsx`      | Newsletter                       | `Newsletter/`               |
| `pagination-demo.tsx` | Pagination                       | `Pagination/`               |
| `pricing.tsx`         | Pricing                          | `Pricing/`                  |
| `search-bar.tsx`      | SearchBar                        | `SearchBar/`                |
| `sidebar.tsx`         | Sidebar                          | `Sidebar/`                  |
| `theme-switch.tsx`    | ThemeSwitch                      | `ThemeSwitch/`              |
| `treeview.tsx`        | TreeView                         | `TreeView/`                 |
| `upload-zone.tsx`     | UploadZone                       | `UploadZone/`               |
| `keyboards.tsx`       | Kbd                              | `Kbd/`                      |
| `chart.tsx`           | Chart                            | `Chart/`                    |

## 🏗️ Architecture

### DocLoader Service

```typescript
// packages/ui/doc_loader.ts

interface ComponentDoc {
    name: string
    slug: string
    title: string
    description: string
    content: string // Markdown content
}

@Service()
export class UiDocLoader {
    private cache = new Map<string, ComponentDoc>()

    /**
     * Mapping des slugs d'URL vers les dossiers de composants
     */
    private readonly slugToComponent: Record<string, string> = {
        'buttons': 'Button',
        'cards': 'Card',
        'feature-cards': 'FeatureCard',
        'inputs': 'Input',
        'textareas': 'Textarea',
        'labels': 'Label',
        'checkboxes': 'Checkbox',
        'switches': 'Switch',
        'badges': 'Badge',
        'alerts': 'Alert',
        'accordion': 'Accordion',
        'modal': 'Modal',
        'table': 'Table',
        'tabs': 'Tabs',
        'progress': 'Progress',
        'circular-progress': 'CircularProgress',
        'stepped-progress': 'SteppedProgress',
        'gauge-progress': 'GaugeProgress',
        'breadcrumb': 'Breadcrumb',
        'links': 'Link',
        'spinner': 'Spinner',
        'skeleton': 'Skeleton',
        'separator': 'Separator',
        'gallery': 'Gallery',
        'hero': 'Hero',
        'navbar': 'Navbar',
        'newsletter': 'Newsletter',
        'pagination': 'Pagination',
        'pricing': 'Pricing',
        'search-bar': 'SearchBar',
        'sidebar': 'Sidebar',
        'theme-switch': 'ThemeSwitch',
        'treeview': 'TreeView',
        'upload-zone': 'UploadZone',
        'keyboards': 'Kbd',
        'chart': 'Chart',
        'code-block': 'CodeBlock',
        'copy-button': 'CopyButton',
    }

    async load(slug: string): Promise<ComponentDoc> {
        if (this.cache.has(slug)) {
            return this.cache.get(slug)!
        }

        const componentName = this.slugToComponent[slug]
        if (!componentName) {
            throw new Error(`Unknown component: ${slug}`)
        }

        const docPath = `packages/ui/components/${componentName}/DOCS.md`
        const content = await Deno.readTextFile(docPath)

        // Parse front matter or first heading for metadata
        const doc = this.parseDoc(slug, componentName, content)
        this.cache.set(slug, doc)
        return doc
    }

    private parseDoc(
        slug: string,
        name: string,
        content: string,
    ): ComponentDoc {
        // Extract title from first H1
        const titleMatch = content.match(/^#\s+(.+)$/m)
        const title = titleMatch?.[1] ?? name

        // Extract description from first paragraph
        const descMatch = content.match(/^#.+\n\n(.+?)(?:\n\n|$)/s)
        const description = descMatch?.[1]?.trim() ?? ''

        return {
            name,
            slug,
            title,
            description,
            content,
        }
    }

    getAvailableSlugs(): string[] {
        return Object.keys(this.slugToComponent)
    }

    clearCache(): void {
        this.cache.clear()
    }
}
```

### Refactored Controller

```typescript
// app/controller/ui_controller.tsx

import { Context, Controller, Get, Inject } from '@lockness/core'
import { UiDocLoader } from '@lockness/ui/doc_loader.ts'
import { UiLayout } from '@view/layouts/ui_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { parseMarkdown } from '@view/helpers/markdown.ts'

@Controller('/ui')
export class UiController {
    @Inject(UiDocLoader)
    accessor docLoader!: UiDocLoader

    @Get('/', { name: 'ui.index' })
    index(c: Context) {
        const slugs = this.docLoader.getAvailableSlugs()
        return c.html(
            <UiLayout title='UI Components'>
                <ComponentsList slugs={slugs} />
            </UiLayout>,
        )
    }

    @Get('/getting-started', { name: 'ui.getting-started' })
    gettingStarted(c: Context) {
        // Page spéciale, pas un composant
        return c.html(<GettingStartedPage />)
    }

    @Get('/:slug', { name: 'ui.component' })
    async component(c: Context) {
        const slug = c.req.param('slug')

        try {
            const doc = await this.docLoader.load(slug)
            const blocks = parseMarkdown(doc.content)

            return c.html(
                <UiLayout title={doc.title}>
                    <MarkdownRenderer blocks={blocks} />
                </UiLayout>,
            )
        } catch {
            return c.notFound()
        }
    }
}
```

### Example DOCS.md Structure

````markdown
# Button

A versatile button component with multiple variants, sizes, and states.

## Installation

The Button component is part of `@lockness/ui`:

```bash
deno add jsr:@lockness/ui
```
````

## Usage

```tsx
import { Button } from '@lockness/ui/components'

<Button variant="default">Click me</Button>
```

## Variants

| Variant       | Description                      |
| ------------- | -------------------------------- |
| `default`     | Primary action button            |
| `secondary`   | Secondary action                 |
| `outline`     | Bordered, transparent background |
| `ghost`       | No background, subtle hover      |
| `destructive` | Dangerous actions (delete, etc.) |
| `link`        | Looks like a link                |

## Sizes

| Size   | Description        |
| ------ | ------------------ |
| `sm`   | Small button       |
| `md`   | Medium (default)   |
| `lg`   | Large button       |
| `icon` | Square icon button |

## Props

| Prop       | Type                                       | Default     | Description          |
| ---------- | ------------------------------------------ | ----------- | -------------------- |
| `variant`  | `'default' \| 'secondary' \| 'outline'...` | `'default'` | Visual style         |
| `size`     | `'sm' \| 'md' \| 'lg' \| 'icon'`           | `'md'`      | Button size          |
| `disabled` | `boolean`                                  | `false`     | Disable interactions |
| `href`     | `string`                                   | -           | Render as link       |
| `loading`  | `boolean`                                  | `false`     | Show loading spinner |

## Examples

### Basic Button

```tsx
<Button>Default Button</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
```

### Button with Icon

```tsx
<Button size='icon'>
    <PlusIcon />
</Button>
```

### Loading State

```tsx
<Button loading>Saving...</Button>
```

## Accessibility

- Uses native `<button>` element
- Supports keyboard navigation
- Proper focus indicators
- Disabled state announced to screen readers

````
## 📋 Implementation Steps

### Phase 1: Create Folder Structure

Script de création des dossiers :

```bash
#!/bin/bash
# scripts/create_component_folders.sh

cd packages/ui/components

# Liste des composants
components=(
    "Accordion"
    "Alert"
    "Badge"
    "Breadcrumb"
    "Button"
    "Card"
    "Chart"
    "ChartExtras"
    "Checkbox"
    "CircularProgress"
    "CodeBlock"
    "CopyButton"
    "FeatureCard"
    "Footer"
    "Gallery"
    "GaugeProgress"
    "Hero"
    "Input"
    "Kbd"
    "Label"
    "Link"
    "Modal"
    "Navbar"
    "Newsletter"
    "Pagination"
    "Pricing"
    "Progress"
    "RootLayout"
    "SearchBar"
    "Section"
    "Separator"
    "Sidebar"
    "Skeleton"
    "Spinner"
    "SteppedProgress"
    "Switch"
    "Table"
    "Tabs"
    "Textarea"
    "ThemeSwitch"
    "Title"
    "TreeView"
    "UploadZone"
)

for component in "${components[@]}"; do
    # Créer le dossier
    mkdir -p "$component"

    # Déplacer le fichier existant
    if [ -f "${component}.tsx" ]; then
        mv "${component}.tsx" "${component}/index.tsx"
    fi

    # Créer un DOCS.md vide si n'existe pas
    if [ ! -f "${component}/DOCS.md" ]; then
        echo "# ${component}" > "${component}/DOCS.md"
        echo "" >> "${component}/DOCS.md"
        echo "Documentation for the ${component} component." >> "${component}/DOCS.md"
    fi
done
````

### Phase 2: Update Exports

Mettre à jour `packages/ui/components.ts` pour pointer vers les nouveaux chemins
:

```typescript
// Avant
export { Button } from './components/Button.tsx'

// Après
export { Button } from './components/Button/index.tsx'
```

### Phase 3: Migrate Documentation

Extraire le contenu des pages TSX vers les fichiers DOCS.md :

1. Copier le contenu textuel et les exemples
2. Convertir en Markdown
3. Ajouter les tableaux de props
4. Supprimer les anciennes pages TSX

### Phase 4: Create DocLoader Service

Créer le service `UiDocLoader` dans `packages/ui/doc_loader.ts`

### Phase 5: Refactor Controller

Simplifier `ui_controller.tsx` pour utiliser le chargement dynamique

### Phase 6: Update Components.ts

Mettre à jour les exports pour la nouvelle structure de dossiers

## ✅ Acceptance Criteria

1. [ ] Chaque composant a un dossier avec `index.tsx` et `DOCS.md`
2. [ ] Les URLs `/ui/*` existantes fonctionnent toujours
3. [ ] Le contrôleur utilise le chargement dynamique
4. [ ] Les exports dans `components.ts` sont mis à jour
5. [ ] La sidebar de navigation fonctionne toujours
6. [ ] Les exemples interactifs fonctionnent (si applicable)
7. [ ] Tests unitaires pour `UiDocLoader`

## 🧪 Testing Requirements

### Test de validation de la structure

```typescript
// tests/ui_component_structure.test.ts

const COMPONENTS = [
    'Button',
    'Card',
    'Input',
    // ... tous les composants
]

Deno.test('UI Components - all should have DOCS.md', async (t) => {
    for (const component of COMPONENTS) {
        await t.step(`checking ${component}/DOCS.md`, async () => {
            const path = `packages/ui/components/${component}/DOCS.md`
            const exists = await Deno.stat(path).catch(() => null)
            assert(exists, `Component "${component}" is missing DOCS.md`)
        })
    }
})

Deno.test('UI Components - all should have index.tsx', async (t) => {
    for (const component of COMPONENTS) {
        await t.step(`checking ${component}/index.tsx`, async () => {
            const path = `packages/ui/components/${component}/index.tsx`
            const exists = await Deno.stat(path).catch(() => null)
            assert(exists, `Component "${component}" is missing index.tsx`)
        })
    }
})

Deno.test('UI Components - DOCS.md should have required sections', async (t) => {
    const requiredSections = ['# ', '## Usage', '## Props']

    for (const component of COMPONENTS) {
        await t.step(`checking ${component}/DOCS.md content`, async () => {
            const path = `packages/ui/components/${component}/DOCS.md`
            const content = await Deno.readTextFile(path)

            for (const section of requiredSections) {
                assert(
                    content.includes(section),
                    `${component}/DOCS.md missing section: ${section}`,
                )
            }
        })
    }
})
```

## 📊 Benefits

| Aspect          | Avant                       | Après                           |
| --------------- | --------------------------- | ------------------------------- |
| Maintenabilité  | Doc séparée du code         | Doc colocalisée                 |
| Fichiers        | ~30 pages TSX               | ~30 fichiers DOCS.md            |
| Code contrôleur | ~200 lignes, 1 méthode/page | ~50 lignes, 1 méthode dynamique |
| Ajout de doc    | Créer page TSX + route      | Créer DOCS.md dans le dossier   |
| Oubli de MàJ    | Fréquent                    | Difficile (même dossier)        |
| Consistance     | Format variable             | Format Markdown uniforme        |

## 🔄 Migration Path

1. **Étape 1**: Créer la structure de dossiers (sans casser l'existant)
2. **Étape 2**: Déplacer les fichiers de composants vers `*/index.tsx`
3. **Étape 3**: Mettre à jour les exports dans `components.ts`
4. **Étape 4**: Créer les fichiers `DOCS.md` vides
5. **Étape 5**: Migrer le contenu des pages TSX vers `DOCS.md`
6. **Étape 6**: Créer `UiDocLoader` et refactoriser le contrôleur
7. **Étape 7**: Supprimer les anciennes pages TSX
8. **Étape 8**: Mettre à jour les tests

## ⚠️ Points d'attention

### Exemples interactifs

Certaines pages ont des exemples interactifs (state, formulaires). Options :

1. **Markdown pur**: Uniquement code statique, pas d'interactivité
2. **MDX-like**: Parser des blocs spéciaux `:::demo` en JSX
3. **Composants de démo**: Créer des composants de démo séparés dans chaque
   dossier

Recommandation : Commencer avec Markdown pur, ajouter l'interactivité plus tard.

### Pages spéciales

Certaines pages ne sont pas liées à un composant :

- `getting-started.tsx` → Reste une page TSX
- `index.tsx` → Reste une page TSX (liste des composants)

### Composants groupés

Certaines pages documentent plusieurs composants :

- `forms.tsx` → Input, Textarea, Label, Checkbox, Switch
- `progress.tsx` → Progress, CircularProgress, SteppedProgress, GaugeProgress
- `navigation.tsx` → Breadcrumb, Link

Options :

1. Un DOCS.md par composant (recommandé)
2. Un DOCS.md commun avec liens entre composants

## 📝 Future Enhancements

- **Live Preview**: Intégrer un preview interactif des exemples de code
- **Props auto-générés**: Parser les types TypeScript pour générer la table de
  props
- **Versioning**: Supporter plusieurs versions de documentation
- **Search**: Indexer le contenu Markdown pour la recherche
- **Hot reload**: Recharger les DOCS.md en mode dev sans redémarrer
