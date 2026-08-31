# @lockness/scheduler

Declarative cron-based task scheduling for Lockness. Put `@Schedule` above a
method and it runs on a schedule — no crontab, no `Deno.cron` unstable flag, no
hand-rolled `setInterval`.

```ts
import { daily, Schedule } from '@lockness/core'

export class ReportService {
    @Schedule('0 3 * * *')
    async nightlyDigest() {
        await sendDigest()
    }

    @Schedule(daily, { name: 'cleanup', retries: 2 })
    async cleanup() {
        await purgeTempFiles()
    }
}
```

Full documentation: [`docs/DOCS.md`](docs/DOCS.md).
