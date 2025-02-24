import app from './_routes.ts'

Deno.serve(app.fetch)