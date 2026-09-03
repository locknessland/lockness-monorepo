/**
 * @fileoverview The render/emit loop for static-site generation (#54).
 *
 * Given the enumerated {@link RenderTarget}s, this renders each one in-memory via
 * `App.fetch` and writes the body to its output path. It is the home for three
 * plan §5 decisions: render **only** via `App.fetch` (no `Deno.serve`, no
 * socket), a render failure aborts the whole build (FR-009), and two targets on
 * one output path abort with a collision error (FR-011). It never continues past
 * a failure — a partial `dist/` is never presented as success.
 *
 * @module @lockness/core/ssg/build
 */

import { dirname } from '@std/path'
import type { RenderTarget } from './enumerate.ts'

/**
 * The minimal app surface the build needs — satisfied by `App` (its `fetch`
 * getter). Only the single-argument call is required; `App.fetch`'s extra
 * optional parameters make it assignable to this narrower shape.
 */
export interface FetchableApp {
    readonly fetch: (request: Request) => Response | Promise<Response>
}

/** One emitted page, for the build report. */
export interface BuildReportEntry {
    /** The URL rendered. */
    readonly url: string
    /** The file written. */
    readonly outputPath: string
    /** The byte length of the written body. */
    readonly bytes: number
}

/** The outcome of a build: every page written, in order. */
export interface SsgBuildResult {
    /** The pages written, in render order. */
    readonly written: BuildReportEntry[]
}

/** The origin used to synthesize render requests; only the path matters to routing. */
const RENDER_ORIGIN = 'http://localhost'

/**
 * Render every target through `App.fetch` and write it to disk.
 *
 * Renders in order; a target whose response is not 2xx, or a `fetch` that
 * throws, aborts the whole build (FR-009) — the caller exits non-zero and no
 * further files are written. Two targets resolving to the same output path abort
 * with a collision error (FR-011). Parent directories are created as needed.
 *
 * @param app - The booted app to render against (its `fetch`).
 * @param targets - The pages to render (from `enumerateStaticTargets`); each
 * already carries an absolute, contained output path from `outputPathFor`.
 * @returns The build result listing every page written.
 * @throws {Error} On a non-2xx render, a throwing `fetch`, or an output collision.
 *
 * @example
 * ```typescript
 * const result = await runSsgBuild(app, targets)
 * console.log(`wrote ${result.written.length} pages`)
 * ```
 */
export async function runSsgBuild(
    app: FetchableApp,
    targets: readonly RenderTarget[],
): Promise<SsgBuildResult> {
    const written: BuildReportEntry[] = []
    const seen = new Map<string, string>() // outputPath -> first url that claimed it

    for (const t of targets) {
        const prior = seen.get(t.outputPath)
        if (prior !== undefined) {
            throw new Error(
                `SSG output collision: "${t.url}" and "${prior}" both map to "${t.outputPath}". ` +
                    `Two static routes cannot write the same file.`,
            )
        }
        seen.set(t.outputPath, t.url)

        let response: Response
        try {
            response = await app.fetch(new Request(RENDER_ORIGIN + t.url))
        } catch (error) {
            throw new Error(
                `SSG render failed for ${t.controller}.${t.action} at "${t.url}": ${
                    error instanceof Error ? error.message : String(error)
                }`,
                { cause: error },
            )
        }

        if (!response.ok) {
            throw new Error(
                `SSG render failed for ${t.controller}.${t.action} at "${t.url}": ` +
                    `expected a 2xx response, got ${response.status} ${response.statusText}.`,
            )
        }

        const body = await response.text()
        await Deno.mkdir(dirname(t.outputPath), { recursive: true })
        await Deno.writeTextFile(t.outputPath, body)
        written.push({
            url: t.url,
            outputPath: t.outputPath,
            bytes: body.length,
        })
    }

    return { written }
}
