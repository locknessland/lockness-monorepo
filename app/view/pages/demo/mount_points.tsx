/**
 * @fileoverview Mount Points Demo View
 *
 * Demonstrates the REAL mount points feature with locale prefix at START of URL.
 */

import { LandingLayout } from '@view/layouts/landing_layout.tsx'
import {
    Alert,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CodeBlock,
    Title,
} from '@lockness/ui/components'

// =============================================================================
// Locale Configuration
// =============================================================================

export const LOCALES: Record<
    string,
    { flag: string; name: string; greeting: string }
> = {
    'en-us': { flag: '🇺🇸', name: 'English (US)', greeting: 'Hello!' },
    'fr-ca': { flag: '🇨🇦', name: 'Français (CA)', greeting: 'Bonjour!' },
    'es-mx': { flag: '🇲🇽', name: 'Español (MX)', greeting: '¡Hola!' },
    'de-de': { flag: '🇩🇪', name: 'Deutsch (DE)', greeting: 'Hallo!' },
    'ja-jp': { flag: '🇯🇵', name: '日本語 (JP)', greeting: 'こんにちは！' },
}

// =============================================================================
// Code Example
// =============================================================================

const KERNEL_CODE =
    `// config/routing.ts — build the pattern, never write it as a literal
import { constrainedParam } from '@lockness/core'
import { validCountries, validLanguages } from './i18n.ts'

@Kernel({
    controllers: controllers,
    mountPoint: {
        // Constrained: an open /:langId/:countryId matches ANY two leading
        // segments, so /.well-known/... would reach this middleware.
        pattern: \`/\${constrainedParam('langId', validLanguages)}/\${
            constrainedParam('countryId', validCountries)
        }\`,
        middleware: async (c: Context, next: Next) => {
            c.set('langId', c.req.param('langId'))
            c.set('countryId', c.req.param('countryId'))
            return await next()
        },
    },
})
export class AppKernel {}

// Routes accessible at:
// /demo/mount-points → without locale context
// /fr/ca/demo/mount-points → WITH locale context ✅`

// =============================================================================
// Types
// =============================================================================

export interface MountPointsProps {
    langId?: string
    countryId?: string
}

// =============================================================================
// Mount Points Demo Page
// =============================================================================

export function MountPointsPage({ langId, countryId }: MountPointsProps) {
    const localeKey = langId && countryId ? `${langId}-${countryId}` : undefined
    const locale = localeKey ? (LOCALES[localeKey] ?? LOCALES['en-us']) : null
    const hasLocale = !!langId && !!countryId

    return (
        <LandingLayout
            title={`Mount Points Demo${locale ? ` - ${locale.name}` : ''}`}
            description='Real mount points demonstration'
        >
            <div class='container mx-auto px-4 py-12 max-w-4xl'>
                {/* Status Alert */}
                {hasLocale
                    ? (
                        <Alert variant='success' class='mb-8'>
                            <div class='flex items-center gap-2'>
                                <span class='text-xl'>✅</span>
                                <div>
                                    <strong>
                                        Mount point middleware active!
                                    </strong>
                                    <p class='text-sm mt-1'>
                                        URL:{' '}
                                        <code>
                                            /{langId}/{countryId}/demo/mount-points
                                        </code>{' '}
                                        (prefix at START)
                                    </p>
                                </div>
                            </div>
                        </Alert>
                    )
                    : (
                        <Alert variant='default' class='mb-8'>
                            <div class='flex items-center gap-2'>
                                <span class='text-xl'>ℹ️</span>
                                <div>
                                    <strong>
                                        No locale - accessing root path
                                    </strong>
                                    <p class='text-sm mt-1'>
                                        URL: <code>/demo/mount-points</code>
                                        {' '}
                                        - Click a locale below to see the mount
                                        point in action
                                    </p>
                                </div>
                            </div>
                        </Alert>
                    )}

                {/* Header */}
                <div class='text-center mb-12'>
                    <span class='text-6xl mb-4 block'>
                        {locale?.flag ?? '🌍'}
                    </span>
                    <Title level={1} size='hero' class='mb-4'>
                        {locale?.greeting ?? 'Mount Points Demo'}
                    </Title>
                    <p class='text-muted-foreground text-lg'>
                        {hasLocale
                            ? 'Locale extracted by mount point middleware in app/kernel.tsx'
                            : 'Select a locale to see the mount point feature in action'}
                    </p>
                </div>

                {/* Current URL Info */}
                <Card class='mb-8'>
                    <CardHeader>
                        <CardTitle>Mount Point Context</CardTitle>
                        <CardDescription>
                            Values set by middleware via c.set()
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div class='font-mono text-lg mb-4'>
                            {hasLocale
                                ? (
                                    <>
                                        <span class='text-green-500 font-bold'>
                                            /{langId}/{countryId}
                                        </span>
                                        <span class='text-muted-foreground'>
                                            /demo/mount-points
                                        </span>
                                    </>
                                )
                                : (
                                    <span class='text-muted-foreground'>
                                        /demo/mount-points
                                    </span>
                                )}
                        </div>
                        <div class='flex flex-wrap items-center gap-2'>
                            <span class='text-sm text-muted-foreground'>
                                c.get() values:
                            </span>
                            <Badge
                                variant={hasLocale ? 'default' : 'outline'}
                            >
                                langId = {langId ? `"${langId}"` : 'undefined'}
                            </Badge>
                            <Badge
                                variant={hasLocale ? 'default' : 'outline'}
                            >
                                countryId ={' '}
                                {countryId ? `"${countryId}"` : 'undefined'}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* Locale Switcher */}
                <Card class='mb-8'>
                    <CardHeader>
                        <CardTitle>Switch Locale (Mount Point)</CardTitle>
                        <CardDescription>
                            Each button adds the locale prefix at START of URL
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div class='flex flex-wrap gap-3'>
                            {Object.entries(LOCALES).map(([key, loc]) => {
                                const [lang, country] = key.split('-')
                                const isActive = key === localeKey
                                return (
                                    <Button
                                        as='a'
                                        href={`/${lang}/${country}/demo/mount-points`}
                                        variant={isActive
                                            ? 'primary'
                                            : 'outline'}
                                        size='md'
                                    >
                                        <span class='text-xl mr-2'>
                                            {loc.flag}
                                        </span>
                                        {loc.name}
                                    </Button>
                                )
                            })}
                        </div>
                        <p class='text-sm text-muted-foreground mt-4'>
                            Compare with root path:{' '}
                            <a
                                href='/demo/mount-points'
                                class='text-primary underline'
                            >
                                /demo/mount-points
                            </a>
                        </p>
                    </CardContent>
                </Card>

                {/* Navigate to sub-page */}
                {hasLocale && (
                    <Card class='mb-8'>
                        <CardHeader>
                            <CardTitle>Navigate Within Locale</CardTitle>
                            <CardDescription>
                                Sub-routes also receive locale context
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div class='flex gap-4'>
                                <Button
                                    as='a'
                                    href={`/${langId}/${countryId}/demo/mount-points/products`}
                                    variant='outline'
                                >
                                    📦 Products Page
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Kernel Code */}
                <Card class='mb-8'>
                    <CardHeader>
                        <CardTitle>app/kernel.tsx Configuration</CardTitle>
                        <CardDescription>
                            Real mount points configuration powering this demo
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <CodeBlock lang='typescript'>
                            {KERNEL_CODE}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Back to Docs */}
                <div class='flex justify-center gap-4'>
                    <Button as='a' href='/docs/mount-points' size='lg'>
                        📚 Read the Documentation
                    </Button>
                </div>
            </div>
        </LandingLayout>
    )
}

