import { bootstrap } from '@/src/kernel.ts'

const app = await bootstrap()
await app.listen(Number(Deno.env.get('PORT') || 8888))
