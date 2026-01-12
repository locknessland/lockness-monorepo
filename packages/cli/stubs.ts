import { dirname, fromFileUrl, join } from '@std/path'

export class Stub {
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
     * Renders a stub file from a specific base directory.
     */
    static async renderFrom(
        baseDir: string,
        type: string,
        name: string,
        data: Record<string, string> = {},
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
                `Could not find stub at ${stubPath}: ${
                    (error as Error).message
                }`,
            )
        }
    }

    /**
     * Renders a stub file with the provided data.
     * @param type - The category (e.g., 'make', 'init')
     * @param name - The name of the stub (e.g., 'controller')
     * @param data - Key-value pairs matching {{ key }} in the stub
     */
    static async render(
        type: string,
        name: string,
        data: Record<string, string> = {},
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
                `Could not find stub at ${stubPath}: ${
                    (error as Error).message
                }`,
            )
        }
    }

    /**
     * Scaffolds a whole directory structure from stubs in a custom directory.
     */
    static async scaffoldFrom(
        sourceDir: string,
        targetDir: string,
        data: Record<string, string> = {},
        fileList?: string[],
    ) {
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
                        `⚠️  Could not process ${file}: ${
                            (error as Error).message
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
     * Scaffolds a whole directory structure from stubs.
     * Useful for initializing a new project.
     */
    static async scaffold(
        type: string,
        targetDir: string,
        data: Record<string, string> = {},
    ) {
        const sourceDir = join(this.getStubsDir(), type)
        await this.scaffoldFrom(sourceDir, targetDir, data)
    }
}
