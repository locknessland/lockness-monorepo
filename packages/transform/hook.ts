/**
 * @fileoverview The Node load hook that runs user TypeScript through
 * {@link transpileForLoad}, and the production refusal (plan 274 §5, audit S9).
 *
 * `register.ts` installs what this module builds; keeping the two apart lets
 * the hook be tested as a function, without installing it into the test
 * process.
 *
 * Decisions this module owns:
 *
 * - **Which files.** `file:` URLs ending in `.ts` or `.tsx`, outside any
 *   `node_modules` segment. Declaration files are skipped. Dependencies are
 *   never transformed: a published package ships JavaScript.
 * - **Which options.** The `tsconfig.json` nearest to the file (TypeScript's own
 *   rule), never above the app root (the nearest `package.json` / `deno.json`)
 *   and only one the current user owns and alone can write; read once per
 *   file and memoised per directory. A file with none is
 *   refused: the options have one home, and a silent default would make the
 *   dev emit differ from `lockness build`'s.
 * - **Where the cache lives.** Beside that `tsconfig.json`, which is the app
 *   root: `<root>/node_modules/.cache/lockness-transform`. Tying it to the
 *   options' home rather than to the working directory means a process started
 *   from a subdirectory reuses the same cache.
 * - **Production.** `APP_ENV=production` refuses to install the hook at all:
 *   production runs built output, never a load-time transform.
 *
 * Not exported from the package: `register.ts` is its one consumer.
 *
 * @module
 */

import { readFileSync } from 'node:fs'
import type { LoadHookSync } from 'node:module'
import { dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cacheKey, TransformCache } from './cache.ts'
import {
    type CompilerOptions,
    findTsconfig as findNearestTsconfig,
    readCompilerOptions,
    transpileForLoad,
    TYPESCRIPT_VERSION,
} from './transform.ts'
import { VERSION } from './version.generated.ts'

/**
 * The version every cache key carries: this package's and the compiler's,
 * since either can change the output for the same input.
 */
export const TRANSFORMER_VERSION: string =
    `${VERSION}+typescript@${TYPESCRIPT_VERSION}`

/** Seams for tests. */
export interface LoadHookOptions {
    /**
     * Finds the `tsconfig.json` governing a directory. Defaults to the nearest
     * one walking up ({@link findNearestTsconfig}).
     */
    readonly findTsconfig?: (fromDir: string) => string | null
}

/** One app as the hook sees it: its compiler options and its cache. */
interface Project {
    readonly options: CompilerOptions
    readonly cache: TransformCache
}

/**
 * Whether the hook transforms a module.
 *
 * @param url - The module URL Node resolved.
 * @returns `true` for a `file:` URL to a `.ts` or `.tsx` file (not `.d.ts`)
 *   with no `node_modules` segment in its path.
 *
 * @example
 * ```ts
 * shouldTransform('file:///srv/app/main.ts')                   // true
 * shouldTransform('file:///srv/app/node_modules/x/index.ts')   // false
 * ```
 */
export function shouldTransform(url: string): boolean {
    if (!url.startsWith('file:')) return false
    // The path only: a `?query` or `#hash` is not part of it.
    const path = fileURLToPath(url)
    if (!path.endsWith('.ts') && !path.endsWith('.tsx')) return false
    if (path.endsWith('.d.ts')) return false
    return !path.split(sep).includes('node_modules')
}

/**
 * Refuse to run in production.
 *
 * `APP_ENV` is normalised the way `@lockness/contract`'s resolver does it
 * (trimmed, lower-cased), so `Production` and a CRLF `.env` value count. This
 * package may import no `@lockness/*` package — it loads before any of them —
 * so the read is repeated here; the rule is the resolver's.
 *
 * @param env - The process environment, e.g. `process.env`.
 * @throws {Error} When `APP_ENV` names production.
 *
 * @example
 * ```ts
 * assertNotProduction(process.env)
 * ```
 */
export function assertNotProduction(
    env: Readonly<Record<string, string | undefined>>,
): void {
    if (env.APP_ENV?.trim().toLowerCase() !== 'production') return
    throw new Error(
        '@lockness/transform refuses to run when APP_ENV=production: ' +
            'production runs built JavaScript, not a load-time transform. ' +
            'Remove the --import flag, or unset APP_ENV for development.',
    )
}

/**
 * Build the synchronous load hook for `module.registerHooks`.
 *
 * @param hookOptions - Test seams; production passes none.
 * @returns A load hook that emits each `.ts` / `.tsx` file it takes as an ES
 *   module, reading through the project's cache, and passes every other module
 *   to `nextLoad`.
 * @throws {Error} From the returned hook: when a file has no governing
 *   `tsconfig.json`, the `tsconfig.json` is invalid, or the file fails to emit.
 *
 * @example
 * ```ts
 * registerHooks({ load: createLoadHook() })
 * ```
 */
export function createLoadHook(
    hookOptions: LoadHookOptions = {},
): LoadHookSync {
    const find = hookOptions.findTsconfig ?? findNearestTsconfig
    const tsconfigOf = new Map<string, string | null>()
    const projects = new Map<string, Project>()

    const projectFor = (fileName: string): Project => {
        const dir = dirname(fileName)
        let tsconfig = tsconfigOf.get(dir)
        if (tsconfig === undefined) {
            tsconfig = find(dir)
            tsconfigOf.set(dir, tsconfig)
        }
        if (tsconfig === null) {
            throw new Error(
                `@lockness/transform: no tsconfig.json governs ${fileName} ` +
                    `(the search stops at the nearest directory holding a ` +
                    `package.json or deno.json). The app's tsconfig.json is ` +
                    `where its compiler options (target, jsx) live; add one ` +
                    `at the app root.`,
            )
        }
        let project = projects.get(tsconfig)
        if (project === undefined) {
            project = {
                options: readCompilerOptions(tsconfig),
                cache: new TransformCache(dirname(tsconfig)),
            }
            projects.set(tsconfig, project)
        }
        return project
    }

    return (url, context, nextLoad) => {
        if (!shouldTransform(url)) return nextLoad(url, context)
        const fileName = fileURLToPath(url)
        const source = readFileSync(fileName, 'utf8')
        const { options, cache } = projectFor(fileName)
        const key = cacheKey({
            transformerVersion: TRANSFORMER_VERSION,
            compilerOptions: options,
            fileName,
            source,
        })
        let code = cache.read(key)
        if (code === undefined) {
            code = transpileForLoad(source, fileName, options)
            cache.write(key, code)
        }
        return { format: 'module', source: code, shortCircuit: true }
    }
}
