import { TAILWIND_CSS } from './styles.ts'
import { Badge } from './components/Badge.tsx'

export const Layout = ({ children }: { children: any }) => {
    return (
        <html lang='en'>
            <head>
                <meta charset='UTF-8' />
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1.0'
                />
                <title>🔧 Lockness Devtools</title>
                <style dangerouslySetInnerHTML={{ __html: TAILWIND_CSS }} />
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
                `,
                    }}
                />
            </head>
            <body class='bg-[#0f1115] text-gray-300 font-sans antialiased min-h-screen'>
                {/* Header */}
                <header class='bg-[#0f1115]/80 backdrop-blur-md sticky top-0 z-50 border-b border-[rgba(255,255,255,0.08)]'>
                    <div class='max-w-7xl mx-auto px-6 py-4'>
                        <div class='flex items-center justify-between'>
                            <div class='flex items-center gap-4'>
                                <h1 class='text-xl font-bold flex items-center gap-2'>
                                    <span class='text-indigo-400'>⚡</span>{' '}
                                    Lockness{' '}
                                    <span class='text-gray-500 font-normal'>
                                        Devtools
                                    </span>
                                </h1>
                                <Badge text='Development' color='green' />
                            </div>
                            <div class='flex items-center gap-3'>
                                <a
                                    href='/'
                                    class='group flex items-center px-3 py-1.5 text-xs font-semibold text-gray-400 bg-[#181a20] border border-[rgba(255,255,255,0.08)] rounded-md hover:text-white hover:border-indigo-500/30 transition-all'
                                >
                                    <svg
                                        class='w-3.5 h-3.5 mr-2 text-gray-500 group-hover:text-white transition-colors'
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
                                    Back to App
                                </a>
                                <button
                                    type='button'
                                    onclick='clearData()'
                                    class='group flex items-center px-3 py-1.5 bg-red-500/5 hover:bg-red-500/10 text-red-500/70 hover:text-red-400 border border-red-500/10 hover:border-red-500/30 rounded-md text-xs font-semibold transition-all'
                                >
                                    <svg
                                        class='w-3.5 h-3.5 mr-2 opacity-70'
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
                                    Clear Data
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {children}
            </body>
        </html>
    )
}
