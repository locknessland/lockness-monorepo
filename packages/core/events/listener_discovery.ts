/**
 * @fileoverview Listener discovery for auto-registering event listeners.
 *
 * Scans a directory for listener classes and automatically registers
 * their @Listener decorated methods with the event dispatcher.
 *
 * @module @lockness/core/events/listener_discovery
 */

import { join } from '@std/path'
import { renderError, safeForLog } from '@lockness/contract'
import { importAppFile } from '@lockness/contract/app-file/internal'
import { shownPath } from '../logging/shown_path.ts'
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
 * A listener file that could not be loaded — it does not resolve, compile or
 * link, or it threw while it evaluated.
 *
 * Raised by {@link discoverListeners}, and so by the listeners boot step,
 * which refuses the boot with it: a dropped listener is event-driven behaviour
 * that silently stops, an audit or lockout handler among them (#518).
 *
 * The message carries the original failure rendered through `renderError`,
 * and there is no `cause`. An uncaught boot error is printed through
 * `Deno.inspect`, which prints a cause raw — and a module that throws while it
 * evaluates can put a credential in it (#478).
 *
 * @example
 * ```typescript
 * try {
 *     await discoverListeners('./app/listener')
 * } catch (error) {
 *     if (error instanceof ListenerLoadError) console.error(error.file)
 *     throw error
 * }
 * ```
 */
export class ListenerLoadError extends Error {
    /** The failing file: relative to the working directory when under it. */
    readonly file: string

    /**
     * @param file - The listener file's absolute path.
     * @param error - What importing it threw.
     */
    constructor(file: string, error: unknown) {
        const shown = shownPath(file)
        super(
            `Listener file "${
                safeForLog(shown)
            }" could not be loaded, so no listener was registered: ${
                renderError(error)
            }`,
        )
        this.name = 'ListenerLoadError'
        this.file = shown
    }
}

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
        // Instantiate via DI container first
        // TC39 Stage 3 decorators populate metadata during instantiation
        const listenerInstance = container.get(listenerClass)

        // Now check for metadata (populated during instantiation)
        const metadata = getListenerMetadata(listenerClass)

        if (metadata.length > 0) {
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
 * Nothing registers unless every file loads: the files are imported first,
 * then registered.
 *
 * @param listenersDir - Path to the listeners directory (e.g., './app/listener')
 * @returns Promise that resolves when all listeners are registered
 * @throws {Deno.errors.NotFound} If the directory does not exist. The caller
 * decides whether that is an error — a project with no listeners legitimately
 * has no directory.
 * @throws {ListenerLoadError} If a listener file fails to import, compile or
 * evaluate. The message names the file.
 * @throws Whatever else reading the directory throws, untouched.
 *
 * @example
 * ```typescript
 * await discoverListeners('./app/listener')
 * ```
 *
 * @internal
 */
export async function discoverListeners(listenersDir: string): Promise<void> {
    const absolutePath = join(Deno.cwd(), listenersDir)

    // An absent directory throws Deno.errors.NotFound from here, before any
    // import runs — so the caller can tell "no listeners" from "a broken one".
    const files = await scanDirectory(absolutePath)

    // Each failure is wrapped where the file is still known. Unwrapped, the
    // runtime's error names the file only sometimes, and a module that throws
    // Deno.errors.NotFound while it evaluates would pass for an absent
    // directory and be dropped in silence (#518).
    const modules = await Promise.all(
        files.map((file) =>
            importAppFile(file).catch((error: unknown) => {
                throw new ListenerLoadError(file, error)
            })
        ),
    )

    // Extract listener classes and register them
    // Note: TC39 Stage 3 decorators only populate metadata during instantiation,
    // so we must instantiate first, then check for metadata
    let registeredCount = 0

    for (const module of modules) {
        for (const exportedValue of Object.values(module)) {
            if (typeof exportedValue === 'function') {
                try {
                    // Instantiate via DI container first
                    // This triggers @Listener decorator's addInitializer
                    // Cast to constructor type for container.get()
                    const listenerInstance = container.get(
                        exportedValue as new (
                            ...args: unknown[]
                        ) => unknown,
                    )

                    // Now check for metadata (populated during instantiation)
                    const metadata = getListenerMetadata(exportedValue)

                    if (metadata.length > 0) {
                        // Register each listener method
                        metadata.forEach((meta: ListenerMetadata) => {
                            const method = (
                                listenerInstance as Record<
                                    string | symbol,
                                    unknown
                                >
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
                } catch {
                    // Skip non-instantiable exports (interfaces, types, etc.)
                    continue
                }
            }
        }
    }

    if (registeredCount > 0) {
        console.log(
            `✓ Registered ${registeredCount} event listener(s) from ${listenersDir}`,
        )
    }
}

/**
 * Recursively scan a directory for TypeScript files.
 *
 * Nothing is tolerated here. A subdirectory that cannot be read is listeners
 * the author believes are registered and are not, so it fails like the root
 * does; whether an absent root is fine is the caller's decision.
 *
 * @param dirPath - Directory path to scan
 * @returns Array of absolute file paths
 * @throws {Deno.errors.NotFound} If `dirPath` does not exist.
 * @throws Whatever else `Deno.readDir` throws, untouched.
 * @internal
 */
async function scanDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = []

    for await (const entry of Deno.readDir(dirPath)) {
        if (entry.isFile && entry.name.endsWith('.ts')) {
            files.push(join(dirPath, entry.name))
        } else if (entry.isDirectory) {
            files.push(...await scanDirectory(join(dirPath, entry.name)))
        }
    }

    return files
}
