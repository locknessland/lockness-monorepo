# Technical Task: @Schedule Decorator

## 📋 Task Overview

Implement a `@Schedule` decorator to enable declarative cron-based task
scheduling. This eliminates the need for external cron systems and provides a
clean, type-safe API for recurring jobs directly in the application code.

## 🎯 Objectives

1. **Primary Objective**: Create `@Schedule` decorator for cron-based method
   execution
2. **Secondary Objective**: Implement a `Scheduler` service to manage scheduled
   tasks
3. **Additional Objective**: Support human-readable presets (`'daily'`,
   `'hourly'`, etc.)
4. **Quality Objective**: Full type safety with comprehensive error handling
5. **Documentation Objective**: Complete JSDoc, README, and LLM documentation

## 📁 Affected File Paths

### New Files to Create

- `/packages/scheduler/mod.ts` - Main entry point
- `/packages/scheduler/decorators.ts` - `@Schedule` decorator
- `/packages/scheduler/scheduler.ts` - Scheduler service
- `/packages/scheduler/cron_parser.ts` - Cron expression parser
- `/packages/scheduler/types.ts` - Type definitions
- `/packages/scheduler/presets.ts` - Human-readable presets
- `/packages/scheduler/deno.json` - Package manifest
- `/packages/scheduler/README.md` - Package documentation
- `/packages/scheduler/docs/DOCS.md` - User documentation
- `/packages/scheduler/tests/scheduler.test.ts` - Unit tests
- `/packages/scheduler/tests/cron_parser.test.ts` - Cron parser tests

### Framework Files to Extend

- `/deno.jsonc` - Add `@lockness/scheduler` workspace
- `/packages/core/mod.ts` - Re-export scheduler (optional)

### Documentation Files to Update

- `/GEMINI.md` - Add scheduler architecture
- `/docs/packages.md` - Document new package

## 🏗️ Architecture Principles

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  User Application Layer                  │  ← @Schedule decorated methods
├─────────────────────────────────────────┤
│  Decorator API Layer                     │  ← @Schedule, presets
├─────────────────────────────────────────┤
│  Scheduler Service Layer                 │  ← Task management, execution
├─────────────────────────────────────────┤
│  Cron Parser Layer                       │  ← Expression parsing, next run
└─────────────────────────────────────────┘
```

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- `CronParser` - Only parses cron expressions
- `Scheduler` - Only manages task execution
- `@Schedule` - Only registers methods

**2. Open/Closed Principle (OCP)**

- Extensible via custom cron presets
- Plugin system for job persistence

**3. Dependency Inversion Principle (DIP)**

- Scheduler depends on abstractions (ScheduledTask interface)
- Timer abstraction for testability

## 🎨 Proposed API Design

### Target User-Facing API (Simple Version)

```typescript
import { Schedule } from '@lockness/scheduler'

class BackupTasks {
    @Schedule('0 0 * * *') // Every day at midnight
    async dailyBackup() {
        await backupDatabase()
    }

    @Schedule('hourly')
    async cleanupTempFiles() {
        await cleanTemp()
    }
}
```

### Target User-Facing API (Advanced Version)

```typescript
import { Schedule, Scheduler } from '@lockness/scheduler'

class AdvancedTasks {
    @Schedule('*/5 * * * *', {
        name: 'health-check',
        timezone: 'Europe/Paris',
        runOnStart: true,
        timeout: '30s',
        retries: 3,
        onError: (error) => console.error('Health check failed:', error),
    })
    async healthCheck() {
        await checkServices()
    }

    @Schedule('0 9 * * 1-5', {
        name: 'daily-report',
        enabled: Deno.env.get('ENABLE_REPORTS') === 'true',
    })
    async sendDailyReport() {
        await generateAndSendReport()
    }
}

