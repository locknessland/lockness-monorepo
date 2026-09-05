/**
 * @fileoverview RESP2 wire encoding and reply reading shared by every
 * Redis-backed surface: the session driver, the scheduler distributed lock, and
 * the durable queue driver.
 *
 * The one home for three decisions (plan §5, features 007 and 009):
 *
 * 1. **How many bytes a RESP argument occupies on the wire** — `encodeCommand`.
 * 2. **A frame is fully on the wire before a reply is read** — `writeFrame`.
 * 3. **When a reply is off the wire in full, and its maximum size** —
 *    `readReply`.
 *
 * The encoder exists because the driver used to length-prefix each argument with
 * `arg.length` (UTF-16 code units) while writing UTF-8 bytes, so every
 * non-ASCII argument declared a bulk length short of the bytes actually
 * written. Redis advances its parse cursor by `bulklen + 2` without checking
 * those two bytes are CRLF, so the surplus was parsed as a fresh inline
 * command — arbitrary command injection plus reply/command desync, reproduced
 * against a live `redis:7-alpine`. See #141.
 *
 * `readReply` moved here from `redis.ts` in #139: the module that owns "a frame
 * is on the wire in full" now also owns "a reply is off the wire in full". It
 * drains the connection until the RESP reply is structurally complete (so a
 * reply larger than one read reassembles), keeps a nil bulk (`$-1`) distinct
 * from an empty-but-present bulk (`$0`), retains any bytes past the frame for the
 * next call, and is bounded by a 10 MiB max bulk length and a read timeout. It
 * replaced the old `.split('\r\n')` `parseResponse`, which assumed the whole
 * reply arrived in one 4096-byte read.
 *
 * @module @lockness/redis/resp
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * The largest bulk string `readReply` will read before rejecting. A live
 * session is kilobytes; 10 MiB is generous headroom while cutting the 512 MB
 * `proto-max-bulk-len` exposure to a bounded allocation on a slow or hostile
 * (plaintext) link (FR-010, Security S1). A declared length above this throws
 * **before** any buffer of the declared size is allocated.
 */
const MAX_BULK_BYTES = 10 * 1024 * 1024

/**
 * Cardinality ceiling for a multi-bulk (`*`) reply — the array analogue of
 * {@link MAX_BULK_BYTES}, so a hostile element count cannot drive an unbounded
 * parse loop. Ten million elements is far above any real reply.
 */
const MAX_ARRAY_ELEMENTS = 10_000_000

/**
 * The production ceiling on a single `readReply` drain. A truncated frame that
 * never completes must fail rather than block a request forever; the test-side
 * `withTimeout` covers CI, this covers production (FR-010). Generous, because a
 * healthy reply completes in milliseconds.
 */
const READ_TIMEOUT_MS = 30_000

/** Unconsumed bytes past the last full reply, retained per connection (A-L2). */
const leftovers = new WeakMap<Deno.Conn, Uint8Array>()

/**
 * One RESP2 reply, parsed. A **nil bulk** (`$-1`) is `{ type: 'nil' }`, kept
 * distinct from an empty-but-present bulk (`$0`), which is
 * `{ type: 'bulk', value: '' }` — the distinction `RedisSessionDriver.read`
 * needs to tell a cache miss (`null`) from a stored empty value (`''`).
 */
export type RespReply =
    | { type: 'simple'; value: string }
    | { type: 'integer'; value: number }
    | { type: 'bulk'; value: string }
    | { type: 'array'; value: readonly RespReply[] }
    | { type: 'nil' }

/**
 * The shared base for every fault {@link readReply} raises — a RESP reply that
 * could not be turned into a value. Never thrown directly; {@link readReply}
 * always raises one of the two subclasses below, which differ on **whether the
 * socket is left in sync**. The base is retained so an `instanceof RespError`
 * check (and its export) still catches both.
 *
 * @see {@link RespServerError} — the reply was fully read; the socket is in sync.
 * @see {@link RespFramingError} — the frame was abandoned mid-body; bytes remain
 *   on the wire and the socket is desynced.
 */
