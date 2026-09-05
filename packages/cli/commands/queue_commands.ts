/**
 * @fileoverview Queue worker and management commands.
 *
 * Provides commands to run queue workers and manage job queues.
 *
 * @module @lockness/cli/commands/queue
 */

import type { Cli } from '../mod.ts'
import type { QueueConfig } from '@lockness/queue'

/**
 * Raised when `QUEUE_DRIVER=redis` is selected but the Redis connection
 * variables in the environment are missing or malformed.
 *
 * A dedicated type so a `queue:*` command surfaces a clear, actionable message
 * (which variable is wrong) instead of letting a downstream connection attempt
 * fail with an opaque socket error. Thrown by {@link resolveQueueConfigFromEnv}.
 *
 * @example
 * ```ts
 * try {
 *   configureQueue(resolveQueueConfigFromEnv())
 * } catch (err) {
 *   if (err instanceof RedisQueueConfigError) console.error(err.message)
 * }
 * ```
 */
export class RedisQueueConfigError extends Error {
    /**
     * @param message - Human-readable reason naming the offending variable.
     */
    constructor(message: string) {
        super(message)
        this.name = 'RedisQueueConfigError'
    }
}

/** Reads a single environment variable; defaults to `Deno.env.get`. */
type EnvReader = (key: string) => string | undefined

/**
 * Parse a required-positive-integer environment variable.
 *
 * @param read - The environment reader.
 * @param name - The variable name (used in the error message and lookup).
 * @returns The parsed integer, or `undefined` when the variable is unset.
 * @throws {RedisQueueConfigError} When the value is set but not a positive
 * integer.
 */
function parseIntEnv(read: EnvReader, name: string): number | undefined {
    const raw = read(name)
    if (raw === undefined || raw === '') return undefined
    const value = Number(raw)
    if (!Number.isInteger(value) || value <= 0) {
        throw new RedisQueueConfigError(
            `QUEUE_DRIVER=redis: ${name} must be a positive integer, got '${raw}'`,
        )
    }
    return value
}

/**
 * Interpret a boolean-ish environment variable: `true`/`1` (any case) is `true`,
 * `false`/`0` is `false`, anything else is rejected.
 *
 * @param read - The environment reader.
 * @param name - The variable name.
 * @returns The parsed boolean, or `undefined` when the variable is unset.
 * @throws {RedisQueueConfigError} When the value is set but not recognisable.
 */
function parseBoolEnv(read: EnvReader, name: string): boolean | undefined {
    const raw = read(name)
    if (raw === undefined || raw === '') return undefined
    const normalized = raw.toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
    throw new RedisQueueConfigError(
        `QUEUE_DRIVER=redis: ${name} must be one of true/false/1/0, got '${raw}'`,
    )
}

/**
 * Resolve the queue configuration for a `queue:*` command from the environment.
 *
 * `QUEUE_DRIVER` selects the driver (`memory` — the default and the fallback for
 * an unrecognised value — `deno-kv`, or `redis`). For the `redis` driver the
 * connection is read from the same `REDIS_*` variables the framework already
 * uses for its Redis-backed session store, extended with the two fields the
 * queue's Redis connection additionally supports:
 *
 * | Variable         | Maps to    | Notes                                   |
 * | ---------------- | ---------- | --------------------------------------- |
 * | `REDIS_HOST`     | `hostname` | **Required** for the `redis` driver.    |
 * | `REDIS_PORT`     | `port`     | Positive integer; Redis default 6379.   |
 * | `REDIS_DB`       | `db`       | Positive integer; Redis default 0.      |
 * | `REDIS_PASSWORD` | `password` | Optional `AUTH` credential.             |
 * | `REDIS_TLS`      | `tls`      | `true`/`1` to wrap the socket with TLS. |
 *
 * The returned config is handed to `configureQueue`; the queue manager builds
 * the `RedisClient` lazily from the `redis` block, so this function opens no
 * socket and does not emit the cleartext-`AUTH` warning (#248) itself — that
 * warning is raised once by `RedisClient` when a password is set with TLS off.
 *
 * `REDIS_HOST` is deliberately required (unlike the session store's dev-friendly
 * `localhost` default): a background worker is a deployed process where a silent
 * fallback to localhost would mask a misconfiguration rather than surface it.
 *
 * @param read - Environment reader; defaults to `Deno.env.get`. Injectable so a
 * test can drive the branches without mutating process env.
 * @returns A partial queue config suitable for `configureQueue`.
 * @throws {RedisQueueConfigError} When `redis` is selected and a required
 * variable is missing or a provided one is malformed.
 *
 * @example
 * ```ts
 * import { configureQueue } from '@lockness/queue'
 * configureQueue(resolveQueueConfigFromEnv())
 * ```
 */
