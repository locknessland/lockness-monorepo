import { Layout } from './Layout.tsx'
import { Navbar } from './components/Navbar.tsx'
import { Overview } from './panels/Overview.tsx'
import { Routes } from './panels/Routes.tsx'
import { Requests } from './panels/Requests.tsx'
import { Deprecations } from './panels/Deprecations.tsx'
import { PlaceholderPanel } from './panels/PlaceholderPanel.tsx'

export const Dashboard = (
    { data, activePanel, selectedRequest }: {
        data: any
        activePanel: string
        selectedRequest: any
    },
) => {
    return (
        <Layout>
            <Navbar activePanel={activePanel} data={data} />
            <main class='max-w-7xl mx-auto px-6 py-6'>
                {activePanel === 'overview' && <Overview data={data} />}
                {activePanel === 'routes' && <Routes data={data} />}
                {activePanel === 'requests' && (
                    <Requests data={data} selectedRequest={selectedRequest} />
                )}

                {activePanel === 'logs' && (
                    <PlaceholderPanel
                        title='Application Logs'
                        count={data.logs.length}
                        label='entries'
                    />
                )}
                {activePanel === 'sql' && (
                    <PlaceholderPanel
                        title='SQL Queries'
                        count={data.queries.length}
                        label='queries'
                    />
                )}
                {activePanel === 'queue' && (
                    <PlaceholderPanel
                        title='Background Queue'
                        count={data.queue.length}
                        label='jobs'
                    />
                )}
                {activePanel === 'mail' && (
                    <PlaceholderPanel
                        title='Mail Log'
                        count={data.mails.length}
                        label='emails'
                    />
                )}
                {activePanel === 'performance' && (
                    <PlaceholderPanel
                        title='Performance Metrics'
                        count={data.performance.length}
                        label='metrics'
                    />
                )}

                {activePanel === 'deprecations' && <Deprecations data={data} />}
            </main>

            <footer class='mt-12 py-6 text-center text-sm text-gray-500'>
                <p>Lockness Devtools • Development Mode Only</p>
            </footer>
        </Layout>
    )
}
