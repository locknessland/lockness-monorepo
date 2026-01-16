import { colors, cssReset, fontSize, fontWeight, spacing } from './theme.ts'
import { Badge } from './components/Badge.tsx'
import { BackToAppButton } from './components/BackToAppButton.tsx'
import { ClearDataButton } from './components/ClearDataButton.tsx'

export const Layout = ({ children }: { children: any }) => {
    const bodyStyles = {
        backgroundColor: colors.bg.primary,
        color: colors.text.secondary,
        fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: '100vh',
    }

    const headerStyles = {
        backgroundColor: 'rgba(15, 17, 21, 0.8)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: '0',
        zIndex: '50',
        borderBottom: `1px solid ${colors.border.default}`,
    }

    const headerContainerStyles = {
        maxWidth: '80rem',
        margin: '0 auto',
        padding: `${spacing.lg} ${spacing.xl}`,
    }

    const headerFlexStyles = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    }

    const brandStyles = {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.lg,
    }

    const titleStyles = {
        fontSize: fontSize.xl,
        fontWeight: fontWeight.bold,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
    }

    const buttonGroupStyles = {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
    }

    return (
        <html lang='en'>
            <head>
                <meta charset='UTF-8' />
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1.0'
                />
                <title>🔧 Lockness Devtools</title>
                <style dangerouslySetInnerHTML={{ __html: cssReset }} />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                    function showPanel(panel) {
                        const url = new URL(window.location)
                        url.searchParams.set('panel', panel)
                        url.searchParams.delete('requestId')
                        window.location.href = url.toString()
                    }

                    function clearData() {
                        if (confirm('Clear all collected data?')) {
                            fetch('/__devtools/clear', { method: 'POST' })
                                .then(() => window.location.reload())
                        }
                    }

                    function toggleMobileMenu() {
                        const menu = document.getElementById('mobile-menu')
                        menu.classList.toggle('hidden')
                    }
                `,
                    }}
                />
            </head>
            <body style={bodyStyles as any}>
                {/* Header */}
                <header style={headerStyles as any}>
                    <div style={headerContainerStyles as any}>
                        <div style={headerFlexStyles as any}>
                            <div style={brandStyles as any}>
                                <h1 style={titleStyles as any}>
                                    <span
                                        style={{
                                            color: colors.brand.indigo[400],
                                        }}
                                    >
                                        ⚡
                                    </span>{' '}
                                    Lockness{' '}
                                    <span
                                        style={{
                                            color: colors.text.disabled,
                                            fontWeight: fontWeight.normal,
                                        }}
                                    >
                                        Devtools
                                    </span>
                                </h1>
                                <Badge text='Development' color='green' />
                            </div>
                            <div style={buttonGroupStyles as any}>
                                <BackToAppButton />
                                <ClearDataButton />
                            </div>
                        </div>
                    </div>
                </header>

                {children}
            </body>
        </html>
    )
}
