import { Tab } from './Tab.tsx'

export const Navbar = (
    { activePanel, data }: { activePanel: string; data: any },
) => {
    return (
        <div class='bg-[#0f1115] border-b border-[rgba(255,255,255,0.08)] sticky top-0 z-10 backdrop-blur-md bg-opacity-95'>
            <div class='max-w-7xl mx-auto px-6'>
                <nav class='flex gap-6 overflow-x-auto no-scrollbar'>
                    <Tab
                        name='Overview'
                        active={activePanel === 'overview'}
                        iconPath='M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z'
                    />
                    <Tab
                        name='Routes'
                        active={activePanel === 'routes'}
                        count={data.routes.length}
                        iconPath='M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'
                    />
                    <Tab
                        name='Requests'
                        active={activePanel === 'requests'}
                        count={data.requests.length}
                        iconPath='M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9'
                    />
                    <Tab
                        name='Logs'
                        active={activePanel === 'logs'}
                        count={data.logs.length}
                        iconPath='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
                    />
                    <Tab
                        name='SQL'
                        active={activePanel === 'sql'}
                        count={data.queries.length}
                        iconPath='M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4'
                    />
                    <Tab
                        name='Queue'
                        active={activePanel === 'queue'}
                        count={data.queue.length}
                        iconPath='M4 6h16M4 12h16M4 18h16'
                    />
                    <Tab
                        name='Mail'
                        active={activePanel === 'mail'}
                        count={data.mails.length}
                        iconPath='M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
                    />
                    <Tab
                        name='Performance'
                        active={activePanel === 'performance'}
                        count={data.performance.length}
                        iconPath='M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'
                    />
                    <Tab
                        name='Deprecations'
                        active={activePanel === 'deprecations'}
                        count={data.deprecations.length}
                        iconPath='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                    />
                </nav>
            </div>
        </div>
    )
}
