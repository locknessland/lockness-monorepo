#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Per-package line-coverage floor with a one-way ratchet.
 *
 * Parses `coverage/lcov.info`, de-duplicates the records (a source file is
 * recorded once per test run that loads it, so the raw sums double-count),
 * aggregates line coverage per top-level workspace package, and compares each
 * package against a stored floor in `coverage-floors.json`.
 *
 * - `--check` (default): exit non-zero if any package fell below its floor.
 * - `--update`: raise each floor to the current value (never lowers it) and
 *   write the file back — the ratchet.
 *
 * De-duplication keeps, per source file, the record with the most lines hit
 * (`LH`); `LF` is constant per file. Test files are excluded so a package's
 * floor reflects the coverage of its own source, not of its tests.
 *
 * @module scripts/coverage_floor
 *
 * @example
 * ```bash
 * deno task test:coverage                 # writes coverage/lcov.info
 * deno run -A scripts/coverage_floor.ts --check
 * deno run -A scripts/coverage_floor.ts --update   # ratchet the floors up
 * ```
 */

import { parseArgs } from '@std/cli/parse-args'

/** Path to the lcov report produced by `deno task test:coverage`. */
const LCOV_PATH = './coverage/lcov.info' as const

/** Path to the persisted per-package floors. */
const FLOORS_PATH = './coverage-floors.json' as const

/** Line counters for one source file. */
interface FileCoverage {
    /** Lines found (instrumentable). */
    lf: number
    /** Lines hit. */
    lh: number
}

/** A package name mapped to its integer line-coverage floor (percent). */
type Floors = Record<string, number>

/** Matches a test file that must not count toward a package's own coverage. */
const TEST_FILE = /(?:\.test\.|_test\.|\.spec\.|\/tests\/)/

/**
 * Parse an lcov report into de-duplicated per-file coverage.
 *
 * @param lcov - The raw contents of an lcov `.info` file.
 * @returns A map of source-file path to its best-seen coverage.
 */
export function parseLcov(lcov: string): Map<string, FileCoverage> {
    const files = new Map<string, FileCoverage>()
    let current: string | null = null
    let lf = 0
    let lh = 0
    for (const line of lcov.split('\n')) {
        if (line.startsWith('SF:')) {
            current = line.slice(3).trim()
            lf = 0
            lh = 0
        } else if (line.startsWith('LF:')) {
            lf = Number(line.slice(3))
        } else if (line.startsWith('LH:')) {
            lh = Number(line.slice(3))
        } else if (line.startsWith('end_of_record') && current) {
            const prev = files.get(current)
            // Keep the record with the most lines hit (same file, many runs).
            if (!prev || lh > prev.lh) files.set(current, { lf, lh })
            current = null
        }
    }
    return files
}

/**
 * Aggregate per-file coverage into per-package line percentages.
 *
 * Only files under `packages/<name>/` are counted, and test files are skipped.
 *
 * @param files - The de-duplicated per-file coverage.
 * @returns A map of package name to its line-coverage percent (one decimal).
 */
export function aggregateByPackage(
    files: Map<string, FileCoverage>,
): Map<string, number> {
    const found = new Map<string, number>()
    const hit = new Map<string, number>()
    for (const [path, cov] of files) {
        if (TEST_FILE.test(path)) continue
        const m = path.match(/\/packages\/([^/]+)\//)
        if (!m) continue
        const pkg = m[1]
        found.set(pkg, (found.get(pkg) ?? 0) + cov.lf)
        hit.set(pkg, (hit.get(pkg) ?? 0) + cov.lh)
    }
    const pct = new Map<string, number>()
    for (const [pkg, lf] of found) {
        pct.set(
            pkg,
            lf > 0 ? Math.round(((hit.get(pkg) ?? 0) / lf) * 1000) / 10 : 0,
        )
    }
    return pct
}

/**
 * Read the stored floors, tolerating an absent file.
 *
 * @returns The persisted floors, or an empty object when none exist yet.
 */
async function readFloors(): Promise<Floors> {
    try {
        return JSON.parse(await Deno.readTextFile(FLOORS_PATH)) as Floors
    } catch {
        return {}
    }
}

/**
 * Entry point: check current coverage against the floors, or ratchet them up.
 */
async function main(): Promise<void> {
    const args = parseArgs(Deno.args, { boolean: ['check', 'update'] })
    let lcov: string
    try {
        lcov = await Deno.readTextFile(LCOV_PATH)
    } catch {
        console.error(
            `Could not read ${LCOV_PATH}. Run \`deno task test:coverage\` first.`,
        )
        Deno.exit(1)
    }

    const current = aggregateByPackage(parseLcov(lcov))
    const floors = await readFloors()

    if (args.update) {
        const next: Floors = { ...floors }
        for (const [pkg, value] of current) {
            const floor = Math.floor(value)
            // Ratchet: never lower an existing floor.
            next[pkg] = Math.max(next[pkg] ?? 0, floor)
        }
        const sorted: Floors = {}
        for (const pkg of Object.keys(next).sort()) sorted[pkg] = next[pkg]
        await Deno.writeTextFile(
            FLOORS_PATH,
            JSON.stringify(sorted, null, 4) + '\n',
        )
        console.log(`Updated ${FLOORS_PATH} for ${current.size} packages.`)
        return
    }

    // Default: --check.
    const violations: string[] = []
    for (const [pkg, floor] of Object.entries(floors)) {
        const value = current.get(pkg)
        if (value === undefined) continue // package produced no coverage records
        if (value < floor) {
            violations.push(
                `  ${pkg}: ${value.toFixed(1)}% < floor ${floor}%`,
            )
        }
    }

    if (violations.length > 0) {
        console.error('Coverage floor violations:')
        console.error(violations.join('\n'))
        console.error(
            '\nRaise coverage, or run `deno task coverage:floor:update` if a ' +
                'floor was intentionally lowered.',
        )
        Deno.exit(1)
    }
    console.log(
        `Coverage floors OK (${Object.keys(floors).length} packages checked).`,
    )
}

if (import.meta.main) {
    await main()
}
