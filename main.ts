import app from '@lockness/kernel'

Deno.serve({ port: Number(Deno.env.get('PORT') || 3000) }, app.fetch)
