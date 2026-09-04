/**
 * @fileoverview Channel kinds and the authorization contract.
 *
 * A channel's kind is derived from its name (Laravel-style prefixes):
 * `presence-*` → presence, `private-*` → private, anything else → public. The
 * app supplies an authorizer; the manager (not the channel) enforces it at
 * subscribe over the connection's **server-derived** identity (security S1).
 *
 * @module @lockness/realtime/channel
 */

/** The three channel kinds. */
export type ChannelKind = 'public' | 'private' | 'presence'

/**
 * Derive a channel's kind from its name.
 *
 * @param name - The channel name.
 * @returns Its kind.
 *
 * @example
 * ```ts
 * channelKind('presence-room.1') // 'presence'
 * channelKind('private-orders')  // 'private'
 * channelKind('news')            // 'public'
 * ```
 */
export function channelKind(name: string): ChannelKind {
    if (name.startsWith('presence-')) return 'presence'
    if (name.startsWith('private-')) return 'private'
    return 'public'
}

/**
 * A presence channel member's public identity, shared only with authorized
 * members of that channel.
 */
export interface PresenceMember {
    /** The member's stable id. */
    id: string | number
    /** Optional public info shown to other members. */
    info?: Record<string, unknown>
}

/** The result of authorizing a connection for a channel. */
export type AuthorizeResult = boolean | PresenceMember

/**
 * An app authorizer for private/presence channels. Receives the connection's
 * **server-derived** identity (never a wire field). Returns `false` to deny; a
 * private channel returns `true` to allow; a presence channel returns the
 * {@link PresenceMember} to allow (or `false` to deny).
 *
 * @typeParam Identity - The app's identity shape.
 */
export type Authorizer<Identity = unknown> = (
    identity: Identity | null,
    channel: string,
) => AuthorizeResult | Promise<AuthorizeResult>
