import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
} from '../theme.ts'
import {
    DeprecationsTab,
    LogsTab,
    MailTab,
    OverviewTab,
    PerformanceTab,
    QueueTab,
    RequestsTab,
    RoutesTab,
    SQLTab,
} from './NavTabs.tsx'
import { Separator } from './Separator.tsx'

export const Navbar = (
    { activePanel, data }: { activePanel: string; data: any },
) => {
    const navStyles = {
        backgroundColor: colors.bg.primary,
        borderBottom: `1px solid ${colors.border.default}`,
        position: 'sticky',
        top: '0',
        zIndex: '10',
        backdropFilter: 'blur(12px)',
        opacity: '0.95',
    }

    const containerStyles = {
        maxWidth: '80rem',
        margin: '0 auto',
        padding: `0 ${spacing.xl}`,
    }

    const desktopNavStyles = {
        display: 'none',
        alignItems: 'center',
        overflowX: 'auto',
        padding: `${spacing.sm} 0`,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
    }

    const mobileHeaderStyles = {
        display: 'flex',
        padding: `${spacing.lg} 0`,
        alignItems: 'center',
        justifyContent: 'space-between',
    }

    const mobileTitleStyles = {
        fontSize: fontSize.sm,
        fontWeight: fontWeight.semibold,
        color: colors.text.secondary,
        textTransform: 'capitalize',
    }

    const mobileButtonStyles = {
        color: colors.text.muted,
        padding: spacing.sm,
        borderRadius: borderRadius.md,
        cursor: 'pointer',
        border: 'none',
        backgroundColor: 'transparent',
    }

    const mobileMenuStyles = {
        display: 'none',
        paddingBottom: spacing.lg,
        flexDirection: 'column',
        gap: spacing.sm,
    }

    const mediaStyles = `
        @media (min-width: 768px) {
            .desktop-nav { display: flex !important; }
            .mobile-header { display: none !important; }
        }
        .desktop-nav::-webkit-scrollbar { display: none; }
        .mobile-menu.hidden { display: none; }
        .mobile-menu:not(.hidden) { display: flex; }
    `

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: mediaStyles }} />
            <div style={navStyles as any}>
                <div style={containerStyles as any}>
                    {/* Desktop Menu */}
                    <nav style={desktopNavStyles as any} class='desktop-nav'>
                        <OverviewTab active={activePanel === 'overview'} />
                        <Separator />
                        <RoutesTab
                            active={activePanel === 'routes'}
                            count={data.routes.length}
                        />
                        <Separator />
                        <RequestsTab
                            active={activePanel === 'requests'}
                            count={data.requests.length}
                        />
                        <Separator />
                        <LogsTab
                            active={activePanel === 'logs'}
                            count={data.logs.length}
                        />
                        <Separator />
                        <SQLTab
                            active={activePanel === 'sql'}
                            count={data.queries.length}
                        />
                        <Separator />
                        <QueueTab
                            active={activePanel === 'queue'}
                            count={data.queue.length}
                        />
                        <Separator />
                        <MailTab
                            active={activePanel === 'mail'}
                            count={data.mails.length}
                        />
                        <Separator />
                        <PerformanceTab
                            active={activePanel === 'performance'}
                            count={data.performance.length}
                        />
                        <Separator />
                        <DeprecationsTab
                            active={activePanel === 'deprecations'}
                            count={data.deprecations.length}
                        />
                    </nav>

                    {/* Mobile Menu Toggle */}
                    <div
                        style={mobileHeaderStyles as any}
                        class='mobile-header'
                    >
                        <span style={mobileTitleStyles as any}>
                            {activePanel} Panel
                        </span>
                        <button
                            type='button'
                            onclick='toggleMobileMenu()'
                            style={mobileButtonStyles as any}
                        >
                            <svg
                                style={{ width: '24px', height: '24px' } as any}
                                fill='none'
                                stroke='currentColor'
                                viewBox='0 0 24 24'
                            >
                                <path
                                    stroke-linecap='round'
                                    stroke-linejoin='round'
                                    stroke-width='2'
                                    d='M4 6h16M4 12h16M4 18h16'
                                />
                            </svg>
                        </button>
                    </div>

                    {/* Mobile Menu Dropdown */}
                    <div
                        id='mobile-menu'
                        style={mobileMenuStyles as any}
                        class='mobile-menu hidden'
                    >
                        <OverviewTab active={activePanel === 'overview'} />
                        <RoutesTab
                            active={activePanel === 'routes'}
                            count={data.routes.length}
                        />
                        <RequestsTab
                            active={activePanel === 'requests'}
                            count={data.requests.length}
                        />
                        <LogsTab
                            active={activePanel === 'logs'}
                            count={data.logs.length}
                        />
                        <SQLTab
                            active={activePanel === 'sql'}
                            count={data.queries.length}
                        />
                        <QueueTab
                            active={activePanel === 'queue'}
                            count={data.queue.length}
                        />
                        <MailTab
                            active={activePanel === 'mail'}
                            count={data.mails.length}
                        />
                        <PerformanceTab
                            active={activePanel === 'performance'}
                            count={data.performance.length}
                        />
                        <DeprecationsTab
                            active={activePanel === 'deprecations'}
                            count={data.deprecations.length}
                        />
                    </div>
                </div>
            </div>
        </>
    )
}
