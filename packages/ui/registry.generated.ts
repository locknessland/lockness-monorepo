/**
 * @fileoverview Component registry for the `@lockness/ui` CLI.
 *
 * This module holds the catalogue of installable UI components — the data the
 * `add` and `list` commands read to resolve source files, internal
 * dependencies, and npm dependencies. It is deliberately data-only so the CLI
 * shell in `mod.ts` stays thin.
 *
 * The registry is hand-maintained: each entry maps a component slug to the
 * source files that must be copied into a consumer project and the
 * dependencies those files require. It is named `registry.generated.ts` to
 * signal that it is a generated-style data table rather than logic, but the
 * data is authored by hand — the examples generator (`registry_generator.ts`)
 * derives a different registry (doc examples) and does not produce this one.
 *
 * @module @lockness/ui/registry
 */

/**
 * A single source file to copy for a component, mapping the file's location
 * inside the package to its destination path in the consumer project.
 */
export interface ComponentFile {
    /** Path to the source file relative to the package root. */
    path: string
    /** Destination path relative to the target directory in the consumer project. */
    target: string
}

/**
 * A registry entry describing one installable component.
 */
export interface ComponentEntry {
    /** The component slug used on the command line. */
    name: string
    /** Human-readable description shown by the `list` command. */
    description: string
    /** Source files copied when the component is installed. */
    files: ComponentFile[]
    /** npm dependencies (name → version specifier) added to the consumer's deno config. */
    dependencies?: Record<string, string>
    /** Other component slugs that must be installed alongside this one. */
    internalDependencies?: string[]
}

/**
 * The component registry, keyed by component slug.
 */
export interface Registry {
    [key: string]: ComponentEntry
}

/**
 * The catalogue of installable UI components.
 *
 * @example
 * ```ts
 * import { REGISTRY } from './registry.generated.ts'
 *
 * const button = REGISTRY['button']
 * console.log(button.internalDependencies) // ['utils']
 * ```
 */
