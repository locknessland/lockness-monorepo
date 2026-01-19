/**
 * Design tokens for Lockness UI
 *
 * Centralized theme definitions using OKLCH color space for consistent,
 * perceptually uniform colors across light and dark modes.
 *
 * Based on shadcn-ui themes adapted for server-side Hono JSX.
 *
 * @module
 */

export interface ColorTokens {
    background: string
    foreground: string
    card: string
    cardForeground: string
    popover: string
    popoverForeground: string
    primary: string
    primaryForeground: string
    secondary: string
    secondaryForeground: string
    muted: string
    mutedForeground: string
    accent: string
    accentForeground: string
    destructive: string
    destructiveForeground: string
    border: string
    input: string
    ring: string
    chart1: string
    chart2: string
    chart3: string
    chart4: string
    chart5: string
}

export interface Theme {
    light: ColorTokens
    dark: ColorTokens
}

/**
 * Stone theme - Neutral gray tones with warm undertones
 */
export const stone: Theme = {
    light: {
        background: 'oklch(1 0 0)',
        foreground: 'oklch(0.147 0.004 49.25)',
        card: 'oklch(1 0 0)',
        cardForeground: 'oklch(0.147 0.004 49.25)',
        popover: 'oklch(1 0 0)',
        popoverForeground: 'oklch(0.147 0.004 49.25)',
        primary: 'oklch(0.216 0.006 56.043)',
        primaryForeground: 'oklch(0.985 0.001 106.423)',
        secondary: 'oklch(0.97 0.001 106.423)',
        secondaryForeground: 'oklch(0.216 0.006 56.043)',
        muted: 'oklch(0.97 0.001 106.423)',
        mutedForeground: 'oklch(0.556 0.004 77.658)',
        accent: 'oklch(0.97 0.001 106.423)',
        accentForeground: 'oklch(0.216 0.006 56.043)',
        destructive: 'oklch(0.577 0.245 27.325)',
        destructiveForeground: 'oklch(0.985 0.001 106.423)',
        border: 'oklch(0.922 0.003 106.423)',
        input: 'oklch(0.922 0.003 106.423)',
        ring: 'oklch(0.708 0.005 77.658)',
        chart1: 'oklch(0.646 0.222 41.116)',
        chart2: 'oklch(0.6 0.118 184.704)',
        chart3: 'oklch(0.398 0.07 227.392)',
        chart4: 'oklch(0.828 0.189 84.429)',
        chart5: 'oklch(0.769 0.188 70.08)',
    },
    dark: {
        background: 'oklch(0.147 0.004 49.25)',
        foreground: 'oklch(0.985 0.001 106.423)',
        card: 'oklch(0.147 0.004 49.25)',
        cardForeground: 'oklch(0.985 0.001 106.423)',
        popover: 'oklch(0.147 0.004 49.25)',
        popoverForeground: 'oklch(0.985 0.001 106.423)',
        primary: 'oklch(0.985 0.001 106.423)',
        primaryForeground: 'oklch(0.216 0.006 56.043)',
        secondary: 'oklch(0.264 0.008 58.566)',
        secondaryForeground: 'oklch(0.985 0.001 106.423)',
        muted: 'oklch(0.264 0.008 58.566)',
        mutedForeground: 'oklch(0.708 0.005 77.658)',
        accent: 'oklch(0.264 0.008 58.566)',
        accentForeground: 'oklch(0.985 0.001 106.423)',
        destructive: 'oklch(0.577 0.245 27.325)',
        destructiveForeground: 'oklch(0.985 0.001 106.423)',
        border: 'oklch(0.264 0.008 58.566)',
        input: 'oklch(0.264 0.008 58.566)',
        ring: 'oklch(0.728 0.011 106.423)',
        chart1: 'oklch(0.646 0.222 41.116)',
        chart2: 'oklch(0.6 0.118 184.704)',
        chart3: 'oklch(0.398 0.07 227.392)',
        chart4: 'oklch(0.828 0.189 84.429)',
        chart5: 'oklch(0.769 0.188 70.08)',
    },
}

/**
 * Zinc theme - Cool gray tones
 */
