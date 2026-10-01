import type { ErrorHandler } from '../types.ts'
import { defaultErrorHandler } from './default_view.ts'
import { renderError, safeForLog } from '../logging/sanitize.ts'
import { importAppFile } from '@lockness/contract'
import { resolve } from '@std/path'

/**
 * Manages error handler auto-discovery and registration.
 * Attempts to load a custom error handler from the app directory,
 * falling back to the default error handler if not found.
 */
export class ErrorHandlerRegistry {
    private customHandlerPath = 'app/view/pages/errors/error_handler.tsx'

    /**
     * Discover and load an error handler.
     * Priority: provided handler > custom handler in app > default handler
     *
     * @param providedHandler - Optional error handler provided by the user
     * @returns A resolved error handler function
     *
     * @example
     * const registry = new ErrorHandlerRegistry()
     * const handler = await registry.discover()
     *
     * // Or with a custom handler
     * const handler = await registry.discover(myCustomHandler)
     */
    async discover(providedHandler?: ErrorHandler): Promise<ErrorHandler> {
        // If a handler is explicitly provided, use it
        if (providedHandler) {
            return providedHandler
        }

        // Try to auto-discover custom error handler
        const customHandler = await this.loadCustomHandler()
        if (customHandler) {
            console.log('  ✨ Using custom error handler')
            return customHandler
        }

        // Fall back to default error handler
        return defaultErrorHandler
    }

    /**
     * Attempt to load the custom error handler from the app directory.
     *
     * An absent file is the normal case and stays quiet. A file that exists
     * but cannot be used is a fault in the app, and is reported (#473): left
     * silent, a syntax error or a bad import makes the app lose its error
     * pages with nothing pointing at the file. Every failure still falls back
     * to the default pages — a broken handler never blocks boot.
     *
     * @returns The handler, or `null` when the default one should be used.
     */
    private async loadCustomHandler(): Promise<ErrorHandler | null> {
        // The path as the app knows it, never the absolute one, and encoded:
        // it is what the developer needs, and no more of the machine than that.
        const shown = safeForLog(this.customHandlerPath)
        try {
            await Deno.stat(resolve(this.customHandlerPath))
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) return null
            console.warn(
                `⚠️  Custom error handler ${shown} could not be read, so the default error pages are used: ${
                    renderError(error)
                }`,
            )
            return null
        }

        let module: Record<string, unknown>
        try {
            // Anchored at the app root, never at core: from JSR, a bare path
            // resolves against the registry URL and the handler never loads
            // (#474).
            module = await importAppFile(this.customHandlerPath)
        } catch (error) {
            console.error(
                `❌ Custom error handler ${shown} failed to import, so the default error pages are used: ${
                    renderError(error)
                }`,
            )
            return null
        }

        if (typeof module.errorHandler !== 'function') {
            console.warn(
                `⚠️  Custom error handler ${shown} has no \`errorHandler\` function export, so the default error pages are used`,
            )
            return null
        }
        return module.errorHandler as ErrorHandler
    }

    /**
     * Set custom handler path (useful for testing or non-standard setups)
     */
    setCustomHandlerPath(path: string): void {
        this.customHandlerPath = path
    }
}
