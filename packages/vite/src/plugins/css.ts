/**
 * @fileoverview CSS / Tailwind integration for the dev server.
 *
 * In dev, Tailwind rebuilds when a watched `app/**` `.ts`/`.tsx` file changes;
 * the built CSS is collected and injected into HTML by the dev-server bridge
 * (#108, via its `getCss` hook). The reload-vs-CSS arbiter lives in `shared.ts`
 * (`classifyChange`) — this plugin only acts on `'css'` changes; `'server-reload'`
 * changes are the HMR plugin's job (#112). In production the CSS flows through
 * Vite's own pipeline (imported by the client entry) and is emitted hashed into
 * the manifest, so no standalone `public/css/app.css` output is produced.
 *
 * @module @lockness/vite/plugins/css
 */

import type { Plugin } from 'vite'
import { defineViteConfig } from '../define_config.ts'
import {
    classifyChange,
    type LocknessViteConfig,
    TAILWIND_CLI,
} from '../shared.ts'

/**
 * Build the full Tailwind CLI argument vector (command + args) for an input →
 * output build. The base command lives in `TAILWIND_CLI` (spelled once, plan §5).
 *
 * @param config - Resolved config (for `cssInput`).
 * @param options - `outFile` target and whether to `watch`.
 * @returns The argv array, e.g. `['deno','run','-A','@tailwindcss/cli','-i',…]`.
 *
 * @example
 * ```typescript
 * buildTailwindArgs(DEFAULTS, { outFile: '/tmp/out.css' })
 * ```
 */
export function buildTailwindArgs(
    config: Required<LocknessViteConfig>,
    options: { outFile: string; watch?: boolean },
): string[] {
    const args = [
        ...TAILWIND_CLI,
        '-i',
        config.cssInput,
        '-o',
        options.outFile,
    ]
    if (options.watch) args.push('--watch')
    return args
}

/** A collector that rebuilds Tailwind CSS and caches the last built output. */
export interface CssCollector {
    /** The most recently built CSS (empty until the first rebuild). */
    getCss(): string
    /** Rebuild the CSS once and cache it. */
    rebuild(): Promise<void>
}

/**
 * Create a Tailwind CSS collector. `rebuild()` runs the Tailwind CLI to a temp
 * file (argument array, no shell) and caches the result for `getCss()`.
 *
 * @param options - `config` (merged over DEFAULTS).
 * @returns A {@link CssCollector}.
 */
export function createCssCollector(
    options: { config?: Partial<LocknessViteConfig> } = {},
): CssCollector {
    const config = defineViteConfig(options.config)
    let css = ''
    return {
        getCss: () => css,
        async rebuild() {
            const outFile = await Deno.makeTempFile({ suffix: '.css' })
            try {
                const args = buildTailwindArgs(config, { outFile })
                const { success, stderr } = await new Deno.Command(args[0], {
                    args: args.slice(1),
                    stderr: 'piped',
                }).output()
                if (!success) {
                    console.error(
                        '@lockness/vite: Tailwind build failed:',
                        new TextDecoder().decode(stderr).trim(),
                    )
                    return
                }
                css = await Deno.readTextFile(outFile)
            } finally {
                await Deno.remove(outFile).catch((error) =>
                    console.warn(
                        `@lockness/vite: could not remove temp CSS file ${outFile}: ${
                            (error as Error).message
                        }`,
                    )
                )
            }
        },
    }
}

/**
 * The CSS/Tailwind dev plugin.
 *
 * @param options - `config` and the shared `collector` (so the dev bridge and
 *   this plugin share one CSS source).
 * @returns A Vite {@link Plugin} that rebuilds Tailwind on `'css'` changes.
 *
 * @example
 * ```typescript
 * const collector = createCssCollector()
 * export default { plugins: [cssPlugin({ collector })] }
 * ```
 */
export function cssPlugin(
    options: { config?: Partial<LocknessViteConfig>; collector: CssCollector },
): Plugin {
    return {
        name: 'lockness:css',
        async buildStart() {
            await options.collector.rebuild() // initial build
        },
        configureServer(server: {
            watcher: { on: (event: string, cb: (path: string) => void) => void }
            ws: { send: (payload: { type: string }) => void }
        }) {
            server.watcher.on('change', async (path: string) => {
                // Only 'css' changes rebuild here; 'server-reload' is the HMR
                // plugin's job, and it wins on overlap (arbiter in shared.ts).
                if (classifyChange(path) !== 'css') return
                await options.collector.rebuild()
                server.ws.send({ type: 'full-reload' })
            })
        },
    }
}
