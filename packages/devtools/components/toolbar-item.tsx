interface ToolbarItemProps {
    icon: string
    label: string
    value: string | number
    href?: string
    color?: string
    badge?: boolean
}

export function ToolbarItem(
    { icon, label, value, href, color, badge }: ToolbarItemProps,
) {
    const content = (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                borderRadius: '0',
                transition: 'all 0.2s',
                position: 'relative',
            }}
        >
            <div
                style={{
                    width: '18px',
                    height: '18px',
                    flexShrink: '0',
                    color: color || '#9ca3af',
                }}
                dangerouslySetInnerHTML={{ __html: icon }}
            />
            <div
                style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
            >
                <span
                    style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        fontWeight: '500',
                        letterSpacing: '0.025em',
                    }}
                >
                    {label}
                </span>
                <span
                    style={{
                        fontWeight: '700',
                        fontSize: '15px',
                        color: color || '#e5e7eb',
                    }}
                >
                    {value}
                </span>
            </div>
            {badge && (
                <div
                    style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#ef4444',
                        border: '2px solid #111827',
                    }}
                />
            )}
        </div>
    )

    if (href) {
        return (
            <a
                href={href}
                style={{
                    textDecoration: 'none',
                    borderRadius: '0',
                    transition: 'background-color 0.2s',
                }}
                onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'"
                onmouseout="this.style.backgroundColor='transparent'"
            >
                {content}
            </a>
        )
    }

    return content
}