export const zinc: Theme = {
    light: {
        background: 'oklch(1 0 0)',
        foreground: 'oklch(0.145 0 0)',
        card: 'oklch(1 0 0)',
        cardForeground: 'oklch(0.145 0 0)',
        popover: 'oklch(1 0 0)',
        popoverForeground: 'oklch(0.145 0 0)',
        primary: 'oklch(0.205 0 0)',
        primaryForeground: 'oklch(0.985 0 0)',
        secondary: 'oklch(0.97 0 0)',
        secondaryForeground: 'oklch(0.205 0 0)',
        muted: 'oklch(0.97 0 0)',
        mutedForeground: 'oklch(0.556 0 0)',
        accent: 'oklch(0.97 0 0)',
        accentForeground: 'oklch(0.205 0 0)',
        destructive: 'oklch(0.577 0.245 27.325)',
        destructiveForeground: 'oklch(0.985 0 0)',
        border: 'oklch(0.922 0 0)',
        input: 'oklch(0.922 0 0)',
        ring: 'oklch(0.708 0 0)',
        chart1: 'oklch(0.646 0.222 41.116)',
        chart2: 'oklch(0.6 0.118 184.704)',
        chart3: 'oklch(0.398 0.07 227.392)',
        chart4: 'oklch(0.828 0.189 84.429)',
        chart5: 'oklch(0.769 0.188 70.08)',
    },
    dark: {
        background: 'oklch(0.145 0 0)',
        foreground: 'oklch(0.985 0 0)',
        card: 'oklch(0.145 0 0)',
        cardForeground: 'oklch(0.985 0 0)',
        popover: 'oklch(0.145 0 0)',
        popoverForeground: 'oklch(0.985 0 0)',
        primary: 'oklch(0.985 0 0)',
        primaryForeground: 'oklch(0.205 0 0)',
        secondary: 'oklch(0.262 0 0)',
        secondaryForeground: 'oklch(0.985 0 0)',
        muted: 'oklch(0.262 0 0)',
        mutedForeground: 'oklch(0.708 0 0)',
        accent: 'oklch(0.262 0 0)',
        accentForeground: 'oklch(0.985 0 0)',
        destructive: 'oklch(0.577 0.245 27.325)',
        destructiveForeground: 'oklch(0.985 0 0)',
        border: 'oklch(0.262 0 0)',
        input: 'oklch(0.262 0 0)',
        ring: 'oklch(0.728 0 0)',
        chart1: 'oklch(0.646 0.222 41.116)',
        chart2: 'oklch(0.6 0.118 184.704)',
        chart3: 'oklch(0.398 0.07 227.392)',
        chart4: 'oklch(0.828 0.189 84.429)',
        chart5: 'oklch(0.769 0.188 70.08)',
    },
}

/**
 * Neutral theme - Balanced gray tones
 */
