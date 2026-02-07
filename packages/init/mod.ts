import { parseArgs } from '@std/cli'
import { dirname, fromFileUrl, join } from '@std/path'
import { type Cli, Stub } from '@lockness/cli'

// Explicit file list for JSR (when running from https://)
export const INIT_STUB_FILES = [
    '.dockerignore.stub',
    '.env.exemple.stub',
    '.gitignore.stub',
    'cli.ts.stub',
    'deno.json.stub',
    'Dockerfile.stub',
    'main.ts.stub',
    'postcss.config.js.stub',
    'public/img/lockness-logo.svg',
    'README.md.stub',
    'scripts/dev.sh.stub',
    'scripts/generate_routes.ts.stub',
    'scripts/watch_routes.ts.stub',
    'config/mod.ts.stub',
    'config/app.ts.stub',
    'config/cache.ts.stub',
    'config/compile.ts.stub',
    'config/database.ts.stub',
    'config/routing.ts.stub',
    'config/session.ts.stub',
    'config/listeners.ts.stub',
    'app/controller/app_controller.tsx.stub',
    'app/kernel.ts.stub',
    'app/routes.ts.stub',
    'app/view/app.ts.stub',
    'app/view/assets/app.css.stub',
    'app/view/components/ui.tsx.stub',
    'app/view/layouts/main_layout.tsx.stub',
    'app/view/pages/home.tsx.stub',
]

// Binary files that need special handling (not included in remote scaffolding)
export const BINARY_FILES = [
    'public/favicon.ico',
    'public/favicon-16x16.png',
    'public/favicon-32x32.png',
    'public/apple-touch-icon.png',
    'public/android-chrome-192x192.png',
    'public/android-chrome-512x512.png',
]

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
    help?: boolean
    version?: boolean
} {
    const parsed = parseArgs(args, {
        string: ['use'],
        boolean: ['help', 'version'],
        alias: {
            'u': 'use',
            'h': 'help',
            'v': 'version',
        },
        default: {
            'use': undefined,
        },
    })

    return {
        projectName: String(parsed._[0] || 'lockness-app'),
        use: parsed['use'] as string | undefined,
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
  --use, -u <version>    Specify framework version (default: latest)
  --help, -h             Show this help message
  --version, -v          Show init package version

Version Formats:
  0.1.15         Exact version (will use ^0.1.15)
  ^0.1.0         Caret range (patch + minor updates)
  ~0.1.20        Tilde range (patch updates only)
  latest         Latest stable version

Examples:
  # Latest version (default)
  deno run -A jsr:@lockness/init my-app

  # Specific version
  deno run -A jsr:@lockness/init my-app --use 0.1.15

  # Version range
  deno run -A jsr:@lockness/init my-app -u "^0.1.0"

  # Pin init package version + framework version
  deno run -A jsr:@lockness/init@0.1.10 my-app --use 0.1.8
`)
}

export function registerInitCommand(cli: Cli) {
    cli.register('init', async (args: string[]) => {
        const { projectName, use } = parseInitArgs(args)

        // Resolve version (validate and normalize)
        let resolvedVersion: string
        try {
            resolvedVersion = await resolveVersion(use)
        } catch (error) {
            console.error(`❌ ${(error as Error).message}`)
            Deno.exit(1)
        }

        // Handle both local file:// and remote https:// URLs
        let stubsDir: string
        const isRemote = !import.meta.url.startsWith('file://')

        if (import.meta.url.startsWith('file://')) {
            const currentFile = fromFileUrl(import.meta.url)
            stubsDir = join(dirname(currentFile), 'stubs', 'init')
        } else {
            // When running from JSR, use URL
            stubsDir = new URL('./stubs/init', import.meta.url).href
        }

        console.log(`🌊 Scaffolding Lockness project: ${projectName}`)
        console.log(`📦 Framework version: ${resolvedVersion}`)

        try {
            await Stub.scaffoldFrom(
                stubsDir,
                String(projectName),
                {
                    projectName: String(projectName),
                    locknessVersion: resolvedVersion,
                },
                isRemote ? INIT_STUB_FILES : undefined,
            )

            // Copy binary files (only in local mode, as they can't be read as text)
            if (!isRemote) {
                for (const file of BINARY_FILES) {
                    try {
                        const sourcePath = join(stubsDir, file)
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

            // Create empty directories that might not be in stubs
            const dirs = [
                'public',
                'public/css',
            ]

            for (const dir of dirs) {
                await Deno.mkdir(`${projectName}/${dir}`, { recursive: true })
            }

            // Copy .env.exemple to .env
            try {
                const envContent = await Deno.readTextFile(
                    `${projectName}/.env.exemple`,
                )
                await Deno.writeTextFile(`${projectName}/.env`, envContent)
            } catch {
                // Ignore if .env.exemple doesn't exist
            }

            // Create .env.production.local
            try {
                await Deno.writeTextFile(
                    `${projectName}/.env.production.local`,
                    'APP_ENV=production\n',
                )
            } catch {
                console.error('⚠️  Could not create .env.production.local')
            }

            console.log('\n✅ Done! To get started:')
            console.log(`  cd ${projectName}`)
            console.log('  deno task dev')
        } catch (error) {
            console.error(
                `❌ Initialization failed: ${(error as Error).message}`,
            )
        }
    }, 'Initialize a new Lockness project')
}

if (import.meta.main) {
    const { projectName, use, help, version } = parseInitArgs(Deno.args)

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
            return handler(args)
        },
    }
    registerInitCommand(cliMock as unknown as Cli)
}