export class RespError extends Error {
    /**
     * @param message - The RESP error text (for a `-…` reply, the server's
     *   message; otherwise a description of the malformed or oversized frame).
     */
    constructor(message: string) {
        super(message)
        this.name = 'RespError'
    }
}

/**
 * A fault raised **after the whole reply was consumed**, so the socket is left
 * IN SYNC and safe to reuse. It covers a framed server error (`-<message>\r\n`)
 * and any line-based reply whose bytes were fully read before the value was
 * rejected (e.g. an unparseable integer). The driver keeps the connection on
 * this class — discarding it would drop a healthy link on every server-level
 * error.
 *
 * @example
 * ```typescript
 * try {
 *   await readReply(conn)
 * } catch (error) {
 *   if (error instanceof RespServerError) {
 *     // The server rejected the command, but the socket is still framed — reuse it.
 *   }
 * }
 * ```
 */
export class RespServerError extends RespError {
    /**
     * @param message - The server's `-…` text, or a description of the in-sync
     *   parse fault.
     */
    constructor(message: string) {
        super(message)
        this.name = 'RespServerError'
    }
}

/**
 * A structural framing fault raised **after the length/type line was read but
 * BEFORE the declared payload was drained** — an oversized bulk length, a
 * malformed bulk length, or an unexpected type byte. Unread bytes remain on the
 * wire and a partial payload sits in the leftovers buffer, so the socket is
 * DESYNCED: a later command's reply would be misframed. The driver must discard
 * the connection on this class rather than drain the abandoned (possibly 10 MiB,
 * possibly hostile) payload to resync — closing is the safe resolution.
 *
 * @example
 * ```typescript
 * try {
 *   await readReply(conn)
 * } catch (error) {
 *   if (error instanceof RespFramingError) {
 *     conn.close() // the socket is desynced; do not reuse it
 *   }
 * }
 * ```
 */
export class RespFramingError extends RespError {
    /**
     * @param message - A description of the abandoned frame (oversized/malformed
     *   length or unexpected type byte).
     */
    constructor(message: string) {
        super(message)
        this.name = 'RespFramingError'
    }
}

/** The two bytes RESP uses to terminate every prefix and bulk string. */
const CRLF = encoder.encode('\r\n')

/**
 * Encode a RESP2 array command from its string arguments.
 *
 * Each argument is encoded to UTF-8 first, and its bulk-length prefix is the
 * `byteLength` of that encoding — never `String.length`, which counts UTF-16
 * code units and under-declares any argument outside ASCII. The frame is
 * assembled from byte buffers; no JavaScript string carries argument data.
 *
 * **Argument content is never inspected, escaped, rejected or rewritten.** A
 * RESP2 bulk string is length-delimited, so an embedded CR/LF is data, not a
 * boundary — Redis reads exactly `byteLength` bytes and never enters the
 * inline parser for a frame that begins with `*`. Escaping here would be a
 * second, wrong home for a decision the length prefix already makes correctly.
 *
 * @param args - The command and its arguments, e.g. `['GET', 'session:abc']`.
 *   Each becomes one `$<byteLength>\r\n<bytes>\r\n` bulk string.
 * @returns The complete frame as a single `Uint8Array`, ready for `writeFrame`.
 * @example
 * ```typescript
 * const frame = encodeCommand(['SET', 'k', 'Renée'])
 * // *3\r\n$3\r\nSET\r\n$1\r\nk\r\n$6\r\nRenée\r\n  — $6, not $5
 * ```
 */
export function encodeCommand(args: readonly string[]): Uint8Array {
    const header = encoder.encode(`*${args.length}\r\n`)
    const parts: Uint8Array[] = [header]
    let total = header.byteLength

    for (const arg of args) {
        const bytes = encoder.encode(arg)
        const prefix = encoder.encode(`$${bytes.byteLength}\r\n`)
        parts.push(prefix, bytes, CRLF)
        total += prefix.byteLength + bytes.byteLength + CRLF.byteLength
    }

    const frame = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
        frame.set(part, offset)
        offset += part.byteLength
    }
    return frame
}