export const REGISTRY: Registry = {
    utils: {
        name: 'utils',
        description: 'Class name utility (cn) for merging Tailwind classes',
        files: [{ path: 'lib/utils.ts', target: 'lib/utils.ts' }],
        dependencies: {
            clsx: 'npm:clsx@2.1.1',
            'tailwind-merge': 'npm:tailwind-merge@2.6.0',
        },
    },
    icons: {
        name: 'icons',
        description:
            'SVG icon components (CheckCircleIcon, XCircleIcon, ArrowRightIcon, etc.)',
        files: [{ path: 'icons.tsx', target: 'lib/icons.tsx' }],
    },
    button: {
        name: 'button',
        description: 'Flexible button component with variants and sizes',
        files: [
            {
                path: 'components/Button/mod.tsx',
                target: 'components/ui/Button.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    card: {
        name: 'card',
        description:
            'Card component system (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)',
        files: [
            {
                path: 'components/Card/mod.tsx',
                target: 'components/ui/Card.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'root-layout': {
        name: 'root-layout',
        description: 'Base HTML layout with Unpoly CDN integration',
        files: [
            {
                path: 'components/RootLayout/mod.tsx',
                target: 'components/ui/RootLayout.tsx',
            },
        ],
    },
    label: {
        name: 'label',
        description: 'Form label component with consistent styling',
        files: [
            {
                path: 'components/Label/mod.tsx',
                target: 'components/ui/Label.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    input: {
        name: 'input',
        description: 'Text input component with variants',
        files: [
            {
                path: 'components/Input/mod.tsx',
                target: 'components/ui/Input.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    textarea: {
        name: 'textarea',
        description: 'Multi-line text input component',
        files: [
            {
                path: 'components/Textarea/mod.tsx',
                target: 'components/ui/Textarea.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    badge: {
        name: 'badge',
        description: 'Badge/label component for tags and status',
        files: [
            {
                path: 'components/Badge/mod.tsx',
                target: 'components/ui/Badge.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    separator: {
        name: 'separator',
        description: 'Visual divider line component',
        files: [
            {
                path: 'components/Separator/mod.tsx',
                target: 'components/ui/Separator.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    skeleton: {
        name: 'skeleton',
        description: 'Loading placeholder with animated pulse',
        files: [
            {
                path: 'components/Skeleton/mod.tsx',
                target: 'components/ui/Skeleton.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    alert: {
        name: 'alert',
        description:
            'Alert message component (Alert, AlertTitle, AlertDescription)',
        files: [
            {
                path: 'components/Alert/mod.tsx',
                target: 'components/ui/Alert.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    kbd: {
        name: 'kbd',
        description: 'Keyboard shortcut display component',
        files: [
            {
                path: 'components/Kbd/mod.tsx',
                target: 'components/ui/Kbd.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    checkbox: {
        name: 'checkbox',
        description: 'Checkbox input with custom styling',
        files: [
            {
                path: 'components/Checkbox/mod.tsx',
                target: 'components/ui/Checkbox.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    switch: {
        name: 'switch',
        description: 'Toggle switch component',
        files: [
            {
                path: 'components/Switch/mod.tsx',
                target: 'components/ui/Switch.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    breadcrumb: {
        name: 'breadcrumb',
        description:
            'Breadcrumb navigation (Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage)',
        files: [
            {
                path: 'components/Breadcrumb/mod.tsx',
                target: 'components/ui/Breadcrumb.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    tabs: {
        name: 'tabs',
        description:
            'Tabbed interface (Tabs, TabsList, TabsTrigger, TabsContent)',
        files: [
            {
                path: 'components/Tabs/mod.tsx',
                target: 'components/ui/Tabs.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    accordion: {
        name: 'accordion',
        description:
            'Collapsible sections (Accordion, AccordionItem, AccordionTrigger, AccordionContent)',
        files: [
            {
                path: 'components/Accordion/mod.tsx',
                target: 'components/ui/Accordion.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    title: {
        name: 'title',
        description:
            'Typography heading component with CSS variable sizing (h1-h6)',
        files: [
            {
                path: 'components/Title/mod.tsx',
                target: 'components/ui/Title.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    pricing: {
        name: 'pricing',
        description:
            'Pricing components (PricingCard, PricingCardHeader, PricingCardPrice, PricingCardFeatures, PricingToggle, PricingComparison)',
        files: [
            {
                path: 'components/Pricing/mod.tsx',
                target: 'components/ui/Pricing.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons', 'button', 'card', 'badge'],
    },
    'theme-switch': {
        name: 'theme-switch',
        description:
            'Dual-button theme switcher optimized for Preline UI dark mode system',
        files: [
            {
                path: 'components/ThemeSwitch/mod.tsx',
                target: 'components/ui/ThemeSwitch.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'search-bar': {
        name: 'search-bar',
        description:
            'Customizable search bar with variants, sizes, and Unpoly integration',
        files: [
            {
                path: 'components/SearchBar/mod.tsx',
                target: 'components/ui/SearchBar.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons'],
    },
    progress: {
        name: 'progress',
        description: 'Progress bar component',
        files: [
            {
                path: 'components/Progress/mod.tsx',
                target: 'components/ui/Progress.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'circular-progress': {
        name: 'circular-progress',
        description: 'Circular progress indicator',
        files: [
            {
                path: 'components/CircularProgress/mod.tsx',
                target: 'components/ui/CircularProgress.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'stepped-progress': {
        name: 'stepped-progress',
        description: 'Step-by-step progress tracker',
        files: [
            {
                path: 'components/SteppedProgress/mod.tsx',
                target: 'components/ui/SteppedProgress.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons'],
    },
    'gauge-progress': {
        name: 'gauge-progress',
        description: 'Gauge/meter style progress',
        files: [
            {
                path: 'components/GaugeProgress/mod.tsx',
                target: 'components/ui/GaugeProgress.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'code-block': {
        name: 'code-block',
        description: 'Syntax highlighting code block',
        files: [
            {
                path: 'components/CodeBlock/mod.tsx',
                target: 'components/ui/CodeBlock/mod.tsx',
            },
            {
                path: 'components/CodeBlock/styles.tsx',
                target: 'components/ui/CodeBlock/styles.tsx',
            },
            {
                path: 'components/CodeBlock/themes.ts',
                target: 'components/ui/CodeBlock/themes.ts',
            },
        ],
        dependencies: {
            'highlight.js': 'npm:highlight.js@^11.9.0',
        },
        internalDependencies: ['utils', 'icons'],
    },
    'copy-button': {
        name: 'copy-button',
        description: 'Copy to clipboard button',
        files: [
            {
                path: 'components/CopyButton/mod.tsx',
                target: 'components/ui/CopyButton.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    chart: {
        name: 'chart',
        description: 'Chart components using Chart.js',
        files: [
            {
                path: 'components/Chart/mod.tsx',
                target: 'components/ui/Chart.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'chart-extras': {
        name: 'chart-extras',
        description: 'Extra chart components (Pie, Bubble, etc.)',
        files: [
            {
                path: 'components/ChartExtras/mod.tsx',
                target: 'components/ui/ChartExtras.tsx',
            },
        ],
        internalDependencies: ['utils', 'chart'],
    },
    'feature-card': {
        name: 'feature-card',
        description: 'Card for displaying features',
        files: [
            {
                path: 'components/FeatureCard/mod.tsx',
                target: 'components/ui/FeatureCard.tsx',
            },
        ],
        internalDependencies: ['utils', 'card', 'icons'],
    },
    footer: {
        name: 'footer',
        description: 'Footer component sections',
        files: [
            {
                path: 'components/Footer/mod.tsx',
                target: 'components/ui/Footer.tsx',
            },
        ],
        internalDependencies: ['utils', 'section', 'link'],
    },
    gallery: {
        name: 'gallery',
        description: 'Image gallery with lightbox and layouts',
        files: [
            {
                path: 'components/Gallery/mod.tsx',
                target: 'components/ui/Gallery.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons'],
    },
    hero: {
        name: 'hero',
        description: 'Hero sections for landing pages',
        files: [
            {
                path: 'components/Hero/mod.tsx',
                target: 'components/ui/Hero.tsx',
            },
        ],
        internalDependencies: ['utils', 'button', 'badge', 'link'],
    },
    link: {
        name: 'link',
        description: 'Enhanced link component',
        files: [
            {
                path: 'components/Link/mod.tsx',
                target: 'components/ui/Link.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    modal: {
        name: 'modal',
        description: 'Dialog/Modal component',
        files: [
            {
                path: 'components/Modal/mod.tsx',
                target: 'components/ui/Modal.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons', 'button'],
    },
    navbar: {
        name: 'navbar',
        description: 'Navigation bar component',
        files: [
            {
                path: 'components/Navbar/mod.tsx',
                target: 'components/ui/Navbar.tsx',
            },
        ],
        internalDependencies: ['utils', 'button', 'link'],
    },
    newsletter: {
        name: 'newsletter',
        description: 'Newsletter subscription form section',
        files: [
            {
                path: 'components/Newsletter/mod.tsx',
                target: 'components/ui/Newsletter.tsx',
            },
        ],
        internalDependencies: ['utils', 'button', 'input', 'section'],
    },
    pagination: {
        name: 'pagination',
        description: 'Pagination controls',
        files: [
            {
                path: 'components/Pagination/mod.tsx',
                target: 'components/ui/Pagination.tsx',
            },
        ],
        internalDependencies: ['utils', 'button', 'icons'],
    },
    section: {
        name: 'section',
        description: 'Page section layout component',
        files: [
            {
                path: 'components/Section/mod.tsx',
                target: 'components/ui/Section.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    sidebar: {
        name: 'sidebar',
        description: 'Sidebar navigation component',
        files: [
            {
                path: 'components/Sidebar/mod.tsx',
                target: 'components/ui/Sidebar.tsx',
            },
        ],
        internalDependencies: [
            'utils',
            'button',
            'separator',
            'skeleton',
            'input',
            'icons',
        ],
    },
    spinner: {
        name: 'spinner',
        description: 'Loading spinner component',
        files: [
            {
                path: 'components/Spinner/mod.tsx',
                target: 'components/ui/Spinner.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    table: {
        name: 'table',
        description: 'Data table component',
        files: [
            {
                path: 'components/Table/mod.tsx',
                target: 'components/ui/Table.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'tree-view': {
        name: 'tree-view',
        description: 'Hierarchical tree view component',
        files: [
            {
                path: 'components/TreeView/mod.tsx',
                target: 'components/ui/TreeView.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons'],
    },
    'upload-zone': {
        name: 'upload-zone',
        description: 'File upload area with drag and drop',
        files: [
            {
                path: 'components/UploadZone/mod.tsx',
                target: 'components/ui/UploadZone.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons', 'button'],
    },
    video: {
        name: 'video',
        description: 'Video player component',
        files: [
            {
                path: 'components/Video/mod.tsx',
                target: 'components/ui/Video.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons'],
    },
}
