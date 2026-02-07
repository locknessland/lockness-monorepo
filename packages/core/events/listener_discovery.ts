/**
 * @fileoverview Listener discovery for auto-registering event listeners.
 *
 * Scans a directory for listener classes and automatically registers
 * their @Listener decorated methods with the event dispatcher.
 *
 * @module @lockness/core/events/listener_discovery
 */

import { join } from '@std/path'
import { container } from '@lockness/container'
import {
    dispatcher,
    getListenerMetadata,
    type ListenerMetadata,
} from '@lockness/events'

/**
 * Type for listener class constructors
 */
// deno-lint-ignore no-explicit-any
export type ListenerClass = new (...args: any[]) => any

/**
 * Register explicit listener classes with the event dispatcher.
 *
 * Instantiates each listener class via the DI container and registers
 * their @Listener decorated methods with the event dispatcher.
 *
 * @param listenerClasses - Array of listener class constructors
 * @returns Number of listener methods registered
 *
 * @example
 * ```typescript
 * import { DevtoolsListener } from '@lockness/devtools'
 *
 * registerListeners([DevtoolsListener])
 * ```
 */
export function registerListeners(listenerClasses: ListenerClass[]): number {
    let registeredCount = 0

    for (const listenerClass of listenerClasses) {
        const metadata = getListenerMetadata(listenerClass)

        if (metadata.length > 0) {
            // Instantiate via DI container
            const listenerInstance = container.get(listenerClass)

            // Register each listener method
            metadata.forEach((meta: ListenerMetadata) => {
                const method = (
                    listenerInstance as Record<string | symbol, unknown>
                )[meta.methodName]
                if (typeof method === 'function') {
                    dispatcher().on(
                        meta.eventClass,
                        method.bind(listenerInstance),
                        meta.options,
                    )
                    registeredCount++
                }
            })
        }
    }

    return registeredCount
}

/**
 * Discover and register all listeners from a directory.
 *
 * Scans the specified directory for TypeScript files, imports them,
 * finds classes with @Listener decorated methods, instantiates them
 * via the DI container, and registers their listeners with the event dispatcher.
 *
 * @param listenersDir - Path to the listeners directory (e.g., './app/listener')
 * @returns Promise that resolves when all listeners are registered
 *
 * @example
 * ```typescript
 * await discoverListeners('./app/listener')
 * ```
 *
 * @internal
 */
export async function discoverListeners(listenersDir: string): Promise<void> {
    try {
        // Resolve absolute path
        const absolutePath = join(Deno.cwd(), listenersDir)

        // Recursively find all .ts files in the directory
        const files: string[] = []
        for await (const entry of Deno.readDir(absolutePath)) {
            if (entry.isFile && entry.name.endsWith('.ts')) {
                files.push(join(absolutePath, entry.name))
            } else if (entry.isDirectory) {
                // Recursively scan subdirectories
                const subFiles = await scanDirectory(
                    join(absolutePath, entry.name),
                )
                files.push(...subFiles)
            }
        }

        // Import all listener files
        const modules = await Promise.all(
            files.map((file) => {
                const fileUrl = new URL(`file://${file}`)
                return import(fileUrl.href)
            }),
        )

        // Extract listener classes and register them
        let registeredCount = 0

        for (const module of modules) {
            for (const exportedValue of Object.values(module)) {
                if (typeof exportedValue === 'function') {
                    // Check if this class has listener metadata
                    const metadata = getListenerMetadata(exportedValue)

                    if (metadata.length > 0) {
                        // This is a listener class - instantiate via DI
                        // Cast to constructor type for container.get()
                        const listenerInstance = container.get(
                            exportedValue as new (
                                ...args: unknown[]
                            ) => unknown,
                        )

                        // Register each listener method
                        metadata.forEach((meta: ListenerMetadata) => {
                            const method = (listenerInstance as any)[
                                meta.methodName
                            ]
                            if (typeof method === 'function') {
                                dispatcher().on(
                                    meta.eventClass,
                                    method.bind(listenerInstance),
                                    meta.options,
                                )
                                registeredCount++
                            }
                        })
                    }
                }
            }
        }

        if (registeredCount > 0) {
            console.log(
                `✓ Registered ${registeredCount} event listener(s) from ${listenersDir}`,
            )
        }
    } catch (error) {
        // Directory doesn't exist - this is fine, listeners are optional
        if (error instanceof Deno.errors.NotFound) {
            return
        }
        // Re-throw other errors
        throw error
    }
}

/**
 * Recursively scan a directory for TypeScript files
 *
 * @param dirPath - Directory path to scan
 * @returns Array of absolute file paths
 * @internal
 */
async function scanDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = []

    try {
        for await (const entry of Deno.readDir(dirPath)) {
            if (entry.isFile && entry.name.endsWith('.ts')) {
                files.push(join(dirPath, entry.name))
            } else if (entry.isDirectory) {
                const subFiles = await scanDirectory(join(dirPath, entry.name))
                files.push(...subFiles)
            }
        }
    } catch (error) {
        // Ignore permission errors and not found errors
        if (
            !(error instanceof Deno.errors.NotFound) &&
            !(error instanceof Deno.errors.PermissionDenied)
        ) {
            throw error
        }
    }

    return files
}