// =============================================================================
// Products Page
// =============================================================================

const TRANSLATIONS: Record<string, { title: string; items: string[] }> = {
    'en-us': {
        title: 'Products',
        items: ['Laptop', 'Phone', 'Tablet'],
    },
    'fr-ca': {
        title: 'Produits',
        items: ['Ordinateur portable', 'Téléphone', 'Tablette'],
    },
    'es-mx': {
        title: 'Productos',
        items: ['Laptop', 'Teléfono', 'Tableta'],
    },
    'de-de': {
        title: 'Produkte',
        items: ['Laptop', 'Handy', 'Tablet'],
    },
    'ja-jp': {
        title: '製品',
        items: ['ノートパソコン', '電話', 'タブレット'],
    },
}

export function MountPointsProductsPage(
    { langId, countryId }: MountPointsProps,
) {
    const localeKey = langId && countryId ? `${langId}-${countryId}` : 'en-us'
    const locale = LOCALES[localeKey] ?? LOCALES['en-us']
    const t = TRANSLATIONS[localeKey] ?? TRANSLATIONS['en-us']
    const hasLocale = !!langId && !!countryId

    return (
        <LandingLayout
            title={`${t.title} - ${locale.name}`}
            description='Products page'
        >
            <div class='container mx-auto px-4 py-12 max-w-4xl'>
                <Alert variant='success' class='mb-8'>
                    <div class='flex items-center gap-2'>
                        <span class='text-xl'>✅</span>
                        <div>
                            <strong>
                                Products page with mount point context!
                            </strong>
                            <p class='text-sm mt-1'>
                                URL:{' '}
                                <Badge variant='outline'>
                                    /{langId}/{countryId}/demo/mount-points/products
                                </Badge>
                            </p>
                        </div>
                    </div>
                </Alert>

                <div class='text-center mb-8'>
                    <span class='text-4xl mb-4 block'>{locale.flag}</span>
                    <Title level={1} class='mb-4'>{t.title}</Title>
                </div>

                <Card class='mb-8'>
                    <CardHeader>
                        <CardTitle>{t.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul class='space-y-2'>
                            {t.items.map((item) => (
                                <li class='flex items-center gap-2'>
                                    <span>📦</span> {item}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                <div class='flex justify-center'>
                    <Button
                        as='a'
                        href={hasLocale
                            ? `/${langId}/${countryId}/demo/mount-points`
                            : '/demo/mount-points'}
                        variant='outline'
                    >
                        ← Back to Demo
                    </Button>
                </div>
            </div>
        </LandingLayout>
    )
}
