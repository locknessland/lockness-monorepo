/**
 * @fileoverview Syntax highlighting styles injector component.
 *
 * Injects highlight.js theme styles into the page.
 * Styles are rendered inline with each code block for SSR compatibility.
 *
 * @module @lockness/ui/components/code-block/styles
 */

import type { FC } from '@lockness/hono'
import { getThemeStyles, type ThemeName } from './themes.ts'

export interface SyntaxHighlightingStylesProps {
    /**
     * Theme to use for syntax highlighting
     * @default 'default'
     */
    theme?: ThemeName
}

/**
 * Component that injects syntax highlighting styles.
 * Renders a <style> tag directly for immediate SSR application.
 * Multiple instances with the same theme are harmless (browser deduplicates).
 */
export const SyntaxHighlightingStyles: FC<SyntaxHighlightingStylesProps> = ({
    theme = 'default',
}) => {
    const styles = getThemeStyles(theme)

    return (
        <style
            data-hljs-theme={theme}
            dangerouslySetInnerHTML={{ __html: styles }}
        />
    )
}