export const neutral: Theme = {
    light: {
        background: 'oklch(1 0 0)',
        foreground: 'oklch(0.144 0 0)',
        card: 'oklch(1 0 0)',
        cardForeground: 'oklch(0.144 0 0)',
        popover: 'oklch(1 0 0)',
        popoverForeground: 'oklch(0.144 0 0)',
        primary: 'oklch(0.205 0 0)',
        primaryForeground: 'oklch(0.985 0 0)',
        secondary: 'oklch(0.971 0 0)',
        secondaryForeground: 'oklch(0.205 0 0)',
        muted: 'oklch(0.971 0 0)',
        mutedForeground: 'oklch(0.554 0 0)',
        accent: 'oklch(0.971 0 0)',
        accentForeground: 'oklch(0.205 0 0)',
        destructive: 'oklch(0.577 0.245 27.325)',
        destructiveForeground: 'oklch(0.985 0 0)',
        border: 'oklch(0.922 0 0)',
        input: 'oklch(0.922 0 0)',
        ring: 'oklch(0.708 0 0)',
        chart1: 'oklch(0.646 0.222 41.116)',
        chart2: 'oklch(0.6 0.118 184.704)',
        chart3: 'oklch(0.398 0.07 227.392)',
        chart4: 'oklch(0.828 0.189 84.429)',
        chart5: 'oklch(0.769 0.188 70.08)',
    },
    dark: {
        background: 'oklch(0.144 0 0)',
        foreground: 'oklch(0.985 0 0)',
        card: 'oklch(0.144 0 0)',
        cardForeground: 'oklch(0.985 0 0)',
        popover: 'oklch(0.144 0 0)',
        popoverForeground: 'oklch(0.985 0 0)',
        primary: 'oklch(0.985 0 0)',
        primaryForeground: 'oklch(0.205 0 0)',
        secondary: 'oklch(0.261 0 0)',
        secondaryForeground: 'oklch(0.985 0 0)',
        muted: 'oklch(0.261 0 0)',
        mutedForeground: 'oklch(0.708 0 0)',
        accent: 'oklch(0.261 0 0)',
        accentForeground: 'oklch(0.985 0 0)',
        destructive: 'oklch(0.577 0.245 27.325)',
        destructiveForeground: 'oklch(0.985 0 0)',
        border: 'oklch(0.261 0 0)',
        input: 'oklch(0.261 0 0)',
        ring: 'oklch(0.728 0 0)',
        chart1: 'oklch(0.646 0.222 41.116)',
        chart2: 'oklch(0.6 0.118 184.704)',
        chart3: 'oklch(0.398 0.07 227.392)',
        chart4: 'oklch(0.828 0.189 84.429)',
        chart5: 'oklch(0.769 0.188 70.08)',
    },
}

/**
 * Gray theme - Classic gray tones
 */
export const gray: Theme = {
    light: {
        background: 'oklch(1 0 0)',
        foreground: 'oklch(0.146 0.001 286.286)',
        card: 'oklch(1 0 0)',
        cardForeground: 'oklch(0.146 0.001 286.286)',
        popover: 'oklch(1 0 0)',
        popoverForeground: 'oklch(0.146 0.001 286.286)',
        primary: 'oklch(0.206 0.002 286.286)',
        primaryForeground: 'oklch(0.985 0.001 286.286)',
        secondary: 'oklch(0.97 0.001 286.286)',
        secondaryForeground: 'oklch(0.206 0.002 286.286)',
        muted: 'oklch(0.97 0.001 286.286)',
        mutedForeground: 'oklch(0.555 0.001 286.286)',
        accent: 'oklch(0.97 0.001 286.286)',
        accentForeground: 'oklch(0.206 0.002 286.286)',
        destructive: 'oklch(0.577 0.245 27.325)',
        destructiveForeground: 'oklch(0.985 0.001 286.286)',
        border: 'oklch(0.922 0.001 286.286)',
        input: 'oklch(0.922 0.001 286.286)',
        ring: 'oklch(0.708 0.001 286.286)',
        chart1: 'oklch(0.646 0.222 41.116)',
        chart2: 'oklch(0.6 0.118 184.704)',
        chart3: 'oklch(0.398 0.07 227.392)',
        chart4: 'oklch(0.828 0.189 84.429)',
        chart5: 'oklch(0.769 0.188 70.08)',
    },
    dark: {
        background: 'oklch(0.146 0.001 286.286)',
        foreground: 'oklch(0.985 0.001 286.286)',
        card: 'oklch(0.146 0.001 286.286)',
        cardForeground: 'oklch(0.985 0.001 286.286)',
        popover: 'oklch(0.146 0.001 286.286)',
        popoverForeground: 'oklch(0.985 0.001 286.286)',
        primary: 'oklch(0.985 0.001 286.286)',
        primaryForeground: 'oklch(0.206 0.002 286.286)',
        secondary: 'oklch(0.263 0.003 286.286)',
        secondaryForeground: 'oklch(0.985 0.001 286.286)',
        muted: 'oklch(0.263 0.003 286.286)',
        mutedForeground: 'oklch(0.708 0.001 286.286)',
        accent: 'oklch(0.263 0.003 286.286)',
        accentForeground: 'oklch(0.985 0.001 286.286)',
        destructive: 'oklch(0.577 0.245 27.325)',
        destructiveForeground: 'oklch(0.985 0.001 286.286)',
        border: 'oklch(0.263 0.003 286.286)',
        input: 'oklch(0.263 0.003 286.286)',
        ring: 'oklch(0.728 0.002 286.286)',
        chart1: 'oklch(0.646 0.222 41.116)',
        chart2: 'oklch(0.6 0.118 184.704)',
        chart3: 'oklch(0.398 0.07 227.392)',
        chart4: 'oklch(0.828 0.189 84.429)',
        chart5: 'oklch(0.769 0.188 70.08)',
    },
}

