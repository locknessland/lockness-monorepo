import { createApp } from '@lockness/core'
import { AppKernel } from '@kernel'

const app = await createApp(AppKernel)

if (import.meta.main) {
    await app.listen(Number(Deno.env.get('PORT') || 8888))
}

export default app
