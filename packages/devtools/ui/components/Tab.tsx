import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
    transitions,
} from '../theme.ts'

interface TabProps {
    name: string
    active: boolean
    count?: number
    iconPath?: string
}

export const Tab = ({
    name,
    active,
    count,
    iconPath,
}: TabProps) => {
    const buttonStyles = {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.lg,
        padding: `${spacing.lg} ${spacing.md}`,
        fontSize: fontSize.sm,
        fontWeight: fontWeight.medium,
        transition: `all ${transitions.slow}`,
        whiteSpace: 'nowrap',
        outline: 'none',
        borderLeft: '3px solid',
        borderBottom: 'none',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
    }

    const activeStyles = active
        ? {
            borderColor: colors.brand.indigo[500],
            color: colors.text.primary,
            backgroundColor: 'rgba(99, 102, 241, 0.05)',
        }
        : {
            borderColor: 'transparent',
            color: colors.text.muted,
            backgroundColor: 'transparent',
        }

    const countBadgeStyles = {
        padding: `${spacing.xs} 10px`,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        borderRadius: borderRadius.full,
        transition: `all ${transitions.slow}`,
    }

    const countActiveStyles = active
        ? {
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            color: colors.brand.indigo[300],
            boxShadow: '0 0 10px -3px rgba(99, 102, 241, 0.3)',
        }
        : {
            backgroundColor: '#1a1d23',
            border: `1px solid ${colors.border.default}`,
            color: colors.text.disabled,
        }

    const iconStyles = {
        width: '16px',
        height: '16px',
        transition: `colors ${transitions.slow}`,
        color: active ? colors.brand.indigo[400] : colors.text.disabled,
    }

    const hoverScript = active ? '' : `
        this.style.color = '${colors.text.secondary}';
        this.style.borderColor = '${colors.text.subtle}';
        this.style.backgroundColor = '${colors.bg.secondary}';
    `

    const unhoverScript = active ? '' : `
        this.style.color = '${colors.text.muted}';
        this.style.borderColor = 'transparent';
        this.style.backgroundColor = 'transparent';
    `

    const mediaQueryStyles = `
        .tab-button {
            ${
        Object.entries(buttonStyles).map(([k, v]) =>
            `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`
        ).join(' ')
    }
            ${
        Object.entries(activeStyles).map(([k, v]) =>
            `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`
        ).join(' ')
    }
        }
        @media (min-width: 768px) {
            .tab-button {
                border-left: none;
                border-bottom: 3px solid ${activeStyles.borderColor};
                width: auto;
            }
        }
    `

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: mediaQueryStyles }} />
            <button
                type='button'
                onclick={`showPanel('${name.toLowerCase()}')`}
                class='tab-button'
                onmouseover={hoverScript}
                onmouseout={unhoverScript}
            >
                {iconPath && (
                    <svg
                        style={iconStyles as any}
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                    >
                        <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            stroke-width='2'
                            d={iconPath}
                        />
                    </svg>
                )}
                {name}
                {count !== undefined && (
                    <span
                        style={{
                            ...countBadgeStyles,
                            ...countActiveStyles,
                        } as any}
                    >
                        {count}
                    </span>
                )}
            </button>
        </>
    )
}
