/**
 * @fileoverview The `ssg:build` command — static-site generation (#54).
 *
 * This file is the single home for "SSG is a command, not a Vite plugin"
 * (plan §5). It boots the app from the `@Kernel`, enumerates the `@Static`
 * routes, renders each in-memory via `App.fetch`, and writes clean-URL HTML to
 * `dist/`. It orchestrates only — the enumeration, path, and render rules live in
 * `packages/core/ssg/` — keeping the command thin (MVC hard rule #8). The
 * testable units (`findKernel`, `loadKernel`, `buildStaticSite`) are exported so
 * the orchestration is witnessable without the CLI runtime.
 *
 * @module @lockness/core/cli/ssg_command
 */

import { join, resolve } from '@std/path'
import { KERNEL_CONFIG } from '../kernel/kernel_decorators.ts'
import { createApp } from '../kernel/loader.ts'
import type { KernelConfig } from '../kernel/kernel_decorators.ts'
import type { RouteInfo } from '../app.ts'
import {
    enumerateStaticTargets,
    loadControllers,
    type StaticControllerRef,
} from '../ssg/enumerate.ts'
import { expandTargetsForLocales } from '../ssg/locales.ts'
import { runSsgBuild, type SsgBuildResult } from '../ssg/build.ts'

/**
 * Command context interface (copied from `@lockness/cli` to avoid a circular
 * dependency, as `compile_command.ts` does).
 */
export interface CommandContext {
    readonly args: string[]
    arg(index: number): string | undefined
    hasFlag(name: string): boolean
    getFlag(name: string): string | undefined
}

/** The command contract the CLI registers against. */
export interface CommandContract {
    handle(ctx: CommandContext): Promise<void>
}

/** The app surface the build needs: render (`fetch`) and route introspection. */
export interface SsgApp {
    readonly fetch: (request: Request) => Response | Promise<Response>
    getRoutes(): RouteInfo[]
}

/** A resolved kernel: its class (to boot) and its config (to read). */
export interface ResolvedKernel {
    readonly KernelClass: new () => unknown
    readonly config: KernelConfig
}

/**
 * FR-013 warning: `@Static` renders run the full stack with the environment
 * loaded, so the page must be state-free and secret-free.
 */
export const SSG_SECRET_WARNING =
    '⚠️  @Static routes are rendered through the full middleware stack with your ' +
    'environment loaded. Keep them state-free and secret-free: no per-request ' +
    'tokens/nonces, no env secrets in the page body — the output is published as-is.'

/** Candidate kernel file paths (relative to the base dir), in resolution order. */
const KERNEL_CANDIDATES = ['app/kernel.ts', 'app/kernel.tsx']

/** Whether a path exists (native, so no `@std/fs` dependency is needed). */
async function fileExists(path: string): Promise<boolean> {
    try {
        await Deno.stat(path)
        return true
    } catch {
        return false
    }
}

/**
 * Find the `@Kernel`-decorated class in an imported module.
 *
 * @param module - A module namespace object (from a dynamic import).
 * @returns The kernel class and its config, or `undefined` when none is decorated.
 */
export function findKernel(
    module: Record<string, unknown>,
): ResolvedKernel | undefined {
    for (const value of Object.values(module)) {
        const config = (value as Record<symbol, unknown> | null)
            ?.[KERNEL_CONFIG]
        if (config) {
            return {
                KernelClass: value as new () => unknown,
                config: config as KernelConfig,
            }
        }
    }
    return undefined
}

/**
 * Resolve and import the `@Kernel`-decorated class from an app base directory.
 *
 * @param baseDir - The directory holding `app/kernel.ts(x)` (defaults to cwd).
 * @returns The resolved kernel, or `undefined` when no kernel file or decorated
 * class is found.
 */
export async function loadKernel(
    baseDir: string = Deno.cwd(),
): Promise<ResolvedKernel | undefined> {
    for (const candidate of KERNEL_CANDIDATES) {
        const path = join(baseDir, candidate)
        if (!(await fileExists(path))) continue
        const module = await import(`file://${path}`)
        const found = findKernel(module)
        if (found) return found
    }
    return undefined
}

/** The outcome of a static build: the render result and whether it was empty. */
export interface StaticBuildOutcome {
    readonly result: SsgBuildResult
    readonly empty: boolean
}

/**
 * Enumerate, expand for locales, and render the `@Static` pages of a booted app.
 *
 * Prints the FR-013 secret-free warning, then enumerates the app's `@Static`
 * routes, expands them for the curated locales, and renders them. Returns
 * `empty: true` (writing nothing) when there are no `@Static` routes.
 *
 * @param app - The booted app (its `fetch` and `getRoutes`).
 * @param controllers - The loaded controller classes carrying `@Static` metadata.
 * @param config - The kernel config (reads `ssg.locales` and `mountPoint`).
 * @param distRoot - The output root (absolute).
 * @returns The render result and whether it was empty.
 * @throws {Error} On any enumeration or render failure (fail loud).
 *
 * @example
 * ```typescript
 * const { result, empty } = await buildStaticSite(app, controllers, config, resolve('dist'))
 * ```
 */
export async function buildStaticSite(
    app: SsgApp,
    controllers: readonly StaticControllerRef[],
    config: KernelConfig,
    distRoot: string,
): Promise<StaticBuildOutcome> {
    console.warn(SSG_SECRET_WARNING)

    let targets = enumerateStaticTargets(app.getRoutes(), controllers, {
        distRoot,
    })
    targets = expandTargetsForLocales(targets, config, distRoot)

    if (targets.length === 0) {
        return { result: { written: [] }, empty: true }
    }
    return { result: await runSsgBuild(app, targets), empty: false }
}

/**
 * The `ssg:build` command.
 *
 * @example
 * ```bash
 * deno task cli ssg:build            # writes to ./dist
 * deno task cli ssg:build --out out  # writes to ./out
 * ```
 */
export class SsgCommand implements CommandContract {
    static readonly _commandName = 'ssg:build'
    static readonly _commandDescription =
        'Pre-render @Static routes to static HTML in dist/ (#54)'

    /**
     * Boot the app, enumerate `@Static` routes, render and write them.
     *
     * @param ctx - The command context (`--out <dir>` overrides the `dist/` root).
     * @throws {Error} Propagates any failure so the CLI exits non-zero.
     */
    async handle(ctx: CommandContext): Promise<void> {
        console.log('🧊 Static-site generation (ssg:build)...')

        const loaded = await loadKernel()
        if (!loaded) {
            throw new Error(
                'No @Kernel-decorated class found in app/kernel.ts(x); cannot build.',
            )
        }
        const { KernelClass, config } = loaded

        const distRoot = resolve(ctx.getFlag('out') ?? 'dist')
        const controllersDir = resolve(
            config.controllersDir ?? './app/controller',
        )

        // Booting the app instantiates every controller (populating its route and
        // @Static metadata); a controller that fails to instantiate aborts here.
        const app = await createApp(KernelClass)
        const controllers = await loadControllers(controllersDir)

        const { result, empty } = await buildStaticSite(
            app as unknown as SsgApp,
            controllers,
            config,
            distRoot,
        )

        if (empty) {
            console.log(
                'ℹ️  No @Static routes found — nothing to render. (Add @Static to a controller route.)',
            )
            return
        }

        console.log(
            `\n✅ Wrote ${result.written.length} page(s) to ${distRoot}:`,
        )
        for (const entry of result.written) {
            console.log(
                `  ${entry.url}  →  ${entry.outputPath} (${entry.bytes} bytes)`,
            )
        }
    }
}
