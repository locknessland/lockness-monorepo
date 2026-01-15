interface ToolbarItemProps {
    icon: string
    label: string
    value: string | number
    href?: string
    color?: string
    badge?: boolean
    className?: string
}

export function ToolbarItem(
    { icon, label, value, href, color, badge, className }: ToolbarItemProps,
) {
    const content = (
        <div className={`ln-toolbar-item ${className || ''}`}>
            <div
                className='ln-icon'
                style={{ color: color || '#9ca3af' }}
                dangerouslySetInnerHTML={{ __html: icon }}
            />
            <div className='ln-content'>
                <span
                    className='ln-value'
                    style={{ color: color || '#e5e7eb' }}
                >
                    {value}
                </span>
                <span className='ln-label'>{label}</span>
            </div>
            {badge && <div className='ln-badge' />}
        </div>
    )

    if (href) {
        return (
            <a href={href} className='ln-link'>
                {content}
            </a>
        )
    }

    return content
}
