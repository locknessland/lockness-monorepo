/**
 * @fileoverview RESP2 wire encoding for the Redis session driver.
 *
 * The one home for two decisions (plan §5, feature 007):
 *
 * 1. **How many bytes a RESP argument occupies on the wire** — `encodeCommand`.
 * 2. **A frame is fully on the wire before a reply is read** — `writeFrame`.
 *
 * It exists because the driver used to length-prefix each argument with
 * `arg.length` (UTF-16 code units) while writing UTF-8 bytes, so every
 * non-ASCII argument declared a bulk length short of the bytes actually
 * written. Redis advances its parse cursor by `bulklen + 2` without checking
 * those two bytes are CRLF, so the surplus was parsed as a fresh inline
 * command — arbitrary command injection plus reply/command desync, reproduced
 * against a live `redis:7-alpine`. See #141.
 *
 * Reply reading and parsing are deliberately NOT here — they stay in
 * `redis.ts` until #139 moves them beside this module.
 *
 * @module @lockness/session/drivers/resp
 */

const encoder = new TextEncoder()

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
