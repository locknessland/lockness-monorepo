import { asset, getManifest } from './helpers.ts'

/**
 * Enhanced Asset component that automatically resolves paths.
 */
export const Asset = ({ src, href, ...props }: any) => {
    const path = src || href
    if (!path) return null

    const resolved = asset(path)

    if (path.endsWith('.css')) {
        return <link rel="stylesheet" href={resolved} {...props} />
    }
    
    if (path.endsWith('.js') || path.endsWith('.ts')) {
        return <script src={resolved} type="module" {...props}></script>
    }

    return null
}

/**
 * Vite scripts component for easy entry point inclusion.
 * Automatically injects CSS dependencies in production.
 */
export const ViteScripts = ({ entry }: { entry: string }) => {
    const isProd = !Deno.env.get('VITE')
    const manifest = isProd ? getManifest() : null
    const tags: any[] = []

    if (isProd && manifest) {
        const item = manifest[entry]
        if (item && item.css) {
            for (const cssFile of item.css) {
                const resolvedCss = cssFile.replace(/^\//, '')
                tags.push(<link key={resolvedCss} rel="stylesheet" href={`/${resolvedCss}`} />)
            }
        }
    }

    tags.push(<Asset key={entry} src={entry} />)
    
    return <>{tags}</>
}
