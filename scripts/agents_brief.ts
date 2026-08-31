#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * @fileoverview Generator for the per-package agent briefs
 * (`packages/*\/AGENTS.md`).
 *
 * A brief has two kinds of section, and the split is the whole point:
 *
 * | Kind | Sections | Who writes it |
 * | :--- | :------- | :------------ |
 * | **Generated** | Dependency contract, Public surface, Tests | this script |
 * | **Hand-written** | intro, Invariants, Where to work, Pitfalls, Before you call it done | a human or an agent that just learned something |
 *
 * Generated sections sit between `<!-- generated:x -->` markers and are
 * rewritten in place; everything else is preserved byte-for-byte. That is what
 * stops the briefs drifting from the code the way the first pass did — 26 files
 * written in one commit, every one of them carrying two or three pitfalls
 * regardless of whether the package had 1 source file or 90.
 *
 * The dependency graph is not re-derived here: it comes from
 * `deno task deps:analyze --json`, which is its single home.
 *
 * @example
 * ```bash
 * deno task agents:brief          # rewrite the generated blocks
 * deno task agents:brief --check  # fail if any block is stale (CI)
 * ```
 *
 * @module
 */

import { join } from '@std/path'

/** One edge as reported by the dependency analyser. */
interface Edge {
    from: string
    to: string
    kind: 'runtime' | 'type' | 'dynamic' | 'soft'
    at: string
}

/** The analyser's `--json` payload. */
interface Graph {
    packages: { name: string; version: string; declared: string[] }[]
    edges: Edge[]
    soft: Edge[]
    policy: {
        packages: Record<
            string,
            { tier: string; allow: string[]; soft?: string[] }
        >
    } | null
}

const ROOT = Deno.cwd()
const PACKAGES_DIR = join(ROOT, 'packages')

/**
 * Read the dependency graph from its single home.
 *
 * @returns The parsed graph.
 * @throws {Error} If the analyser fails.
 */
async function loadGraph(): Promise<Graph> {
    const result = await new Deno.Command(Deno.execPath(), {
        args: ['run', '-A', 'scripts/deps_analyzer.ts', '--json'],
        cwd: ROOT,
        stdout: 'piped',
        stderr: 'piped',
    }).output()

    if (!result.success) {
        throw new Error(
            `deps_analyzer --json failed:\n${
                new TextDecoder().decode(result.stderr)
            }`,
        )
    }
    return JSON.parse(new TextDecoder().decode(result.stdout))
}

/**
 * Every package that reaches `target`, directly or transitively.
 *
 * Importing any of them from `target` would close a cycle, which is what makes
 * this the honest answer to "what must this package never import".
 *
 * @param target - The package to trace back from.
 * @param edges - All static and soft edges.
 * @returns The importers, sorted.
 */
function importersOf(target: string, edges: Edge[]): string[] {
    const reverse = new Map<string, Set<string>>()
    for (const edge of edges) {
        const set = reverse.get(edge.to) ?? new Set<string>()
        reverse.set(edge.to, set)
        set.add(edge.from)
    }

    const seen = new Set<string>()
    const queue = [target]
    while (queue.length > 0) {
        const node = queue.pop() as string
        for (const importer of reverse.get(node) ?? []) {
            if (seen.has(importer) || importer === target) continue
            seen.add(importer)
            queue.push(importer)
        }
    }
    return [...seen].sort()
}

/**
 * Exported symbol names of a package's main module.
 *
 * @param packageName - Short package name.
 * @returns Symbol names grouped by kind, or `null` when `mod.ts` is absent.
 */
