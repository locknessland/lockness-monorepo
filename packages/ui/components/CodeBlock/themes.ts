/**
 * @fileoverview Syntax highlighting themes for CodeBlock component.
 *
 * Each theme provides CSS styles for highlight.js classes.
 * Uses OKLCH color space for perceptually uniform colors.
 *
 * @module @lockness/ui/components/code-block/themes
 */

/**
 * Available syntax highlighting theme names
 */
export type ThemeName = 'default' | 'monokai' | 'github' | 'nord'

/**
 * Theme definition with CSS styles
 */
export interface Theme {
    /** Theme display name */
    name: string
    /** CSS styles for highlight.js classes */
    styles: string
}

/**
 * Default theme - balanced colors for light/dark modes
 */
const defaultTheme: Theme = {
    name: 'Default',
    styles: `
.hljs-keyword,
.hljs-selector-tag,
.hljs-literal,
.hljs-section,
.hljs-link {
    color: oklch(0.7 0.15 280);
}

.hljs-string,
.hljs-title,
.hljs-name,
.hljs-type,
.hljs-attribute,
.hljs-symbol,
.hljs-bullet,
.hljs-addition,
.hljs-variable,
.hljs-template-tag,
.hljs-template-variable {
    color: oklch(0.75 0.15 140);
}

.hljs-comment,
.hljs-quote,
.hljs-deletion,
.hljs-meta {
    color: oklch(0.6 0 0);
}

.hljs-function,
.hljs-title.function_ {
    color: oklch(0.75 0.15 220);
}

.hljs-number {
    color: oklch(0.75 0.15 60);
}

.hljs-built_in,
.hljs-class .hljs-title {
    color: oklch(0.75 0.12 200);
}

.hljs-property {
    color: oklch(0.8 0.1 180);
}

.hljs-params {
    color: oklch(0.8 0 0);
}

.hljs-attr {
    color: oklch(0.75 0.12 30);
}
`,
}

/**
 * Monokai theme - inspired by the classic Sublime Text theme
 */
const monokaiTheme: Theme = {
    name: 'Monokai',
    styles: `
.hljs-keyword,
.hljs-selector-tag,
.hljs-literal,
.hljs-section,
.hljs-link {
    color: oklch(0.7 0.2 350);
}

.hljs-string,
.hljs-title,
.hljs-name,
.hljs-type,
.hljs-attribute,
.hljs-symbol,
.hljs-bullet,
.hljs-addition,
.hljs-variable,
.hljs-template-tag,
.hljs-template-variable {
    color: oklch(0.8 0.15 100);
}

.hljs-comment,
.hljs-quote,
.hljs-deletion,
.hljs-meta {
    color: oklch(0.55 0.02 100);
}

.hljs-function,
.hljs-title.function_ {
    color: oklch(0.75 0.18 140);
}

.hljs-number {
    color: oklch(0.75 0.15 300);
}

.hljs-built_in,
.hljs-class .hljs-title {
    color: oklch(0.75 0.15 200);
}

.hljs-property {
    color: oklch(0.8 0.12 200);
}

.hljs-params {
    color: oklch(0.85 0.08 50);
}

.hljs-attr {
    color: oklch(0.75 0.18 140);
}
`,
}

/**
 * GitHub theme - clean and minimal
 */
const githubTheme: Theme = {
    name: 'GitHub',
    styles: `
.hljs-keyword,
.hljs-selector-tag,
.hljs-literal,
.hljs-section,
.hljs-link {
    color: oklch(0.55 0.2 350);
}

.hljs-string,
.hljs-title,
.hljs-name,
.hljs-type,
.hljs-attribute,
.hljs-symbol,
.hljs-bullet,
.hljs-addition,
.hljs-variable,
.hljs-template-tag,
.hljs-template-variable {
    color: oklch(0.5 0.12 250);
}

.hljs-comment,
.hljs-quote,
.hljs-deletion,
.hljs-meta {
    color: oklch(0.55 0 0);
}

.hljs-function,
.hljs-title.function_ {
    color: oklch(0.55 0.15 300);
}

.hljs-number {
    color: oklch(0.5 0.15 250);
}

.hljs-built_in,
.hljs-class .hljs-title {
    color: oklch(0.55 0.12 30);
}

.hljs-property {
    color: oklch(0.5 0.15 250);
}

.hljs-params {
    color: oklch(0.4 0 0);
}

.hljs-attr {
    color: oklch(0.55 0.15 300);
}
`,
}

/**
 * Nord theme - arctic, north-bluish color palette
 */
const nordTheme: Theme = {
    name: 'Nord',
    styles: `
.hljs-keyword,
.hljs-selector-tag,
.hljs-literal,
.hljs-section,
.hljs-link {
    color: oklch(0.7 0.12 250);
}

.hljs-string,
.hljs-title,
.hljs-name,
.hljs-type,
.hljs-attribute,
.hljs-symbol,
.hljs-bullet,
.hljs-addition,
.hljs-variable,
.hljs-template-tag,
.hljs-template-variable {
    color: oklch(0.75 0.12 140);
}

.hljs-comment,
.hljs-quote,
.hljs-deletion,
.hljs-meta {
    color: oklch(0.55 0.03 230);
}

.hljs-function,
.hljs-title.function_ {
    color: oklch(0.7 0.12 220);
}

.hljs-number {
    color: oklch(0.75 0.12 300);
}

.hljs-built_in,
.hljs-class .hljs-title {
    color: oklch(0.7 0.1 200);
}

.hljs-property {
    color: oklch(0.75 0.08 220);
}

.hljs-params {
    color: oklch(0.8 0.05 230);
}

.hljs-attr {
    color: oklch(0.7 0.12 220);
}
`,
}

/**
 * All available themes
 */
export const themes: Record<ThemeName, Theme> = {
    default: defaultTheme,
    monokai: monokaiTheme,
    github: githubTheme,
    nord: nordTheme,
}

/**
 * Get theme by name, falls back to default if not found
 */
export function getTheme(name: ThemeName = 'default'): Theme {
    return themes[name] ?? themes.default
}

/**
 * Get theme CSS styles by name
 */
export function getThemeStyles(name: ThemeName = 'default'): string {
    return getTheme(name).styles
}

/**
 * List all available theme names
 */
export function getAvailableThemes(): ThemeName[] {
    return Object.keys(themes) as ThemeName[]
}
