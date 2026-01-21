/**
 * @fileoverview Component dependency analyzer for TSX files.
 *
 * Performs static analysis on TSX files to build component dependency trees.
 * This enables visualization of component hierarchies in the devtools dashboard.
 *
 * @module @lockness/devtools/utils/component_dependency_analyzer
 *
 * @example
 * ```typescript
 * const analyzer = new ComponentDependencyAnalyzer()
 * await analyzer.scan()
 *
 * // Get the dependency tree for a component
 * const tree = analyzer.buildTree('UserProfile')
 * console.log(tree.children) // Child components used by UserProfile
 * ```
 */

import { walk } from '@std/fs'
import { dirname, join, relative, resolve } from '@std/path'

// =============================================================================
// Types
// =============================================================================

/**
 * Information about a scanned component.
 *
 * Contains metadata extracted from static analysis of the component's source.
 */
export interface ComponentInfo {
    /** The component name (e.g., 'UserProfile') */
    readonly name: string
    /** Relative path to the component file */
    readonly file: string
    /** Map of imported component names to their source paths */
    readonly imports: Map<string, string>
    /** Set of component names used in this component's JSX */
    readonly usedComponents: Set<string>
}

/**
 * A node in the component dependency tree.
 *
 * Used for visualizing component hierarchies.
 */
export interface ComponentTreeNode {
    /** The component name */
    readonly name: string
    /** The source file path (if known) */
    readonly file?: string
    /** Child components used by this component */
    readonly children: ComponentTreeNode[]
}

// =============================================================================
// Analyzer Class
// =============================================================================

// =============================================================================
// Analyzer Class
// =============================================================================

/**
 * Analyzes TSX files to build component dependency trees.
 *
 * The analyzer scans configured directories for TSX files and performs
 * static analysis to determine:
 * - Which components are exported from each file
 * - Which components are imported and used within other components
 *
 * This information is used to build dependency trees for visualization.
 *
 * @example
 * ```typescript
 * const analyzer = new ComponentDependencyAnalyzer()
 *
 * // Scan all TSX files in configured directories
 * await analyzer.scan()
 *
 * // Get a component name to file path mapping
 * const componentMap = analyzer.getComponentMap()
 *
 * // Build dependency tree for a component
 * const tree = analyzer.buildTree('Dashboard')
 * ```
 */
export class ComponentDependencyAnalyzer {
    /**
     * Directories to scan for components.
     * @internal
     */
    private static readonly SCAN_DIRS = ['app/view', 'packages/ui'] as const
    private components = new Map<string, ComponentInfo>()
    private fileToComponents = new Map<string, string[]>()
    private cwd = ''

    async scan() {
        try {
            this.cwd = Deno.cwd()

            for (const scanDir of ComponentDependencyAnalyzer.SCAN_DIRS) {
                const dir = join(this.cwd, scanDir)
                try {
                    for await (
                        const entry of walk(dir, {
                            includeDirs: false,
                            exts: ['.tsx'],
                        })
                    ) {
                        const content = await Deno.readTextFile(entry.path)
                        const relativePath = relative(this.cwd, entry.path)
                        this.analyzeFile(content, relativePath)
                    }
                } catch {
                    // Directory might not exist
                }
            }
        } catch (e) {
            console.warn('[Devtools] Failed to scan components:', e)
        }
    }

    private analyzeFile(content: string, filePath: string) {
        const componentsInFile: string[] = []

        // Extract imports with resolved file paths
        const imports = this.extractImports(content, filePath)

        // Extract exported components with their body ranges
        const exportedComponents = this.extractExportedComponentsWithBodies(
            content,
        )

        for (const { name, bodyStart, bodyEnd } of exportedComponents) {
            // Extract only the body of this component
            const componentBody = content.substring(bodyStart, bodyEnd)

            // Find JSX tags used in this specific component
            const usedComponents = this.extractUsedComponentsFromBody(
                componentBody,
                imports,
            )

            const info: ComponentInfo = {
                name,
                file: filePath,
                imports,
                usedComponents,
            }

            this.components.set(name, info)
            componentsInFile.push(name)
        }

        if (componentsInFile.length > 0) {
            this.fileToComponents.set(filePath, componentsInFile)
        }
    }

    private resolveImportPath(
        importSource: string,
        currentFile: string,
    ): string | undefined {
        // Handle alias @view -> app/view
        if (importSource.startsWith('@view/')) {
            return importSource.replace('@view/', 'app/view/')
        }

        // Handle alias @lockness/ui -> packages/ui
        if (importSource.startsWith('@lockness/ui')) {
            const rest = importSource.replace('@lockness/ui', '')
            if (rest === '' || rest === '/') {
                return 'packages/ui/mod.ts'
            }
            return `packages/ui${rest}`
        }

        // Handle relative paths
        if (importSource.startsWith('./') || importSource.startsWith('../')) {
            const currentDir = dirname(currentFile)
            const resolved = resolve(currentDir, importSource)
            // Make it relative to cwd
            return relative(this.cwd, resolve(this.cwd, resolved))
        }

        return undefined
    }

    private extractImports(
        content: string,
        currentFile: string,
    ): Map<string, string> {
        const imports = new Map<string, string>()

        // Match: import { Foo, Bar as Baz } from 'source'
        // Match: import Foo from 'source'
        const importRegex =
            /import\s+(?:(\w+)|{([^}]+)})\s+from\s+['"]([^'"]+)['"]/g
        let match

