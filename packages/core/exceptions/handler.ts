import type { ErrorHandler } from '../types.ts'

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
        return await this.loadDefaultHandler()
    }

    /**
     * Attempt to load custom error handler from the app directory
     */
    private async loadCustomHandler(): Promise<ErrorHandler | null> {
        try {
            // Use absolute path from CWD for compiled binaries compatibility
            const cwd = Deno.cwd()
            const customErrorHandlerPath = `${cwd}/${this.customHandlerPath}`

            // Check if file exists before trying to import
            try {
                await Deno.stat(customErrorHandlerPath)
                const customHandler = await import(customErrorHandlerPath)
                if (customHandler.errorHandler) {
                    return customHandler.errorHandler
                }
            } catch {
                // File doesn't exist or can't be imported
                return null
            }
        } catch {
            // Any other error in the process
            return null
        }

        return null
    }

    /**
     * Load the default error handler
     */
    private async loadDefaultHandler(): Promise<ErrorHandler> {
        const { defaultErrorHandler } = await import(
            './default_view.tsx'
        )
        return defaultErrorHandler
    }

    /**
     * Set custom handler path (useful for testing or non-standard setups)
     */
    setCustomHandlerPath(path: string): void {
        this.customHandlerPath = path
    }
}
