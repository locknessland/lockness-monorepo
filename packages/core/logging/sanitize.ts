/**
 * @fileoverview Re-export of the framework's log encoder.
 *
 * The implementation moved to `@lockness/contract` so that `@lockness/events`
 * could reach it: core imports events, so events importing core would be a
 * cycle. This file keeps `@lockness/core`'s public name working — its callers
 * did not change and should not have to.
 *
 * @module @lockness/core/logging/sanitize
 */

export { safeForLog } from '@lockness/contract'