// Manual control
const scheduler = Scheduler.getInstance()
scheduler.pause('health-check')
scheduler.resume('health-check')
scheduler.runNow('daily-report')
```

### Presets

```typescript
// Human-readable presets
@Schedule('everyMinute')      // * * * * *
@Schedule('everyFiveMinutes') // */5 * * * *
@Schedule('everyTenMinutes')  // */10 * * * *
@Schedule('everyFifteenMinutes') // */15 * * * *
@Schedule('everyThirtyMinutes')  // */30 * * * *
@Schedule('hourly')           // 0 * * * *
@Schedule('daily')            // 0 0 * * *
@Schedule('weekly')           // 0 0 * * 0
@Schedule('monthly')          // 0 0 1 * *
@Schedule('yearly')           // 0 0 1 1 *
@Schedule('weekdays')         // 0 0 * * 1-5
@Schedule('weekends')         // 0 0 * * 0,6
```

## 📝 Detailed Implementation Steps

### Phase 1: Core Types

**Step 1.1: Type Definitions**

File: `/packages/scheduler/types.ts`

```typescript
/**
 * @fileoverview Type definitions for the scheduler package.
 *
 * @module @lockness/scheduler/types
 */

/**
 * Cron expression or preset name
 */
export type CronExpression = string

/**
 * Human-readable schedule presets
 */
export type SchedulePreset =
    | 'everyMinute'
    | 'everyFiveMinutes'
    | 'everyTenMinutes'
    | 'everyFifteenMinutes'
    | 'everyThirtyMinutes'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'weekdays'
    | 'weekends'

/**
 * Schedule configuration options
 */
export interface ScheduleOptions {
    /**
     * Unique name for the scheduled task
     * @default Method name
     */
    readonly name?: string

    /**
     * Timezone for schedule evaluation
     * @default 'UTC'
     */
    readonly timezone?: string

    /**
     * Whether to run immediately on scheduler start
     * @default false
     */
    readonly runOnStart?: boolean

    /**
     * Maximum execution time before timeout
     * @example '30s', '5m', '1h'
     */
    readonly timeout?: string

    /**
     * Number of retry attempts on failure
     * @default 0
     */
    readonly retries?: number

    /**
     * Delay between retries
     * @default '1s'
     */
    readonly retryDelay?: string

    /**
     * Whether the schedule is enabled
     * @default true
     */
    readonly enabled?: boolean

    /**
     * Error handler callback
     */
    readonly onError?: (
        error: Error,
        context: TaskContext,
    ) => void | Promise<void>

    /**
     * Success handler callback
     */
    readonly onSuccess?: (context: TaskContext) => void | Promise<void>
}

/**
 * Context passed to task handlers
 */
export interface TaskContext {
    /** Task name */
    readonly name: string
    /** Scheduled execution time */
    readonly scheduledAt: Date
    /** Actual execution start time */
    readonly startedAt: Date
    /** Current attempt number (1-based) */
    readonly attempt: number
    /** Previous execution time (if any) */
    readonly lastRun?: Date
}

/**
 * Registered scheduled task
 */
export interface ScheduledTask {
    /** Unique task name */
    readonly name: string
    /** Cron expression */
    readonly cron: string
    /** Task options */
    readonly options: ScheduleOptions
    /** Target class instance */
    readonly target: object
    /** Method to execute */
    readonly method: string
    /** Whether task is currently paused */
    paused: boolean
    /** Last execution time */
    lastRun?: Date
    /** Next scheduled execution */
    nextRun?: Date
    /** Current timer ID */
    timerId?: number
}

/**
 * Scheduler statistics
 */
