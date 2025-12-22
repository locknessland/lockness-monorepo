import { html } from 'lockness'

export const Layout = (props: { title: string; children: any }) => {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${props.title} | Lockness</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-slate-900 text-white min-h-screen">
        <nav class="p-6 border-b border-slate-800">
          <div class="container mx-auto flex justify-between items-center">
            <h1 class="text-2xl font-bold text-blue-400">🌊 Lockness</h1>
            <div class="space-x-4">
              <a href="/" class="hover:text-blue-400">Home</a>
              <a href="/test" class="hover:text-blue-400">Test</a>
            </div>
          </div>
        </nav>
        <main class="container mx-auto p-6">
          ${props.children}
        </main>
      </body>
    </html>
  `
}
