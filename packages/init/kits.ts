/**
 * @fileoverview The starter kits — which files each one scaffolds.
 *
 * **This module is the single home of what a kit contains.** A kit is not a
 * separate template tree: it is a *selection* from the shared base in
 * `stubs/init/`, plus an overlay in `stubs/kits/<name>/` that adds what is
 * specific to it and replaces what differs. Three full trees would trebble
 * every file the framework already ships, and the three copies would drift
 * apart on the first change to `main.ts`.
 *
 * Overlay wins on collision, because the overlay is applied second and
 * scaffolding writes files in order. That is how `web` and `api` each get their
 * own `deno.json` and `app/kernel.ts` without the base needing to know they
 * exist.
 *
 * @module @lockness/init/kits
 */

/** The kits `lockness init --kit=<name>` accepts. */
export type KitName = 'web' | 'api' | 'slim'

/** The default when `--kit` is not passed. */
export const DEFAULT_KIT: KitName = 'web'

/** What one kit scaffolds. */
export interface Kit {
    /** One line, shown by `--help`. */
    readonly summary: string
    /** What the kit deliberately leaves out, shown after scaffolding. */
    readonly omits: string
    /** Files taken from `stubs/init/`, in order. */
    readonly base: readonly string[]
    /** Files taken from `stubs/kits/<name>/`, applied after — and over — the base. */
    readonly overlay: readonly string[]
    /** Binary files copied verbatim from `stubs/init/`. Never templated. */
    readonly binaries: readonly string[]
    /** Directories created empty, for output the app writes at runtime. */
    readonly directories: readonly string[]
}

/**
 * Files every kit takes from the base, whatever it is for.
 *
 * The entry point, the CLI, the route registry generator, and the three config
 * modules that carry no optional package between them.
 */
const COMMON: readonly string[] = [
    '.dockerignore.stub',
    '.gitignore.stub',
    'Dockerfile.stub',
    'cli.ts.stub',
    'main.ts.stub',
    'scripts/generate_routes.ts.stub',
    'scripts/watch_routes.ts.stub',
    'config/app.ts.stub',
    'config/compile.ts.stub',
    'config/listeners.ts.stub',
]

/** The JSX + Tailwind view layer. `web` only. */
const VIEW: readonly string[] = [
    'postcss.config.js.stub',
    'scripts/dev.sh.stub',
    'app/view/app.ts.stub',
    'app/view/assets/app.css.stub',
    'app/view/components/ui.tsx.stub',
    'app/view/layouts/main_layout.tsx.stub',
    'app/view/pages/home.tsx.stub',
    'public/img/lockness-logo.svg',
]

/** Favicons and touch icons. Meaningless without a browser, so `web` only. */
const WEB_BINARIES: readonly string[] = [
    'public/favicon.ico',
    'public/favicon-16x16.png',
    'public/favicon-32x32.png',
    'public/apple-touch-icon.png',
    'public/android-chrome-192x192.png',
    'public/android-chrome-512x512.png',
]

/**
 * Every kit, keyed by the name `--kit` accepts.
 *
 * @example
 * ```ts
 * KITS.slim.overlay.includes('app/controller/app_controller.ts.stub') // true
 * ```
 */
export const KITS: Readonly<Record<KitName, Kit>> = {
    web: {
        summary:
            'Full-stack: JSX views, Tailwind v4, session auth, Drizzle. The default.',
        omits:
            'Nothing — this is the full framework. Remove what you do not need.',
        base: [
            ...COMMON,
            ...VIEW,
            'config/cache.ts.stub',
            'config/mod.ts.stub',
            'config/routing.ts.stub',
            'config/session.ts.stub',
            'app/controller/app_controller.tsx.stub',
        ],
        overlay: [
            '.env.exemple.stub',
            'README.md.stub',
            'deno.json.stub',
            'config/database.ts.stub',
            'app/kernel.ts.stub',
            'app/routes.ts.stub',
            'app/auth/guards.ts.stub',
            'app/auth/user_provider.ts.stub',
            'app/controller/auth_controller.tsx.stub',
            'app/model/user.ts.stub',
            'app/view/pages/login.tsx.stub',
            'database/migrations/0000_create_users.sql.stub',
            'tests/smoke.test.ts.stub',
        ],
        binaries: WEB_BINARIES,
        directories: ['public', 'public/css', 'app/listener', 'app/middleware'],
    },

    api: {
        summary:
            'JSON API: token auth, CORS, throttling, OpenAPI, Drizzle. No view layer.',
        omits:
            'No JSX, no Tailwind, no sessions — a token is the whole of the request state.',
        base: [
            ...COMMON,
            'config/cache.ts.stub',
        ],
        overlay: [
            '.env.exemple.stub',
            'README.md.stub',
            'deno.json.stub',
            'config/database.ts.stub',
            'config/mod.ts.stub',
            'app/kernel.ts.stub',
            'app/routes.ts.stub',
            'app/auth/guards.ts.stub',
            'app/auth/user_provider.ts.stub',
            'app/controller/health_controller.ts.stub',
            'app/controller/token_controller.ts.stub',
            'app/model/user.ts.stub',
            'database/migrations/0000_create_users.sql.stub',
            'tests/smoke.test.ts.stub',
        ],
        binaries: [],
        directories: ['public', 'app/listener', 'app/middleware'],
    },

    slim: {
        summary:
            'Minimal: one controller, one middleware, @lockness/core and nothing else.',
        omits: 'No auth, no session, no database, no views, no Tailwind.',
        base: COMMON,
        overlay: [
            '.env.exemple.stub',
            'README.md.stub',
            'deno.json.stub',
            'config/mod.ts.stub',
            'app/kernel.ts.stub',
            'app/routes.ts.stub',
            'app/controller/app_controller.ts.stub',
            'app/middleware/example_middleware.ts.stub',
            'tests/smoke.test.ts.stub',
        ],
        binaries: [],
        directories: ['public', 'app/listener'],
    },
}

/**
 * Resolve a `--kit` value, or say what was accepted.
 *
 * @param value - The raw flag value, or `undefined` when it was not passed.
 * @returns The resolved kit name.
 * @throws {TypeError} If the value names no kit — never a silent fallback to
 * the default, which would hand someone who typo'd `--kit=slm` a full
 * Tailwind scaffold and no hint as to why.
 *
 * @example
 * ```ts
 * resolveKit(undefined) // 'web'
 * resolveKit('api') // 'api'
 * resolveKit('slm') // throws
 * ```
 */
export function resolveKit(value: string | undefined): KitName {
    if (value === undefined || value === '') return DEFAULT_KIT
    const normalised = value.trim().toLowerCase()
    if (normalised in KITS) return normalised as KitName
    throw new TypeError(
        `Unknown kit "${value}". Available kits: ${
            Object.keys(KITS).join(', ')
        }.`,
    )
}
