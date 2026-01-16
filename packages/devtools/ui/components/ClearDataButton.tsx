import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
    transitions,
} from '../theme.ts'

export const ClearDataButton = () => {
    const buttonStyles = {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: `${spacing.sm} ${spacing.lg}`,
        backgroundColor: colors.bg.secondary,
        border: `1px solid #2d303a`,
        borderRadius: borderRadius.lg,
        transition: `all ${transitions.slow}`,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
    }

    const iconStyles = {
        width: '16px',
        height: '16px',
        color: colors.text.muted,
        transition: `all ${transitions.slow}`,
    }

    const textStyles = {
        fontSize: fontSize.sm,
        fontWeight: fontWeight.medium,
        color: colors.text.muted,
        transition: `color ${transitions.slow}`,
    }

    const overlayStyles = {
        position: 'absolute',
        inset: '0',
        background:
            'linear-gradient(to right, rgba(239, 68, 68, 0), rgba(239, 68, 68, 0.05), rgba(239, 68, 68, 0))',
        opacity: '0',
        transition: `opacity ${transitions.slow}`,
        borderRadius: borderRadius.lg,
        pointerEvents: 'none',
    }

    const hoverScript = `
        this.style.backgroundColor = 'rgba(127, 29, 29, 0.1)';
        this.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        this.style.boxShadow = '0 0 15px -3px rgba(239, 68, 68, 0.2)';
        this.querySelector('svg').style.color = '${colors.status.error}';
        this.querySelector('svg').style.transform = 'rotate(12deg)';
        this.querySelector('span').style.color = '#fca5a5';
        this.querySelector('.overlay').style.opacity = '1';
    `

    const unhoverScript = `
        this.style.backgroundColor = '${colors.bg.secondary}';
        this.style.borderColor = '#2d303a';
        this.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
        this.querySelector('svg').style.color = '${colors.text.muted}';
        this.querySelector('svg').style.transform = 'rotate(0)';
        this.querySelector('span').style.color = '${colors.text.muted}';
        this.querySelector('.overlay').style.opacity = '0';
    `

    return (
        <button
            type='button'
            onclick='clearData()'
            style={buttonStyles as any}
            onmouseover={hoverScript}
            onmouseout={unhoverScript}
        >
            <div class='overlay' style={overlayStyles as any} />
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
                    d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
                />
            </svg>
            <span style={textStyles as any}>
                Clear Data
            </span>
        </button>
    )
}
