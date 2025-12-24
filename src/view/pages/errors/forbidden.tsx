/**
 * 403 - Forbidden Error Page
 */

export function ForbiddenPage() {
    return (
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>403 - Forbidden</title>
                <link rel="stylesheet" href="/css/app.css" />
            </head>
            <body class="min-h-screen flex items-center justify-center bg-gray-50">
                <div class="text-center px-4">
                    <h1 class="text-9xl font-bold text-gray-300">403</h1>
                    <h2 class="text-3xl font-semibold text-gray-800 mt-4">
                        Access Forbidden
                    </h2>
                    <p class="text-gray-600 mt-4 max-w-md mx-auto">
                        You don't have permission to access this resource.
                    </p>
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
