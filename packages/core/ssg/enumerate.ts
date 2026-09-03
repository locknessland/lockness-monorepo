/**
 * @fileoverview Route enumeration for static-site generation (#54).
 *
 * Turns the app's registered routes plus the `@Static` opt-in into the concrete
 * list of pages to render. It **joins two single-home sources** and invents
 * neither: the route paths come from the app's route registry
 * (`app.getRoutes()`), and the "is this route static" decision comes from the
 * `@Static` decorator's constructor metadata. The enumerator never rebuilds a
 * route path itself (that would be a second home for the registry's rule).
 *
 * It is the home for three decisions (plan §5): only GET is renderable, a
 * parameterized static route needs explicit `params`, and a controller that
 * fails to import aborts the build (`loadControllers`, FR-012).
 *
 * @module @lockness/core/ssg/enumerate
 */

import { join } from '@std/path'
import type { ControllerWithMetadata } from '@lockness/contract'
import type { RouteInfo } from '../app.ts'
import { outputPathFor } from './paths.ts'

/** A discovered controller class as the enumerator reads it: metadata + name. */
export type StaticControllerRef = ControllerWithMetadata & {
    readonly name: string
}

/** One page to render: the URL to fetch and the file to write. */
export interface RenderTarget {
    /** The URL path to render via `App.fetch`. */
    readonly url: string
    /** The absolute file path to write the rendered HTML to. */
    readonly outputPath: string
    /** The controller class name (for error messages). */
    readonly controller: string
    /** The controller method name (for error messages). */
    readonly action: string
}

/** Matches a Hono path parameter token, e.g. `:slug` (global, for replace). */
const PARAM_TOKEN = /:([A-Za-z0-9_]+)/g

/** Non-global twin of {@link PARAM_TOKEN} — `.test()` on a global regex is stateful. */
const HAS_PARAM = /:[A-Za-z0-9_]+/

/** Whether a route path carries a parameter or wildcard segment. */
function isParameterized(path: string): boolean {
    return HAS_PARAM.test(path) || path.includes('*')
}

/**
 * Substitute a literal param map into a route path.
 *
 * @throws {Error} If the map omits a token the path requires, or the result
 * still contains an unfilled token or wildcard.
 */
function substituteParams(
    path: string,
    map: Record<string, string>,
    controller: string,
    action: string,
): string {
    const filled = path.replace(PARAM_TOKEN, (_, key: string) => {
        if (!(key in map)) {
            throw new Error(
                `@Static ${controller}.${action}: params entry is missing a value for ":${key}" in "${path}".`,
            )
        }
        return map[key]
    })
    if (filled.includes(':') || filled.includes('*')) {
        throw new Error(
            `@Static ${controller}.${action}: route "${path}" still has an unfilled parameter after substitution (got "${filled}").`,
        )
    }
    return filled
}

/**
 * Enumerate the concrete pages to render from the app's routes and the `@Static`
 * opt-in.
 *
 * A route is included only when its controller is class-level `@Static` or its
 * method carries `@Static`. Each included route must be GET (else the build
 * aborts); a parameterized one must carry an explicit literal `params` list
 * (else the build aborts, actionably). Non-`@Static` routes are silently left
 * out — they keep serving dynamically. Every output path passes through
 * {@link outputPathFor}, so a traversal-bearing param value is rejected here.
 *
 * @param routes - The app's registered routes (`app.getRoutes()`).
 * @param controllers - The discovered controller classes carrying `@Static` metadata.
 * @param options - `distRoot`: the output root the paths are computed against.
 * @returns The render targets, one per page (parameterless → one; params → one each).
 * @throws {Error} On a non-GET `@Static` route, a parameterized `@Static` route
 * with no `params`, an incomplete param map, or a disallowed output segment.
 *
 * @example
 * ```typescript
 * const targets = enumerateStaticTargets(app.getRoutes(), controllers, { distRoot: resolve('dist') })
 * ```
 */
export function enumerateStaticTargets(
    routes: readonly RouteInfo[],
    controllers: readonly StaticControllerRef[],
    options: { readonly distRoot: string },
): RenderTarget[] {
    const byName = new Map<string, StaticControllerRef>()
    for (const c of controllers) byName.set(c.name, c)

    const targets: RenderTarget[] = []

    for (const route of routes) {
        const ctor = byName.get(route.controller)
        if (!ctor) continue // route from a controller we did not load — leave it dynamic

        const isStatic = ctor._staticAll === true ||
            ctor._staticConfigs?.[route.action] !== undefined
        if (!isStatic) continue

        if (route.method.toUpperCase() !== 'GET') {
            throw new Error(
                `@Static ${route.controller}.${route.action}: only GET routes can be pre-rendered, got ${route.method} "${route.path}".`,
            )
        }

        const opts = ctor._staticConfigs?.[route.action]

        if (isParameterized(route.path)) {
            const params = opts?.params
            if (!params || params.length === 0) {
                throw new Error(
                    `@Static ${route.controller}.${route.action}: route "${route.path}" has a parameter but no params list. ` +
                        `Provide an explicit \`@Static({ params: [...] })\` list, or remove @Static.`,
                )
            }
            for (const map of params) {
                const url = substituteParams(
                    route.path,
                    map,
                    route.controller,
                    route.action,
                )
                targets.push({
                    url,
                    outputPath: outputPathFor(url, options.distRoot),
                    controller: route.controller,
                    action: route.action,
                })
            }
        } else {
            targets.push({
                url: route.path,
                outputPath: outputPathFor(route.path, options.distRoot),
                controller: route.controller,
                action: route.action,
            })
        }
    }

    return targets
}

/**
 * Import every controller module in a directory and collect the decorated
 * controller classes (those carrying `@Controller`'s `_basePath`).
 *
 * An import failure is **fatal** — it throws, naming the file — never the
 * warn-and-skip `router:list` uses, because a silently-skipped `@Static`
 * controller would emit a `dist/` missing pages while the build reports success
 * (FR-012). Instantiation is not done here: the SSG command boots the app via
 * `createApp` first, which instantiates the controllers (populating their route
 * and `@Static` metadata) and whose own failure aborts the build.
 *
 * @param dir - The controllers directory to import from.
 * @returns The decorated controller classes found, in directory order.
 * @throws {Error} If any `.ts`/`.tsx`/`.js` module fails to import, naming it.
 *
 * @example
 * ```typescript
 * const controllers = await loadControllers(join(Deno.cwd(), 'app', 'controller'))
 * ```
 */
export async function loadControllers(
    dir: string,
): Promise<StaticControllerRef[]> {
    const found: StaticControllerRef[] = []

    for await (const entry of Deno.readDir(dir)) {
        if (!entry.isFile) continue
        if (
            !entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx') &&
            !entry.name.endsWith('.js')
        ) continue

        const fileUrl = `file://${join(dir, entry.name)}`
        let module: Record<string, unknown>
        try {
            module = await import(fileUrl)
        } catch (error) {
            // Fatal, not warn-and-skip: a missing @Static controller would ship a
            // dist/ with holes and still report success (FR-012).
            throw new Error(
                `SSG could not import controller "${entry.name}": ${
                    error instanceof Error ? error.message : String(error)
                }`,
                { cause: error },
            )
        }

        for (const value of Object.values(module)) {
            if (
                typeof value === 'function' &&
                (value as StaticControllerRef)._basePath !== undefined
            ) {
                found.push(value as unknown as StaticControllerRef)
            }
        }
    }

    return found
}
