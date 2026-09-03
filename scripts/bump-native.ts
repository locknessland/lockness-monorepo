#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Lockstep version bump for the Lockness monorepo, delegating to
 * Deno's native `deno bump-version` (Deno >= 2.8).
 *
 * This is the primary entry point behind `deno task bump`. It maps the
 * project's existing bump interface (`--major` / `--minor` / `--patch`, a bare
 * increment keyword, or an absolute `X.Y.Z` that is one clean semver step from
 * the current version) onto `deno bump-version --workspace <increment>`, which
 * applies one shared increment to every workspace member and rewrites the
 * `jsr:@lockness/*` cross-package specifiers in place — i.e. exactly the
 * lockstep model documented in `docs/releasing.md`.
 *
 * Why native over the hand-rolled `scripts/bump.ts` (evaluated in issue #162):
 * the native command preserves subpath specifiers (`@lockness/hono/jsx-runtime`),
 * preserves the root `deno.jsonc` comments, and leaves never-published members
 * (the vite demo) untouched. `scripts/bump.ts` remains as `deno task bump:legacy`
 * for arbitrary version jumps native cannot express as a single increment, and
 * as a fallback while `deno bump-version` is still flagged experimental.
 *
 * @module scripts/bump-native
 *
 * @example
 * ```bash
 * deno task bump --patch          # 0.2.0 -> 0.2.1, all members
 * deno task bump minor            # 0.2.0 -> 0.3.0
 * deno task bump 0.3.0            # accepted: one clean minor step from 0.2.0
 * deno task bump --patch --dry-run
 * ```
 */

import { parse as parseJsonc } from '@std/jsonc'
import { parseArgs } from '@std/cli/parse-args'
import * as semver from '@std/semver'

/** Path to the root workspace configuration. */
const ROOT_CONFIG_PATH = './deno.jsonc' as const

/** The semver increments `deno bump-version` accepts as its positional. */
const INCREMENTS = [
    'major',
    'minor',
    'patch',
    'premajor',
    'preminor',
    'prepatch',
    'prerelease',
] as const

/** A semver increment keyword understood by `deno bump-version`. */
type Increment = (typeof INCREMENTS)[number]

/** Matches a plain `X.Y.Z` version (no prerelease/build metadata). */
const ABSOLUTE_SEMVER = /^\d+\.\d+\.\d+$/

/**
 * Read the current framework version from the root `deno.jsonc`.
 *
 * @returns The current version string (e.g. `"0.2.0"`).
 * @throws {Error} If the file cannot be read or has no string `version` field.
 */
async function readCurrentVersion(): Promise<string> {
    const text = await Deno.readTextFile(ROOT_CONFIG_PATH)
    const config = parseJsonc(text)
    if (
        typeof config !== 'object' || config === null ||
        !('version' in config) ||
        typeof (config as { version: unknown }).version !== 'string'
    ) {
        throw new Error(
            `Root ${ROOT_CONFIG_PATH} has no string "version" field.`,
        )
    }
    return (config as { version: string }).version
}

/**
 * Resolve the requested bump to a native increment keyword.
 *
 * Accepts, in order: a `--major` / `--minor` / `--patch` flag, a bare
 * increment keyword positional, or an absolute `X.Y.Z` that is exactly one
 * `major` / `minor` / `patch` step from `current`. An absolute target that is
 * not a single clean step returns `null` — the caller routes it to the legacy
 * script, which can set an arbitrary version.
 *
 * @param args - Parsed CLI arguments.
 * @param current - The current framework version.
 * @returns The increment keyword, or `null` when only the legacy path applies.
 */
function resolveIncrement(
    args: ReturnType<typeof parseArgs>,
    current: string,
): Increment | null {
    if (args.major === true) return 'major'
    if (args.minor === true) return 'minor'
    if (args.patch === true) return 'patch'

    const positional = args._[0]?.toString()
    if (!positional) return null

    if ((INCREMENTS as readonly string[]).includes(positional)) {
        return positional as Increment
    }

    if (ABSOLUTE_SEMVER.test(positional)) {
        const from = semver.parse(current)
        for (const kind of ['patch', 'minor', 'major'] as const) {
            if (semver.format(semver.increment(from, kind)) === positional) {
                return kind
            }
        }
    }

    return null
}

/**
 * Run `deno bump-version --workspace <increment>` and return its exit code.
 *
 * @param increment - The semver increment to apply to every member.
 * @param dryRun - When true, pass `--dry-run` so no files are written.
 * @returns The subprocess exit code (0 on success).
 */
async function runNative(
    increment: Increment,
    dryRun: boolean,
): Promise<number> {
    const cmdArgs = ['bump-version', '--workspace', increment]
    if (dryRun) cmdArgs.push('--dry-run')

    const command = new Deno.Command('deno', {
        args: cmdArgs,
        stdout: 'inherit',
        stderr: 'inherit',
    })
    const { code } = await command.output()
    return code
}

/**
 * Print usage and the legacy escape hatch.
 */
function printUsage(): void {
    console.error(
        'Usage: deno task bump <--major|--minor|--patch | major|minor|patch | X.Y.Z> [--dry-run]',
    )
    console.error(
        '  For an arbitrary version jump native cannot express as one step,',
    )
    console.error('  use the legacy script: deno task bump:legacy X.Y.Z')
}

/**
 * Entry point: resolve the increment and delegate to the native command.
 */
async function main(): Promise<void> {
    const args = parseArgs(Deno.args, {
        boolean: ['major', 'minor', 'patch', 'dry-run'],
        alias: { major: 'M', minor: 'm', patch: 'p' },
    })

    let current: string
    try {
        current = await readCurrentVersion()
    } catch (error) {
        console.error(
            `Could not read the current version: ${
                error instanceof Error ? error.message : String(error)
            }`,
        )
        Deno.exit(1)
    }

    const increment = resolveIncrement(args, current)
    if (!increment) {
        const positional = args._[0]?.toString()
        if (positional && ABSOLUTE_SEMVER.test(positional)) {
            console.error(
                `"${positional}" is not a single semver step from ${current}; ` +
                    'native bump-version only applies increments.',
            )
            console.error(
                `  Run: deno task bump:legacy ${positional}`,
            )
        } else {
            printUsage()
        }
        Deno.exit(1)
    }

    const code = await runNative(increment, args['dry-run'] === true)
    if (code !== 0) {
        console.error(
            `deno bump-version exited with code ${code}. ` +
                'If this is an experimental-command regression, fall back to: ' +
                'deno task bump:legacy',
        )
    }
    Deno.exit(code)
}

if (import.meta.main) {
    await main()
}
