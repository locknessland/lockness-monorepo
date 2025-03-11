import { bootstrap } from '@lockness/bootstrap'

const app = await bootstrap()
await app.listen(Number(Deno.env.get('PORT') || 3000))
