/**
 * `encodeCommand` — the bulk length is the UTF-8 byteLength, always.
 *
 * The frames below are written as byte LITERALS, never derived from
 * `encodeCommand` (plan §5 row 6): a test that asks the encoder to state its
 * own expectation is circular and passes against the very bug it should catch.
 *
 * SC-004 mutation record — verified 2026-09-01. Mutate the encoder
 * `bytes.byteLength → arg.length` in `drivers/resp.ts` and re-run: the two
 * tests below that carry a non-ASCII argument go red instantly —
 *   - "a non-ASCII argument declares its UTF-8 byte length …" (the FR-007 test)
 *   - "a surrogate pair counts its 4 UTF-8 bytes …"
 * while the empty-string, pure-ASCII and CRLF tests stay green because the two
 * encodings agree on ASCII — they pin other invariants and are not this
 * mutation's falsifiers. The driver-level falsifiers are in
 * `redis_wire.test.ts`; see its header for the full record.
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import {
    encodeCommand,
    readReply,
    RespError,
    RespFramingError,
    RespServerError,
    writeFrame,
} from '../drivers/resp.ts'
import * as sessionPublic from '../mod.ts'

/**
 * A `Deno.Conn` whose `read` serves the given chunks in order, one (partial)
 * chunk per call, then EOF (`null`). Splitting a reply across chunks exercises
 * `readReply`'s drain loop; keeping a nil bulk in its own reply pins the
 * nil-vs-empty distinction.
 */
function mockConn(...chunks: Uint8Array[]): Deno.Conn {
    const queue = chunks.filter((c) => c.byteLength > 0)
    return {
        read(p: Uint8Array): Promise<number | null> {
            if (queue.length === 0) return Promise.resolve(null)
            const chunk = queue[0]
            const n = Math.min(chunk.byteLength, p.byteLength)
            p.set(chunk.subarray(0, n))
            if (n < chunk.byteLength) queue[0] = chunk.subarray(n)
            else queue.shift()
            return Promise.resolve(n)
        },
        close() {},
    } as unknown as Deno.Conn
}

const wire = (s: string): Uint8Array => new TextEncoder().encode(s)

Deno.test('encodeCommand - a non-ASCII argument declares its UTF-8 byte length, not its code-unit count', () => {
    // 'Renée' is 5 UTF-16 units and 6 UTF-8 bytes (é is 2 bytes). The broken
    // encoder wrote `$5`; the wire must carry `$6`. Byte-exact literal.
    const frame = encodeCommand(['SET', 'k', 'Renée'])

    assertEquals(
        Array.from(frame),
        [
            42,
            51,
            13,
            10, // *3\r\n
            36,
            51,
            13,
            10,
            83,
            69,
            84,
            13,
            10, // $3\r\nSET\r\n
            36,
            49,
            13,
            10,
            107,
            13,
            10, // $1\r\nk\r\n
            36,
            54,
            13,
            10,
            82,
            101,
            110,
            195,
            169,
            101,
            13,
            10, // $6\r\nRenée\r\n
        ],
    )
})

Deno.test('encodeCommand - the empty string is $0, not special-cased', () => {
    assertEquals(
        new TextDecoder().decode(encodeCommand([''])),
        '*1\r\n$0\r\n\r\n',
    )
})

Deno.test('encodeCommand - a surrogate pair counts its 4 UTF-8 bytes, not its 2 units', () => {
    // '🔒' is 2 UTF-16 units and 4 UTF-8 bytes. The prefix is $4.
    const frame = encodeCommand(['🔒'])

    assertEquals(new TextDecoder().decode(frame), '*1\r\n$4\r\n🔒\r\n')
})

Deno.test('encodeCommand - a pure-ASCII frame is unchanged from the naive encoding', () => {
    // The two encodings agree on ASCII; only there is the fix invisible. This
    // pins that the fix did not perturb the common case.
    assertEquals(
        new TextDecoder().decode(encodeCommand(['GET', 'session:abc'])),
        '*2\r\n$3\r\nGET\r\n$11\r\nsession:abc\r\n',
    )
})

