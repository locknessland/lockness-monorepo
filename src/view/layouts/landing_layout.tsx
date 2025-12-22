import { html } from 'lockness'

export const LandingLayout = (props: { title: string; children: any }) => {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${props.title} | Lockness</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { font-family: 'Inter', sans-serif; }
        </style>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      </head>
      <body class="bg-slate-900 text-white min-h-screen antialiased overflow-x-hidden">
          ${props.children}
      </body>
    </html>
  `
}
