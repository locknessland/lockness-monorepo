import { bootstrap } from '@kernel'

const app = await bootstrap()
await app.listen(Number(Deno.env.get('PORT') || 8888))
