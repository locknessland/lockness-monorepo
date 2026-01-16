import { colors, fontSize, fontWeight } from '../theme.ts'

export type TextVariant =
    | 'h1'
    | 'h2'
    | 'h3'
    | 'body'
    | 'label'
    | 'mono'
    | 'tiny'
export type TextColor = 'primary' | 'secondary' | 'muted' | 'subtle' | 'accent'

interface TextProps {
    children: any
    variant?: TextVariant
    color?: TextColor
    class?: string
    style?: Record<string, string>
}

export const Text = ({
    children,
    variant = 'body',
    color = 'secondary',
    class: className,
    style: customStyle = {},
}: TextProps) => {
    const colorMap: Record<TextColor, string> = {
        primary: colors.text.primary,
        secondary: colors.text.secondary,
        muted: colors.text.muted,
        subtle: colors.text.subtle,
        accent: colors.brand.indigo[400],
    }

    const variantStyles: Record<
        TextVariant,
        { tag: string; styles: Record<string, string> }
    > = {
        h1: {
            tag: 'h1',
            styles: {
                fontSize: fontSize['2xl'],
                fontWeight: fontWeight.bold,
                color: colorMap[color],
            },
        },
        h2: {
            tag: 'h2',
            styles: {
                fontSize: fontSize.xl,
                fontWeight: fontWeight.semibold,
                color: colorMap[color],
            },
        },
        h3: {
            tag: 'h3',
            styles: {
                fontSize: fontSize.lg,
                fontWeight: fontWeight.semibold,
                color: colorMap[color],
            },
        },
        body: {
            tag: 'p',
            styles: {
                fontSize: fontSize.sm,
                fontWeight: fontWeight.normal,
                color: colorMap[color],
            },
        },
        label: {
            tag: 'span',
            styles: {
                fontSize: '10px',
                fontWeight: fontWeight.bold,
                color: colorMap[color],
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
            },
        },
        mono: {
            tag: 'code',
            styles: {
                fontSize: fontSize.xs,
                fontWeight: fontWeight.normal,
                fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                color: colorMap[color],
            },
        },
        tiny: {
            tag: 'span',
            styles: {
                fontSize: fontSize.xs,
                fontWeight: fontWeight.normal,
                color: colorMap[color],
            },
        },
    }

    const { tag, styles } = variantStyles[variant]
    const combinedStyles = { ...styles, ...customStyle }

    const Tag = tag as any

    return (
        <Tag style={combinedStyles} class={className}>
            {children}
        </Tag>
    )
}
