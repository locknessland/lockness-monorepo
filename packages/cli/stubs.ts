/**
 * @fileoverview Stub template rendering and scaffolding utilities.
 *
 * Provides tools for loading stub templates and replacing placeholders
 * with dynamic values. Supports both local filesystem and remote URLs (JSR).
 *
 * @module @lockness/cli/stubs
 *
 * @example
 * ```ts
 * import { Stub } from '@lockness/cli'
 *
 * const content = await Stub.render('make', 'controller', {
 *   className: 'UserController',
 *   route: 'users'
 * })
 * ```
 */

import { dirname, fromFileUrl, join } from '@std/path'

/**
 * Stub template data for placeholder replacement.
 */
export type StubData = Record<string, string>

/**
 * Stub template rendering and scaffolding utility class.
 *
 * Supports loading templates from both local filesystem and remote URLs,
 * with placeholder replacement using `{{ key }}` syntax.
 */
export class Stub {
    /**
     * Get the path to the stubs directory.
     * @returns Path or URL to stubs directory
     * @internal
     */
    private static getStubsDir(): string {
        // Handle both local file:// and remote https:// URLs
        if (import.meta.url.startsWith('file://')) {
            const currentFile = fromFileUrl(import.meta.url)
            return join(dirname(currentFile), 'stubs')
        } else {
            // When running from JSR, use relative import
            return new URL('./stubs', import.meta.url).href
        }
    }

