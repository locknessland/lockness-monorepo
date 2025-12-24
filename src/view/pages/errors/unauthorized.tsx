/**
 * 401 - Unauthorized Error Page
 */

export function UnauthorizedPage() {
    return (
        <html lang='en'>
            <head>
                <meta charset='UTF-8' />
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1.0'
                />
                <title>401 - Unauthorized</title>
                <link rel='stylesheet' href='/css/app.css' />
            </head>
            <body class='min-h-screen flex items-center justify-center bg-gray-50'>
                <div class='text-center px-4'>
                    <h1 class='text-9xl font-bold text-gray-300'>401</h1>
                    <h2 class='text-3xl font-semibold text-gray-800 mt-4'>
                        Unauthorized
                    </h2>
                    <p class='text-gray-600 mt-4 max-w-md mx-auto'>
                        You need to be authenticated to access this resource.
                    </p>
                    <div class='mt-8 space-x-4'>
                        <a
                            href='/auth/login'
                            class='inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition'
                        >
                            Login
                        </a>
                        <a
                            href='/'
                            class='inline-block px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition'
                        >
                            Go Home
                        </a>
                    </div>
                </div>
            </body>
        </html>
    )
}