export interface SchedulerStats {
    /** Total registered tasks */
    readonly totalTasks: number
    /** Currently running tasks */
    readonly runningTasks: number
    /** Paused tasks */
    readonly pausedTasks: number
    /** Total executions since start */
    readonly totalExecutions: number
    /** Failed executions */
    readonly failedExecutions: number
}
```

### Phase 2: Cron Parser

**Step 2.1: Cron Expression Parser**

File: `/packages/scheduler/cron_parser.ts`

````typescript
/**
 * @fileoverview Cron expression parser.
 *
 * Supports standard 5-field cron expressions:
 * - minute (0-59)
 * - hour (0-23)
 * - day of month (1-31)
 * - month (1-12)
 * - day of week (0-7, 0 and 7 are Sunday)
 *
 * @module @lockness/scheduler/cron_parser
 */

/**
 * Parsed cron field
 */
interface CronField {
    readonly values: ReadonlySet<number>
}

/**
 * Parsed cron expression
 */
export interface ParsedCron {
    readonly minute: CronField
    readonly hour: CronField
    readonly dayOfMonth: CronField
    readonly month: CronField
    readonly dayOfWeek: CronField
}

/**
 * Parse a cron expression into its components.
 *
 * @param expression - Cron expression (5 fields)
 * @returns Parsed cron object
 * @throws {Error} If expression is invalid
 *
 * @example
 * ```typescript
 * const parsed = parseCron('0 9 * * 1-5')
 * // Runs at 9:00 AM on weekdays
 * ```
 */
export function parseCron(expression: string): ParsedCron {
    const fields = expression.trim().split(/\s+/)

    if (fields.length !== 5) {
        throw new Error(
            `Invalid cron expression: expected 5 fields, got ${fields.length}`,
        )
    }

    return {
        minute: parseField(fields[0], 0, 59),
        hour: parseField(fields[1], 0, 23),
        dayOfMonth: parseField(fields[2], 1, 31),
        month: parseField(fields[3], 1, 12),
        dayOfWeek: parseField(fields[4], 0, 7),
    }
}

/**
 * Parse a single cron field.
 */
function parseField(field: string, min: number, max: number): CronField {
    const values = new Set<number>()

    for (const part of field.split(',')) {
        if (part === '*') {
            // All values
            for (let i = min; i <= max; i++) {
                values.add(i)
            }
        } else if (part.includes('/')) {
            // Step values: */5, 0-30/5
            const [range, stepStr] = part.split('/')
            const step = parseInt(stepStr, 10)
            const [start, end] = range === '*'
                ? [min, max]
                : parseRange(range, min, max)

            for (let i = start; i <= end; i += step) {
                values.add(i)
            }
        } else if (part.includes('-')) {
            // Range: 1-5
            const [start, end] = parseRange(part, min, max)
            for (let i = start; i <= end; i++) {
                values.add(i)
            }
        } else {
            // Single value
            const value = parseInt(part, 10)
            if (value < min || value > max) {
                throw new Error(`Value ${value} out of range [${min}-${max}]`)
            }
            values.add(value)
        }
    }

    return { values }
}

/**
 * Parse a range expression (e.g., "1-5").
 */
function parseRange(
    range: string,
    min: number,
    max: number,
): [number, number] {
    const [startStr, endStr] = range.split('-')
    const start = parseInt(startStr, 10)
    const end = parseInt(endStr, 10)

    if (start < min || end > max || start > end) {
        throw new Error(`Invalid range: ${range}`)
    }

    return [start, end]
}

/**
 * Calculate the next run time for a parsed cron expression.
 *
 * @param parsed - Parsed cron expression
 * @param from - Start time (default: now)
 * @param timezone - Timezone (default: UTC)
 * @returns Next execution date
 *
 * @example
 * ```typescript
 * const parsed = parseCron('0 9 * * *')
 * const next = getNextRun(parsed)
 * console.log(`Next run: ${next}`)
 * ```
 */
export function getNextRun(
    parsed: ParsedCron,
    from: Date = new Date(),
    _timezone = 'UTC',
): Date {
    const next = new Date(from.getTime() + 60000) // Start from next minute
    next.setSeconds(0)
    next.setMilliseconds(0)

    // Maximum iterations to prevent infinite loop
    const maxIterations = 366 * 24 * 60 // One year in minutes

    for (let i = 0; i < maxIterations; i++) {
        if (matchesCron(parsed, next)) {
            return next
        }
        next.setTime(next.getTime() + 60000) // Add one minute
    }

    throw new Error('Could not find next run time within one year')
}

/**
 * Check if a date matches a parsed cron expression.
 */
function matchesCron(parsed: ParsedCron, date: Date): boolean {
    const minute = date.getMinutes()
    const hour = date.getHours()
    const dayOfMonth = date.getDate()
    const month = date.getMonth() + 1
    const dayOfWeek = date.getDay()

    return (
        parsed.minute.values.has(minute) &&
        parsed.hour.values.has(hour) &&
        parsed.dayOfMonth.values.has(dayOfMonth) &&
        parsed.month.values.has(month) &&
        (parsed.dayOfWeek.values.has(dayOfWeek) ||
            parsed.dayOfWeek.values.has(dayOfWeek === 0 ? 7 : dayOfWeek))
    )
}
````

### Phase 3: Presets

**Step 3.1: Schedule Presets**

File: `/packages/scheduler/presets.ts`

````typescript
/**
 * @fileoverview Human-readable schedule presets.
 *
 * @module @lockness/scheduler/presets
 */

import type { SchedulePreset } from './types.ts'

/**
 * Mapping of preset names to cron expressions.
 */
export const SCHEDULE_PRESETS: Readonly<Record<SchedulePreset, string>> = {
    everyMinute: '* * * * *',
    everyFiveMinutes: '*/5 * * * *',
    everyTenMinutes: '*/10 * * * *',
    everyFifteenMinutes: '*/15 * * * *',
    everyThirtyMinutes: '*/30 * * * *',
    hourly: '0 * * * *',
    daily: '0 0 * * *',
    weekly: '0 0 * * 0',
    monthly: '0 0 1 * *',
    yearly: '0 0 1 1 *',
    weekdays: '0 0 * * 1-5',
    weekends: '0 0 * * 0,6',
} as const

/**
 * Check if a string is a valid preset name.
 *
 * @param value - String to check
 * @returns True if value is a preset name
 */
export function isPreset(value: string): value is SchedulePreset {
    return value in SCHEDULE_PRESETS
}

/**
 * Resolve a preset or cron expression to a cron expression.
 *
 * @param expression - Preset name or cron expression
 * @returns Cron expression
 *
 * @example
 * ```typescript
 * resolveExpression('daily') // '0 0 * * *'
 * resolveExpression('0 9 * * *') // '0 9 * * *'
 * ```
 */
export function resolveExpression(expression: string): string {
    if (isPreset(expression)) {
        return SCHEDULE_PRESETS[expression]
    }
    return expression
}
````

### Phase 4: Scheduler Service

**Step 4.1: Scheduler**

File: `/packages/scheduler/scheduler.ts`

````typescript
/**
 * @fileoverview Scheduler service for managing scheduled tasks.
 *
 * @module @lockness/scheduler
 */

import type {
    ScheduledTask,
    ScheduleOptions,
    SchedulerStats,
    TaskContext,
} from './types.ts'
import { getNextRun, parseCron } from './cron_parser.ts'
import { resolveExpression } from './presets.ts'

/**
 * Symbol to store scheduled tasks on classes
 */
export const SCHEDULED_TASKS = Symbol('scheduler:tasks')

/**
 * Scheduler service for managing cron-based tasks.
 *
 * @example
 * ```typescript
 * const scheduler = Scheduler.getInstance()
 *
 * // Register tasks from decorated classes
 * scheduler.register(new MyTasks())
 *
 * // Start the scheduler
 * scheduler.start()
 *
 * // Control individual tasks
 * scheduler.pause('task-name')
 * scheduler.resume('task-name')
 * scheduler.runNow('task-name')
 *
 * // Stop all tasks
 * scheduler.stop()
 * ```
 */
export class Scheduler {
    private static instance: Scheduler | null = null
    private readonly tasks = new Map<string, ScheduledTask>()
    private running = false
    private stats = {
        totalExecutions: 0,
        failedExecutions: 0,
    }

    private constructor() {}

    /**
     * Get the singleton scheduler instance.
     */
    static getInstance(): Scheduler {
        if (!Scheduler.instance) {
            Scheduler.instance = new Scheduler()
        }
        return Scheduler.instance
    }

    /**
     * Reset the singleton instance (for testing).
     */
    static resetInstance(): void {
        if (Scheduler.instance) {
            Scheduler.instance.stop()
            Scheduler.instance = null
        }
    }

    /**
     * Register tasks from a decorated class instance.
     *
     * @param target - Class instance with @Schedule decorated methods
     *
     * @example
     * ```typescript
     * class MyTasks {
     *     @Schedule('daily')
     *     async cleanup() { ... }
     * }
     *
     * scheduler.register(new MyTasks())
     * ```
     */
    register(target: object): void {
        const constructor = target.constructor as unknown as {
            [SCHEDULED_TASKS]?: Array<{
                method: string
                cron: string
                options: ScheduleOptions
            }>
        }

        const taskMetas = constructor[SCHEDULED_TASKS] ?? []

        for (const meta of taskMetas) {
            const name = meta.options.name ?? meta.method
            const cron = resolveExpression(meta.cron)

            if (this.tasks.has(name)) {
                throw new Error(`Task with name "${name}" already registered`)
            }

            const task: ScheduledTask = {
                name,
                cron,
                options: meta.options,
                target,
                method: meta.method,
                paused: !(meta.options.enabled ?? true),
            }

            // Calculate next run
            const parsed = parseCron(cron)
            task.nextRun = getNextRun(parsed)

            this.tasks.set(name, task)
        }
    }

    /**
     * Start the scheduler.
     */
    start(): void {
        if (this.running) return
        this.running = true

        for (const task of this.tasks.values()) {
            if (!task.paused) {
                this.scheduleTask(task)

                // Run on start if configured
                if (task.options.runOnStart) {
                    this.executeTask(task)
                }
            }
        }
    }

    /**
     * Stop the scheduler and cancel all pending tasks.
     */
    stop(): void {
        this.running = false

        for (const task of this.tasks.values()) {
            if (task.timerId !== undefined) {
                clearTimeout(task.timerId)
                task.timerId = undefined
            }
        }
    }

    /**
     * Pause a specific task.
     *
     * @param name - Task name
     */
    pause(name: string): void {
        const task = this.tasks.get(name)
        if (!task) {
            throw new Error(`Task "${name}" not found`)
        }

        task.paused = true
        if (task.timerId !== undefined) {
            clearTimeout(task.timerId)
            task.timerId = undefined
        }
    }

    /**
     * Resume a paused task.
     *
     * @param name - Task name
     */
    resume(name: string): void {
        const task = this.tasks.get(name)
        if (!task) {
            throw new Error(`Task "${name}" not found`)
        }

        task.paused = false
        if (this.running) {
            this.scheduleTask(task)
        }
    }

    /**
     * Run a task immediately (outside of schedule).
     *
     * @param name - Task name
     */
    async runNow(name: string): Promise<void> {
        const task = this.tasks.get(name)
        if (!task) {
            throw new Error(`Task "${name}" not found`)
        }

        await this.executeTask(task)
    }

    /**
     * Get scheduler statistics.
     */
    getStats(): SchedulerStats {
        let runningTasks = 0
        let pausedTasks = 0

        for (const task of this.tasks.values()) {
            if (task.paused) {
                pausedTasks++
            } else if (task.timerId !== undefined) {
                runningTasks++
            }
        }

        return {
            totalTasks: this.tasks.size,
            runningTasks,
            pausedTasks,
            totalExecutions: this.stats.totalExecutions,
            failedExecutions: this.stats.failedExecutions,
        }
    }

    /**
     * Get all registered tasks.
     */
    getTasks(): ReadonlyMap<string, ScheduledTask> {
        return this.tasks
    }

    /**
     * Schedule the next execution of a task.
     */
    private scheduleTask(task: ScheduledTask): void {
        if (task.paused || !this.running) return

        const parsed = parseCron(task.cron)
        const nextRun = getNextRun(parsed)
        task.nextRun = nextRun

        const delay = nextRun.getTime() - Date.now()

        task.timerId = setTimeout(() => {
            this.executeTask(task)
            this.scheduleTask(task) // Schedule next run
        }, delay)
    }

    /**
     * Execute a task with retry and error handling.
     */
    private async executeTask(task: ScheduledTask): Promise<void> {
        const maxAttempts = (task.options.retries ?? 0) + 1
        const scheduledAt = new Date()

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const context: TaskContext = {
                name: task.name,
                scheduledAt,
                startedAt: new Date(),
                attempt,
                lastRun: task.lastRun,
            }

            try {
                const method = (task.target as Record<string, unknown>)[
                    task.method
                ] as (...args: unknown[]) => unknown

                // Execute with optional timeout
                if (task.options.timeout) {
                    await this.executeWithTimeout(
                        () => method.call(task.target),
                        this.parseTimeout(task.options.timeout),
                    )
                } else {
                    await method.call(task.target)
                }

                task.lastRun = new Date()
                this.stats.totalExecutions++

                // Success callback
                if (task.options.onSuccess) {
                    await task.options.onSuccess(context)
                }

                return // Success, exit retry loop
            } catch (error) {
                if (attempt === maxAttempts) {
                    this.stats.failedExecutions++

                    // Error callback
                    if (task.options.onError) {
                        await task.options.onError(
                            error instanceof Error
                                ? error
                                : new Error(String(error)),
                            context,
                        )
                    } else {
                        console.error(
                            `[Scheduler] Task "${task.name}" failed:`,
                            error,
                        )
                    }
                } else {
                    // Wait before retry
                    const retryDelay = this.parseTimeout(
                        task.options.retryDelay ?? '1s',
                    )
                    await this.sleep(retryDelay)
                }
            }
        }
    }

    /**
     * Execute a function with timeout.
     */
    private async executeWithTimeout(
        fn: () => unknown,
        timeout: number,
    ): Promise<void> {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
            await Promise.race([
                fn(),
                new Promise((_, reject) => {
                    controller.signal.addEventListener('abort', () => {
                        reject(new Error('Task execution timed out'))
                    })
                }),
            ])
        } finally {
            clearTimeout(timeoutId)
        }
    }

    /**
     * Parse timeout string to milliseconds.
     */
    private parseTimeout(timeout: string): number {
        const match = timeout.match(/^(\d+)(ms|s|m|h)$/)
        if (!match) {
            throw new Error(`Invalid timeout format: ${timeout}`)
        }

        const value = parseInt(match[1], 10)
        const unit = match[2]

        switch (unit) {
            case 'ms':
                return value
            case 's':
                return value * 1000
            case 'm':
                return value * 60 * 1000
            case 'h':
                return value * 60 * 60 * 1000
            default:
                throw new Error(`Unknown time unit: ${unit}`)
        }
    }

    /**
     * Sleep for a duration.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }
}
````

### Phase 5: Decorator

**Step 5.1: Schedule Decorator**

File: `/packages/scheduler/decorators.ts`

````typescript
/**
 * @fileoverview Schedule decorator for cron-based task scheduling.
 *
 * @module @lockness/scheduler
 */

import type { ScheduleOptions, SchedulePreset } from './types.ts'
import { SCHEDULED_TASKS } from './scheduler.ts'

/**
 * Mark a method to be executed on a cron schedule.
 *
 * @param expression - Cron expression or preset name
 * @param options - Schedule configuration options
 *
 * @example Basic usage
 * ```typescript
 * class Tasks {
 *     @Schedule('0 0 * * *') // Every day at midnight
 *     async dailyCleanup() {
 *         await cleanupOldRecords()
 *     }
 * }
 * ```
 *
 * @example With preset
 * ```typescript
 * class Tasks {
 *     @Schedule('hourly')
 *     async hourlySync() {
 *         await syncData()
 *     }
 * }
 * ```
 *
 * @example With options
 * ```typescript
 * class Tasks {
 *     @Schedule('*/5 * * * *', {
 *         name: 'health-check',
 *         timeout: '30s',
 *         retries: 3,
 *         onError: (err) => notify(err),
 *     })
 *     async healthCheck() {
 *         await checkServices()
 *     }
 * }
 * ```
 */
export function Schedule(
    expression: string | SchedulePreset,
    options: ScheduleOptions = {}
) {
    return function <T extends (...args: unknown[]) => unknown>(
        originalMethod: T,
        context: ClassMethodDecoratorContext
    ): T {
        if (context.kind !== 'method') {
            throw new Error('@Schedule can only decorate methods')
        }

        const methodName = String(context.name)

        context.addInitializer(function () {
            const constructor = this.constructor as Record<symbol, unknown>

            // Initialize tasks array if needed
            if (!constructor[SCHEDULED_TASKS]) {
                constructor[SCHEDULED_TASKS] = []
            }

            // Add this method to scheduled tasks
            (constructor[SCHEDULED_TASKS] as unknown[]).push({
                method: methodName,
                cron: expression,
                options,
            })
        })

        return originalMethod
    }
}
````

### Phase 6: Package Entry Point

**Step 6.1: Main Entry Point**

File: `/packages/scheduler/mod.ts`

````typescript
/**
 * @fileoverview Scheduler package for cron-based task scheduling.
 *
 * Provides a declarative way to schedule recurring tasks using
 * cron expressions or human-readable presets.
 *
 * @module @lockness/scheduler
 *
 * @example Basic usage
 * ```typescript
 * import { Schedule, Scheduler } from '@lockness/scheduler'
 *
 * class BackupTasks {
 *     @Schedule('daily')
 *     async backup() {
 *         await backupDatabase()
 *     }
 *
 *     @Schedule('0 */6 * * *') // Every 6 hours
 *     async cleanup() {
 *         await cleanupTempFiles()
 *     }
 * }
 *
 * // Register and start
 * const scheduler = Scheduler.getInstance()
 * scheduler.register(new BackupTasks())
 * scheduler.start()
 * ```
 */

// Decorator
export { Schedule } from './decorators.ts'

// Scheduler service
export { Scheduler, SCHEDULED_TASKS } from './scheduler.ts'

// Cron utilities
export { getNextRun, parseCron, type ParsedCron } from './cron_parser.ts'

// Presets
export {
    isPreset,
    resolveExpression,
    SCHEDULE_PRESETS,
} from './presets.ts'

// Types
export type {
    CronExpression,
    ScheduledTask,
    ScheduleOptions,
    SchedulePreset,
    SchedulerStats,
    TaskContext,
} from './types.ts'
````

### Phase 7: Package Manifest

**Step 7.1: deno.json**

File: `/packages/scheduler/deno.json`

```json
{
    "name": "@lockness/scheduler",
    "description": "Declarative cron-based task scheduling for Lockness",
    "version": "0.1.0",
    "license": "MIT",
    "exports": "./mod.ts",
    "tasks": {
        "test": "deno test -A tests/",
        "test:watch": "deno test -A --watch tests/"
    },
    "publish": {
        "include": [
            "mod.ts",
            "decorators.ts",
            "scheduler.ts",
            "cron_parser.ts",
            "presets.ts",
            "types.ts",
            "deno.json",
            "README.md"
        ],
        "exclude": ["tests/"]
    },
    "imports": {
        "@std/assert": "jsr:@std/assert@1"
    }
}
```

## 🔄 Integration with Kernel

### With @Kernel Decorator

```typescript
import { Kernel, OnBoot } from '@lockness/core'
import { Schedule, Scheduler } from '@lockness/scheduler'

