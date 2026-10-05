import { parseArgs } from '@std/cli'
import { dirname, fromFileUrl, join } from '@std/path'
import { type Cli, Stub } from '@lockness/cli'
import { CommandFailedError, runSteps } from '@lockness/cli/command-failure'
import { runEntry } from '@lockness/cli/entry'
import { DEFAULT_KIT, type KitName, KITS, resolveKit } from './kits.ts'

export { DEFAULT_KIT, KITS, resolveKit } from './kits.ts'
export type { Kit, KitName } from './kits.ts'

/**
 * The web kit's file list, kept as a named export for compatibility.
 *
 * It used to be hand-maintained beside the stub tree and passed to remote
 * scaffolding only. {@link KITS} is the source of truth now, and this is
 * derived from it — the two cannot drift, and a caller that imported this name
 * still gets what it always got, because `web` is the default kit.
 *
 * @deprecated Read `KITS.web` (or `KITS[kit]`) instead.
 */
/**
 * Generate an application key for a scaffolded project.
 *
 * `base64:` followed by 32 random bytes — the one shape
 * `@lockness/session`'s `assertUsableSecret` accepts.
 *
 * **Why this is not imported from `@lockness/session`.** `init` is a scaffolder
 * that runs once; importing the session package would pull it, and Hono behind
 * it, into a tooling package, and would invert the tier the dependency policy
 * gives `init` (`allow: ["cli"]`). The *shape* still has exactly one home —
 * `packages/session/secret.ts` — and `tests/app_key.test.ts` runs this
 * function's output through `assertUsableSecret`, so the two cannot drift apart
 * without a red test. That guarantee is what mattered; a shared symbol was only
 * one way of getting it.
 *
 * @returns A key of the form `base64:<44 base64 characters>`.
 *
 * @example
 * ```typescript
 * await Deno.writeTextFile('.env', `APP_KEY=${generateAppKey()}\n`)
 * ```
 */
export function generateAppKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return `base64:${btoa(binary)}`
}

/**
 * Set `APP_KEY` in an env file's text, replacing any existing line.
 *
 * @param envContent - The `.env.exemple` text.
 * @param key - The generated key.
 * @returns The text carrying exactly one `APP_KEY=` line, with `key`.
 *
 * @example
 * ```typescript
 * withAppKey('APP_ENV=development\nAPP_KEY=\n', 'base64:...')
 * ```
 */
export function withAppKey(envContent: string, key: string): string {
    if (/^APP_KEY=.*$/m.test(envContent)) {
        return envContent.replace(/^APP_KEY=.*$/m, `APP_KEY=${key}`)
    }
    return `${envContent.trimEnd()}\nAPP_KEY=${key}\n`
}

export const INIT_STUB_FILES: readonly string[] = [
    ...KITS.web.base,
    ...KITS.web.overlay,
]

/**
 * Binary files, which are copied rather than templated.
 *
 * @deprecated Read `KITS[kit].binaries` instead.
 */
export const BINARY_FILES: readonly string[] = KITS.web.binaries

/**
 * Parse init command arguments with version support
 *
 * @example
 * ```typescript
 * const config = parseInitArgs(['my-app', '--use', '0.1.15'])
 * // { projectName: 'my-app', use: '0.1.15' }
 * ```
 */
function parseInitArgs(args: string[]): {
    projectName: string
    use?: string
    kit?: string
    help?: boolean
    version?: boolean
} {
    const parsed = parseArgs(args, {
        string: ['use', 'kit'],
        boolean: ['help', 'version'],
        alias: {
            'u': 'use',
            'k': 'kit',
            'h': 'help',
            'v': 'version',
        },
        default: {
            'use': undefined,
            'kit': undefined,
        },
    })

    return {
        projectName: String(parsed._[0] || 'lockness-app'),
        use: parsed['use'] as string | undefined,
        kit: parsed['kit'] as string | undefined,
        help: parsed.help as boolean | undefined,
        version: parsed.version as boolean | undefined,
    }
}

/**
 * Validate semantic version string
 * Supports: X.Y.Z, ^X.Y.Z, ~X.Y.Z, latest
 *
 * @example
 * ```typescript
 * validateVersion('0.1.15')      // true
 * validateVersion('^0.1.0')      // true
 * validateVersion('latest')      // true
 * validateVersion('invalid')     // false
 * ```
 */
function validateVersion(version: string): boolean {
    if (version === 'latest') return true

    // Match semver: X.Y.Z with optional ^ or ~ prefix
    const semverRegex = /^[\^~]?\d+\.\d+\.\d+$/
    return semverRegex.test(version)
}

