import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
} from '../theme.ts'
import { CopyButton } from './CopyButton.tsx'

interface ComponentNode {
    name: string
    file?: string
    children: ComponentNode[]
}

export const MetadataCard = ({ selectedRequest }: { selectedRequest: any }) => {
    // Parse component info
    let componentName = selectedRequest.component
    let componentFile = ''

    if (componentName) {
        const sourceMatch = componentName.match(/_source="([^"]+)"/)
        if (sourceMatch) {
            componentFile = sourceMatch[1]
            componentName = componentName.replace(
                ` _source="${componentFile}"`,
                '',
            )
        }
    }

    // Extract just the component name without < and />
    const cleanComponentName = componentName?.replace(/<|\/>/g, '').trim()

    // Format action with parentheses if not already present
    const formattedAction =
        selectedRequest.action && !selectedRequest.action.includes('(')
            ? `${selectedRequest.action}()`
            : selectedRequest.action

    const cardStyles = {
        backgroundColor: colors.bg.secondary,
        border: `1px solid ${colors.border.default}`,
        borderRadius: borderRadius.lg,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
    }

    const headerStyles = {
        padding: `${spacing.lg} ${spacing.xl}`,
        borderBottom: `1px solid ${colors.border.default}`,
        backgroundColor: colors.bg.elevated,
    }

    const headerTitleStyles = {
        fontWeight: fontWeight.medium,
        color: colors.text.secondary,
        fontSize: fontSize.sm,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    }

    const contentStyles = {
        padding: spacing.xl,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.lg,
    }

    return (
        <div style={cardStyles as any}>
            <div style={headerStyles as any}>
                <h3 style={headerTitleStyles as any}>
                    Metadata
                </h3>
            </div>
            <div style={contentStyles as any}>
                <MetadataItem
                    label='Controller'
                    value={selectedRequest.controller}
                    color={colors.brand.indigo[300]}
                />
                <MetadataItem
                    label='Action'
                    value={formattedAction}
                    color={colors.brand.indigo[300]}
                />
                <MetadataItem
                    label='Route Name'
                    value={selectedRequest.routeName}
                    color={colors.text.muted}
                    italic
                />
                <MetadataItem
                    label='Component'
                    value={componentName}
                    color={colors.brand.purple[300]}
                />
                {componentFile && (
                    <MetadataItem
                        label='File'
                        value={componentFile}
                        color={colors.text.muted}
                    />
                )}
            </div>
            {cleanComponentName && (
                <ComponentTreeSection componentName={cleanComponentName} />
            )}
        </div>
    )
}

const MetadataItem = (
    { label, value, color, italic }: {
        label: string
        value?: string
        color: string
        italic?: boolean
    },
) => {
    const displayValue = value || '-'

    const labelStyles = {
        fontSize: '10px',
        fontWeight: fontWeight.bold,
        color: colors.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
    }

    const containerStyles = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: spacing.xs,
    }

    const valueStyles = {
        fontSize: fontSize.sm,
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        color,
        ...(italic && { fontStyle: 'italic' }),
    }

    return (
        <div>
            <span style={labelStyles as any}>
                {label}
            </span>
            <div style={containerStyles as any}>
                <p style={valueStyles as any}>
                    {displayValue}
                </p>
                {value && <CopyButton value={value} label={label} />}
            </div>
        </div>
    )
}
/**
 * Component Tree Section - Shows the component hierarchy
 * Fetches tree data via API and renders it
 */
