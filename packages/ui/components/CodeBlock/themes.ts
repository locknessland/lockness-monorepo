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
[data-hljs-theme="default"] .hljs-keyword,
[data-hljs-theme="default"] .hljs-selector-tag,
[data-hljs-theme="default"] .hljs-literal,
[data-hljs-theme="default"] .hljs-section,
[data-hljs-theme="default"] .hljs-link {
    color: oklch(0.7 0.15 280);
}

[data-hljs-theme="default"] .hljs-string,
[data-hljs-theme="default"] .hljs-title,
[data-hljs-theme="default"] .hljs-name,
[data-hljs-theme="default"] .hljs-type,
[data-hljs-theme="default"] .hljs-attribute,
[data-hljs-theme="default"] .hljs-symbol,
[data-hljs-theme="default"] .hljs-bullet,
[data-hljs-theme="default"] .hljs-addition,
[data-hljs-theme="default"] .hljs-variable,
[data-hljs-theme="default"] .hljs-template-tag,
[data-hljs-theme="default"] .hljs-template-variable {
    color: oklch(0.75 0.15 140);
}

[data-hljs-theme="default"] .hljs-comment,
[data-hljs-theme="default"] .hljs-quote,
[data-hljs-theme="default"] .hljs-deletion,
[data-hljs-theme="default"] .hljs-meta {
    color: oklch(0.6 0 0);
}

[data-hljs-theme="default"] .hljs-function,
[data-hljs-theme="default"] .hljs-title.function_ {
    color: oklch(0.75 0.15 220);
}

[data-hljs-theme="default"] .hljs-number {
    color: oklch(0.75 0.15 60);
}

[data-hljs-theme="default"] .hljs-built_in,
[data-hljs-theme="default"] .hljs-class .hljs-title {
    color: oklch(0.75 0.12 200);
}

[data-hljs-theme="default"] .hljs-property {
    color: oklch(0.8 0.1 180);
}

[data-hljs-theme="default"] .hljs-params {
    color: oklch(0.8 0 0);
}

