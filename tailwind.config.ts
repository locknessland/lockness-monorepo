import type { Config } from 'tailwindcss'

export default {
    content: [
        './app/**/*.{ts,tsx}',
        './lockness/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {},
    },
    plugins: [],
} satisfies Config
