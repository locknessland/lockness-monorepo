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

import { assertEquals, assertRejects } from '@std/assert'
import { encodeCommand, writeFrame } from '../drivers/resp.ts'
import * as sessionPublic from '../mod.ts'

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
})