/**
 * Slate theme - Blue-tinted gray tones
 */
export const slate: Theme = {
    light: {
        background: 'oklch(1 0 0)',
        foreground: 'oklch(0.149 0.01 254.604)',
        card: 'oklch(1 0 0)',
        cardForeground: 'oklch(0.149 0.01 254.604)',
        popover: 'oklch(1 0 0)',
        popoverForeground: 'oklch(0.149 0.01 254.604)',
        primary: 'oklch(0.213 0.018 254.604)',
        primaryForeground: 'oklch(0.985 0.002 254.604)',
        secondary: 'oklch(0.97 0.002 254.604)',
        secondaryForeground: 'oklch(0.213 0.018 254.604)',
        muted: 'oklch(0.97 0.002 254.604)',
        mutedForeground: 'oklch(0.559 0.012 254.604)',
        accent: 'oklch(0.97 0.002 254.604)',
        accentForeground: 'oklch(0.213 0.018 254.604)',
        destructive: 'oklch(0.577 0.245 27.325)',
        destructiveForeground: 'oklch(0.985 0.002 254.604)',
        border: 'oklch(0.922 0.005 254.604)',
        input: 'oklch(0.922 0.005 254.604)',
        ring: 'oklch(0.708 0.012 254.604)',
        chart1: 'oklch(0.646 0.222 41.116)',
        chart2: 'oklch(0.6 0.118 184.704)',
        chart3: 'oklch(0.398 0.07 227.392)',
        chart4: 'oklch(0.828 0.189 84.429)',
        chart5: 'oklch(0.769 0.188 70.08)',
    },
    dark: {
        background: 'oklch(0.149 0.01 254.604)',
        foreground: 'oklch(0.985 0.002 254.604)',
        card: 'oklch(0.149 0.01 254.604)',
        cardForeground: 'oklch(0.985 0.002 254.604)',
        popover: 'oklch(0.149 0.01 254.604)',
        popoverForeground: 'oklch(0.985 0.002 254.604)',
        primary: 'oklch(0.985 0.002 254.604)',
        primaryForeground: 'oklch(0.213 0.018 254.604)',
        secondary: 'oklch(0.27 0.018 254.604)',
        secondaryForeground: 'oklch(0.985 0.002 254.604)',
        muted: 'oklch(0.27 0.018 254.604)',
        mutedForeground: 'oklch(0.708 0.012 254.604)',
        accent: 'oklch(0.27 0.018 254.604)',
        accentForeground: 'oklch(0.985 0.002 254.604)',
        destructive: 'oklch(0.577 0.245 27.325)',
        destructiveForeground: 'oklch(0.985 0.002 254.604)',
        border: 'oklch(0.27 0.018 254.604)',
        input: 'oklch(0.27 0.018 254.604)',
        ring: 'oklch(0.728 0.015 254.604)',
        chart1: 'oklch(0.646 0.222 41.116)',
        chart2: 'oklch(0.6 0.118 184.704)',
        chart3: 'oklch(0.398 0.07 227.392)',
        chart4: 'oklch(0.828 0.189 84.429)',
        chart5: 'oklch(0.769 0.188 70.08)',
    },
}

/**
 * All available themes
 */
export const themes = {
    stone,
    zinc,
    neutral,
    gray,
    slate,
}

export type ThemeName = keyof typeof themes
export type ColorMode = 'light' | 'dark'

/**
 * Get CSS variable value for a theme
 */
export function getCSSVariable(
    themeName: ThemeName,
    mode: ColorMode,
    token: keyof ColorTokens,
): string {
    return themes[themeName][mode][token]
}