async function publicSurface(
    packageName: string,
): Promise<Map<string, string[]> | null> {
    for (const candidate of ['mod.ts', 'mod.tsx']) {
        const path = join(PACKAGES_DIR, packageName, candidate)
        try {
            await Deno.stat(path)
        } catch {
            continue
        }

        const result = await new Deno.Command(Deno.execPath(), {
            args: ['doc', '--json', path],
            cwd: ROOT,
            stdout: 'piped',
            stderr: 'null',
        }).output()
        if (!result.success) return null

        const parsed = JSON.parse(new TextDecoder().decode(result.stdout))
        const byKind = new Map<string, string[]>()
        for (const node of Object.values(parsed.nodes ?? {})) {
            for (
                const symbol of (node as { symbols?: unknown[] }).symbols ?? []
            ) {
                const { name, declarations } = symbol as {
                    name: string
                    declarations?: { kind?: string }[]
                }
                if (name.startsWith('_')) continue
                const kind = declarations?.[0]?.kind ?? 'other'
                const bucket = byKind.get(kind) ?? []
                byKind.set(kind, bucket)
                if (!bucket.includes(name)) bucket.push(name)
            }
        }
        for (const bucket of byKind.values()) bucket.sort()
        return byKind
    }
    return null
}

/**
 * Source and test files a package holds.
 *
 * @param packageName - Short package name.
 * @returns Repo-relative source and test paths.
 */
async function inventory(
    packageName: string,
): Promise<{ source: string[]; tests: string[] }> {
    const source: string[] = []
    const tests: string[] = []

    const walk = async (dir: string): Promise<void> => {
        for await (const entry of Deno.readDir(dir)) {
            const path = join(dir, entry.name)
            if (entry.isDirectory) {
                if (entry.name === 'node_modules' || entry.name === 'docs') {
                    continue
                }
                await walk(path)
                continue
            }
            if (!/\.tsx?$/.test(entry.name)) continue
            const relative = path.slice(ROOT.length + 1)
            if (/[._]test\.tsx?$/.test(entry.name)) tests.push(relative)
            else if (!relative.includes('/stubs/')) source.push(relative)
        }
    }

    await walk(join(PACKAGES_DIR, packageName))
    return { source: source.sort(), tests: tests.sort() }
}

/** A generated block, keyed by its marker name. */
type Blocks = Record<string, string>

/**
 * Render the three generated sections for one package.
 *
 * @param name - Short package name.
 * @param graph - The dependency graph.
 * @returns Block bodies keyed by marker name.
 */