/**
 * Read this package's own version from its `deno.json`: from disk in a
 * checkout, over HTTP when run from JSR.
 *
 * There is no fallback. The one it replaces answered a hard-coded `0.1.22`,
 * which scaffolded a project pinned to a framework release its stubs do not
 * match; a failure here now reaches the user with its real reason.
 *
 * @returns The version, e.g. `0.4.0`.
 * @throws {CommandFailedError} When JSR answers with an error status.
 * @throws {Error} When the file cannot be read, fetched or parsed.
 */
async function readOwnVersion(): Promise<string> {
    const url = new URL('./deno.json', import.meta.url)
    if (url.protocol === 'file:') {
        return JSON.parse(await Deno.readTextFile(fromFileUrl(url))).version
    }
    const response = await fetch(url)
    if (!response.ok) {
        await response.body?.cancel()
        throw new CommandFailedError(
            `Could not read the @lockness/init version (HTTP ${response.status})`,
        )
    }
    return (await response.json()).version
}

/**
 * Resolve version string to exact version or range
 *
 * @param version - The `--use` value, or `undefined` for the latest.
 * @returns The version range to write into the scaffolded `deno.json`.
 * @throws {CommandFailedError} When `version` is not a form `--use` accepts:
 * the command failure itself (#436, D4 rule 4).
 * @throws {Error} When the latest version cannot be read; a fetch failure
 * propagates (see {@link readOwnVersion}).
 *
 * @example
 * ```typescript
 * await resolveVersion('0.1.15')   // '^0.1.15'
 * await resolveVersion('latest')   // '^0.4.0' (this package's version)
 * await resolveVersion('^0.1.0')   // '^0.1.0'
 * ```
 */
async function resolveVersion(version?: string): Promise<string> {
    if (!version || version === 'latest') {
        return `^${await readOwnVersion()}`
    }

    if (!validateVersion(version)) {
        throw new CommandFailedError(
            `Invalid version format: "${version}". Expected X.Y.Z, ^X.Y.Z, ~X.Y.Z or "latest", e.g. 0.1.15, ^0.1.0, ~0.1.20`,
        )
    }

    // If version starts with ^ or ~, use as-is (range)
    if (version.startsWith('^') || version.startsWith('~')) {
        return version
    }

    // Exact version: prefix with ^ for patch updates
    return `^${version}`
}

/**
 * Display helpful version help message
 */
function displayHelp() {
    console.log(`
📦 Lockness Init - Project Scaffolding

Usage:
  deno run -A jsr:@lockness/init <project-name> [options]

Options:
  --kit, -k <name>       Starter kit: ${
        Object.keys(KITS).join(' | ')
    } (default: ${DEFAULT_KIT})
  --use, -u <version>    Specify framework version (default: latest)
  --help, -h             Show this help message
  --version, -v          Show init package version

Kits:
${
        Object.entries(KITS).map(([name, kit]) =>
            `  ${name.padEnd(21)}${kit.summary}`
        ).join('\n')
    }

Version Formats:
  0.1.15         Exact version (will use ^0.1.15)
  ^0.1.0         Caret range (patch + minor updates)
  ~0.1.20        Tilde range (patch updates only)
  latest         Latest stable version

Examples:
  # Latest version, web kit (both are the default)
  deno run -A jsr:@lockness/init my-app

  # A JSON API, no view layer
  deno run -A jsr:@lockness/init my-api --kit api

  # The smallest possible starting point
  deno run -A jsr:@lockness/init my-app --kit slim

  # Specific version
  deno run -A jsr:@lockness/init my-app --use 0.1.15

  # Version range
  deno run -A jsr:@lockness/init my-app -u "^0.1.0"

  # Pin init package version + framework version
  deno run -A jsr:@lockness/init@0.1.10 my-app --use 0.1.8
`)
}

/**
 * Where a kit's two stub trees live, local checkout or JSR alike.
 *
 * @param kit - The kit being scaffolded.
 * @returns The base directory, the kit's overlay directory, and whether they
 * are remote — which decides how binaries are handled.
 */
function stubRoots(
    kit: KitName,
): { base: string; overlay: string; isRemote: boolean } {
    if (import.meta.url.startsWith('file://')) {
        const here = dirname(fromFileUrl(import.meta.url))
        return {
            base: join(here, 'stubs', 'init'),
            overlay: join(here, 'stubs', 'kits', kit),
            isRemote: false,
        }
    }
    return {
        base: new URL('./stubs/init', import.meta.url).href,
        overlay: new URL(`./stubs/kits/${kit}`, import.meta.url).href,
        isRemote: true,
    }
}