export function resolveQueueConfigFromEnv(
    read: EnvReader = (key) => Deno.env.get(key),
): Partial<QueueConfig> {
    const raw = read('QUEUE_DRIVER')
    const driver: QueueConfig['driver'] = raw === 'deno-kv' || raw === 'redis'
        ? raw
        : 'memory'

    if (driver !== 'redis') return { driver }

    const hostname = read('REDIS_HOST')
    if (hostname === undefined || hostname === '') {
        throw new RedisQueueConfigError(
            'QUEUE_DRIVER=redis requires REDIS_HOST to be set',
        )
    }

    const redis: NonNullable<QueueConfig['redis']> = { hostname }
    const port = parseIntEnv(read, 'REDIS_PORT')
    if (port !== undefined) redis.port = port
    const db = parseIntEnv(read, 'REDIS_DB')
    if (db !== undefined) redis.db = db
    const password = read('REDIS_PASSWORD')
    if (password !== undefined && password !== '') redis.password = password
    const tls = parseBoolEnv(read, 'REDIS_TLS')
    if (tls !== undefined) redis.tls = tls

    return { driver: 'redis', redis }
}

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
 * - queue:retry - Retry failed (dead-lettered) jobs: queue:retry [<id> | --all]
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

        // Configure the queue driver from env. For QUEUE_DRIVER=redis this reads
        // the REDIS_* connection variables and throws RedisQueueConfigError when
        // a required one is missing (#270).
        configureQueue(resolveQueueConfigFromEnv())

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
        configureQueue(resolveQueueConfigFromEnv())

        await clearQueue(queue)
        console.log(`✅ Queue '${queue}' cleared`)
    }, 'Clear all jobs from a queue')

    cli.register('queue:retry', async (args) => {
        const { configureQueue, listFailedJobs, retryFailedJob } = await import(
            '@lockness/queue'
        )
        configureQueue(resolveQueueConfigFromEnv())

        // No id and no --all: list the dead-letter queue (projected, no payload).
        if (args.length === 0) {
            const failed = await listFailedJobs()
            if (failed.length === 0) {
                console.log('✅ No failed jobs.')
                return
            }
            console.log(`Failed jobs (${failed.length}):`)
            for (const f of failed) {
                console.log(
                    `  ${f.id}  [${f.name}]  queue=${f.queue}  attempts=${f.attempts}  error=${f.error}`,
                )
            }
            console.log('\nRetry one with: queue:retry <id>, or all with --all')
            return
        }

        if (args.includes('--all')) {
            const failed = await listFailedJobs()
            let retried = 0
            for (const f of failed) {
                if (await retryFailedJob(f.id)) retried++
            }
            console.log(`✅ Re-enqueued ${retried} failed job(s)`)
            return
        }

        const id = args[0]
        if (await retryFailedJob(id)) {
            console.log(`✅ Re-enqueued failed job ${id}`)
        } else {
            console.error(`❌ No failed job with id ${id}`)
        }
    }, 'Retry failed (dead-lettered) jobs: queue:retry [<id> | --all]')
}
