import type { Config } from 'tailwindcss'

export default {
    content: [
        './src/**/*.{ts,tsx}',
        './lockness/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {},
    },
    plugins: [],
} satisfies Config