/**
 * Write a frame to the connection in full, looping over short writes.
 *
 * `Deno.Conn.write` resolves to the number of bytes written and may write
 * fewer than the buffer holds (measured: a single 8 MiB write returned ~320 KB
 * against a slow reader). A frame left half-written truncates mid-argument and
 * desyncs the connection by the same route the length bug does, so the write
 * is looped until every byte is on the wire.
 *
 * A write that makes no progress (returns 0) raises rather than spinning — the
 * caller discards the connection, since a partially written frame cannot be
 * recovered on that socket.
 *
 * @param conn - The open connection to write to.
 * @param frame - The complete frame from `encodeCommand`.
 * @returns Resolves once every byte of `frame` has been written.
 * @throws {Error} If the connection stops accepting bytes before the frame is
 *   fully written.
 * @example
 * ```typescript
 * await writeFrame(conn, encodeCommand(['PING']))
 * ```
 */
export async function writeFrame(
    conn: Deno.Conn,
    frame: Uint8Array,
): Promise<void> {
    let offset = 0
    while (offset < frame.byteLength) {
        const written = await conn.write(frame.subarray(offset))
        if (written <= 0) {
            throw new Error(
                `Redis write stalled after ${offset} of ${frame.byteLength} bytes`,
            )
        }
        offset += written
    }
}

/**
 * Read from `conn` into `buf`, failing if no byte arrives within `timeoutMs`.
 *
 * The drain loop is bounded in production, not only by a test-side helper: a
 * truncated frame that never completes must surface as an error rather than
 * block the request forever.
 */
function readWithTimeout(
    conn: Deno.Conn,
    buf: Uint8Array,
    timeoutMs: number,
): Promise<number | null> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const guard = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () =>
                reject(new Error(`Redis read timed out after ${timeoutMs}ms`)),
            timeoutMs,
        )
    })
    return Promise.race([conn.read(buf), guard]).finally(() =>
        clearTimeout(timer)
    ) as Promise<number | null>
}

/** The bytes each `#fill` pulls from the socket per `conn.read`. */
const READ_CHUNK_BYTES = 4096

/**
 * A cursor over a connection that pulls more bytes only when the current reply
 * needs them.
 *
 * Two properties matter for a reply that spans many reads:
 *
 * - **A per-REPLY wall-clock deadline**, not a timer reset on every `conn.read`.
 *   The deadline is fixed once, when the reader is constructed; each read is
 *   bounded by the time left until it. A byte-at-a-time dribble that stays just
 *   under a per-read timeout would otherwise reset the clock forever and never
 *   surface as the "reply never completed" fault the bound exists to catch.
 * - **Geometric buffer growth, not a reallocation per read.** Bytes are read
 *   straight into a backing buffer at the current fill offset; when the tail is
 *   full the consumed prefix is compacted away, and only if that is still not
 *   enough is the capacity doubled. A reply drained over N reads costs O(total
 *   bytes) amortised, not the O(N × total) of merging a fresh array each read.
 */
class ReplyReader {
    #conn: Deno.Conn
    /** Backing store; `[#pos, #len)` is the unconsumed window, `#len ≤ capacity`. */
    #buf: Uint8Array
    /** Bytes consumed by the parser so far. */
    #pos = 0
    /** Valid bytes held; the free tail is `[#len, #buf.byteLength)`. */
    #len: number
    /** Epoch ms by which the whole reply must be off the wire. */
    readonly #deadline: number
    /** The reply's total time budget, for the timeout message. */
    readonly #timeoutMs: number

    constructor(conn: Deno.Conn, initial: Uint8Array, timeoutMs: number) {
        this.#conn = conn
        const capacity = Math.max(READ_CHUNK_BYTES, initial.byteLength)
        this.#buf = new Uint8Array(capacity)
        this.#buf.set(initial)
        this.#len = initial.byteLength
        this.#timeoutMs = timeoutMs
        this.#deadline = Date.now() + timeoutMs
    }

