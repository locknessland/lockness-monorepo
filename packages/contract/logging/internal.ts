/**
 * @fileoverview The logging helpers for Lockness packages only: the credential
 * rule and the failure-message renderer.
 *
 * Exposed on `@lockness/contract/logging/internal`, never the root:
 * `@lockness/core` re-exports the root with `export *`, so anything there
 * reaches every app.
 *
 * - `isCredentialParamName` and `redactQueryCredentials` — the one rule for
 *   which `name=value` pairs carry a credential (`credential_params.ts`).
 * - `renderMessage` — a failure message rendered for a terminal or a log line
 *   (`sanitize.ts`), what `@lockness/cli` prints after `❌`.
 *
 * @module @lockness/contract/logging/internal
 */

export {
    isCredentialParamName,
    redactQueryCredentials,
} from './credential_params.ts'
export { renderMessage } from './sanitize.ts'
