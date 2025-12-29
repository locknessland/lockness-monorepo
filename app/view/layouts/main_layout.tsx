// deno-lint-ignore no-explicit-any
export const MainLayout = (props: { title: string; children: any }) => {
    return (
        <html lang='en'>
            <head>
                <meta charset='UTF-8' />
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1.0'
                />
                <title>{props.title}</title>
                <link rel='stylesheet' href='/css/app.css' />
            </head>
            <body>
                <main>
                    {props.children}
                </main>
            </body>
        </html>
    )
}
