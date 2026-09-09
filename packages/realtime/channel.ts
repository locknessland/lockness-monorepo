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
    /**
     * The member's stable id.
     *
     * **Length-bounded, charset-free — decided in #306.** The string form must
     * be 1 to 200 characters, and a numeric id must be finite;
     * `ChannelManager.subscribe` refuses anything else with a
     * `PresenceMemberIdError` before it writes the roster.
     *
     * The charset is deliberately NOT constrained, unlike {@link Connection.id}
     * which #304 bound to `[A-Za-z0-9:._-]`. This is application identity —
     * deployments key presence on emails, usernames and external providers' ids
     * — and that charset rejects `a@b.com` on the `@`. Nothing is bought by it
     * either: RESP bulk strings are length-prefixed so no value can forge a
     * command, control frames carry a MAC, and the owned-set entry parses on
     * the FIRST space with a charset-bounded channel ahead of it, so a field
     * containing spaces is unambiguous.
     *
     * Length is the one thing no layer below bounds. The id becomes a Redis
     * hash field, and the caps upstream are a 10 MiB RESP frame and an 8 KiB
     * control payload — neither a bound on this value, and the roster write
     * happens before the control publish, so without this an oversized id lands
     * in the hash while the frame announcing it is dropped with a warning and
     * `subscribe` still answers `{ ok: true }`.
     */
    id: string | number
    /** Optional public info shown to other members. */
    info?: Record<string, unknown>
}

/**
 * The result of authorizing a connection for a channel.
 *
 * **`false` refuses THIS ATTEMPT. It never removes a standing membership**
 * (#331). A denial on a channel the connection already holds answers that
 * subscribe frame `{ ok: false }` and leaves the subscription, the roster entry
 * and delivery exactly as they were.
 *
 * That is deliberate, and it is what makes `false` safe to return. An
 * authorizer is arbitrary application code — {@link Authorizer} sanctions a DB
 * read, an audit write or a rate-limit increment on **admission**, which is not
 * a verb budget: it never runs for a public channel or for `unsubscribe` at
 * all, so it cannot bound how often the channel verbs are invoked. See
 * `ChannelManager.handlerHooks` for where that belongs (#329). So `false` today
 * already carries "not this fast" and "I could not check". Revoking on it would
 * give those the force of an eviction, silently, with no compile error and no
 * way to express the difference.
 *
 * **Revocation is an explicit server-side verb**, never a side effect of the
 * client asking again: `ChannelManager.unsubscribe` for one channel,
 * `ChannelManager.evict` for a real revoke — which is durable and crosses
 * processes, where a denial-driven removal would survive nothing.
 */
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
