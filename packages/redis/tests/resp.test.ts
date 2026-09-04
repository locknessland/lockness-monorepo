/**
 * @fileoverview RESP2 codec round-trip for `@lockness/redis`.
 *
 * The frames below are written as byte LITERALS, never derived from
 * `encodeCommand`: a test that asks the encoder to state its own expectation is
 * circular and passes against the very bug it should catch (the #141
 * under-declared bulk length). `readReply` is driven off a mock `Deno.Conn` that
 * serves bytes chunk-by-chunk, exercising the drain loop and the nil-vs-empty
 * distinction.
 *
 * @module @lockness/redis/tests/resp
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import {
    encodeCommand,
    readReply,
    RespError,
    RespFramingError,
    RespServerError,
    writeFrame,
} from '../mod.ts'

/**
 * A `Deno.Conn` whose `read` serves the given chunks in order, one (partial)
 * chunk per call, then EOF (`null`). Splitting a reply across chunks exercises
 * `readReply`'s drain loop.
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

Deno.test('encodeCommand - bulk length is the UTF-8 byteLength, not the code-unit count', () => {
    // 'Renée' is 5 UTF-16 units and 6 UTF-8 bytes (é is 2 bytes). The #141 bug
    // wrote $5 while emitting 6 bytes; the literal below pins $6.
    const frame = encodeCommand(['SET', 'k', 'Renée'])
    assertEquals(
        new TextDecoder().decode(frame),
        '*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$6\r\nRenée\r\n',
    )
})

Deno.test('encodeCommand - an embedded CRLF in an argument is data, not a boundary', () => {
    const frame = encodeCommand(['SET', 'k', 'a\r\nb'])
    assertEquals(
        new TextDecoder().decode(frame),
        '*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$4\r\na\r\nb\r\n',
    )
})

Deno.test('readReply - a simple string reply', async () => {
    assertEquals(await readReply(mockConn(wire('+OK\r\n'))), {
        type: 'simple',
        value: 'OK',
    })
})

Deno.test('readReply - an integer reply', async () => {
    assertEquals(await readReply(mockConn(wire(':42\r\n'))), {
        type: 'integer',
        value: 42,
    })
})

Deno.test('readReply - a bulk string reply', async () => {
    assertEquals(await readReply(mockConn(wire('$3\r\nabc\r\n'))), {
        type: 'bulk',
        value: 'abc',
    })
})

Deno.test('readReply - a multi-bulk array reply', async () => {
    assertEquals(
        await readReply(mockConn(wire('*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n'))),
        {
            type: 'array',
            value: [
                { type: 'bulk', value: 'foo' },
                { type: 'bulk', value: 'bar' },
            ],
        },
    )
})

Deno.test('readReply - an empty array ($*0) is distinct from a nil array (*-1)', async () => {
    assertEquals(await readReply(mockConn(wire('*0\r\n'))), {
        type: 'array',
        value: [],
    })
    assertEquals(await readReply(mockConn(wire('*-1\r\n'))), { type: 'nil' })
})

Deno.test('readReply - a nested array reassembles recursively', async () => {
    assertEquals(
        await readReply(mockConn(wire('*1\r\n*2\r\n:7\r\n$1\r\nx\r\n'))),
        {
            type: 'array',
            value: [
                {
                    type: 'array',
                    value: [
                        { type: 'integer', value: 7 },
                        { type: 'bulk', value: 'x' },
                    ],
                },
            ],
        },
    )
})

Deno.test('readReply - an over-cardinality array (*huge) is a RespFramingError before the parse loop', async () => {
    await assertRejects(
        () => readReply(mockConn(wire('*99999999999\r\n'))),
        RespFramingError,
    )
})

Deno.test('readReply - a malformed array length is a RespFramingError', async () => {
    await assertRejects(
        () => readReply(mockConn(wire('*notanumber\r\n'))),
        RespFramingError,
    )
})

Deno.test('readReply - a nil bulk ($-1) is distinct from an empty bulk ($0)', async () => {
    assertEquals(await readReply(mockConn(wire('$-1\r\n'))), { type: 'nil' })
    assertEquals(await readReply(mockConn(wire('$0\r\n\r\n'))), {
        type: 'bulk',
        value: '',
    })
})

Deno.test('readReply - a bulk body split across two reads reassembles', async () => {
    const body = 'y'.repeat(5000)
    const full = wire(`$${body.length}\r\n${body}\r\n`)
    const at = 2010 // mid-body, past the length prefix
    assertEquals(
        await readReply(mockConn(full.subarray(0, at), full.subarray(at))),
        { type: 'bulk', value: body },
    )
})

Deno.test('readReply - a framed -ERR is a RespServerError (socket stays in sync)', async () => {
    const error = await readReply(mockConn(wire('-ERR boom\r\n'))).then(
        () => null,
        (e) => e,
    )
    assert(error instanceof RespServerError)
    assert(error instanceof RespError)
    assert(!(error instanceof RespFramingError))
})

Deno.test('readReply - an oversized bulk length is a RespFramingError, not allocated', async () => {
    const huge = 11 * 1024 * 1024
    const error = await readReply(mockConn(wire(`$${huge}\r\n`))).then(
        () => null,
        (e) => e,
    )
    assert(error instanceof RespFramingError)
    assert(error instanceof RespError)
})

Deno.test('writeFrame + readReply - a command round-trips over a loopback socket', async () => {
    // A genuine wire round-trip: encode a command, write it to a loopback
    // listener that replies with a canned bulk, and drain the reply. Not "live
    // Redis" — a byte echo over 127.0.0.1.
    const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 })
    const port = (listener.addr as Deno.NetAddr).port
    const server = (async () => {
        const conn = await listener.accept()
        const buf = new Uint8Array(4096)
        await conn.read(buf) // consume the client's frame
        await conn.write(wire('$5\r\nhello\r\n'))
        conn.close()
    })()

    const conn = await Deno.connect({ hostname: '127.0.0.1', port })
    try {
        await writeFrame(conn, encodeCommand(['GET', 'greeting']))
        assertEquals(await readReply(conn), { type: 'bulk', value: 'hello' })
    } finally {
        conn.close()
        await server
        listener.close()
    }
})

Deno.test('writeFrame - a write that makes no progress raises instead of spinning', async () => {
    const stalled = {
        write: () => Promise.resolve(0),
    } as unknown as Deno.Conn
    await assertRejects(
        () => writeFrame(stalled, encodeCommand(['PING'])),
        Error,
    )
})