@Kernel()
export class AppKernel {
    @OnBoot({ priority: 10 })
    async startScheduler(app: App) {
        const scheduler = Scheduler.getInstance()
        scheduler.register(new BackupTasks())
        scheduler.register(new MaintenanceTasks())
        scheduler.start()
    }
}

class BackupTasks {
    @Schedule('daily', { name: 'db-backup' })
    async backupDatabase() {
        // ...
    }
}

class MaintenanceTasks {
    @Schedule('hourly')
    async cleanupSessions() {
        // ...
    }
}
```

### Standalone Usage

```typescript
import { Schedule, Scheduler } from '@lockness/scheduler'

class MyTasks {
    @Schedule('*/5 * * * *')
    async checkHealth() {
        console.log('Health check at', new Date())
    }
}

// Register and start
const scheduler = Scheduler.getInstance()
scheduler.register(new MyTasks())
scheduler.start()

// Keep process alive
Deno.addSignalListener('SIGINT', () => {
    scheduler.stop()
    Deno.exit()
})
```

## 🧪 Testing Strategy

### Unit Tests

File: `/packages/scheduler/tests/cron_parser.test.ts`

```typescript
import { assertEquals, assertThrows } from '@std/assert'
import { getNextRun, parseCron } from '../cron_parser.ts'