        while ((match = importRegex.exec(content)) !== null) {
            const defaultImport = match[1]
            const namedImports = match[2]
            const source = match[3]

            // Resolve the import path to a file path
            const resolvedPath = this.resolveImportPath(source, currentFile)

            if (defaultImport) {
                imports.set(defaultImport, resolvedPath || source)
            }

            if (namedImports) {
                const names = namedImports.split(',').map((s) => s.trim())
                for (const name of names) {
                    const parts = name.split(/\s+as\s+/)
                    const originalName = parts[0].trim()
                    const localName = parts[1]?.trim() || originalName
                    if (/^[A-Z]/.test(localName)) {
                        imports.set(localName, resolvedPath || source)
                    }
                }
            }
        }

        return imports
    }

    private extractExportedComponentsWithBodies(
        content: string,
    ): Array<{ name: string; bodyStart: number; bodyEnd: number }> {
        const components: Array<
            { name: string; bodyStart: number; bodyEnd: number }
        > = []

        // Match export const Name = (props) => { ... } or export const Name = ({ ... }) => { ... }
        // Also match export function Name(...) { ... }
        const patterns = [
            // Arrow function component: export const Name = (...) => { ... } or => (...)
            /export\s+const\s+([A-Z]\w*)\s*[=:][^=]*=>\s*(\{|\()/g,
            // Function component: export function Name(...) { ... }
            /export\s+function\s+([A-Z]\w*)\s*\([^)]*\)\s*\{/g,
        ]

        for (const pattern of patterns) {
            let match
            while ((match = pattern.exec(content)) !== null) {
                const name = match[1]
                const bodyStart = match.index + match[0].length - 1
                const bodyEnd = this.findMatchingBrace(content, bodyStart)

                if (bodyEnd > bodyStart) {
                    components.push({ name, bodyStart, bodyEnd })
                }
            }
        }

        return components
    }

    private findMatchingBrace(content: string, start: number): number {
        const openChar = content[start]
        const closeChar = openChar === '{' ? '}' : ')'
        let depth = 1
        let i = start + 1

        while (i < content.length && depth > 0) {
            const char = content[i]
            if (char === openChar) depth++
            else if (char === closeChar) depth--
            i++
        }

        return i
    }

    private extractUsedComponentsFromBody(
        body: string,
        imports: Map<string, string>,
    ): Set<string> {
        const used = new Set<string>()

        // Find JSX tags: <ComponentName or <ComponentName>
        const jsxTagRegex = /<([A-Z]\w*)[\s/>]/g
        let match

        while ((match = jsxTagRegex.exec(body)) !== null) {
            const tagName = match[1]
            // Only include if it's an imported component
            if (imports.has(tagName)) {
                used.add(tagName)
            }
        }

        return used
    }

    /**
     * Build a component tree starting from a root component
     */
    buildTree(
        rootComponentName: string,
        maxDepth = 5,
    ): ComponentTreeNode | null {
        const info = this.components.get(rootComponentName)
        if (!info) {
            return { name: rootComponentName, children: [] }
        }

        return this.buildTreeRecursive(
            rootComponentName,
            new Set(),
            0,
            maxDepth,
            undefined,
        )
    }

    private buildTreeRecursive(
        componentName: string,
        visited: Set<string>,
        depth: number,
        maxDepth: number,
        parentInfo?: ComponentInfo,
    ): ComponentTreeNode {
        const info = this.components.get(componentName)

        // Try to get file from parent's imports if component not in registry
        let file = info?.file
        if (!file && parentInfo) {
            const importPath = parentInfo.imports.get(componentName)
            if (importPath) {
                file = importPath
            }
        }

        const node: ComponentTreeNode = {
            name: componentName,
            file,
            children: [],
        }

        // Prevent infinite recursion and limit depth
        if (depth >= maxDepth || visited.has(componentName)) {
            return node
        }

        visited.add(componentName)

        if (info) {
            for (const childName of info.usedComponents) {
                if (childName !== componentName) {
                    const childNode = this.buildTreeRecursive(
                        childName,
                        new Set(visited),
                        depth + 1,
                        maxDepth,
                        info,
                    )
                    node.children.push(childNode)
                }
            }
        }

        return node
    }

    /**
     * Get component file path
     */
    getComponentFile(name: string): string | undefined {
        return this.components.get(name)?.file
    }

    /**
     * Get all components as a map (for backward compatibility)
     */
    getComponentMap(): Map<string, string> {
        const map = new Map<string, string>()
        for (const [name, info] of this.components) {
            map.set(name, info.file)
        }
        return map
    }

    /**
     * Serialize tree to display format
     */
    static serializeTree(node: ComponentTreeNode, depth = 0): string[] {
        const lines: string[] = []
        const indent = '  '.repeat(depth)
        const prefix = depth > 0 ? '├─ ' : ''

        lines.push(`${indent}${prefix}<${node.name} />`)

        for (const child of node.children) {
            lines.push(
                ...ComponentDependencyAnalyzer.serializeTree(child, depth + 1),
            )
        }

        return lines
    }

    /**
     * Convert tree to JSON-serializable format
     */
    static treeToJSON(
        node: ComponentTreeNode,
    ): { name: string; file?: string; children: unknown[] } {
        return {
            name: node.name,
            file: node.file,
            children: node.children.map((c) =>
                ComponentDependencyAnalyzer.treeToJSON(c)
            ),
        }
    }
}