/**
 * Scaffold a project: the one implementation behind `init` on a `Cli` and
 * behind `deno run jsr:@lockness/init`.
 *
 * It reports failure by throwing and never touches process state: the caller
 * (`Cli.dispatch` or `runEntry`) prints the failure once and sets the exit
 * status (#436).
 *
 * @param args - The project name followed by the init options.
 * @throws {CommandFailedError} When `--kit` or `--use` is rejected, before
 * anything is written; or when scaffold steps failed, after every other step
 * ran.
 */
async function runInit(args: string[]): Promise<void> {
    const { projectName, use, kit: rawKit, help, version } = parseInitArgs(
        args,
    )

    if (help) {
        displayHelp()
        return
    }
    if (version) {
        console.log(`@lockness/init v${await readOwnVersion()}`)
        return
    }

    // Resolve the kit and the version BEFORE anything is written. A typo'd
    // --kit must not leave half a project on disk.
    const kit = resolveKit(rawKit)
    const resolvedVersion = await resolveVersion(use)

    const { base, overlay, isRemote } = stubRoots(kit)
    const definition = KITS[kit]
    const target = String(projectName)
    const data = { projectName: target, locknessVersion: resolvedVersion }

    console.log(`🌊 Scaffolding Lockness project: ${projectName}`)
    console.log(`🎒 Kit: ${kit} — ${definition.summary}`)
    console.log(`📦 Framework version: ${resolvedVersion}`)

    // Finish, then fail (#436, FR-010): a step that fails does not stop the
    // others, and the failure names it, so the user knows exactly which part
    // of the project is missing instead of holding an unknown half of one.
    await runSteps([
        // Base first, overlay second. The overlay is allowed to replace a base
        // file, and does for deno.json, the kernel and the README, so the
        // order here is the mechanism, not an incidental.
        {
            label: 'base stubs',
            run: () => Stub.scaffoldFrom(base, target, data, definition.base),
        },
        {
            label: `${kit} kit stubs`,
            run: () =>
                Stub.scaffoldFrom(overlay, target, data, definition.overlay),
        },

        // Binaries are copied, never templated. Remotely there is nothing to
        // copy from (`fetch` would give us text), so they are skipped, exactly
        // as before kits existed.
        ...(isRemote ? [] : definition.binaries).map((file) => ({
            label: file,
            run: async () => {
                const targetPath = join(target, file)
                await Deno.mkdir(dirname(targetPath), { recursive: true })
                await Deno.copyFile(join(base, file), targetPath)
            },
        })),

        // Directories the app writes into at runtime, which therefore have no
        // stub to create them.
        {
            label: 'directories',
            run: async () => {
                for (const dir of definition.directories) {
                    await Deno.mkdir(`${target}/${dir}`, { recursive: true })
                }
            },
        },

        // Copy .env.exemple to .env, and give THIS project its own key.
        //
        // Injected here rather than templated into the stub on purpose:
        // `.env.exemple` is committed by the user, so a key placed there would
        // ship with the project and be shared by everyone who clones it, the
        // defect this replaces in a new costume. Every kit ships
        // `.env.exemple`, so a failure here is real, never an absent file.
        {
            label: '.env',
            run: async () => {
                const envContent = await Deno.readTextFile(
                    `${target}/.env.exemple`,
                )
                // 0600: this file now carries live key material, and its
                // sensitivity rose the moment a real key went into it. The
                // default 0644 would leave it world-readable.
                await Deno.writeTextFile(
                    `${target}/.env`,
                    withAppKey(envContent, generateAppKey()),
                    { mode: 0o600 },
                )
            },
        },

        // Create .env.production.local, with a key of its own.
        //
        // Without one, a freshly scaffolded project fails its first production
        // deploy (the framework refuses to boot on the cookie driver with no
        // APP_KEY), and the natural repair for that is to paste a key from a
        // blog post, which is how shared keys spread.
        {
            label: '.env.production.local',
            run: () =>
                Deno.writeTextFile(
                    `${target}/.env.production.local`,
                    `APP_ENV=production\nAPP_KEY=${generateAppKey()}\n`,
                    { mode: 0o600 },
                ),
        },
    ])

    console.log('\n✅ Done! To get started:')
    console.log(`  cd ${projectName}`)
    console.log('  deno task dev')
    console.log(`\n${definition.omits}`)
}

/**
 * Register the `init` command on a CLI.
 *
 * A failed scaffold throws, so `Cli.dispatch` prints it once and returns a
 * non-zero status.
 *
 * @param cli - The CLI to register `init` on.
 *
 * @example
 * ```typescript
 * registerInitCommand(cli)
 * await cli.dispatch(['init', 'my-app', '--kit', 'api'])
 * ```
 */
export function registerInitCommand(cli: Cli): void {
    cli.register('init', runInit, 'Initialize a new Lockness project')
}

if (import.meta.main) await runEntry('init', () => runInit(Deno.args))
