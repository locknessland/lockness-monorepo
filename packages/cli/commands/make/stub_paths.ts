/**
 * @fileoverview Resolved filesystem/URL paths to the stub directories.
 *
 * Computes the location of the CLI stubs and the Drizzle stubs relative to this
 * module, handling both local `file://` execution and remote `https://` (JSR)
 * execution. The command bodies read templates from these directories.
 *
 * @module @lockness/cli/commands/make/stub_paths
 */

import { dirname, fromFileUrl, join } from '@std/path'

/**
 * Path to the CLI stubs directory.
 *
 * Handles both local `file://` and remote `https://` (JSR) execution. Resolves
 * to `packages/cli/stubs` regardless of how the module is loaded.
 */
export let STUBS_PATH: string

/**
 * Path to the Drizzle stubs directory.
 *
 * Resolves to `packages/drizzle/stubs` regardless of how the module is loaded.
 */
export let DRIZZLE_STUBS_PATH: string

if (import.meta.url.startsWith('file://')) {
    const currentDir = dirname(fromFileUrl(import.meta.url))
    STUBS_PATH = join(currentDir, '..', '..', 'stubs')
    DRIZZLE_STUBS_PATH = join(currentDir, '..', '..', '..', 'drizzle', 'stubs')
} else {
    // When running from JSR, use relative URLs
    STUBS_PATH = new URL('../../stubs', import.meta.url).href
    DRIZZLE_STUBS_PATH = new URL('../../../drizzle/stubs', import.meta.url).href
}