    /**
     * Render a stub file from a specific base directory.
     *
     * @param baseDir - Base directory path or URL containing stub folders
     * @param type - The stub category (e.g., 'make', 'auth')
     * @param name - The stub name without extension (e.g., 'controller')
     * @param data - Key-value pairs for `{{ key }}` placeholder replacement
     * @returns The rendered stub content
     * @throws {Error} When stub file cannot be found or fetched
     *
     * @example
     * ```ts
     * const content = await Stub.renderFrom(
     *   '/path/to/stubs',
     *   'make',
     *   'controller',
     *   { className: 'User' }
     * )
     * ```
     */
    static async renderFrom(
        baseDir: string,
        type: string,
        name: string,
        data: StubData = {},
    ): Promise<string> {
        const stubPath = baseDir.startsWith('http')
            ? `${baseDir}/${type}/${name}.stub`
            : join(baseDir, type, `${name}.stub`)

        try {
            let content: string
            if (stubPath.startsWith('http')) {
                // Fetch from remote URL (JSR)
                const response = await fetch(stubPath)
                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}: ${response.statusText}`,
                    )
                }
                content = await response.text()
            } else {
                // Read from local filesystem
                content = await Deno.readTextFile(stubPath)
            }

            for (const [key, value] of Object.entries(data)) {
                const regex = new RegExp(`{{ ${key} }}`, 'g')
                content = content.replace(regex, value)
            }
            return content
        } catch (error) {
            throw new Error(
                `Could not find stub at ${stubPath}: ${(error as Error).message
                }`,
            )
        }
    }

    /**
     * Render a stub file from the default stubs directory.
     *
     * @param type - The stub category (e.g., 'make', 'auth', 'nessy')
     * @param name - The stub name without extension (e.g., 'controller')
     * @param data - Key-value pairs for `{{ key }}` placeholder replacement
     * @returns The rendered stub content
     * @throws {Error} When stub file cannot be found
     *
     * @example
     * ```ts
     * const content = await Stub.render('make', 'controller', {
     *   className: 'UserController',
     *   route: 'users'
     * })
     * ```
     */
    static async render(
        type: string,
        name: string,
        data: StubData = {},
    ): Promise<string> {
        const stubsDir = this.getStubsDir()
        const stubPath = stubsDir.startsWith('http')
            ? `${stubsDir}/${type}/${name}.stub`
            : join(stubsDir, type, `${name}.stub`)

        try {
            let content: string
            if (stubPath.startsWith('http')) {
                // Fetch from remote URL (JSR)
                const response = await fetch(stubPath)
                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}: ${response.statusText}`,
                    )
                }
                content = await response.text()
            } else {
                // Read from local filesystem
                content = await Deno.readTextFile(stubPath)
            }

            for (const [key, value] of Object.entries(data)) {
                const regex = new RegExp(`{{ ${key} }}`, 'g')
                content = content.replace(regex, value)
            }

            return content
        } catch (error) {
            throw new Error(
                `Could not find stub at ${stubPath}: ${(error as Error).message
                }`,
            )
        }
    }

    /**
     * Scaffold a directory structure from stubs in a custom directory.
     *
     * Recursively copies and processes all stub files from source to target,
     * replacing placeholders and removing `.stub` extensions.
     *
     * @param sourceDir - Source directory path or URL containing stubs
     * @param targetDir - Target directory path to create files in
     * @param data - Key-value pairs for placeholder replacement
     * @param fileList - Required for remote URLs: explicit list of files to fetch
     * @throws {Error} When scaffolding from URL without fileList
     *
     * @example
     * ```ts
     * await Stub.scaffoldFrom(
     *   '/path/to/stubs/init',
     *   './my-project',
     *   { projectName: 'my-app' },
     *   ['main.ts.stub', 'deno.json.stub']
     * )
     * ```
     */
    static async scaffoldFrom(
        sourceDir: string,
        targetDir: string,
        data: StubData = {},
        fileList?: ReadonlyArray<string>,
    ): Promise<void> {
        // For remote URLs, we need an explicit file list
        if (sourceDir.startsWith('http')) {
            if (!fileList || fileList.length === 0) {
                throw new Error(
                    'When scaffolding from a remote URL, you must provide a fileList array',
                )
            }

            await Deno.mkdir(targetDir, { recursive: true })

            for (const file of fileList) {
                const sourceUrl = `${sourceDir}/${file}`
                const targetPath = join(targetDir, file.replace('.stub', ''))

                try {
                    const response = await fetch(sourceUrl)
                    if (!response.ok) {
                        console.warn(
                            `⚠️  Could not fetch ${file}: ${response.status}`,
                        )
                        continue
                    }

                    let content = await response.text()
                    for (const [key, value] of Object.entries(data)) {
                        const regex = new RegExp(`{{ ${key} }}`, 'g')
                        content = content.replace(regex, value)
                    }

                    await Deno.mkdir(dirname(targetPath), { recursive: true })
                    await Deno.writeTextFile(targetPath, content)
                } catch (error) {
                    console.warn(
                        `⚠️  Could not process ${file}: ${(error as Error).message
                        }`,
                    )
                }
            }

            return
        }

        // Local filesystem scaffolding
        const walk = async (currentSource: string, currentTarget: string) => {
            const entries = []
            for await (const entry of Deno.readDir(currentSource)) {
                entries.push(entry)
            }

            for (const entry of entries) {
                const sourcePath = join(currentSource, entry.name)
                const targetPath = join(
                    currentTarget,
                    entry.name.replace('.stub', ''),
                )

                if (entry.isDirectory) {
                    await Deno.mkdir(targetPath, { recursive: true })
                    await walk(sourcePath, targetPath)
                } else if (entry.isFile) {
                    let content = await Deno.readTextFile(sourcePath)
                    for (const [key, value] of Object.entries(data)) {
                        const regex = new RegExp(`{{ ${key} }}`, 'g')
                        content = content.replace(regex, value)
                    }
                    await Deno.mkdir(dirname(targetPath), { recursive: true })
                    await Deno.writeTextFile(targetPath, content)
                }
            }
        }

        await Deno.mkdir(targetDir, { recursive: true })
        await walk(sourceDir, targetDir)
    }

    /**
     * Scaffold a directory structure from the default stubs directory.
     *
     * Useful for initializing a new project with template files.
     *
     * @param type - The stub category containing the files
     * @param targetDir - Target directory path to create files in
     * @param data - Key-value pairs for placeholder replacement
     *
     * @example
     * ```ts
     * await Stub.scaffold('init', './my-project', {
     *   projectName: 'my-app',
     *   author: 'John Doe'
     * })
     * ```
     */
    static async scaffold(
        type: string,
        targetDir: string,
        data: StubData = {},
    ): Promise<void> {
        const sourceDir = join(this.getStubsDir(), type)
        await this.scaffoldFrom(sourceDir, targetDir, data)
    }
}
