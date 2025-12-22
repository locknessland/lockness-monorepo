import { dirname, fromFileUrl, join } from '@std/path'

export class Stub {
    private static getStubsDir(): string {
        const currentFile = fromFileUrl(import.meta.url)
        return join(dirname(currentFile), 'stubs')
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
        const stubPath = join(baseDir, type, `${name}.stub`)
        try {
            let content = await Deno.readTextFile(stubPath)
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
        const stubPath = join(this.getStubsDir(), type, `${name}.stub`)

        try {
            let content = await Deno.readTextFile(stubPath)

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
     * Scaffolds a whole directory structure from stubs.
     * Useful for initializing a new project.
     */
    static async scaffold(
        type: string,
        targetDir: string,
        data: Record<string, string> = {},
    ) {
        const sourceDir = join(this.getStubsDir(), type)

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
}