    /** Ensure at least `need` free bytes in the tail, compacting then growing. */
    #reserve(need: number): void {
        if (this.#buf.byteLength - this.#len >= need) return
        // Drop the consumed prefix first — reuse the space before allocating.
        if (this.#pos > 0) {
            this.#buf.copyWithin(0, this.#pos, this.#len)
            this.#len -= this.#pos
            this.#pos = 0
        }
        if (this.#buf.byteLength - this.#len >= need) return
        // Still short: double the capacity until the tail fits `need`.
        let capacity = this.#buf.byteLength
        while (capacity - this.#len < need) capacity *= 2
        const grown = new Uint8Array(capacity)
        grown.set(this.#buf.subarray(0, this.#len))
        this.#buf = grown
    }

    /** Pull one more chunk from the socket, bounded by the per-reply deadline. */
    async #fill(): Promise<void> {
        const remaining = this.#deadline - Date.now()
        if (remaining <= 0) {
            throw new Error(`Redis read timed out after ${this.#timeoutMs}ms`)
        }
        this.#reserve(READ_CHUNK_BYTES)
        const into = this.#buf.subarray(this.#len, this.#len + READ_CHUNK_BYTES)
        const n = await readWithTimeout(this.#conn, into, remaining)
        if (n === null) {
            throw new Error('Redis connection closed mid-reply')
        }
        this.#len += n
    }

    /** Read the next byte, filling if the window is empty. */
    async readByte(): Promise<number> {
        while (this.#pos >= this.#len) await this.#fill()
        return this.#buf[this.#pos++]
    }

    /** Read up to the next CRLF, returning the line without it. */
    async readLine(): Promise<string> {
        while (true) {
            for (let i = this.#pos; i + 1 < this.#len; i++) {
                if (this.#buf[i] === 0x0d && this.#buf[i + 1] === 0x0a) {
                    const line = decoder.decode(
                        this.#buf.subarray(this.#pos, i),
                    )
                    this.#pos = i + 2
                    return line
                }
            }
            await this.#fill()
        }
    }

    /** Read exactly `count` bytes, draining across reads as needed. */
    async readExact(count: number): Promise<Uint8Array> {
        while (this.#len - this.#pos < count) await this.#fill()
        // A copy: a later `#fill` may compact or replace the backing buffer, so
        // the caller must own its bytes rather than hold a view into `#buf`.
        const out = this.#buf.slice(this.#pos, this.#pos + count)
        this.#pos += count
        return out
    }

    /** A copy of the bytes past the reply just read, for the next call. */
    remaining(): Uint8Array {
        return this.#buf.slice(this.#pos, this.#len)
    }
}

/** Parse exactly one RESP2 reply off `reader`. */
async function parseReply(reader: ReplyReader): Promise<RespReply> {
    const typeByte = await reader.readByte()
    switch (typeByte) {
        case 0x2b /* + */:
            return { type: 'simple', value: await reader.readLine() }
        case 0x2d /* - */:
            // A framed `-…` reply: the whole line is off the wire, socket in sync.
            throw new RespServerError(await reader.readLine())
        case 0x3a /* : */: {
            const line = await reader.readLine()
            const value = Number(line)
            if (!Number.isFinite(value)) {
                // The reply line was fully read before the value was rejected —
                // the socket is in sync, so this is a server error, not a frame
                // fault.
                throw new RespServerError(`invalid RESP integer: ${line}`)
            }
            return { type: 'integer', value }
        }
        case 0x24 /* $ */: {
            const lenLine = await reader.readLine()
            const len = Number(lenLine)
            if (len === -1) return { type: 'nil' } // nil bulk, distinct from ''
            if (!Number.isInteger(len) || len < -1) {
                // The declared body length is unusable, so the payload cannot be
                // drained — the frame is abandoned mid-reply and the socket is
                // desynced.
                throw new RespFramingError(
                    `invalid RESP bulk length: ${lenLine}`,
                )
            }
            // Reject an oversized declared length BEFORE it reaches `readExact`
            // — the resource-exhaustion guard (Security S1). The socket is
            // drained in fixed 4096-byte chunks, and the len-sized copy below
            // runs only once `len` has passed this bound, so a hostile declared
            // length never drives an allocation of its own size.
            if (len > MAX_BULK_BYTES) {
                // The oversized body is never drained (by design — it may be
                // hostile), so the socket is left desynced: a framing fault.
                throw new RespFramingError(
                    `RESP bulk length ${len} exceeds the ${MAX_BULK_BYTES}-byte limit`,
                )
            }
            const payload = decoder.decode(await reader.readExact(len))
            await reader.readExact(2) // trailing CRLF
            return { type: 'bulk', value: payload }
        }
        case 0x2a /* * */: {
            const lenLine = await reader.readLine()
            const len = Number(lenLine)
            if (len === -1) return { type: 'nil' } // nil array, distinct from []
            if (!Number.isInteger(len) || len < -1) {
                // An unusable element count: how many replies follow cannot be
                // known, so the frame is abandoned and the socket desynced.
                throw new RespFramingError(
                    `invalid RESP array length: ${lenLine}`,
                )
            }
            // Cardinality guard, the array analogue of the bulk-length bound: a
            // hostile `*<huge>` would otherwise drive an unbounded parse loop.
            if (len > MAX_ARRAY_ELEMENTS) {
                throw new RespFramingError(
                    `RESP array length ${len} exceeds the ${MAX_ARRAY_ELEMENTS}-element limit`,
                )
            }
            const items: RespReply[] = []
            for (let i = 0; i < len; i++) {
                // Recursive: each element is one reply, and a nested array (a
                // command that returns arrays of arrays) reassembles the same way.
                items.push(await parseReply(reader))
            }
            return { type: 'array', value: items }
        }
        default:
            // The type byte is unknown, so the reply's structure — and thus how
            // many bytes it occupies — cannot be determined; the frame is
            // abandoned and the socket desynced.
            throw new RespFramingError(
                `unexpected RESP reply type byte 0x${typeByte.toString(16)}`,
            )
    }
}

/**
 * Read exactly one RESP2 reply from `conn`, draining until it is complete.
 *
 * The one home for "a reply is off the wire in full, and its maximum size"
 * (plan §5). It reads the type byte, then the reply body, looping over
 * `conn.read` until the frame is structurally complete — so a reply larger than
 * one 4096-byte read, or a bulk body split across TCP segments, reassembles
 * intact. A nil bulk (`$-1`) returns `{ type: 'nil' }`, kept distinct from an
 * empty-but-present bulk (`$0` → `{ type: 'bulk', value: '' }`). Any bytes past
 * the reply are retained, keyed on `conn`, for the next call (harmless today —
 * one reply per command — and the seam that survives #145 adding pipelining).
 *
 * @param conn - The connection to read one reply from.
 * @param timeoutMs - Ceiling on a single reply's drain; defaults to 30s. A
 *   truncated frame that never completes rejects rather than blocking forever.
 * @returns The parsed reply. A bulk keeps `''` distinct from nil.
 * @throws {RespServerError} On a framed server error (`-…`) or an in-sync parse
 *   fault (e.g. an unparseable integer) — the whole reply was read, the socket
 *   stays framed, so the caller may reuse the connection.
 * @throws {RespFramingError} On an abandoned frame — an oversized bulk length
 *   (rejected before allocation), a malformed bulk length, or an unexpected type
 *   byte — where bytes remain on the wire, so the caller must discard the
 *   connection. Both subclasses are also a {@link RespError}.
 * @throws {Error} If the connection closes mid-reply or the read times out.
 * @example
 * ```typescript
 * await writeFrame(conn, encodeCommand(['GET', 'session:abc']))
 * const reply = await readReply(conn)
 * if (reply.type === 'nil') {
 *   // cache miss
 * } else if (reply.type === 'bulk') {
 *   JSON.parse(reply.value)
 * }
 * ```
 */
export async function readReply(
    conn: Deno.Conn,
    timeoutMs: number = READ_TIMEOUT_MS,
): Promise<RespReply> {
    const reader = new ReplyReader(
        conn,
        leftovers.get(conn) ?? new Uint8Array(0),
        timeoutMs,
    )
    try {
        return await parseReply(reader)
    } finally {
        leftovers.set(conn, reader.remaining())
    }
}
