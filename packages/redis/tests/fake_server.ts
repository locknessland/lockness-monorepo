/**
 * @fileoverview A small stateful fake RESP server for the client tests.
 *
 * Loopback only — never a live Redis. It parses the client's stream **by
 * declared bulk length** (so it never imports `encodeCommand` and cannot be
 * fooled by the #141 under-declaration), keeps a key→value store, and answers
 * the handful of commands the tests issue: `AUTH`, `SELECT`, `PING`, `GET`,
 * `SET`, `SETEX`, `DEL`, `QUIT`, and — for the subscribe-mode connection tests
 * (#268) — `PSUBSCRIBE`/`PUNSUBSCRIBE`. It replies once per newly-completed
 * command so the client's per-command read resolves and it can proceed, records
 * every parsed command in {@link FakeServer.commandLog}, and exposes
 * {@link FakeServer.publish} to push unbidden `pmessage` frames plus
 * {@link FakeServer.dropConnections} to force a wire fault the subscriber must
 * self-heal from.
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
    /**
     * Every command parsed off any connection, in arrival order — lets a test
     * assert the handshake (`AUTH`/`SELECT`) and the `PSUBSCRIBE` frames reached
     * the wire.
     */
    commandLog: string[][]
    /** How many client connections have been accepted so far. */
    accepts(): number
    /**
     * Push an unbidden `pmessage` frame to every live connection, as Redis does
     * for a pattern subscriber. The client dispatches it only if it holds a
     * handler for `pattern`.
     *
     * @param pattern - The subscribed pattern the message matched.
     * @param topic - The concrete topic the payload was published to.
     * @param payload - The published payload.
     */
    publish(pattern: string, topic: string, payload: string): void
    /**
     * Close every live connection while keeping the listener open, forcing an
     * in-flight client read to fault so its self-heal (reconnect +
     * re-`PSUBSCRIBE`) can be observed. Newly dialled connections are accepted.
     */
    dropConnections(): void
    /** Close the listener and any live connections; safe to call twice. */
    stop(): void
}

/** A RESP2 array frame of bulk strings and integers, encoded to bytes. */
function respFrame(parts: readonly (string | number)[]): Uint8Array {
    let out = `*${parts.length}\r\n`
    for (const part of parts) {
        if (typeof part === 'number') {
            out += `:${part}\r\n`
        } else {
            out += `$${encoder.encode(part).byteLength}\r\n${part}\r\n`
        }
    }
    return encoder.encode(out)
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
        case 'PSUBSCRIBE':
            // Confirm the pattern subscription: `*3` [ "psubscribe", pattern, n ].
            return respFrame(['psubscribe', args[1] ?? '', 1])
        case 'PUNSUBSCRIBE':
            return respFrame(['punsubscribe', args[1] ?? '', 0])
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
    const commandLog: string[][] = []
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
                            commandLog.push(commands[i])
                            await conn.write(replyFor(commands[i], store))
                        }
                        repliedThrough = Math.max(
                            repliedThrough,
                            commands.length,
                        )
                    }
                } catch {
                    // A reset after stop()/dropConnections() is a normal end.
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
        commandLog,
        accepts: () => accepts,
        publish: (pattern: string, topic: string, payload: string) => {
            const frame = respFrame(['pmessage', pattern, topic, payload])
            for (const conn of conns) {
                // Fire-and-forget: a dropped connection just misses the push.
                conn.write(frame).catch(() => {})
            }
        },
        dropConnections: () => {
            for (const conn of conns) {
                try {
                    conn.close()
                } catch {
                    // Already closed.
                }
            }
            conns.clear()
        },
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
