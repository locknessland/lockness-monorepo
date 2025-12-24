/**
 * 500 - Server Error Page
 */

interface ServerErrorPageProps {
    error?: Error
    showDetails?: boolean
}

export function ServerErrorPage({ error, showDetails = false }: ServerErrorPageProps) {
    return (
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>500 - Server Error</title>
                <link rel="stylesheet" href="/css/app.css" />
            </head>
            <body class="min-h-screen flex items-center justify-center bg-gray-50">
                <div class="text-center px-4 max-w-2xl">
                    <h1 class="text-9xl font-bold text-gray-300">500</h1>
                    <h2 class="text-3xl font-semibold text-gray-800 mt-4">
                        Something Went Wrong
                    </h2>
                    <p class="text-gray-600 mt-4">
                        An unexpected error occurred. Please try again later.
                    </p>
                    
                    {showDetails && error && (
                        <div class="mt-8 text-left bg-red-50 border border-red-200 rounded-lg p-4">
                            <h3 class="font-semibold text-red-800 mb-2">Error Details:</h3>
                            <pre class="text-sm text-red-700 overflow-auto">
                                {error.message}
                                {error.stack && '\n\n' + error.stack}
                            </pre>
                        </div>
                    )}
                    
                    <div class="mt-8">
                        <a
                            href="/"
                            class="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                            Go Back Home
                        </a>
                    </div>
                </div>
            </body>
        </html>
    )
}
