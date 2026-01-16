import { borderRadius, colors } from '../theme.ts'

export const CopyButton = (
    { value, label }: { value: string; label: string },
) => {
    const copyToClipboard =
        `navigator.clipboard.writeText('${value}').then(() => { const el = document.getElementById('copy-${
            label.replace(/\s+/g, '-')
        }'); if(el) { el.style.color = '#10b981'; setTimeout(() => { el.style.color = '${colors.text.muted}'; }, 1000) } })`

    const buttonStyles = {
        padding: '6px',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: borderRadius.md,
        transition: 'background-color 200ms',
        cursor: 'pointer',
    }

    const iconStyles = {
        width: '16px',
        height: '16px',
        color: colors.text.muted,
        transition: 'color 200ms',
    }

    const hoverScript = `
        this.style.backgroundColor = '${colors.bg.hover}';
        this.querySelector('svg').style.color = '${colors.text.primary}';
    `

    const unhoverScript = `
        this.style.backgroundColor = 'transparent';
        this.querySelector('svg').style.color = '${colors.text.muted}';
    `

    return (
        <button
            type='button'
            onclick={copyToClipboard}
            style={buttonStyles as any}
            title='Copy to clipboard'
            onmouseover={hoverScript}
            onmouseout={unhoverScript}
        >
            <svg
                id={`copy-${label.replace(/\s+/g, '-')}`}
                style={iconStyles as any}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
            >
                <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='2'
                    d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
                />
            </svg>
        </button>
    )
}
