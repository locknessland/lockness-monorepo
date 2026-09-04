/**
 * @fileoverview Internal address formatting helper.
 *
 * Renders a {@link MailAddress} to an RFC-5322 `"Name" <email>` string. Shared
 * by the drivers; not part of the package's public surface.
 *
 * @module @lockness/mail/format
 */

import type { MailAddress } from './types.ts'

/**
 * Format a mail address as `"Name" <email>` (or bare email when unnamed).
 *
 * @param address - The address to format, if any.
 * @returns The formatted address, or an empty string when none is given.
 */
export function formatAddress(address?: MailAddress): string {
    if (!address) return ''
    if (address.name) {
        return `"${address.name}" <${address.email}>`
    }
    return address.email
}
