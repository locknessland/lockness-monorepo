/**
 * @fileoverview Built-in log transports.
 *
 * Console, in-memory (test double) and file transports. The file transport
 * opens its `Deno.FsFile` lazily and closes it on `close()`.
 *
 * @module @lockness/logger/transports
 */

import { LogLevel } from './types.ts'
import type { LogEntry, LogFormatter, LogTransport } from './types.ts'
import { TextFormatter } from './formatters.ts'

/**
 * Console transport - writes to stdout/stderr
 */
export class ConsoleTransport implements LogTransport {
    constructor(private useStderr = true) {}

    log(entry: LogEntry): Promise<void> {
        const output = entry.level >= LogLevel.ERROR && this.useStderr
            ? console.error
            : console.log

        output(entry)
        return Promise.resolve()
    }
}

/**
 * Memory transport - stores logs in memory (for testing)
 */
export class MemoryTransport implements LogTransport {
    private logs: LogEntry[] = []

    log(entry: LogEntry): Promise<void> {
        this.logs.push(entry)
        return Promise.resolve()
    }

    getLogs(): LogEntry[] {
        return [...this.logs]
    }

    clear(): void {
        this.logs = []
    }
}

/**
 * File transport - writes logs to a file
 */
export class FileTransport implements LogTransport {
    private encoder = new TextEncoder()
    private file?: Deno.FsFile

    constructor(
        private filepath: string,
        private formatter: LogFormatter = new TextFormatter(),
    ) {}

    async log(entry: LogEntry): Promise<void> {
        if (!this.file) {
            this.file = await Deno.open(this.filepath, {
                create: true,
                append: true,
                write: true,
            })
        }

        const formatted = this.formatter.format(entry) + '\n'
        await this.file.write(this.encoder.encode(formatted))
    }

    close(): Promise<void> {
        if (this.file) {
            this.file.close()
            this.file = undefined
        }
        return Promise.resolve()
    }
}
