import { type Ace } from '../cli.ts'

export function registerQueueCommands(ace: Ace) {
    ace.register('queue:work', async (args) => {
        // Dynamic import to avoid loading queue module at CLI startup
        const { QueueWorker, configureQueue, registerJob } = await import(
            '@lockness/core'
        )

        // Parse flags from args
        const parseFlag = (name: string, def: string): string => {
            const flag = args.find((a) => a.startsWith(`--${name}=`))
            return flag ? flag.split('=')[1] : def
        }
        const queue = parseFlag('queue', 'default')
        const sleep = Number(parseFlag('sleep', '1000'))
        const maxJobs = Number(parseFlag('max-jobs', '0'))
        const once = args.includes('--once')

        // Configure queue driver from env
        const driver = (Deno.env.get('QUEUE_DRIVER') as 'memory' | 'deno-kv') ||
            'memory'
        configureQueue({ driver })

        // Auto-discover and register jobs from src/job/
        try {
            for await (const entry of Deno.readDir('./src/job')) {
                if (entry.isFile && entry.name.endsWith('.ts')) {
                    const modulePath = `${Deno.cwd()}/src/job/${entry.name}`
                    const module = await import(modulePath)
                    for (const key in module) {
                        const Exported = module[key]
                        if (typeof Exported === 'function' && Exported.prototype) {
                            registerJob(Exported)
                        }
                    }
                }
            }
        } catch {
            // No jobs directory
        }

        const worker = new QueueWorker({
            queues: queue.split(','),
            sleep,
            maxJobs,
            stopWhenEmpty: once,
        })

        // Handle graceful shutdown
        const controller = new AbortController()
        Deno.addSignalListener('SIGINT', () => {
            console.log('\n🛑 Shutting down worker...')
            worker.stop()
            controller.abort()
        })

        await worker.start()
    }, 'Process jobs from the queue')

    ace.register('queue:clear', async (args) => {
        const { clearQueue, configureQueue } = await import('@lockness/core')

        const queue = args[0] || 'default'
        const driver = (Deno.env.get('QUEUE_DRIVER') as 'memory' | 'deno-kv') ||
            'memory'
        configureQueue({ driver })

        await clearQueue(queue)
        console.log(`✅ Queue '${queue}' cleared`)
    }, 'Clear all jobs from a queue')
}
