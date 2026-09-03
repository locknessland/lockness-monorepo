#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Module-documentation coverage gate for hard rule #7.
 *
 * Hard rule #7 requires a file-level `@fileoverview` on public modules, but
 * nothing enforced it. This gate scans the tracked package source (excluding
 * tests and the vite demo) and fails when a file that is NOT in
 * `docs-coverage-baseline.json` lacks an `@fileoverview` tag.
 *
 * The baseline is the set of files that were undocumented when the gate landed
 * — tracked tech-debt, not a licence to add more. `--update` rewrites it from
 * the current state (removing files that gained docs); `--check` (the default)
 * fails only on undocumented files outside the baseline, so new code must carry
 * `@fileoverview` while the backlog is worked down over time.
 *
 * @module scripts/docs_coverage
 *
 * @example
 * ```bash
 * deno run -A scripts/docs_coverage.ts            # check (CI / pre-push)
 * deno run -A scripts/docs_coverage.ts --update   # refresh the baseline
 * ```
 */

/** Path to the tracked baseline of currently-undocumented files. */
const BASELINE_PATH = './docs-coverage-baseline.json'

/** Test / demo files are exempt from the module-doc requirement. */
const EXEMPT = /(?:_test\.|\.test\.|\.spec\.|\/tests\/|\/demo\/)/

/** How much of a file to scan for the tag (the header comment). */
const HEADER_BYTES = 2000

/**
 * List tracked package source files subject to the rule.
 *
 * Uses `git ls-files` so untracked and gitignored paths (e.g. `node_modules`)
 * never enter the set.
 *
 * @returns Sorted repo-relative paths of `.ts`/`.tsx` package source.
 */
async function listSourceFiles(): Promise<string[]> {
    const { stdout } = await new Deno.Command('git', {
        args: ['ls-files', 'packages/*.ts', 'packages/*.tsx'],
        stdout: 'piped',
    }).output()
    return new TextDecoder()
        .decode(stdout)
        .split('\n')
        .filter((f) => f && !EXEMPT.test(f))
        .sort()
}

/**
 * Whether a file carries an `@fileoverview` tag in its header.
 *
 * @param path - Repo-relative file path.
 * @returns `true` when the header contains `@fileoverview`.
 */
async function hasFileoverview(path: string): Promise<boolean> {
    const text = await Deno.readTextFile(path)
    return text.slice(0, HEADER_BYTES).includes('@fileoverview')
}

/**
 * Compute the current set of undocumented source files.
 *
 * @returns Sorted repo-relative paths lacking `@fileoverview`.
 */
async function undocumented(): Promise<string[]> {
    const files = await listSourceFiles()
    const missing: string[] = []
    for (const f of files) {
        if (!(await hasFileoverview(f))) missing.push(f)
    }
    return missing
}

/**
 * Read the baseline, tolerating an absent file.
 *
 * @returns The baselined undocumented paths (empty when none recorded).
 */
async function readBaseline(): Promise<Set<string>> {
    try {
        return new Set(
            JSON.parse(await Deno.readTextFile(BASELINE_PATH)) as string[],
        )
    } catch {
        return new Set()
    }
}

/** Entry point: check against the baseline, or rewrite it. */
async function main(): Promise<void> {
    const update = Deno.args.includes('--update')
    const missing = await undocumented()

    if (update) {
        await Deno.writeTextFile(
            BASELINE_PATH,
            JSON.stringify(missing, null, 4) + '\n',
        )
        console.log(
            `Wrote ${BASELINE_PATH}: ${missing.length} files pending @fileoverview.`,
        )
        return
    }

    const baseline = await readBaseline()
    const violations = missing.filter((f) => !baseline.has(f))
    if (violations.length > 0) {
        console.error(
            `Missing @fileoverview on ${violations.length} file(s) not in the baseline:`,
        )
        for (const f of violations) console.error(`  ${f}`)
        console.error(
            '\nAdd a file-level /** @fileoverview ... */ (hard rule #7). If a ' +
                'file was intentionally removed, run docs:coverage:update.',
        )
        Deno.exit(1)
    }
    console.log(
        `Module docs OK: ${missing.length} baselined, no new undocumented files.`,
    )
}

if (import.meta.main) {
    await main()
}
