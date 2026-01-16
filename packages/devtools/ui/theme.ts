/**
 * Design tokens for Lockness Devtools UI
 * Pure CSS theme constants to maintain consistent visual identity
 */

export const colors = {
    // Background
    bg: {
        primary: '#0f1115',
        secondary: '#181a20',
        tertiary: '#1a1d23',
        elevated: '#20232a',
        hover: '#2a2d35',
    },

    // Text
    text: {
        primary: '#ffffff',
        secondary: '#e5e7eb',
        tertiary: '#d1d5db',
        muted: '#9ca3af',
        disabled: '#6b7280',
        subtle: '#4b5563',
    },

    // Brand
    brand: {
        indigo: {
            50: '#eef2ff',
            100: '#e0e7ff',
            200: '#c7d2fe',
            300: '#a5b4fc',
            400: '#818cf8',
            500: '#6366f1',
            600: '#4f46e5',
            700: '#4338ca',
            800: '#3730a3',
            900: '#312e81',
            950: '#1e1b4b',
        },
        purple: {
            300: '#d8b4fe',
            400: '#c084fc',
        },
    },

    // Semantic
    status: {
        success: '#10b981',
        successDark: '#059669',
        warning: '#f59e0b',
        warningDark: '#d97706',
        error: '#ef4444',
        errorDark: '#dc2626',
        info: '#3b82f6',
        infoDark: '#2563eb',
    },

    // Borders
    border: {
        default: 'rgba(255, 255, 255, 0.08)',
        light: 'rgba(255, 255, 255, 0.05)',
        dark: 'rgba(255, 255, 255, 0.1)',
    },
}

export const spacing = {
    xs: '0.25rem', // 4px
    sm: '0.5rem', // 8px
    md: '0.75rem', // 12px
    lg: '1rem', // 16px
    xl: '1.5rem', // 24px
    '2xl': '2rem', // 32px
    '3xl': '3rem', // 48px
}

export const borderRadius = {
    sm: '0.25rem', // 4px
    md: '0.375rem', // 6px
    lg: '0.5rem', // 8px
    xl: '0.75rem', // 12px
    full: '9999px',
}

export const fontSize = {
    xs: '0.75rem', // 12px
    sm: '0.875rem', // 14px
    base: '1rem', // 16px
    lg: '1.125rem', // 18px
    xl: '1.25rem', // 20px
    '2xl': '1.5rem', // 24px
    '3xl': '1.875rem', // 30px
}

export const fontWeight = {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
}

export const shadows = {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
}

export const transitions = {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
}

/**
 * Helper to create CSS style objects
 */
export const cssReset = `
    *, *::before, *::after {
        box-sizing: border-box;
        border-width: 0;
        border-style: solid;
        border-color: ${colors.border.default};
    }

    html {
        line-height: 1.5;
        -webkit-text-size-adjust: 100%;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    body {
        margin: 0;
        line-height: inherit;
        background-color: ${colors.bg.primary};
        color: ${colors.text.secondary};
    }

    h1, h2, h3 {
        font-size: inherit;
        font-weight: inherit;
        color: ${colors.text.secondary};
    }

    a {
        color: inherit;
        text-decoration: inherit;
    }

    button {
        font-family: inherit;
        font-size: 100%;
        font-weight: inherit;
        line-height: inherit;
        color: inherit;
        margin: 0;
        padding: 0;
        background-color: transparent;
        background-image: none;
        border: none;
        cursor: pointer;
    }

    table {
        text-indent: 0;
        border-color: ${colors.border.default};
        border-collapse: collapse;
    }

    th {
        color: ${colors.text.muted};
    }

    td {
        color: ${colors.text.secondary};
    }
`
