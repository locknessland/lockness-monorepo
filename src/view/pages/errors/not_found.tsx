/**
 * 404 - Not Found Error Page
 */

export function NotFoundPage() {
    return (
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>404 - Page Not Found</title>
                <link rel="stylesheet" href="/css/app.css" />
            </head>
            <body class="min-h-screen flex items-center justify-center bg-gray-50">
                <div class="text-center px-4">
                    <h1 class="text-9xl font-bold text-gray-300">404</h1>
                    <h2 class="text-3xl font-semibold text-gray-800 mt-4">
                        Page Not Found
                    </h2>
                    <p class="text-gray-600 mt-4 max-w-md mx-auto">
                        The page you are looking for doesn't exist or has been moved.
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
