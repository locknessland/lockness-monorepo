// deno-lint-ignore-file no-explicit-any
import { join } from 'node:path'
import type { ControllerClass } from './types.ts'

/**
 * Handles automatic discovery and loading of controller classes from a directory.
 * Scans TypeScript/JavaScript files and identifies classes decorated with @Controller.
 */
export class ControllerDiscovery {
    /**
     * Discover all controllers in a directory
     *
     * @param dirPath - Path to the directory containing controllers (relative or absolute)
     * @returns Array of discovered controller classes
     *
     * @example
     * const discovery = new ControllerDiscovery()
     * const controllers = await discovery.discover('./app/controller')
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
     * Resolve a directory path to an absolute path
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
     * Check if a file is a controller file (TypeScript/JavaScript)
     */
    private isControllerFile(entry: Deno.DirEntry): boolean {
        return (
            entry.isFile &&
            (entry.name.endsWith('.ts') ||
                entry.name.endsWith('.js') ||
                entry.name.endsWith('.tsx'))
        )
    }

    /**
     * Load all controller classes from a single file
     */
    private async loadControllersFromFile(
        filePath: string,
    ): Promise<ControllerClass[]> {
        const controllers: ControllerClass[] = []

        try {
            const module = await import(/* @vite-ignore */ filePath)

            for (const exportKey in module) {
                const Exported = module[exportKey]
                if (this.isControllerClass(Exported)) {
                    // TC39 decorators: addInitializer only runs on instance creation
                    // Create temporary instance to trigger metadata initialization
                    this.initializeControllerMetadata(Exported)
                    controllers.push(Exported as ControllerClass)
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
     * Check if an exported value is a controller class
     */
    private isControllerClass(exported: any): boolean {
        return (
            typeof exported === 'function' &&
            exported._basePath !== undefined
        )
    }

    /**
     * Initialize controller metadata by creating a temporary instance
     * This is necessary for TC39 decorators to run their initializers
     */
    private initializeControllerMetadata(Controller: any): void {
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
