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
    /**
     * Make the broker **unreachable**: close the listener so a dial gets
     * `ECONNREFUSED`, and close every live connection. The port is retained, so
     * {@link FakeServer.reachable} re-binds the same one.
     *
     * This is the ONLY way to prove a failed *connect* (FR-004 / SC-003). Do not
     * reach for {@link FakeServer.mute} — a bound listener that stops accepting
     * still completes the TCP handshake into the kernel backlog, so `Deno.connect`
     * RESOLVES and the client waits on a read instead.
     */
    unreachable(): void
    /**
     * Undo {@link FakeServer.unreachable} — re-bind the SAME port and resume
     * accepting. Same port, deliberately: the client dials a fixed address, and
     * re-binding elsewhere would prove nothing about recovery.
     */
    reachable(): void
    /**
     * Accept connections but **answer nothing**: commands are still parsed and
     * logged, and no reply is written. Models a hung or half-open broker.
     *
     * This is the ONLY way to prove liveness detection (FR-002 / SC-002). Do not
     * reach for {@link FakeServer.unreachable} — a refused dial is a different
     * failure, and a test that uses it proves the connect path instead.
     */
    mute(): void
    /**
     * Undo {@link FakeServer.mute} and flush every reply withheld while muted, so
     * a connection that survived the silence resumes mid-stream.
     */
    unmute(): void
    /**
     * Wait `ms` before writing each reply, modelling a slow-but-alive peer.
     *
     * The distinction a per-step budget cannot see: three steps that each answer
     * inside the window can still take three windows in total. Set to `0` to
     * disarm.
     */
    delayReply(ms: number): void
    /**
     * Reply to `op` as usual and then immediately close that connection.
     *
     * Models a broker that dies mid-activation — the one failure the read loop
     * cannot back-stop, because on a FIRST activation the PSUBSCRIBE writes run
     * before any read loop exists to fault. Set to `null` to disarm.
     */
    closeAfter(op: string | null): void
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
function replyFor(
    args: string[],
    store: Map<string, string>,
    state: { subscribed: boolean },
): Uint8Array {
    const op = (args[0] ?? '').toUpperCase()
    switch (op) {
        case 'AUTH':
        case 'SELECT':
        case 'QUIT':
            return encoder.encode('+OK\r\n')
        case 'PSUBSCRIBE':
            // Confirm the pattern subscription: `*3` [ "psubscribe", pattern, n ].
            state.subscribed = true
            return respFrame(['psubscribe', args[1] ?? '', 1])
        case 'PUNSUBSCRIBE':
            return respFrame(['punsubscribe', args[1] ?? '', 0])
        case 'PING':
            // Redis answers PING differently once the connection has entered
            // subscribe mode: a multi-bulk ["pong", ""] rather than the `+PONG`
            // simple string. Modelled because the keepalive (#274) makes PING
            // load-bearing on the subscribe socket, and a fake that only ever
            // sends the command-mode shape would prove the wrong thing.
            return state.subscribed
                ? respFrame(['pong', ''])
                : encoder.encode('+PONG\r\n')
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
    const store = new Map<string, string>()
    const commandLog: string[][] = []
    const conns = new Set<Deno.Conn>()
    /** Flush callbacks, one per live connection, used by `unmute()`. */
    const pending = new Set<() => Promise<void>>()
    let accepts = 0
    let closed = false
    let muted = false
    let closeAfterOp: string | null = null
    let replyDelayMs = 0

    // The port is captured once from the ephemeral bind and reused by every
    // later `reachable()`, so a client dialling a fixed address can be made to
    // fail and then recover WITHOUT the address changing under it.
    let listener = Deno.listen({ hostname: '127.0.0.1', port: 0 })
    const port = (listener.addr as Deno.NetAddr).port

    const serve = (conn: Deno.Conn): void => {
        const chunks: number[] = []
        const state = { subscribed: false }
        let repliedThrough = 0
        let commandLogged = 0
        const buf = new Uint8Array(4096)

        // Reply to every command parsed but not yet answered. Called on each
        // read, and again by `unmute()` for the backlog withheld while muted.
        // Serialized: `unmute()` calls this while the read loop may already be
        // inside it, and both walk the same `repliedThrough` range. Without the
        // guard they replay overlapping commands and interleave their writes —
        // the fake would then produce exactly the desync the subject under test
        // is supposed to prevent.
        let flushing = false
        const flush = async (): Promise<void> => {
            if (muted || flushing) return
            flushing = true
            try {
                await flushOnce()
            } finally {
                flushing = false
            }
        }
        const flushOnce = async (): Promise<void> => {
            const { commands } = parseCommands(new Uint8Array(chunks))
            for (let i = repliedThrough; i < commands.length; i++) {
                if (replyDelayMs > 0) {
                    await new Promise((r) => setTimeout(r, replyDelayMs))
                }
                await conn.write(replyFor(commands[i], store, state))
                if (
                    closeAfterOp !== null &&
                    (commands[i][0] ?? '').toUpperCase() === closeAfterOp
                ) {
                    repliedThrough = commands.length
                    conns.delete(conn)
                    try {
                        conn.close()
                    } catch {
                        // Already closed.
                    }
                    return
                }
            }
            repliedThrough = Math.max(repliedThrough, commands.length)
        }
        pending.add(flush)
        ;(async () => {
            try {
                while (true) {
                    const n = await conn.read(buf)
                    if (n === null) break
                    for (let i = 0; i < n; i++) chunks.push(buf[i])
                    const { commands } = parseCommands(new Uint8Array(chunks))
                    // Commands are LOGGED even while muted — a muted broker
                    // still receives; it just does not answer. Tests assert on
                    // arrival separately from the reply.
                    for (let i = commandLogged; i < commands.length; i++) {
                        commandLog.push(commands[i])
                    }
                    commandLogged = Math.max(commandLogged, commands.length)
                    await flush()
                }
            } catch {
                // A reset after stop()/dropConnections()/unreachable() is a
                // normal end.
            } finally {
                pending.delete(flush)
                conns.delete(conn)
                try {
                    conn.close()
                } catch {
                    // Already closed.
                }
            }
        })()
    }

    const acceptLoop = (l: Deno.Listener): void => {
        ;(async () => {
            while (true) {
                let conn: Deno.Conn
                try {
                    conn = await l.accept()
                } catch {
                    // Listener closed by stop() or unreachable(); end the loop.
                    break
                }
                accepts++
                conns.add(conn)
                serve(conn)
            }
        })()
    }
    acceptLoop(listener)

    const closeAll = (): void => {
        for (const conn of conns) {
            try {
                conn.close()
            } catch {
                // Already closed.
            }
        }
        conns.clear()
    }

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
        dropConnections: () => closeAll(),
        unreachable: () => {
            if (closed) return
            try {
                listener.close()
            } catch {
                // Already closed by a previous unreachable().
            }
            closeAll()
        },
        reachable: () => {
            if (closed) return
            listener = Deno.listen({ hostname: '127.0.0.1', port })
            acceptLoop(listener)
        },
        delayReply: (ms: number) => {
            replyDelayMs = ms
        },
        closeAfter: (op: string | null) => {
            closeAfterOp = op === null ? null : op.toUpperCase()
        },
        mute: () => {
            muted = true
        },
        unmute: () => {
            muted = false
            for (const flush of pending) flush().catch(() => {})
        },
        stop: () => {
            if (closed) return
            closed = true
            try {
                listener.close()
            } catch {
                // Already closed by unreachable().
            }
            closeAll()
        },
    })
}