Deno.test('encodeCommand - an embedded CRLF in an argument is data, not a boundary', () => {
    // FR-005: content is never escaped. The bulk length counts the CRLF bytes,
    // and Redis reads them as data because the frame begins with '*'.
    const frame = encodeCommand(['SET', 'k', 'a\r\nb'])
    // 'a\r\nb' is 4 bytes → $4, the CR/LF included in the count.
    assertEquals(
        new TextDecoder().decode(frame),
        '*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$4\r\na\r\nb\r\n',
    )
})

Deno.test('writeFrame - a short write is looped until the whole frame is on the wire (FR-004)', async () => {
    // The mitigation the plan measures: a single write can return fewer bytes
    // than the buffer holds. A fake conn that writes one byte per call must
    // still deliver every byte, in order.
    const delivered: number[] = []
    const oneByteAtATime = {
        write: (b: Uint8Array) => {
            delivered.push(b[0])
            return Promise.resolve(1)
        },
    } as unknown as Deno.Conn

    const frame = encodeCommand(['PING'])
    await writeFrame(oneByteAtATime, frame)

    assertEquals(
        delivered,
        Array.from(frame),
        'every byte reached the wire in order',
    )
})

Deno.test('writeFrame - a write that makes no progress raises instead of spinning (FR-004)', async () => {
    // The guard against an infinite loop. A conn whose write returns 0 must
    // make writeFrame throw, not hang.
    const stalled = {
        write: () => Promise.resolve(0),
    } as unknown as Deno.Conn

    await assertRejects(
        () => writeFrame(stalled, encodeCommand(['PING'])),
        Error,
        'stalled',
    )
})

Deno.test('readReply - a simple string reply', async () => {
    const reply = await readReply(mockConn(wire('+OK\r\n')))
    assertEquals(reply, { type: 'simple', value: 'OK' })
})

Deno.test('readReply - an integer reply', async () => {
    const reply = await readReply(mockConn(wire(':42\r\n')))
    assertEquals(reply, { type: 'integer', value: 42 })
})

Deno.test('readReply - an error reply throws with the server message', async () => {
    await assertRejects(
        () => readReply(mockConn(wire('-ERR something broke\r\n'))),
        RespError,
        'ERR something broke',
    )
})

Deno.test('readReply - a bulk string reply', async () => {
    const reply = await readReply(mockConn(wire('$3\r\nabc\r\n')))
    assertEquals(reply, { type: 'bulk', value: 'abc' })
})

Deno.test('readReply - a nil bulk ($-1) is a distinct outcome, not the empty string (A-M2)', async () => {
    const reply = await readReply(mockConn(wire('$-1\r\n')))
    assertEquals(reply, { type: 'nil' })
})

Deno.test('readReply - an empty-but-present bulk ($0) is the empty string, NOT nil (A-M2)', async () => {
    const reply = await readReply(mockConn(wire('$0\r\n\r\n')))
    assertEquals(reply, { type: 'bulk', value: '' })
})

Deno.test('readReply - a declared bulk length beyond 10 MiB throws without allocating it (SC-006)', async () => {
    // A hostile/misbehaving server declares a huge bulk. The reader must reject
    // on the length line, BEFORE allocating a buffer of the declared size — the
    // resource-exhaustion guard (Security S1). Only the `$<len>\r\n` header is
    // fed; if the reader tried to read the body it would block/EOF, not throw
    // "exceeds", so the specific message proves it rejected pre-allocation.
    const huge = 11 * 1024 * 1024 // > the 10 MiB bound
    await assertRejects(
        () => readReply(mockConn(wire(`$${huge}\r\n`))),
        RespError,
        'exceeds',
    )
})

Deno.test('readReply - a framed -ERR is a RespServerError: the whole reply was read, the socket is in sync', async () => {
    // The `-…` line is consumed in full, so the connection stays framed for the
    // next command. It is a RespServerError (a RespError subclass), the signal
    // the driver keeps the socket on.
    const error = await readReply(mockConn(wire('-ERR boom\r\n'))).then(
        () => {
            throw new Error('expected a reject')
        },
        (e) => e,
    )
    assert(
        error instanceof RespServerError,
        'a framed -ERR is a RespServerError',
    )
    assert(
        error instanceof RespError,
        'and still a RespError for existing checks',
    )
    assert(
        !(error instanceof RespFramingError),
        'a framed reply is not a framing fault',
    )
})

