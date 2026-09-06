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

import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert'
import {
    encodeCommand,
    MAX_BULK_BYTES,
    MAX_COMMAND_FRAME_BYTES,
    readReply,
    RespCommandTooLargeError,
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

Deno.test('readReply - a line that never terminates is refused on SIZE, not on time', async () => {
    // #245. `MAX_BULK_BYTES` guards a bulk BODY, and only once a well-formed
    // length line has been read. The line itself had no ceiling: `readLine`
    // looped on `#fill` until a CRLF appeared, so the memory a peer could force
    // was bandwidth x the read deadline rather than a fixed number.
    //
    // That mattered the moment #274 raised the subscribe socket's deadline —
    // a bound riding on a timeout gets weaker every time the timeout grows, and
    // silently. The `timeoutMs` here is deliberately generous: if this test ever
    // passes by TIMING OUT rather than by refusing the size, it is proving the
    // wrong thing.
    const encoder = new TextEncoder()
    // A VALID type byte, so the refusal is the length cap and not "unknown
    // reply type" — the same test passing for a different reason.
    const first = encoder.encode('+' + 'x'.repeat(8 * 1024 - 1))
    const chunk = encoder.encode('x'.repeat(8 * 1024))
    const chunks = [first, ...Array.from({ length: 23 }, () => chunk)]
    const error = await readReply(mockConn(...chunks), 60_000).then(
        () => null,
        (e) => e,
    )
    assert(
        error instanceof RespFramingError,
        `expected a framing error, received ${String(error)}`,
    )
    assert(
        String(error).includes('without a CRLF'),
        'the message names WHY it was refused, so an operator is not left ' +
            'reading a timeout that was really a size limit',
    )
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

Deno.test('#287: a length prefix is decimal digits or -1, and nothing else', async () => {
    // Every row measured against `Number()` before this landed, and every one
    // of them was ACCEPTED as a length — reading the wrong number of bytes off
    // the socket and desyncing it without raising.
    const rejected = ['', ' ', '0x10', '1e3', '+5', '0b11', '5.', '-2', '1_0']
    for (const bad of rejected) {
        for (const type of ['$', '*']) {
            await assertRejects(
                () => readReply(mockConn(wire(`${type}${bad}\r\n`))),
                RespFramingError,
                undefined,
                `a ${type} length of ${JSON.stringify(bad)} was accepted`,
            )
        }
    }
    // And the two forms that must still work.
    assertEquals(await readReply(mockConn(wire('$-1\r\n'))), { type: 'nil' })
    assertEquals(await readReply(mockConn(wire('$2\r\nhi\r\n'))), {
        type: 'bulk',
        value: 'hi',
    })
})

Deno.test('#287: a bulk body must be followed by CRLF, not merely two bytes', async () => {
    // The other half of the same trust. The length check stops the client
    // believing a bad length; this stops it believing the frame ended where the
    // length said. Two bytes consumed unchecked slide the cursor silently.
    await assertRejects(
        () => readReply(mockConn(wire('$2\r\nhiXX'))),
        RespFramingError,
        undefined,
        'a bulk body followed by non-CRLF was accepted',
    )
})

Deno.test('#286: a write that never settles rejects on its deadline', async () => {
    // The leg #245's liveness window does not cover. `written <= 0` catches a
    // socket that reports no progress; this is the other shape — a socket that
    // reports NOTHING, because `conn.write` never settles. A peer that accepts
    // the connection and then stops draining produces exactly that, and until
    // now it left the caller suspended with no error, no retry and no log line.
    const stalled = {
        write: () => new Promise<number>(() => {}),
    } as unknown as Deno.Conn
    const started = Date.now()
    const error = await assertRejects(
        () => writeFrame(stalled, encodeCommand(['PING']), 60),
        Error,
    )
    const elapsed = Date.now() - started
    assert(elapsed < 2000, `it waited ${elapsed}ms — the deadline did nothing`)
    assert(
        /timed out/i.test(error.message),
        `the message must say what happened, got: ${error.message}`,
    )
})

Deno.test('#286: the deadline is per FRAME, not per write', async () => {
    // The distinction that decides whether the bound works at all. A socket
    // dribbling one byte per tick keeps a PER-WRITE timer alive forever — each
    // write completes, each timer is cleared, and the frame never finishes.
    // `ReplyReader` already records this reasoning for the read side ("a
    // per-REPLY wall-clock deadline, not a timer reset on every conn.read");
    // the write side has the identical failure mode.
    //
    // 20ms per byte against a 60ms budget: every individual write is well
    // inside any per-write timeout, and the frame still must not complete.
    let written = 0
    const dribble = {
        write: () =>
            new Promise<number>((resolve) =>
                setTimeout(() => {
                    written++
                    resolve(1)
                }, 20)
            ),
    } as unknown as Deno.Conn
    const frame = encodeCommand(['PING'])
    const error = await assertRejects(
        () => writeFrame(dribble, frame, 60),
        Error,
    )
    assert(
        written > 0 && written < frame.byteLength,
        `the socket must have made SOME progress and not finished — wrote ` +
            `${written} of ${frame.byteLength}. If it wrote the whole frame ` +
            'this fixture no longer tests a per-frame deadline.',
    )
    assert(/timed out/i.test(error.message), error.message)
})

Deno.test('#286: the stall message does not claim an exact byte offset', async () => {
    // An abandoned `conn.write` cannot be cancelled and may still be advancing
    // the offset after the deadline fires, so any number in this message is a
    // lower bound and must say so. The `written <= 0` error keeps its exact
    // offset — it has one, because that write returned.
    const dribble = {
        write: () =>
            new Promise<number>((resolve) => setTimeout(() => resolve(1), 20)),
    } as unknown as Deno.Conn
    const error = await assertRejects(
        () => writeFrame(dribble, encodeCommand(['PING']), 60),
        Error,
    )
    assert(
        /at least/i.test(error.message),
        'the confirmed count must be marked as a lower bound, got: ' +
            error.message,
    )
})

Deno.test('#286: an absent deadline leaves the loop unbounded, exactly as before', async () => {
    // Q1. The parameter is OPTIONAL and `undefined` means unbounded, which is
    // what keeps the command path out of this change: `exchange` passes its
    // timeout to `readReply` only, so a DEFAULTED write deadline would have
    // reached AUTH, SELECT, QUIT and every RedisClient.command without a caller
    // opting in — and bypassed the handshake's per-step `#remaining`
    // threading, restoring the multiplication #274 fixed.
    //
    // Asserting a non-event, so it needs its own control: the same socket with
    // a deadline DOES reject, three lines down.
    const stalled = {
        write: () => new Promise<number>(() => {}),
    } as unknown as Deno.Conn
    const unbounded = writeFrame(stalled, encodeCommand(['PING']))
    const raced = await Promise.race([
        unbounded.then(() => 'settled'),
        new Promise((resolve) =>
            setTimeout(() => resolve('still pending'), 120)
        ),
    ])
    assertEquals(raced, 'still pending')
    await assertRejects(
        () => writeFrame(stalled, encodeCommand(['PING']), 40),
        Error,
        undefined,
        'the control: the same socket WITH a deadline must reject, or the ' +
            'assertion above proves nothing about the deadline being absent',
    )
})

Deno.test('#286: writeFrame refuses a nonsense deadline', async () => {
    // FR-010. An exported parameter with no defined behaviour for 0 / NaN /
    // negative is a public API that accepts a value and does something
    // arbitrary with it.
    const ok = { write: () => Promise.resolve(1) } as unknown as Deno.Conn
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        await assertRejects(
            () => writeFrame(ok, encodeCommand(['PING']), bad),
            RangeError,
            undefined,
            `a timeout of ${bad} was accepted`,
        )
    }
})

Deno.test('readReply - the TOTAL of a multi-bulk reply is bounded, not just each part', async () => {
    // #245, review gate. MAX_BULK_BYTES bounds one bulk BODY and MAX_LINE_BYTES
    // one line; neither bounds their sum. A multi-bulk of individually-legal
    // elements aggregated without limit, and the parsed form is far larger than
    // the wire that produced it — 4 MB of wire measured at 81.5 MB of heap.
    //
    // As with MAX_LINE_BYTES, the generous timeout is deliberate: if this ever
    // passes by timing out rather than by refusing the size, it proves nothing.
    const encoder = new TextEncoder()
    const megabyte = 'm'.repeat(1024 * 1024)
    const chunks: Uint8Array[] = [encoder.encode('*64\r\n')]
    for (let i = 0; i < 40; i++) {
        chunks.push(encoder.encode(`$${1024 * 1024}\r\n${megabyte}\r\n`))
    }
    const error = await readReply(mockConn(...chunks), 60_000).then(
        () => null,
        (e) => e,
    )
    assert(
        error instanceof RespFramingError,
        `expected a framing error, received ${String(error)}`,
    )
    assert(
        String(error).includes('in total'),
        'the message says it was the AGGREGATE that was refused, so an ' +
            'operator is not left hunting for an oversized single element',
    )
})

Deno.test('#300: an oversized command is refused WITHOUT being encoded', () => {
    // "Before writeFrame" is not "before the allocation". `encodeCommand`
    // allocates `encoder.encode(arg)` per argument and then the assembled
    // frame, so a check downstream of it costs ~2x the payload in transient
    // heap before refusing — the refusal becomes the memory event it exists to
    // prevent. `resp.ts` already states the correct principle twice on the read
    // side: MAX_BULK_BYTES "throws BEFORE any buffer of the declared size is
    // allocated".
    //
    // The cheap pre-check is on `Σ args[i].length` in UTF-16 units, which is a
    // sound LOWER bound on the UTF-8 byte length — a BMP char is 1 unit and >=1
    // byte, an astral pair is 2 units and 4 bytes, an unpaired surrogate is 1
    // unit and 3 bytes — so it refuses with no false positives and no encode.
    // Six times the limit, so the encode this must NOT do is measurable.
    // Measured on this machine: encoding 60 MB of ASCII takes ~41ms, 20 MB
    // ~12ms, and the pre-check is a loop over `args.length` — microseconds. The
    // bound below is set from that measurement, not guessed; an earlier version
    // used 200ms with a payload at the limit, where encoding costs ~5ms, so it
    // passed with the pre-check deleted and proved nothing.
    const huge = 'x'.repeat(60 * 1024 * 1024)
    const before = performance.now()
    assertThrows(
        () => encodeCommand(['SETEX', 'k', '60', huge]),
        RespCommandTooLargeError,
    )
    const elapsed = performance.now() - before
    assert(
        elapsed < 20,
        `refusing took ${elapsed.toFixed(1)}ms. Encoding this payload costs ` +
            '~41ms, so it was encoded before being refused — which is the ' +
            'memory event the bound exists to prevent.',
    )
})

Deno.test('#300: a multi-byte payload under the UTF-16 bound is still refused', () => {
    // The case the cheap pre-check cannot see, and therefore the one that says
    // the exact check is load-bearing. `String.length` is UTF-16 code units,
    // which is a LOWER bound on UTF-8 bytes — sound for refusing, blind to a
    // payload that is under the limit in units and over it in bytes.
    //
    // `é` is 1 unit and 2 bytes: this payload is 5,242,888 units (under the
    // 10 MiB limit) and 10,485,776 bytes (over it). Only the exact check after
    // the encode catches it.
    const multi = 'é'.repeat(Math.floor(MAX_COMMAND_FRAME_BYTES / 2) + 8)
    assert(
        multi.length <= MAX_COMMAND_FRAME_BYTES,
        'the fixture must be UNDER the limit in UTF-16 units, or the ' +
            'pre-check catches it and this proves nothing about the exact one',
    )
    assertThrows(
        () => encodeCommand(['SET', 'k', multi]),
        RespCommandTooLargeError,
    )
})

Deno.test('#300: the refusal names the verb and a BUCKETED size, never the exact one', () => {
    // An exact frame size is a length derived from arguments: for a fixed verb
    // and arity it inverts to their summed byte length. An attacker padding a
    // field they influence inside a blob that also holds a secret reads the
    // secret's length to the byte in one probe. `resp.ts` records #297 removing
    // this exact class.
    //
    // Asserted as an EQUALITY, not an absence: two payloads of different sizes
    // inside one bucket must produce byte-identical messages. An absence test
    // cannot catch a number it was not told to look for, and that is precisely
    // what let the previous disclosure survive.
    const bucket = 1024 * 1024
    const a = 'x'.repeat(MAX_COMMAND_FRAME_BYTES + 1)
    const b = 'x'.repeat(MAX_COMMAND_FRAME_BYTES + 1 + Math.floor(bucket / 2))
    const messageOf = (payload: string) => {
        try {
            encodeCommand(['SETEX', 'k', '60', payload])
        } catch (error) {
            return (error as Error).message
        }
        throw new Error('it was not refused')
    }
    const first = messageOf(a)
    assertEquals(
        first,
        messageOf(b),
        'two payloads inside one bucket produced different messages, so the ' +
            'message carries resolution finer than the bucket',
    )
    assert(/SETEX/.test(first), `it must name the verb: ${first}`)
    assert(
        !first.includes(String(MAX_COMMAND_FRAME_BYTES + 1)),
        `it names the exact size: ${first}`,
    )
})

Deno.test('#300: a frame just under the limit still encodes', () => {
    // A bound that cannot be approached is a bound set wrong.
    const fits = 'x'.repeat(MAX_COMMAND_FRAME_BYTES - 64)
    const frame = encodeCommand(['SET', 'k', fits])
    assert(frame.byteLength <= MAX_COMMAND_FRAME_BYTES)
})

Deno.test('#300: the write bound never exceeds the read bound', () => {
    // The round-trip invariant, and the reason the bound is DERIVED rather than
    // chosen. A value this client can write must be a value it can read back:
    // above MAX_BULK_BYTES the reply raises RespFramingError on every GET, the
    // socket is discarded, and the key is a poison pill that survives process
    // restart because it lives in Redis rather than in memory.
    //
    // The payload survey the first plan draft asked for cannot be conducted —
    // session and queue bound nothing — so this inequality IS the derivation.
    assert(
        MAX_COMMAND_FRAME_BYTES <= MAX_BULK_BYTES,
        `a frame of ${MAX_COMMAND_FRAME_BYTES} bytes can be written and never ` +
            `read: the reply bound is ${MAX_BULK_BYTES}`,
    )
})
