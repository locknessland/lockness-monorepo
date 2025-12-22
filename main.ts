import { bootstrap } from '@kernel'

const app = await bootstrap()

if (import.meta.main && !Deno.env.get('VITE')) {
    await app.listen(Number(Deno.env.get('PORT') || 8888))
}

export default app
