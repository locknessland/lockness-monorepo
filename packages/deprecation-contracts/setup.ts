/**
 * @fileoverview The setup step of `@lockness/deprecation-contracts`, run by
 * `./nessy package:install deprecation-contracts`.
 *
 * The named {@link setup} export receives a `SetupContext` from the command:
 * it registers the package through the context and adds the deprecation
 * variables to the app's `.env` and `.env.exemple`. It replaces the
 * `install.ts` that imported `@lockness/cli` for `addPackage`, `runEntry` and
 * `CommandFailedError` — the port leaves this package with no `cli` edge
 * (plan 274 §5, #592). Which file holds the app's package list, and the
 * check that the directory is a Lockness project, are the context's.
 *
 * @example
 * ```bash
 * ./nessy package:install deprecation-contracts
 * ```
 *
 * @module @lockness/deprecation-contracts/setup
 */

import { join } from 'node:path'
import type { PackageSetup } from '@lockness/contract/setup'

/** The variables added to each environment file that lacks them. */
const DEPRECATION_CONFIG =
    '\n# Deprecation Configuration\nSTRICT_DEPRECATIONS=false\nIGNORE_DEPRECATIONS=false\n'

/** The environment files the setup extends, relative to the project root. */
const ENV_FILES = ['.env', '.env.exemple'] as const

/**
 * Read a text file that may legitimately be absent.
 *
 * @param path - The file to read.
 * @returns Its content, or `undefined` when it does not exist.
 * @throws {Error} Any other read error (permissions, a directory, …): only
 *   absence is expected, so nothing else is skipped silently.
 */
async function readIfExists(path: string): Promise<string | undefined> {
    try {
        return await Deno.readTextFile(path)
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return undefined
        throw error
    }
}

/**
 * Set up `@lockness/deprecation-contracts` in the application: register the
 * package, then add `STRICT_DEPRECATIONS` and `IGNORE_DEPRECATIONS` to each
 * existing `.env` / `.env.exemple` that lacks them. A missing file is not
 * created.
 *
 * Registration comes first, so a directory that is not a Lockness project
 * fails before any file is written.
 *
 * @param context - What `package:install` provides: the project root and the
 *   package registration.
 * @returns A promise that resolves once the package is set up.
 * @throws {import('@lockness/contract/command').CommandFailure} When the
 *   context cannot register the package (not a project, unreadable manifest).
 * @throws {Error} When an existing environment file cannot be read or written.
 *
 * @example
 * ```ts
 * import { setup } from '@lockness/deprecation-contracts/setup'
 *
 * // package:install builds the context; a test can stub it:
 * await setup({
 *     root: Deno.cwd(),
 *     registerPackage: (name) => {
 *         console.log(`would register ${name}`)
 *         return Promise.resolve()
 *     },
 * })
 * ```
 */
export const setup: PackageSetup = async (context) => {
    console.log('🌊 Installing @lockness/deprecation-contracts...\n')

    await context.registerPackage('deprecation-contracts')

    for (const name of ENV_FILES) {
        const path = join(context.root, name)
        const content = await readIfExists(path)
        if (content === undefined || content.includes('STRICT_DEPRECATIONS')) {
            continue
        }
        await Deno.writeTextFile(path, content + DEPRECATION_CONFIG)
        console.log(`✓ Updated ${name} with deprecation configuration`)
    }

    console.log('\n✅ @lockness/deprecation-contracts installed successfully!')
    console.log('📖 Usage:')
    console.log(
        '   import { triggerDeprecation } from "@lockness/deprecation-contracts"',
    )
    console.log(
        '   triggerDeprecation("my-pkg", "1.2.0", "Use newMethod() instead")\n',
    )
    console.log('⚙️ Configuration:')
    console.log('   CHECK your .env file to control deprecation behavior.\n')
}
