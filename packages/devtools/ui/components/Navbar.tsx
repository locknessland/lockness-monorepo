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
    return (
        <div class='bg-[#0f1115] border-b border-[rgba(255,255,255,0.08)] sticky top-0 z-10 backdrop-blur-md bg-opacity-95'>
            <div class='max-w-7xl mx-auto px-6'>
                {/* Desktop Menu */}
                <nav class='hidden md:flex items-center overflow-x-auto no-scrollbar py-2'>
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
                <div class='md:hidden py-4 flex items-center justify-between'>
                    <span class='text-sm font-semibold text-gray-300 capitalize'>
                        {activePanel} Panel
                    </span>
                    <button
                        type='button'
                        onclick='toggleMobileMenu()'
                        class='text-gray-400 hover:text-white focus:outline-none'
                    >
                        <svg
                            class='w-6 h-6'
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
                <div id='mobile-menu' class='hidden md:hidden pb-4 space-y-2'>
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
    )
}