async function renderBlocks(name: string, graph: Graph): Promise<Blocks> {
    const all = [...graph.edges, ...graph.soft]
    const uniq = (values: string[]): string[] => [...new Set(values)].sort()

    const staticDeps = uniq(
        graph.edges.filter((e) => e.from === name).map((e) => e.to),
    )
    const typeOnly = new Set(
        graph.edges
            .filter((e) => e.from === name && e.kind === 'type')
            .map((e) => e.to),
    )
    for (const edge of graph.edges) {
        if (edge.from === name && edge.kind !== 'type') typeOnly.delete(edge.to)
    }
    const softDeps = uniq(
        graph.soft.filter((e) => e.from === name).map((e) => e.to),
    )
    const importedBy = uniq(all.filter((e) => e.to === name).map((e) => e.from))
    const forbidden = importersOf(name, all)

    const fmt = (values: string[]): string =>
        values.length === 0 ? '—' : values
            .map((v) => `\`${v}\`${typeOnly.has(v) ? ' *(type-only)*' : ''}`)
            .join(', ')

    const deps = [
        '| Direction | Packages |',
        '| :-------- | :------- |',
        `| Imports (static) | ${fmt(staticDeps)} |`,
        `| Imports (soft, via \`tryImportOptionalPackage\`) | ${
            fmt(softDeps)
        } |`,
        `| Imported by | ${fmt(importedBy)} |`,
        `| **Must never import** | ${
            forbidden.length === 0
                ? 'nothing — no package depends on this one'
                : fmt(forbidden) +
                    ' — each already reaches this package, so importing one closes a cycle'
        } |`,
        '',
        'Enforced by `deno task deps:analyze` against `deps.policy.jsonc`.',
        "A soft edge is deliberately **not** declared in this package's",
        '`deno.json`: the consuming application installs it, or the feature',
        'stays off.',
    ].join('\n')

    const surface = await publicSurface(name)
    const surfaceLines = surface === null || surface.size === 0
        ? ['`mod.ts` exports nothing this tool could read.']
        : [
            '| Kind | Exports |',
            '| :--- | :------ |',
            ...[...surface.entries()].sort().map(([kind, names]) =>
                `| ${kind} | ${names.map((n) => `\`${n}\``).join(', ')} |`
            ),
            '',
            'Anything not listed is internal and free to change.',
        ]

    const { source, tests } = await inventory(name)
    const testLines = tests.length === 0
        ? [
            `**This package has no tests.** ${source.length} source file${
                source.length === 1 ? '' : 's'
            } ship untested — treat any change here as unguarded, and add`,
            'coverage for what you touch rather than trusting the suite.',
        ]
        : [
            `${tests.length} test file${
                tests.length === 1 ? '' : 's'
            } for ${source.length} source file${
                source.length === 1 ? '' : 's'
            }:`,
            '',
            ...tests.map((t) => `- \`${t}\``),
        ]

    const gate = [
        'The framework-wide gate, from the repository root:',
        '',
        '```bash',
        'deno fmt && deno lint && deno check && deno task test',
        'deno task deps:analyze     # cycles, declaration drift, tier policy',
        "deno task agents:brief     # refresh this file's generated blocks",
        '```',
        '',
        ...(tests.length === 0
            ? [
                `Then, specific to this package: **it has no tests.** Anything you`,
                'change here is unguarded by the suite — add coverage for it.',
            ]
            : [
                `Then, specific to this package: run its ${tests.length} test file${
                    tests.length === 1 ? '' : 's'
                } directly —`,
                '',
                '```bash',
                `deno test -A packages/${name}/`,
                '```',
            ]),
    ].join('\n')

    return {
        deps,
        surface: surfaceLines.join('\n'),
        tests: testLines.join('\n'),
        gate,
    }
}

/**
 * Replace a marked block, or return `null` when the marker is absent.
 *
 * @param body - The document.
 * @param key - Marker name.
 * @param content - Replacement body.
 * @returns The updated document, or `null`.
 */
function replaceBlock(
    body: string,
    key: string,
    content: string,
): string | null {
    const pattern = new RegExp(
        `<!-- generated:${key} -->[\\s\\S]*?<!-- /generated:${key} -->`,
    )
    if (!pattern.test(body)) return null
    return body.replace(
        pattern,
        `<!-- generated:${key} -->\n${content}\n<!-- /generated:${key} -->`,
    )
}

/**
 * Pull the body of a `##` section out of an existing brief.
 *
 * @param body - The document.
 * @param heading - Section heading without the `##`.
 * @returns The section body, trimmed, or an empty string.
 */
