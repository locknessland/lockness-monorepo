import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
    transitions,
} from '../theme.ts'

export const BackToAppButton = () => {
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
        textDecoration: 'none',
        cursor: 'pointer',
    }

    const iconStyles = {
        width: '16px',
        height: '16px',
        color: colors.text.muted,
        transition: `color ${transitions.slow}`,
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
            'linear-gradient(to right, rgba(99, 102, 241, 0), rgba(99, 102, 241, 0.05), rgba(99, 102, 241, 0))',
        opacity: '0',
        transition: `opacity ${transitions.slow}`,
        borderRadius: borderRadius.lg,
        pointerEvents: 'none',
    }

    const hoverScript = `
        this.style.backgroundColor = '#1f232b';
        this.style.borderColor = 'rgba(99, 102, 241, 0.5)';
        this.style.boxShadow = '0 0 15px -3px rgba(99, 102, 241, 0.2)';
        this.querySelector('svg').style.color = '${colors.brand.indigo[400]}';
        this.querySelector('svg').style.transform = 'translateX(-2px)';
        this.querySelector('span').style.color = '${colors.brand.indigo[100]}';
        this.querySelector('.overlay').style.opacity = '1';
    `

    const unhoverScript = `
        this.style.backgroundColor = '${colors.bg.secondary}';
        this.style.borderColor = '#2d303a';
        this.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
        this.querySelector('svg').style.color = '${colors.text.muted}';
        this.querySelector('svg').style.transform = 'translateX(0)';
        this.querySelector('span').style.color = '${colors.text.muted}';
        this.querySelector('.overlay').style.opacity = '0';
    `

    return (
        <a
            href='/'
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
                    d='M10 19l-7-7m0 0l7-7m-7 7h18'
                />
            </svg>
            <span style={textStyles as any}>
                Back to App
            </span>
        </a>
    )
}