Deno.test('parseCron - parses simple expression', () => {
    const parsed = parseCron('0 0 * * *')
    assertEquals(parsed.minute.values.has(0), true)
    assertEquals(parsed.hour.values.has(0), true)
})

Deno.test('parseCron - parses step values', () => {
    const parsed = parseCron('*/5 * * * *')
    assertEquals(parsed.minute.values.has(0), true)
    assertEquals(parsed.minute.values.has(5), true)
    assertEquals(parsed.minute.values.has(10), true)
})

Deno.test('parseCron - throws on invalid expression', () => {
    assertThrows(() => parseCron('invalid'))
    assertThrows(() => parseCron('* * *')) // Too few fields
})

Deno.test('getNextRun - calculates next run', () => {
    const parsed = parseCron('0 9 * * *')
    const from = new Date('2026-01-24T08:00:00Z')
    const next = getNextRun(parsed, from)
    assertEquals(next.getHours(), 9)
    assertEquals(next.getMinutes(), 0)
})
```

File: `/packages/scheduler/tests/scheduler.test.ts`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import { Schedule, Scheduler } from '../mod.ts'

Deno.test('Scheduler - registers decorated tasks', () => {
    Scheduler.resetInstance()

    class TestTasks {
        @Schedule('daily', { name: 'test-task' })
        async testTask() {}
    }

    const scheduler = Scheduler.getInstance()
    scheduler.register(new TestTasks())

    const tasks = scheduler.getTasks()
    assertEquals(tasks.size, 1)
    assertExists(tasks.get('test-task'))
})

Deno.test('Scheduler - pause and resume', () => {
    Scheduler.resetInstance()

    class TestTasks {
        @Schedule('hourly', { name: 'pausable' })
        async task() {}
    }

    const scheduler = Scheduler.getInstance()
    scheduler.register(new TestTasks())

    scheduler.pause('pausable')
    assertEquals(scheduler.getTasks().get('pausable')?.paused, true)

    scheduler.resume('pausable')
    assertEquals(scheduler.getTasks().get('pausable')?.paused, false)
})
```