const ComponentTreeSection = (
    { componentName }: { componentName: string },
) => {
    const sectionStyles = {
        borderTop: `1px solid ${colors.border.default}`,
        padding: spacing.xl,
    }

    const headerStyles = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    }

    const titleStyles = {
        fontSize: '10px',
        fontWeight: fontWeight.bold,
        color: colors.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
    }

    const treeContainerStyles = {
        backgroundColor: colors.bg.primary,
        border: `1px solid ${colors.border.light}`,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        maxHeight: '300px',
        overflowY: 'auto',
    }

    const loadingStyles = {
        color: colors.text.muted,
        fontSize: fontSize.sm,
        fontStyle: 'italic',
    }

    // Client-side script to fetch and render tree
    const scriptContent = `
        (function() {
            const container = document.getElementById('component-tree-${componentName}');
            if (!container) return;
            
            fetch('/_devtools/api/component-tree/${
        encodeURIComponent(componentName)
    }')
                .then(res => res.json())
                .then(tree => {
                    if (tree.error) {
                        container.innerHTML = '<span style="color: ${colors.text.muted}; font-style: italic;">Tree not available</span>';
                        return;
                    }
                    container.innerHTML = renderTree(tree, 0, true, '');
                })
                .catch(err => {
                    container.innerHTML = '<span style="color: ${colors.text.muted}; font-style: italic;">Failed to load tree</span>';
                });
            
            function copyToClipboard(text) {
                navigator.clipboard.writeText(text).then(() => {
                    // Show a brief toast notification
                    const toast = document.createElement('div');
                    toast.textContent = 'Copied: ' + text;
                    toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: ${colors.bg.elevated}; color: ${colors.text.primary}; padding: 8px 16px; border-radius: 4px; font-size: 12px; z-index: 9999; border: 1px solid ${colors.border.default}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;';
                    document.body.appendChild(toast);
                    setTimeout(() => toast.remove(), 2000);
                });
            }
            
            function renderTree(node, depth, isLast = true, parentPrefix = '') {
                if (!node || !node.name) return '';
                
                const color = depth === 0 ? '${colors.brand.purple[300]}' : '${
        colors.brand.indigo[300]
    }';
                const hoverBg = '${colors.bg.hover}';
                const filePath = node.file ? node.file.replace(/'/g, "\\\\'") : '';
                
                // Build the tree connector
                let connector = '';
                let childPrefix = parentPrefix;
                
                if (depth > 0) {
                    connector = isLast ? '└─ ' : '├─ ';
                    childPrefix = parentPrefix + (isLast ? '   ' : '│  ');
                }
                
                let html = '<div class="tree-item" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.8; cursor: ' + (filePath ? 'pointer' : 'default') + '; padding: 2px 4px; border-radius: 4px; transition: background-color 150ms; white-space: pre;" ' + (filePath ? 'onclick="copyToClipboard(\\'' + filePath + '\\')" title="Click to copy path"' : '') + ' onmouseover="if(this.dataset.file) this.style.backgroundColor=\\'' + hoverBg + '\\'" onmouseout="this.style.backgroundColor=\\'transparent\\'" data-file="' + filePath + '">';
                html += '<span style="color: ${colors.text.subtle};">' + parentPrefix + connector + '</span>';
                html += '<span style="color: ' + color + ';">&lt;' + node.name + ' /&gt;</span>';
                
                if (node.file) {
                    html += '<span style="color: ${colors.text.disabled}; font-size: 10px; margin-left: 8px;">' + node.file + '</span>';
                }
                html += '</div>';
                
                if (node.children && node.children.length > 0) {
                    for (let i = 0; i < node.children.length; i++) {
                        const isLastChild = i === node.children.length - 1;
                        html += renderTree(node.children[i], depth + 1, isLastChild, childPrefix);
                    }
                }
                
                return html;
            }
            
            // Make copyToClipboard available globally for onclick handlers
            window.copyToClipboard = copyToClipboard;
        })();
    `

    return (
        <div style={sectionStyles as any}>
            <div style={headerStyles as any}>
                <span style={titleStyles as any}>
                    Component Tree
                </span>
            </div>
            <div
                style={treeContainerStyles as any}
                id={`component-tree-${componentName}`}
            >
                <span style={loadingStyles as any}>
                    Loading component tree...
                </span>
            </div>
            <script dangerouslySetInnerHTML={{ __html: scriptContent }} />
        </div>
    )
}