Deno.test('readReply - an unparseable integer is a RespServerError: the reply line was fully consumed', async () => {
    // `:abc\r\n` — the whole line is off the wire, so the socket is in sync even
    // though the value is garbage. The connection is safe to keep.
    const error = await readReply(mockConn(wire(':abc\r\n'))).then(
        () => {
            throw new Error('expected a reject')
        },
        (e) => e,
    )
    assert(
        error instanceof RespServerError,
        'an in-sync parse fault is a RespServerError',
    )
})

Deno.test('readReply - an oversized bulk length is a RespFramingError: the payload is never drained', async () => {
    // The `$<len>\r\n` line is read but the declared body is not; bytes remain on
    // the wire, so the socket is desynced. It must be a RespFramingError, the
    // signal the driver discards the socket.
    const huge = 11 * 1024 * 1024
    const error = await readReply(mockConn(wire(`$${huge}\r\n`))).then(
        () => {
            throw new Error('expected a reject')
        },
        (e) => e,
    )
    assert(
        error instanceof RespFramingError,
        'an oversized bulk is a RespFramingError',
    )
    assert(
        error instanceof RespError,
        'and still a RespError for existing checks',
    )
    assert(
        !(error instanceof RespServerError),
        'a framing fault is not an in-sync server error',
    )
})

Deno.test('readReply - a malformed bulk length is a RespFramingError: the frame is abandoned', async () => {
    const error = await readReply(mockConn(wire('$notanumber\r\n'))).then(
        () => {
            throw new Error('expected a reject')
        },
        (e) => e,
    )
    assert(
        error instanceof RespFramingError,
        'a malformed length is a RespFramingError',
    )
})

Deno.test('readReply - an unexpected type byte is a RespFramingError: the frame cannot be reframed', async () => {
    const error = await readReply(mockConn(wire('?nonsense\r\n'))).then(
        () => {
            throw new Error('expected a reject')
        },
        (e) => e,
    )
    assert(
        error instanceof RespFramingError,
        'an unexpected type byte is a RespFramingError',
    )
})

Deno.test('readReply - bytes past a reply are retained for the next call (A-L2)', async () => {
    // Two replies arrive in one chunk. The first `readReply` consumes only its
    // own frame and retains the surplus (`:99\r\n`) keyed on the conn; the second
    // call parses that retained tail WITHOUT another `conn.read` — the mock EOFs
    // on a second read, so a reader that dropped the leftovers would throw
    // "closed mid-reply" instead of returning the integer.
    const conn = mockConn(wire('+OK\r\n:99\r\n'))
    assertEquals(await readReply(conn), { type: 'simple', value: 'OK' })
    assertEquals(await readReply(conn), { type: 'integer', value: 99 })
})

Deno.test('readReply - the drain deadline is per-reply wall-clock, not reset each read', async () => {
    // Each read delivers one byte after 10ms and the frame never completes, so
    // no single read exceeds the 80ms budget but their sum does. A per-read
    // timer (the bug) resets every read and never fires; a per-reply deadline
    // fixed at the first read fires once the wall-clock budget is spent. The
    // frame stays a `+…` line with no CRLF, so `readReply` keeps draining.
    let stopped = false
    const dribble = {
        read(p: Uint8Array): Promise<number | null> {
            if (stopped) return Promise.resolve(null)
            return new Promise((resolve) =>
                setTimeout(() => {
                    p[0] = 0x2b // '+', a simple-string byte that never terminates
                    resolve(1)
                }, 10)
            )
        },
        close() {
            stopped = true
        },
    } as unknown as Deno.Conn

    try {
        await assertRejects(
            () => readReply(dribble, 80),
            Error,
            'timed out',
        )
    } finally {
        stopped = true
    }
})

Deno.test('resp - the encoder stays internal, off the package surface (FR-006)', () => {
    // SC-005 pins this at build time via `agents:brief`; this pins it at test
    // time. encodeCommand/writeFrame must never be reachable from @lockness/session.
    const surface = sessionPublic as Record<string, unknown>
    assertEquals(
        surface.encodeCommand,
        undefined,
        'encodeCommand is not exported',
    )
    assertEquals(surface.writeFrame, undefined, 'writeFrame is not exported')
    assertEquals(surface.readReply, undefined, 'readReply is not exported')
})
