/**
 * @fileoverview A small stateful fake RESP server for the client tests.
 *
 * Loopback only — never a live Redis. It parses the client's stream **by
 * declared bulk length** (so it never imports `encodeCommand` and cannot be
 * fooled by the #141 under-declaration), keeps a key→value store, and answers
 * the handful of commands the tests issue: `AUTH`, `SELECT`, `PING`, `GET`,
 * `SET`, `SETEX`, `DEL`, `QUIT`. It replies once per newly-completed command so
 * the client's per-command read resolves and it can proceed.
 *
 * @module @lockness/redis/tests/fake_server
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** A running fake RESP server handle. */
export interface FakeServer {
    /** The loopback port the server is listening on. */
    port: number
    /** The backing store: key → stored value. */
    store: Map<string, string>
    /** How many client connections have been accepted so far. */
    accepts(): number
    /** Close the listener and any live connections; safe to call twice. */
    stop(): void
}

/** Parse a RESP2 multibulk stream by declared length; returns full commands. */
function parseCommands(
    raw: Uint8Array,
): { commands: string[][]; consumed: number } {
    const commands: string[][] = []
    let pos = 0

    const readLine = (): string | null => {
        const start = pos
        while (pos < raw.byteLength && raw[pos] !== 0x0d) pos++
        if (pos + 1 >= raw.byteLength || raw[pos + 1] !== 0x0a) return null
        const line = decoder.decode(raw.subarray(start, pos))
        pos += 2
        return line
    }

    while (pos < raw.byteLength) {
        if (raw[pos] !== 0x2a /* * */) break
        const startOfCommand = pos
        pos++
        const countLine = readLine()
        if (countLine === null) {
            pos = startOfCommand
            break
        }
        const count = Number(countLine)
        const args: string[] = []
        let complete = true
        for (let i = 0; i < count; i++) {
            const lenLine = readLine()
            if (lenLine === null || lenLine[0] !== '$') {
                complete = false
                break
            }
            const n = Number(lenLine.slice(1))
            if (pos + n + 2 > raw.byteLength) {
                complete = false
                break
            }
            args.push(decoder.decode(raw.subarray(pos, pos + n)))
            pos += n + 2
        }
        if (!complete) {
            pos = startOfCommand
            break
        }
        commands.push(args)
    }
    return { commands, consumed: pos }
}

/** The reply bytes for one parsed command against the store. */
function replyFor(args: string[], store: Map<string, string>): Uint8Array {
    const op = (args[0] ?? '').toUpperCase()
    switch (op) {
        case 'AUTH':
        case 'SELECT':
        case 'QUIT':
            return encoder.encode('+OK\r\n')
        case 'PING':
            return encoder.encode('+PONG\r\n')
        case 'SET':
        case 'SETEX': {
            // SET key value  |  SETEX key ttl value
            const key = args[1]
            const value = op === 'SET' ? args[2] : args[3]
            store.set(key, value)
            return encoder.encode('+OK\r\n')
        }
        case 'DEL': {
            const existed = store.delete(args[1])
            return encoder.encode(`:${existed ? 1 : 0}\r\n`)
        }
        case 'GET': {
            const value = store.get(args[1])
            if (value === undefined) return encoder.encode('$-1\r\n')
            const bytes = encoder.encode(value)
            return encoder.encode(`$${bytes.byteLength}\r\n${value}\r\n`)
        }
        default:
            return encoder.encode('-ERR unknown command\r\n')
    }
}

/**
 * Start a fake RESP server on a fresh loopback port.
 *
 * @returns The running server handle.
 * @example
 * ```typescript
 * const server = await startFakeServer()
 * try {
 *   const client = new RedisClient({ hostname: '127.0.0.1', port: server.port })
 *   await client.command('SET', 'k', 'v')
 * } finally {
 *   server.stop()
 * }
 * ```
 */
export function startFakeServer(): Promise<FakeServer> {
    const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 })
    const port = (listener.addr as Deno.NetAddr).port
    const store = new Map<string, string>()
    const conns = new Set<Deno.Conn>()
    let accepts = 0
    let closed = false
    ;(async () => {
        while (true) {
            let conn: Deno.Conn
            try {
                conn = await listener.accept()
            } catch {
                // Listener closed by stop(); end the accept loop.
                break
            }
            accepts++
            conns.add(conn)
            ;(async () => {
                const chunks: number[] = []
                let repliedThrough = 0
                const buf = new Uint8Array(4096)
                try {
                    while (true) {
                        const n = await conn.read(buf)
                        if (n === null) break
                        for (let i = 0; i < n; i++) chunks.push(buf[i])
                        const { commands } = parseCommands(
                            new Uint8Array(chunks),
                        )
                        for (let i = repliedThrough; i < commands.length; i++) {
                            await conn.write(replyFor(commands[i], store))
                        }
                        repliedThrough = Math.max(
                            repliedThrough,
                            commands.length,
                        )
                    }
                } catch {
                    // A reset after stop() is the normal end of a test.
                } finally {
                    conns.delete(conn)
                    try {
                        conn.close()
                    } catch {
                        // Already closed.
                    }
                }
            })()
        }
    })()

    return Promise.resolve({
        port,
        store,
        accepts: () => accepts,
        stop: () => {
            if (closed) return
            closed = true
            listener.close()
            for (const conn of conns) {
                try {
                    conn.close()
                } catch {
                    // Already closed.
                }
            }
        },
    })
}
