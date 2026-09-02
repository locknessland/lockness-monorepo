import { Layout } from './Layout.tsx'
import { Navbar } from './components/Navbar.tsx'
import { Overview } from './panels/Overview.tsx'
import { Routes } from './panels/Routes.tsx'
import { Requests } from './panels/Requests.tsx'
import { Events } from './panels/Events.tsx'
import { Sessions } from './panels/Sessions.tsx'
import { Deprecations } from './panels/Deprecations.tsx'
import { PlaceholderPanel } from './panels/PlaceholderPanel.tsx'
import { colors, fontSize, spacing } from './theme.ts'

export const Dashboard = (
    { data, activePanel, selectedRequest }: {
        data: any
        activePanel: string
        selectedRequest: any
    },
) => {
    const mainStyles = {
        maxWidth: '80rem',
        margin: '0 auto',
        padding: `${spacing.xl} ${spacing.xl}`,
    }

    const footerStyles = {
        marginTop: '48px',
        padding: `${spacing.xl} 0`,
        textAlign: 'center',
        fontSize: fontSize.sm,
        color: colors.text.disabled,
    }

    return (
        <Layout>
            <Navbar activePanel={activePanel} data={data} />
            <main style={mainStyles as any}>
                {activePanel === 'overview' && <Overview data={data} />}
                {activePanel === 'routes' && <Routes data={data} />}
                {activePanel === 'requests' && (
                    <Requests data={data} selectedRequest={selectedRequest} />
                )}
                {activePanel === 'events' && <Events data={data} />}
                {activePanel === 'sessions' && <Sessions data={data} />}

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

            <footer style={footerStyles as any}>
                <p>Lockness Devtools • Development Mode Only</p>
            </footer>
        </Layout>
    )
}
