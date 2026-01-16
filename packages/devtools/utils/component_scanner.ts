import { walk } from '@std/fs'
import { join, relative } from '@std/path'

export class ComponentScanner {
    private static SCAN_DIR = 'app/view'
    private components = new Map<string, string>()

    async scan() {
        try {
            const cwd = Deno.cwd()
            const viewDir = join(cwd, ComponentScanner.SCAN_DIR)

            for await (
                const entry of walk(viewDir, {
                    includeDirs: false,
                    exts: ['.tsx'],
                })
            ) {
                const content = await Deno.readTextFile(entry.path)
                this.extractComponents(content, entry.path, cwd)
            }
        } catch (e) {
            console.warn('[Devtools] Failed to scan components:', e)
        }
    }

    private extractComponents(content: string, filePath: string, cwd: string) {
        const relativePath = relative(cwd, filePath)
        // const fileName = relativePath.split('/').pop() || ''

        // Match export const Name = ... or export function Name ... or export class Name ...
        const simpleRegex = /export\s+(?:const|function|class)\s+(\w+)/g
        let match

        while ((match = simpleRegex.exec(content)) !== null) {
            const componentName = match[1]
            this.components.set(componentName, relativePath)
        }

        // Also handle default export
        // export default function Home() ... or export default class Home ...
        const defaultRegex = /export\s+default\s+(?:function|class)\s+(\w+)/
        const defaultMatch = defaultRegex.exec(content)
        if (defaultMatch) {
            this.components.set(defaultMatch[1], relativePath)
        }
    }

    getComponentFile(name: string): string | undefined {
        return this.components.get(name)
    }
}
