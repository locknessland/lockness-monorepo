import app from './src/kernel.ts'

Deno.serve({ port: 3000 }, app.fetch)