[data-hljs-theme="default"] .hljs-attr {
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
[data-hljs-theme="monokai"] .hljs-keyword,
[data-hljs-theme="monokai"] .hljs-selector-tag,
[data-hljs-theme="monokai"] .hljs-literal,
[data-hljs-theme="monokai"] .hljs-section,
[data-hljs-theme="monokai"] .hljs-link {
    color: oklch(0.7 0.2 350);
}

[data-hljs-theme="monokai"] .hljs-string,
[data-hljs-theme="monokai"] .hljs-title,
[data-hljs-theme="monokai"] .hljs-name,
[data-hljs-theme="monokai"] .hljs-type,
[data-hljs-theme="monokai"] .hljs-attribute,
[data-hljs-theme="monokai"] .hljs-symbol,
[data-hljs-theme="monokai"] .hljs-bullet,
[data-hljs-theme="monokai"] .hljs-addition,
[data-hljs-theme="monokai"] .hljs-variable,
[data-hljs-theme="monokai"] .hljs-template-tag,
[data-hljs-theme="monokai"] .hljs-template-variable {
    color: oklch(0.8 0.15 100);
}

[data-hljs-theme="monokai"] .hljs-comment,
[data-hljs-theme="monokai"] .hljs-quote,
[data-hljs-theme="monokai"] .hljs-deletion,
[data-hljs-theme="monokai"] .hljs-meta {
    color: oklch(0.55 0.02 100);
}

[data-hljs-theme="monokai"] .hljs-function,
[data-hljs-theme="monokai"] .hljs-title.function_ {
    color: oklch(0.75 0.18 140);
}

[data-hljs-theme="monokai"] .hljs-number {
    color: oklch(0.75 0.15 300);
}

[data-hljs-theme="monokai"] .hljs-built_in,
[data-hljs-theme="monokai"] .hljs-class .hljs-title {
    color: oklch(0.75 0.15 200);
}

[data-hljs-theme="monokai"] .hljs-property {
    color: oklch(0.8 0.12 200);
}

[data-hljs-theme="monokai"] .hljs-params {
    color: oklch(0.85 0.08 50);
}

[data-hljs-theme="monokai"] .hljs-attr {
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
[data-hljs-theme="github"] .hljs-keyword,
[data-hljs-theme="github"] .hljs-selector-tag,
[data-hljs-theme="github"] .hljs-literal,
[data-hljs-theme="github"] .hljs-section,
[data-hljs-theme="github"] .hljs-link {
    color: oklch(0.55 0.2 350);
}

[data-hljs-theme="github"] .hljs-string,
[data-hljs-theme="github"] .hljs-title,
[data-hljs-theme="github"] .hljs-name,
[data-hljs-theme="github"] .hljs-type,
[data-hljs-theme="github"] .hljs-attribute,
[data-hljs-theme="github"] .hljs-symbol,
[data-hljs-theme="github"] .hljs-bullet,
[data-hljs-theme="github"] .hljs-addition,
[data-hljs-theme="github"] .hljs-variable,
[data-hljs-theme="github"] .hljs-template-tag,
[data-hljs-theme="github"] .hljs-template-variable {
    color: oklch(0.5 0.12 250);
}

[data-hljs-theme="github"] .hljs-comment,
[data-hljs-theme="github"] .hljs-quote,
[data-hljs-theme="github"] .hljs-deletion,
[data-hljs-theme="github"] .hljs-meta {
    color: oklch(0.55 0 0);
}

[data-hljs-theme="github"] .hljs-function,
[data-hljs-theme="github"] .hljs-title.function_ {
    color: oklch(0.55 0.15 300);
}

[data-hljs-theme="github"] .hljs-number {
    color: oklch(0.5 0.15 250);
}

[data-hljs-theme="github"] .hljs-built_in,
[data-hljs-theme="github"] .hljs-class .hljs-title {
    color: oklch(0.55 0.12 30);
}

[data-hljs-theme="github"] .hljs-property {
    color: oklch(0.5 0.15 250);
}

[data-hljs-theme="github"] .hljs-params {
    color: oklch(0.4 0 0);
}

[data-hljs-theme="github"] .hljs-attr {
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
[data-hljs-theme="nord"] .hljs-keyword,
[data-hljs-theme="nord"] .hljs-selector-tag,
[data-hljs-theme="nord"] .hljs-literal,
[data-hljs-theme="nord"] .hljs-section,
[data-hljs-theme="nord"] .hljs-link {
    color: oklch(0.7 0.12 250);
}

[data-hljs-theme="nord"] .hljs-string,
[data-hljs-theme="nord"] .hljs-title,
[data-hljs-theme="nord"] .hljs-name,
[data-hljs-theme="nord"] .hljs-type,
[data-hljs-theme="nord"] .hljs-attribute,
[data-hljs-theme="nord"] .hljs-symbol,
[data-hljs-theme="nord"] .hljs-bullet,
[data-hljs-theme="nord"] .hljs-addition,
[data-hljs-theme="nord"] .hljs-variable,
[data-hljs-theme="nord"] .hljs-template-tag,
[data-hljs-theme="nord"] .hljs-template-variable {
    color: oklch(0.75 0.12 140);
}

[data-hljs-theme="nord"] .hljs-comment,
[data-hljs-theme="nord"] .hljs-quote,
[data-hljs-theme="nord"] .hljs-deletion,
[data-hljs-theme="nord"] .hljs-meta {
    color: oklch(0.55 0.03 230);
}

[data-hljs-theme="nord"] .hljs-function,
[data-hljs-theme="nord"] .hljs-title.function_ {
    color: oklch(0.7 0.12 220);
}

[data-hljs-theme="nord"] .hljs-number {
    color: oklch(0.75 0.12 300);
}

[data-hljs-theme="nord"] .hljs-built_in,
[data-hljs-theme="nord"] .hljs-class .hljs-title {
    color: oklch(0.7 0.1 200);
}

[data-hljs-theme="nord"] .hljs-property {
    color: oklch(0.75 0.08 220);
}

[data-hljs-theme="nord"] .hljs-params {
    color: oklch(0.8 0.05 230);
}

[data-hljs-theme="nord"] .hljs-attr {
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
