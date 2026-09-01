import { parseArgs } from '@std/cli'
import { dirname, fromFileUrl, join } from '@std/path'
import { type Cli, Stub } from '@lockness/cli'
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
 * Resolve version string to exact version or range
 *
 * @example
 * ```typescript
 * await resolveVersion('0.1.15')   // '^0.1.15'
 * await resolveVersion('latest')   // '^0.1.22' (current version)
 * await resolveVersion('^0.1.0')   // '^0.1.0'
 * ```
 */
async function resolveVersion(version?: string): Promise<string> {
    if (!version || version === 'latest') {
        // Read current version from deno.json
        try {
            let denoJsonPath: string
            if (import.meta.url.startsWith('file://')) {
                denoJsonPath = fromFileUrl(
                    new URL('./deno.json', import.meta.url),
                )
            } else {
                // When running from JSR, fetch the file
                const response = await fetch(
                    new URL('./deno.json', import.meta.url),
                )
                if (response.ok) {
                    const denoJson = await response.json()
                    return `^${denoJson.version}`
                }
                // Fallback if we can't read version
                return '^0.1.22'
            }
            const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath))
            return `^${denoJson.version}`
        } catch {
            // Fallback if we can't read the version
            return '^0.1.22'
        }
    }

    if (!validateVersion(version)) {
        throw new Error(
            `Invalid version format: "${version}"\n` +
                `Expected: X.Y.Z, ^X.Y.Z, ~X.Y.Z, or "latest"\n` +
                `Examples: 0.1.15, ^0.1.0, ~0.1.20, latest`,
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

export function registerInitCommand(cli: Cli) {
    cli.register('init', async (args: string[]) => {
        const { projectName, use, kit: rawKit } = parseInitArgs(args)

        // Resolve the kit BEFORE anything is written. A typo'd --kit must not
        // leave half a project on disk.
        let kit: KitName
        try {
            kit = resolveKit(rawKit)
        } catch (error) {
            console.error(`❌ ${(error as Error).message}`)
            Deno.exit(1)
        }

        // Resolve version (validate and normalize)
        let resolvedVersion: string
        try {
            resolvedVersion = await resolveVersion(use)
        } catch (error) {
            console.error(`❌ ${(error as Error).message}`)
            Deno.exit(1)
        }

        const { base, overlay, isRemote } = stubRoots(kit)
        const definition = KITS[kit]
        const data = {
            projectName: String(projectName),
            locknessVersion: resolvedVersion,
        }

        console.log(`🌊 Scaffolding Lockness project: ${projectName}`)
        console.log(`🎒 Kit: ${kit} — ${definition.summary}`)
        console.log(`📦 Framework version: ${resolvedVersion}`)

        try {
            // Base first, overlay second. The overlay is allowed to replace a
            // base file, and does for deno.json, the kernel and the README —
            // so the order here is the mechanism, not an incidental.
            await Stub.scaffoldFrom(
                base,
                String(projectName),
                data,
                definition.base,
            )
            await Stub.scaffoldFrom(
                overlay,
                String(projectName),
                data,
                definition.overlay,
            )

            // Binaries are copied, never templated. Remotely there is nothing
            // to copy from — `fetch` would give us text — so they are skipped,
            // exactly as before kits existed.
            if (!isRemote) {
                for (const file of definition.binaries) {
                    try {
                        const sourcePath = join(base, file)
                        const targetPath = join(projectName, file)
                        await Deno.mkdir(dirname(targetPath), {
                            recursive: true,
                        })
                        await Deno.copyFile(sourcePath, targetPath)
                    } catch (error) {
                        console.warn(
                            `⚠️  Could not copy binary file ${file}: ${
                                (error as Error).message
                            }`,
                        )
                    }
                }
            }

            // Directories the app writes into at runtime, which therefore have
            // no stub to create them.
            for (const dir of definition.directories) {
                await Deno.mkdir(`${projectName}/${dir}`, { recursive: true })
            }

            // Copy .env.exemple to .env, and give THIS project its own key.
            //
            // Injected here rather than templated into the stub on purpose:
            // `.env.exemple` is committed by the user, so a key placed there
            // would ship with the project and be shared by everyone who clones
            // it — the defect this replaces, in a new costume.
            try {
                const envContent = await Deno.readTextFile(
                    `${projectName}/.env.exemple`,
                )
                // 0600: this file now carries live key material, and its
                // sensitivity rose the moment a real key went into it. The
                // default 0644 would leave it world-readable.
                await Deno.writeTextFile(
                    `${projectName}/.env`,
                    withAppKey(envContent, generateAppKey()),
                    { mode: 0o600 },
                )
            } catch {
                // Ignore if .env.exemple doesn't exist
            }

            // Create .env.production.local, with a key of its own.
            //
            // Without one, a freshly scaffolded project fails its first
            // production deploy — the framework refuses to boot on the cookie
            // driver with no APP_KEY — and the natural repair for that is to
            // paste a key from a blog post, which is how shared keys spread.
            try {
                await Deno.writeTextFile(
                    `${projectName}/.env.production.local`,
                    `APP_ENV=production\nAPP_KEY=${generateAppKey()}\n`,
                    { mode: 0o600 },
                )
            } catch {
                console.error('⚠️  Could not create .env.production.local')
            }

            console.log('\n✅ Done! To get started:')
            console.log(`  cd ${projectName}`)
            console.log('  deno task dev')
            console.log(`\n${definition.omits}`)
        } catch (error) {
            console.error(
                `❌ Initialization failed: ${(error as Error).message}`,
            )
            // Non-zero, or a failed scaffold looks like a successful one to
            // everything downstream: a CI step, a `&&` chain, and the person
            // who now has half a project and a green terminal.
            Deno.exit(1)
        }
    }, 'Initialize a new Lockness project')
}

if (import.meta.main) {
    const { projectName, use, kit, help, version } = parseInitArgs(Deno.args)

    // Handle --help flag
    if (help) {
        displayHelp()
        Deno.exit(0)
    }

    // Handle --version flag
    if (version) {
        try {
            let denoJsonPath: string
            if (import.meta.url.startsWith('file://')) {
                denoJsonPath = fromFileUrl(
                    new URL('./deno.json', import.meta.url),
                )
                const denoJson = JSON.parse(
                    await Deno.readTextFile(denoJsonPath),
                )
                console.log(`@lockness/init v${denoJson.version}`)
            } else {
                // When running from JSR, fetch the file
                const response = await fetch(
                    new URL('./deno.json', import.meta.url),
                )
                if (response.ok) {
                    const denoJson = await response.json()
                    console.log(`@lockness/init v${denoJson.version}`)
                } else {
                    console.log('@lockness/init v0.1.22')
                }
            }
        } catch {
            console.log('@lockness/init (version unknown)')
        }
        Deno.exit(0)
    }

    // Normal scaffolding
    const cliMock = {
        register: (
            _name: string,
            handler: (args: string[]) => Promise<void>,
        ) => {
            const args = [projectName]
            if (use) {
                args.push('--use', use)
            }
            if (kit) {
                args.push('--kit', kit)
            }
            return handler(args)
        },
    }
    registerInitCommand(cliMock as unknown as Cli)
}
