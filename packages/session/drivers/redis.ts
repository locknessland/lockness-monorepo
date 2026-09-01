/**
 * @fileoverview Redis session driver.
 *
 * @module @lockness/session/drivers/redis
 */

import type { SessionData, SessionDriver } from '../types.ts'
import { encodeCommand, writeFrame } from './resp.ts'

/**
 * Redis session driver.
 *
 * Persistent session storage using Redis server.
 * Implements RESP protocol directly without external dependencies.
 *
 * @remarks
 * Commands must be issued one at a time per instance: the driver holds a single
 * connection and its RESP reply reader expects exactly one reply per command,
 * so two overlapping `sendCommand` calls would interleave frames and desync the
 * socket. The framework satisfies this by constructing one driver per request
 * and awaiting each call (`session/middleware.ts`); a consumer using this class
 * directly must serialize its own calls. Per-connection command serialization
 * is tracked with the shared-socket work in
 * {@link https://github.com/locknessland/lockness-monorepo/issues/138 | #138}.
 *
 * @example
 * ```typescript
 * const driver = new RedisSessionDriver({
 *   hostname: 'localhost',
 *   port: 6379,
 *   password: 'secret',
 *   db: 1,
 * })
 * ```
 */
export class RedisSessionDriver implements SessionDriver {
    private connection: Deno.Conn | null = null
    private readonly config: {
        hostname: string
        port: number
        password?: string
        db?: number
    }

    constructor(config: {
        hostname: string
        port?: number
        password?: string
        db?: number
    }) {
        this.config = {
            hostname: config.hostname,
            port: config.port ?? 6379,
            password: config.password,
            db: config.db ?? 0,
        }
    }

    private async connect(): Promise<Deno.Conn> {
        if (!this.connection) {
            this.connection = await Deno.connect({
                hostname: this.config.hostname,
                port: this.config.port,
            })

            // Authenticate if password provided
            if (this.config.password) {
                await this.sendCommand(['AUTH', this.config.password])
            }

            // Select database if specified
            if (this.config.db !== 0) {
                await this.sendCommand(['SELECT', String(this.config.db)])
            }
        }
        return this.connection
    }

    private async sendCommand(args: string[]): Promise<string> {
        const conn = await this.connect()
        const decoder = new TextDecoder()

        // The RESP frame is built and written by `resp.ts` — the one home for
        // "how many bytes an argument occupies" (`encodeCommand`) and "the
        // frame is on the wire in full before a reply is read" (`writeFrame`).
        // A write that fails after partial progress leaves the socket desynced
        // and unrecoverable, so the connection is closed and discarded before
        // the error propagates; the next command reconnects clean (FR-004a).
        // Closing frees the fd and the Redis client slot the half-written frame
        // would otherwise hold. The reply reader below is unchanged, #139's.
        try {
            await writeFrame(conn, encodeCommand(args))
        } catch (error) {
            try {
                conn.close()
            } catch {
                // Already closed by the failure itself; nothing to free.
            }
            this.connection = null
            throw error
        }

        // Read response
        const buffer = new Uint8Array(4096)
        const n = await conn.read(buffer)
        if (!n) throw new Error('Redis connection closed')

        const response = decoder.decode(buffer.subarray(0, n))
        return this.parseResponse(response)
    }

    private parseResponse(response: string): string {
        const type = response[0]

        if (type === '+') {
            // Simple string
            return response.substring(1, response.indexOf('\r\n'))
        } else if (type === '$') {
            // Bulk string
            const lines = response.split('\r\n')
            const length = parseInt(lines[0].substring(1))
            if (length === -1) return '' // NULL
            return lines[1] || ''
        } else if (type === '-') {
            // Error
            throw new Error(response.substring(1, response.indexOf('\r\n')))
        } else if (type === ':') {
            // Integer
            return response.substring(1, response.indexOf('\r\n'))
        }

        return ''
    }

    async read(sessionId: string): Promise<SessionData | null> {
        try {
            const data = await this.sendCommand(['GET', `session:${sessionId}`])
            if (!data) return null
            return JSON.parse(data) as SessionData
        } catch {
            return null
        }
    }

    async write(
        sessionId: string,
        data: SessionData,
        lifetime: number,
    ): Promise<void> {
        await this.sendCommand([
            'SETEX',
            `session:${sessionId}`,
            String(lifetime),
            JSON.stringify(data),
        ])
    }

    async destroy(sessionId: string): Promise<void> {
        await this.sendCommand(['DEL', `session:${sessionId}`])
    }

    async regenerate(oldId: string, newId: string): Promise<void> {
        const data = await this.read(oldId)
        if (data) {
            await this.write(newId, data, this.config.db ?? 7200)
            await this.destroy(oldId)
        }
    }

    async close(): Promise<void> {
        if (this.connection) {
            await this.sendCommand(['QUIT'])
            this.connection.close()
            this.connection = null
        }
    }
}
