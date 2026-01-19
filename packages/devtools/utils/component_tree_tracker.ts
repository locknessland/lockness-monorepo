/**
 * Component Tree Tracker
 * Tracks JSX component hierarchy during render for devtools visualization
 *
 * This works by instrumenting the JSX factory function to capture
 * component calls and build a tree structure.
 */

export interface ComponentNode {
    name: string
    file?: string
    props?: string[]
    children: ComponentNode[]
}

/**
 * AsyncLocalStorage-like context for tracking component trees per request
 * In Deno, we use a simple Map keyed by request ID since rendering is synchronous
 */
class ComponentTreeTracker {
    private trees = new Map<string, ComponentNode[]>()
    private stacks = new Map<string, ComponentNode[]>()
    private componentMap = new Map<string, string>()

    /**
     * Set the component name to file path mapping
     */
    setComponentMap(map: Map<string, string>) {
        this.componentMap = map
    }

    /**
     * Start tracking components for a request
     */
    startTracking(requestId: string) {
        this.trees.set(requestId, [])
        this.stacks.set(requestId, [])
    }

    /**
     * Record a component being rendered
     */
    pushComponent(
        requestId: string,
        name: string,
        props?: Record<string, unknown>,
    ) {
        const tree = this.trees.get(requestId)
        const stack = this.stacks.get(requestId)

        if (!tree || !stack) return

        const node: ComponentNode = {
            name,
            file: this.componentMap.get(name),
            props: props
                ? Object.keys(props).filter((k) => k !== 'children')
                : undefined,
            children: [],
        }

        if (stack.length === 0) {
            // Root component
            tree.push(node)
        } else {
            // Child component - add to parent's children
            const parent = stack[stack.length - 1]
            parent.children.push(node)
        }

        stack.push(node)
    }

    /**
     * Mark current component as finished rendering
     */
    popComponent(requestId: string) {
        const stack = this.stacks.get(requestId)
        if (stack) {
            stack.pop()
        }
    }

    /**
     * Get the component tree for a request
     */
    getTree(requestId: string): ComponentNode[] {
        return this.trees.get(requestId) || []
    }

    /**
     * Stop tracking and cleanup
     */
    stopTracking(requestId: string): ComponentNode[] {
        const tree = this.trees.get(requestId) || []
        this.trees.delete(requestId)
        this.stacks.delete(requestId)
        return tree
    }

    /**
     * Serialize tree to a flat displayable format
     */
    static serializeTree(
        nodes: ComponentNode[],
        depth = 0,
    ): string[] {
        const lines: string[] = []
        for (const node of nodes) {
            const indent = '  '.repeat(depth)
            const prefix = depth > 0 ? '├─ ' : ''
            const propsStr = node.props?.length
                ? ` (${node.props.join(', ')})`
                : ''
            lines.push(`${indent}${prefix}<${node.name}${propsStr} />`)
            if (node.children.length > 0) {
                lines.push(
                    ...ComponentTreeTracker.serializeTree(
                        node.children,
                        depth + 1,
                    ),
                )
            }
        }
        return lines
    }

    /**
     * Serialize tree to JSON-compatible format
     */
    static toJSON(nodes: ComponentNode[]): ComponentNode[] {
        return nodes.map((node) => ({
            name: node.name,
            file: node.file,
            props: node.props,
            children: ComponentTreeTracker.toJSON(node.children),
        }))
    }
}

// Singleton instance
export const componentTreeTracker = new ComponentTreeTracker()

/**
 * Create a wrapped JSX factory that tracks component rendering
 * This should wrap Hono's jsx function
 */
export function createTrackedJsx(
    // deno-lint-ignore no-explicit-any
    originalJsx: any,
    requestIdGetter: () => string | undefined,
    // deno-lint-ignore no-explicit-any
): any {
    // deno-lint-ignore no-explicit-any
    return function trackedJsx(
        type: unknown,
        props: unknown,
        ...children: unknown[]
    ) {
        const requestId = requestIdGetter()

        // Only track function components (not HTML elements)
        if (
            requestId && typeof type === 'function' &&
            (type as { name?: string }).name
        ) {
            componentTreeTracker.pushComponent(
                requestId,
                (type as { name: string }).name,
                props as Record<string, unknown>,
            )

            try {
                const result = originalJsx(type, props, ...children)
                return result
            } finally {
                componentTreeTracker.popComponent(requestId)
            }
        }

        return originalJsx(type, props, ...children)
    }
}
