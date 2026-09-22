/**
 * @fileoverview The JSON wire protocol — envelope types, name validation, and
 * a fail-safe codec.
 *
 * Decoding is defensive: an oversized frame, malformed JSON, an unknown type,
 * or an out-of-charset / oversized channel name raises a {@link ProtocolError}
 * the caller turns into an `error` frame — never a thrown connection crash
 * (FR-006/FR-006a/FR-009, security S3).
 *
 * @module @lockness/realtime/protocol
 */

import type { PresenceMember } from './channel.ts'

/** Client → server frames. */
export type ClientMessage =
    | { type: 'subscribe'; channel: string }
    | { type: 'unsubscribe'; channel: string }
    | { type: 'ping' }

/** Server → client frames. */
export type ServerMessage =
    | {
        type: 'subscribed'
        channel: string
        members?: PresenceMember[]
        /**
         * The roster size `members` was cut from (#339). Present from 0.4.0;
         * `members.length < total` means the snapshot is partial. Absent from
         * an older server, which sent the whole room.
         */
        total?: number
    }
    | { type: 'unsubscribed'; channel: string }
    | { type: 'event'; channel?: string; event: string; data: unknown }
    | {
        type: 'presence'
        channel: string
        action: 'here' | 'joined' | 'left'
        members?: PresenceMember[]
        /**
         * On a `here` frame: the roster size `members` was cut from (#339). A
         * snapshot-time number — `joined`/`left` frames never carry it.
         */
        total?: number
        member?: PresenceMember
    }
    | { type: 'error'; message: string }
    | { type: 'pong' }

/** Raised for any invalid inbound frame. The caller sends an `error`, not a crash. */
export class ProtocolError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ProtocolError'
    }
}

/** Max channel/event name length. */
export const MAX_NAME_LENGTH = 200
/** Default max inbound frame size in bytes. */
export const MAX_FRAME_BYTES = 16 * 1024
const NAME_RE = /^[A-Za-z0-9:._-]+$/

/**
 * Whether a channel/event name is within the allow-list charset and length.
 *
 * @param name - The name to validate.
 * @returns `true` when the name is safe to route and relay.
 */
export function isValidName(name: string): boolean {
    return typeof name === 'string' &&
        name.length > 0 &&
        name.length <= MAX_NAME_LENGTH &&
        NAME_RE.test(name)
}

/**
 * Whether a value may be a presence member id: a string, or a finite number
 * (#346).
 *
 * **One rule, three callers, and they must change together.** The join
 * boundary (`ChannelManager`'s `#assertUsableMemberId`), the Redis frame ingest
 * (`isPlainMember`) and the Redis roster read (`#parseRosterValue`) all decide
 * the id's TYPE through this predicate. Before #346 the two receive-side sites
 * each carried their own copy and the join carried none, so a `null`, an
 * `undefined` or an object id joined locally — `String()` turned each into an
 * ordinary-looking key that two different people then shared — while every
 * peer dropped the frame announcing it. A sender that accepts what its
 * receivers refuse is a silent partial failure; one predicate makes that
 * disagreement unrepresentable.
 *
 * TYPE ONLY. #306's length bound stays at the join, where it protects the
 * roster write; applying it on the receive side would skip entries that still
 * count in a snapshot's `total` (#339). The one receive-side difference from
 * the copies it replaced: an overflowing literal such as `1e999` parses to
 * `Infinity`, which they accepted and this refuses — no join can produce one,
 * since the join boundary refuses a non-finite id first.
 *
 * Package-internal: exported from this module for its callers, NOT from
 * `mod.ts`.
 *
 * @param value - A candidate member id, straight from `authorize()` or a wire.
 * @returns `true` for a string or a finite number.
 *
 * @example
 * ```ts
 * isPresenceMemberIdValue('ada@example.com') // true
 * isPresenceMemberIdValue(1e21)              // true
 * isPresenceMemberIdValue(Number.NaN)        // false
 * isPresenceMemberIdValue(null)              // false
 * ```
 */
