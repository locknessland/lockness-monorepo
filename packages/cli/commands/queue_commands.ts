/**
 * @fileoverview Queue worker and management commands.
 *
 * Provides commands to run queue workers and manage job queues.
 *
 * @module @lockness/cli/commands/queue
 */

import type { Cli } from '../mod.ts'

/**
 * Register queue management commands.
 *
 * Commands registered:
 * - queue:work - Start a queue worker to process jobs
 *   - --queue=name - Queue name(s) to process (comma-separated)
 *   - --sleep=ms - Sleep time between job polls (default: 1000)
 *   - --max-jobs=n - Maximum jobs to process (0 = unlimited)
 *   - --once - Process one job and exit
 * - queue:clear - Clear all jobs from a queue
 *
 * @param cli - The CLI instance to register commands on
 *
 * @example
 * ```bash
 * # Start worker for default queue
 * deno task cli queue:work
 *
 * # Start worker for specific queues
 * deno task cli queue:work --queue=emails,notifications
 *
 * # Clear a queue
 * deno task cli queue:clear emails
 * ```
 */
export function registerQueueCommands(cli: Cli): void {
    cli.register('queue:work', async (args) => {
        // Dynamic import to avoid loading queue module at CLI startup
        const { QueueWorker, configureQueue, registerJob } = await import(
            '@lockness/queue'
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

        // Auto-discover and register jobs from app/job/
        try {
            for await (const entry of Deno.readDir('./app/job')) {
                if (entry.isFile && entry.name.endsWith('.ts')) {
                    const modulePath = `${Deno.cwd()}/app/job/${entry.name}`
                    const module = await import(modulePath)
                    for (const key in module) {
                        const Exported = module[key]
                        if (
                            typeof Exported === 'function' && Exported.prototype
                        ) {
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

    cli.register('queue:clear', async (args) => {
        const { clearQueue, configureQueue } = await import('@lockness/queue')

        const queue = args[0] || 'default'
        const driver = (Deno.env.get('QUEUE_DRIVER') as 'memory' | 'deno-kv') ||
            'memory'
        configureQueue({ driver })

        await clearQueue(queue)
        console.log(`✅ Queue '${queue}' cleared`)
    }, 'Clear all jobs from a queue')
}
