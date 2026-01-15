import { TAILWIND_CSS } from './styles.ts'
import { Badge } from './components/Badge.tsx'
import { BackToAppButton } from './components/BackToAppButton.tsx'
import { ClearDataButton } from './components/ClearDataButton.tsx'

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
