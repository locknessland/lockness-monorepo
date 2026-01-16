/**
 * @lockness/ui - Component exports for direct usage
 *
 * Use this for quick prototyping or testing. For production,
 * consider using the CLI to copy components into your project:
 *
 * ```bash
 * deno run -A jsr:@lockness/ui add button card
 * ```
 *
 * @module
 */

// Utility
export { cn } from './lib/utils.ts'

// Components
export { Button } from './components/Button.tsx'
export {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from './components/Card.tsx'
export { RootLayout } from './components/RootLayout.tsx'