export function isPresenceMemberIdValue(
    value: unknown,
): value is string | number {
    if (typeof value === 'string') return true
    return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Whether a value is a well-formed presence member as it crosses a process
 * boundary: a plain object whose `id` passes {@link isPresenceMemberIdValue},
 * whose `info` is absent or a plain (non-array) object, and which carries at
 * most two own keys (#348).
 *
 * **One rule, two callers, and they must agree.** The Redis control-frame
 * ingest (`isPlainMember`, the pre-MAC guard on the one field an attacker can
 * make arbitrarily large) refuses any `presence-join` / `presence-leave` whose
 * member fails it. The manager's departure handler asks the same question of
 * a member a driver reports through `onRosterDeparture`, before it emits
 * locally and publishes: a member this instance showed its own subscribers
 * while every peer dropped the frame would be a silent partial failure — the
 * #346 shape again. Before #348 the manager spelled the `info` half inline and
 * never bounded the keys, so exactly that member got through.
 *
 * **The key bound is a count, not an allow-list** — what the ingest has
 * always enforced, kept unchanged so no frame a 0.3.0 peer admits is refused:
 * `{ id, info, extra }` fails it, `{ id, extra }` does not.
 *
 * Package-internal: exported from this module for its callers, NOT from
 * `mod.ts`.
 *
 * @param value - A candidate member, off the wire or from a driver.
 * @returns `true` when every peer's ingest would admit it.
 *
 * @example
 * ```ts
 * isWirePresenceMember({ id: 7, info: { name: 'Ada' } }) // true
 * isWirePresenceMember({ id: 7, info: [] })              // false
 * isWirePresenceMember({ id: 7, info: {}, extra: 1 })    // false
 * isWirePresenceMember({ id: null })                     // false
 * ```
 */
export function isWirePresenceMember(value: unknown): value is PresenceMember {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
    }
    const member = value as { id?: unknown; info?: unknown }
    // The join boundary's own predicate (#346): a member is refused here only
    // for an id the sending instance would itself have refused at `subscribe`.
    const idOk = isPresenceMemberIdValue(member.id)
    const infoOk = member.info === undefined ||
        (typeof member.info === 'object' && member.info !== null &&
            !Array.isArray(member.info))
    return idOk && infoOk && Object.keys(member).length <= 2
}

/**
 * Encode a server frame for the wire.
 *
 * @param message - The frame to send.
 * @returns The JSON string.
 */
export function encodeServerMessage(message: ServerMessage): string {
    return JSON.stringify(message)
}

/**
 * Decode and validate an inbound client frame.
 *
 * @param raw - The raw frame (string or bytes).
 * @param maxBytes - The max accepted frame size (default {@link MAX_FRAME_BYTES}).
 * @returns The parsed, validated client message.
 * @throws {ProtocolError} On oversize, malformed JSON, unknown type, or an
 *   invalid channel name.
 */
export function decodeClientMessage(
    raw: string | ArrayBufferLike | Uint8Array,
    maxBytes: number = MAX_FRAME_BYTES,
): ClientMessage {
    const text = typeof raw === 'string'
        ? raw
        : new TextDecoder().decode(raw as ArrayBuffer)
    // Measure real UTF-8 bytes, not UTF-16 code units — a multi-byte frame must
    // not slip past the byte budget.
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
        throw new ProtocolError('frame exceeds the maximum size')
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        throw new ProtocolError('malformed JSON frame')
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new ProtocolError('frame is not an object')
    }

    const msg = parsed as Record<string, unknown>
    switch (msg.type) {
        case 'subscribe':
        case 'unsubscribe': {
            if (typeof msg.channel !== 'string' || !isValidName(msg.channel)) {
                throw new ProtocolError('invalid channel name')
            }
            return { type: msg.type, channel: msg.channel }
        }
        case 'ping':
            return { type: 'ping' }
        default:
            throw new ProtocolError(`unknown frame type: ${String(msg.type)}`)
    }
}