function sectionBody(body: string, heading: string): string {
    // Split rather than match: JavaScript has no end-of-string anchor that
    // survives the `m` flag (`\Z` is a literal Z, and `$` stops at the first
    // line break), so a regex silently truncates or drops the last section.
    for (const chunk of body.split(/^## /m).slice(1)) {
        const newline = chunk.indexOf('\n')
        if (newline === -1) continue
        if (chunk.slice(0, newline).trim() !== heading) continue
        return chunk.slice(newline + 1).trim()
    }
    return ''
}

/**
 * Build a brief from scratch, carrying over whatever the old one had.
 *
 * @param name - Short package name.
 * @param previous - The existing document, or an empty string.
 * @param blocks - Generated block bodies.
 * @returns The new document.
 */
function scaffold(name: string, previous: string, blocks: Blocks): string {
    const intro = previous
        .replace(/^#[^\n]*\n/, '')
        .split(/^## /m)[0]
        .trim()

    // The old format closed with an italic footer counting files and pointing
    // at the root rules. It sits inside the last section, so strip it rather
    // than carrying two footers into the new file.
    const dropFooter = (text: string): string =>
        text
            .split(/\n\s*\n/)
            .filter((paragraph) => !paragraph.includes('Framework-wide rules'))
            .join('\n\n')
            .trim()

    const existingInvariants = sectionBody(previous, 'Invariants')
    const invariantSeed = existingInvariants === ''
        ? `- **The dependency contract above is binding.** Importing anything
  outside it fails \`deno task deps:analyze\`, and the failure is a design
  question, not a lint to silence.

_Add the domain invariants — what must stay true inside this package, and what
breaks when it does not. A statement that could have been guessed from the file
names does not belong here._`
        : existingInvariants

    const where = dropFooter(sectionBody(previous, 'Where to work'))
    const pitfalls = dropFooter(sectionBody(previous, 'Pitfalls'))

    return `# \`@lockness/${name}\` — agent brief

${
        intro === ''
            ? `_One or two sentences: what this package does, and the two or three constraints that shape it._`
            : intro
    }

## Invariants

${invariantSeed}

## Dependency contract

<!-- generated:deps -->
${blocks.deps}
<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->
${blocks.surface}
<!-- /generated:surface -->

## Where to work

${
        where === ''
            ? '_Intent → file. The section that stops an agent grepping the whole package._'
            : where
    }

## Pitfalls

${
        pitfalls === ''
            ? '_None recorded yet. Add one when something here costs you time — with the mechanism and the date. An entry that could have been guessed does not belong._'
            : pitfalls
    }

## Tests

<!-- generated:tests -->
${blocks.tests}
<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->
${blocks.gate}
<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface, tests and closing gate are generated by
\`deno task agents:brief\` from the code itself — fix the code, not those
blocks. Everything else is hand-written and preserved._
`
}

/**
 * Normalise a document through `deno fmt`.
 *
 * The repository formats Markdown, which re-wraps prose. Without this the
 * generated blocks would differ from the formatted file on disk and `--check`
 * would fail on every run, whatever the content.
 *
 * @param body - The document.
 * @returns The formatted document, or the input unchanged if `deno fmt` fails.
 */
async function formatMarkdown(body: string): Promise<string> {
    const command = new Deno.Command(Deno.execPath(), {
        args: ['fmt', '--ext', 'md', '-'],
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'null',
    })
    const child = command.spawn()
    const writer = child.stdin.getWriter()
    await writer.write(new TextEncoder().encode(body))
    await writer.close()
    const result = await child.output()
    if (!result.success) return body
    return new TextDecoder().decode(result.stdout)
}

/**
 * Refresh every package brief.
 */
async function main(): Promise<void> {
    const check = Deno.args.includes('--check')
    const graph = await loadGraph()
    const stale: string[] = []
    let written = 0

    for (
        const pkg of [...graph.packages].sort((a, b) =>
            a.name < b.name ? -1 : 1
        )
    ) {
        const path = join(PACKAGES_DIR, pkg.name, 'AGENTS.md')
        const previous = await Deno.readTextFile(path).catch(() => '')
        const blocks = await renderBlocks(pkg.name, graph)

        let next = previous
        let missingMarker = previous === ''
        for (const [key, content] of Object.entries(blocks)) {
            const replaced = replaceBlock(next, key, content)
            if (replaced === null) missingMarker = true
            else next = replaced
        }
        if (missingMarker) next = scaffold(pkg.name, previous, blocks)

        next = await formatMarkdown(next)
        if (next === previous) continue
        if (check) {
            stale.push(pkg.name)
            continue
        }
        await Deno.writeTextFile(path, next)
        written++
    }

    if (check) {
        if (stale.length > 0) {
            console.error(
                `❌ ${stale.length} agent brief(s) out of date: ${
                    stale.join(', ')
                }`,
            )
            console.error('   Run `deno task agents:brief`.')
            Deno.exit(1)
        }
        console.log('✅ Every agent brief is up to date')
        return
    }

    console.log(`📝 Updated ${written} agent brief(s)`)
}

if (import.meta.main) {
    await main()
}