## ✅ Definition of Done

- [ ] All implementation steps completed
- [ ] All tests passing (unit + integration)
- [ ] **JSDoc documentation complete**
  - [ ] File-level `@fileoverview` and `@module` tags
  - [ ] All public classes, methods, functions documented
  - [ ] `@param`, `@returns`, `@throws`, `@example` tags included
- [ ] **Type safety enforced**
  - [ ] No `any` types (or justified with lint-ignore comment)
  - [ ] Explicit return types on all public functions
  - [ ] `readonly` used for immutable properties
- [ ] Package README.md created
- [ ] User documentation in docs/DOCS.md
- [ ] Integration with @Kernel documented
- [ ] Presets documented
- [ ] Manual testing completed
- [ ] **Quality checks passed**
  - [ ] `deno check packages/scheduler/**/*.ts` passes
  - [ ] `deno lint packages/scheduler/` passes
  - [ ] `deno test packages/scheduler/tests/` passes

## 🔗 Related Tasks

- [on-boot-decorator.md](.tasks/on-boot-decorator.md) - Used for scheduler
  startup
- [kernel-decorator.md](.tasks/kernel-decorator.md) - Integration point

## 📅 Timeline

- **Estimated Effort**: 6-8 hours
- **Priority**: High (très demandé)

## 📝 Notes

### Future Enhancements

- Distributed locking (prevent duplicate runs in cluster)
- Persistent job history (store in database)
- Web UI for monitoring scheduled tasks
- Support for seconds field (6-field cron)
- Timezone-aware scheduling with proper DST handling

### Alternatives Considered

- External cron (rejected: harder to manage, no type safety)
- Deno.cron (rejected: not available, Deno Deploy only)
- node-cron port (rejected: prefer native implementation)

---

_Task created: 2026-01-24_
