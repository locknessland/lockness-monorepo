/**
 * @fileoverview Controller Discovery Module
 *
 * Provides automatic discovery and loading of controller classes from a directory.
 * Scans TypeScript/JavaScript files and identifies classes decorated with `@Controller`.
 *
 * This module is used internally by the `App` class during initialization
 * when `controllersDir` is specified in the config.
 *
 * @module @lockness/core/controller_discovery
 *
 * @example
 * ```typescript
 * const discovery = new ControllerDiscovery()
 * const controllers = await discovery.discover('./app/controller')
 * // Returns: [UserController, ProductController, ...]
 * ```
 */

import { join } from 'node:path'
import type { ControllerClass } from '../types.ts'

/** Supported file extensions for controller files */
const CONTROLLER_EXTENSIONS = ['.ts', '.js', '.tsx'] as const

/**
 * Handles automatic discovery and loading of controller classes from a directory.
 *
 * Scans TypeScript/JavaScript files and identifies classes decorated with `@Controller`.
 * Uses dynamic imports to load each file and extracts exported controller classes.
 *
 * @example
 * ```typescript
 * const discovery = new ControllerDiscovery()
 * const controllers = await discovery.discover('./app/controller')
 *
 * // Use discovered controllers
 * await app.init({ controllers })
 * ```
 */
export class ControllerDiscovery {
    /**
     * Discovers all controller classes in a directory.
     *
     * Recursively scans the specified directory for TypeScript/JavaScript files,
     * dynamically imports each file, and extracts classes that have been decorated
     * with the `@Controller` decorator (identified by the `_basePath` property).
     *
     * @param dirPath - Path to the directory containing controllers (relative or absolute)
     * @returns Promise resolving to an array of discovered controller classes
     *
     * @example Relative path
     * ```typescript
     * const controllers = await discovery.discover('./app/controller')
     * ```
     *
     * @example Absolute path
     * ```typescript
     * const controllers = await discovery.discover('/home/user/project/app/controller')
     * ```
     *
     * @remarks
     * - Files must export classes decorated with `@Controller`
     * - Supports `.ts`, `.js`, and `.tsx` file extensions
     * - Silently skips files that fail to load
     * - Returns empty array if directory doesn't exist
     */
    async discover(dirPath: string): Promise<ControllerClass[]> {
        const controllers: ControllerClass[] = []
        const absolutePath = this.resolveAbsolutePath(dirPath)

        if (!absolutePath) {
            return []
        }

        try {
            for await (const entry of Deno.readDir(absolutePath)) {
                if (this.isControllerFile(entry)) {
                    const filePath = `file://${join(absolutePath, entry.name)}`
                    const fileControllers = await this.loadControllersFromFile(
                        filePath,
                    )
                    controllers.push(...fileControllers)
                }
            }
        } catch (error) {
            console.error(
                `❌ Error during controller discovery: ${
                    (error as Error).message
                }`,
            )
        }

        return controllers
    }

    /**
     * Resolves a directory path to an absolute path.
     *
     * Attempts to resolve using Deno.realPathSync first, then falls back
     * to joining with the current working directory.
     *
     * @param dirPath - Relative or absolute directory path
     * @returns Absolute path if valid directory, `null` otherwise
     *
     * @internal
     */
    private resolveAbsolutePath(dirPath: string): string | null {
        try {
            return Deno.realPathSync(dirPath)
        } catch {
            // If realPath fails, try using CWD + dirPath
            try {
                const absolutePath = join(Deno.cwd(), dirPath)
                // Test if it's a directory
                const info = Deno.statSync(absolutePath)
                if (!info.isDirectory) {
                    console.warn(
                        `⚠️ Controllers directory not found: ${dirPath}`,
                    )
                    return null
                }
                return absolutePath
            } catch {
                console.warn(`⚠️ Controllers directory not found: ${dirPath}`)
                return null
            }
        }
    }

    /**
     * Checks if a directory entry is a valid controller file.
     *
     * Valid controller files are regular files with `.ts`, `.js`, or `.tsx` extensions.
     *
     * @param entry - Directory entry to check
     * @returns `true` if the entry is a valid controller file
     *
     * @internal
     */
    private isControllerFile(entry: Deno.DirEntry): boolean {
        if (!entry.isFile) {
            return false
        }

        return CONTROLLER_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
    }

    /**
     * Loads all controller classes from a single file.
     *
     * Dynamically imports the file and scans all exports for classes
     * that have been decorated with `@Controller` (identified by `_basePath`).
     *
     * @param filePath - File URL (must start with `file://`)
     * @returns Promise resolving to an array of controller classes from the file
     *
     * @internal
     */
    private async loadControllersFromFile(
        filePath: string,
    ): Promise<ControllerClass[]> {
        const controllers: ControllerClass[] = []

        try {
            const module: Record<string, unknown> = await import(
                /* @vite-ignore */ filePath
            )

            for (const exportKey in module) {
                const exported = module[exportKey]
                if (this.isControllerClass(exported)) {
                    // TC39 decorators: addInitializer only runs on instance creation
                    // Create temporary instance to trigger metadata initialization
                    this.initializeControllerMetadata(exported)
                    controllers.push(exported)
                }
            }
        } catch (error) {
            console.error(
                `❌ Error loading controllers from ${filePath}: ${
                    (error as Error).message
                }`,
            )
        }

        return controllers
    }

    /**
     * Type guard to check if an exported value is a controller class.
     *
     * A controller class is identified by having the `_basePath` property,
     * which is set by the `@Controller` decorator.
     *
     * @param exported - Value to check
     * @returns `true` if the value is a controller class
     *
     * @internal
     */
    private isControllerClass(exported: unknown): exported is ControllerClass {
        return (
            typeof exported === 'function' &&
            '_basePath' in exported &&
            exported._basePath !== undefined
        )
    }

    /**
     * Initializes controller metadata by creating a temporary instance.
     *
     * This is necessary for TC39 decorators to run their initializers,
     * which populate the `_routes` array with route information.
     *
     * @param Controller - Controller class to initialize
     *
     * @remarks
     * Silently ignores errors during instantiation, as the controller
     * may have dependencies that can't be resolved during discovery.
     *
     * @internal
     */
    private initializeControllerMetadata(Controller: ControllerClass): void {
        // Only initialize if routes haven't been set yet
        if (!Controller._routes || Controller._routes.length === 0) {
            try {
                new Controller()
            } catch {
                // Ignore errors during temporary instantiation
                // The controller may have dependencies that can't be resolved here
            }
        }
    }
}
