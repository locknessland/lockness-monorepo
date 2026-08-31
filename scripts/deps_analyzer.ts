#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * @fileoverview Dependency integrity checker for the Lockness monorepo.
 *
 * Builds the **real** `@lockness/* → @lockness/*` graph from `deno info --json`
 * — the module graph Deno itself resolves — and runs three checks against it:
 *
 * | Check | Question it answers |
 * | :---- | :------------------ |
 * | **A. Cycles** | Does any import cycle exist between packages? |
 * | **B. Declaration drift** | Does every real import appear in its own `deno.json`? |
 * | **C. Tier policy** | Does every edge respect `deps.policy.jsonc`? |
 *
 * Check B is what keeps published packages resolvable: inside the workspace a
 * bare `@lockness/x` specifier resolves by workspace member *name*, so an
 * undeclared import works locally and fails for a JSR consumer with
 * `TS2307: Import "@lockness/x" not a dependency and not in import map`.
 *
 * **Soft edges cannot be parsed.** `tryImportOptionalPackage('@lockness/drizzle')`
 * passes the specifier as a *string argument*, so it never appears in any module
 * graph. Those edges are declared in `deps.policy.jsonc` under `soft` and folded
 * into check A — declaring them is the only way they can be seen at all.
 *
 * @module
 */

import { fromFileUrl, join } from '@std/path'

/** How one package reaches another. */
export type EdgeKind = 'runtime' | 'type' | 'dynamic' | 'soft'

/** A single directed edge, with the evidence that produced it. */
export interface Edge {
    from: string
    to: string
    kind: EdgeKind
    /** Repo-relative file the edge was observed in. Empty for `soft`. */
    at: string
}

/** One package's entry in `deps.policy.jsonc`. */
interface PolicyEntry {
    tier: string
    allow: string[]
    soft?: string[]
}

/** The hand-written policy input. */
interface Policy {
    tiers: Record<string, number>
    packages: Record<string, PolicyEntry>
    /** Pre-existing cycles that are accepted for now, each with its ticket. */
    knownCycles?: KnownCycle[]
}

/** One accepted cycle. Removing the entry is what closes its ticket. */
interface KnownCycle {
    /** The ring, in any rotation, without the repeated closing element. */
    cycle: string[]
    /** Backlog issue that retires this entry. */
    issue: number
    why: string
}

/** A package as read from its own `deno.json`. */
interface PackageInfo {
    name: string
    version: string
    /** Bare `@lockness/*` names declared in this package's own `imports`. */
    declared: Set<string>
    /** Entry points from `exports`, repo-relative. */
    entries: string[]
}

const ROOT = Deno.cwd()
const PACKAGES_DIR = join(ROOT, 'packages')
const POLICY_PATH = join(ROOT, 'deps.policy.jsonc')
const OUTPUT_PATH = join(ROOT, 'docs', 'dependencies.md')

/**
 * Strip comments from a JSONC source so `JSON.parse` accepts it.
 *
 * @param source - The JSONC text.
 * @returns Equivalent JSON text.
 */
function stripJsonc(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1')
}

/**
 * Every source file a package ships.
 *
 * `exports` is not enough: `deno publish` uploads and type-checks the whole
 * directory, so a file no export reaches — `packages/ui/docs_renderer.tsx` is
 * one — still carries real imports and can still close a cycle.
 *
 * Tests and stub templates are excluded: stubs are scaffolding text for
 * generated apps, and test-only edges are not part of the published contract.
 *
 * @param packageDir - Absolute path to the package root.
 * @returns Repo-relative paths, sorted.
 */
async function sourceFiles(packageDir: string): Promise<string[]> {
    const found: string[] = []

    const walk = async (dir: string): Promise<void> => {
        for await (const entry of Deno.readDir(dir)) {
            const path = join(dir, entry.name)
            if (entry.isDirectory) {
                if (entry.name === 'tests' || entry.name === 'stubs') continue
                if (entry.name === 'node_modules' || entry.name === 'docs') {
                    continue
                }
                await walk(path)
                continue
            }
            if (!/\.tsx?$/.test(entry.name)) continue
            if (/\.d\.ts$/.test(entry.name)) continue
            if (/[._]test\.tsx?$/.test(entry.name)) continue
            found.push(path.slice(ROOT.length + 1))
        }
    }

    await walk(packageDir)
    return found.sort()
}

/**
 * Read every workspace package from `packages/`.
 *
 * @returns The packages, keyed by short name (`core`, not `@lockness/core`).
 */
async function readPackages(): Promise<Map<string, PackageInfo>> {
    const packages = new Map<string, PackageInfo>()

    for await (const entry of Deno.readDir(PACKAGES_DIR)) {
        if (!entry.isDirectory || entry.name.startsWith('.')) continue

        const manifestPath = join(PACKAGES_DIR, entry.name, 'deno.json')
        let raw: string
        try {
            raw = await Deno.readTextFile(manifestPath)
        } catch {
            continue
        }

        const config = JSON.parse(raw)
        const declared = new Set<string>()
        // Two spellings count as declared: the direct key `@lockness/x`, and an
        // alias whose value points at the package (`"hono": "jsr:@lockness/hono"`).
        for (const [key, value] of Object.entries(config.imports ?? {})) {
            if (key.startsWith('@lockness/')) {
                declared.add(key.slice('@lockness/'.length))
                continue
            }
            if (typeof value !== 'string') continue
            const alias = value.match(/(?:jsr|npm):@lockness\/([a-z0-9-]+)/)
            if (alias !== null) declared.add(alias[1])
        }

        packages.set(entry.name, {
            name: entry.name,
            version: config.version ?? '0.0.0',
            declared,
            entries: await sourceFiles(join(PACKAGES_DIR, entry.name)),
        })
    }

    return packages
}

/**
 * Map an absolute file path to the package that owns it.
 *
 * @param path - An absolute path, typically decoded from a `file://` URL.
 * @param packages - The known packages.
 * @returns The owning package's short name, or `null` when outside `packages/`.
 */
function ownerOf(
    path: string,
    packages: Map<string, PackageInfo>,
): string | null {
    if (!path.startsWith(PACKAGES_DIR + '/')) return null
    const name = path.slice(PACKAGES_DIR.length + 1).split('/')[0]
    return packages.has(name) ? name : null
}

/**
 * Build the real cross-package graph in a single `deno info` invocation.
 *
 * A synthetic entry module importing every package export is written to the
 * repository root — workspace member resolution only applies inside the
 * workspace — then removed. `deno info` resolves the graph statically; nothing
 * is executed.
 *
 * @param packages - The workspace packages.
 * @returns Every observed static edge.
 * @throws {Error} If `deno info` fails.
 */
async function buildGraph(
    packages: Map<string, PackageInfo>,
): Promise<Edge[]> {
    const lines: string[] = []
    let index = 0
    for (const pkg of packages.values()) {
        for (const entry of pkg.entries) {
            if (!/\.(ts|tsx)$/.test(entry)) continue
            lines.push(`import * as _${index++} from './${entry}'`)
        }
    }
    lines.push(
        `console.log(${
            Array.from({ length: index }, (_, i) => `_${i}`).join(', ')
        })`,
    )

    const entryPath = join(ROOT, '.deps_graph_entry.ts')
    await Deno.writeTextFile(entryPath, lines.join('\n') + '\n')

    let stdout: Uint8Array
    try {
        const result = await new Deno.Command(Deno.execPath(), {
            args: ['info', '--json', entryPath],
            cwd: ROOT,
            stdout: 'piped',
            stderr: 'piped',
        }).output()

        if (!result.success) {
            throw new Error(
                `deno info failed:\n${new TextDecoder().decode(result.stderr)}`,
            )
        }
        stdout = result.stdout
    } finally {
        await Deno.remove(entryPath).catch(() => {})
    }

    const info = JSON.parse(new TextDecoder().decode(stdout))
    const edges: Edge[] = []
    const seen = new Set<string>()

    for (const module of info.modules ?? []) {
        if (typeof module.specifier !== 'string') continue
        if (!module.specifier.startsWith('file://')) continue

        const fromPath = fromFileUrl(module.specifier)
        const from = ownerOf(fromPath, packages)
        if (from === null) continue

        for (const dep of module.dependencies ?? []) {
            // `code` is a value import, `type` is erased at runtime but still
            // binds the two packages for cycle purposes.
            const resolved = dep.code?.specifier ?? dep.type?.specifier
            if (typeof resolved !== 'string') continue
            if (!resolved.startsWith('file://')) continue

            const to = ownerOf(fromFileUrl(resolved), packages)
            if (to === null || to === from) continue

            const kind: EdgeKind = dep.code === undefined
                ? 'type'
                : dep.isDynamic === true
                ? 'dynamic'
                : 'runtime'

            const at = fromPath.slice(ROOT.length + 1)
            const key = `${from}>${to}>${kind}>${at}`
            if (seen.has(key)) continue
            seen.add(key)
            edges.push({ from, to, kind, at })
        }
    }

    return edges
}

/**
 * Fold the policy's declared soft edges into the edge list.
 *
 * @param policy - The parsed policy.
 * @returns One `soft` edge per declared target.
 */
function softEdges(policy: Policy): Edge[] {
    const edges: Edge[] = []
    for (const [from, entry] of Object.entries(policy.packages)) {
        for (const to of entry.soft ?? []) {
            edges.push({ from, to, kind: 'soft', at: '' })
        }
    }
    return edges
}

/**
 * Find every distinct cycle among the binding edges.
 *
 * By default `type` edges are excluded: they erase at runtime and cannot
 * deadlock a module graph. Pass `includeTypes` to get the structural graph as
 * written, which is what surfaces a loop held together by type-only edges — an
 * architectural smell rather than a runtime fault.
 *
 * @param edges - All edges.
 * @param includeTypes - Count `type` edges as binding. Defaults to `false`.
 * @returns Each cycle as a package list whose first and last entries match.
 */
function findCycles(edges: Edge[], includeTypes = false): string[][] {
    const adjacency = new Map<string, Set<string>>()
    for (const edge of edges) {
        if (edge.kind === 'type' && !includeTypes) continue
        const targets = adjacency.get(edge.from) ?? new Set<string>()
        adjacency.set(edge.from, targets)
        targets.add(edge.to)
    }

    const cycles: string[][] = []
    const visited = new Set<string>()
    const stack: string[] = []
    const onStack = new Set<string>()

    const visit = (node: string): void => {
        visited.add(node)
        stack.push(node)
        onStack.add(node)

        for (const next of adjacency.get(node) ?? []) {
            if (onStack.has(next)) {
                cycles.push([...stack.slice(stack.indexOf(next)), next])
            } else if (!visited.has(next)) {
                visit(next)
            }
        }

        stack.pop()
        onStack.delete(node)
    }

    for (const node of [...adjacency.keys()].sort()) {
        if (!visited.has(node)) visit(node)
    }

    // Two traversals can report the same ring from different entry points.
    const unique = new Map<string, string[]>()
    for (const cycle of cycles) {
        const ring = cycle.slice(0, -1)
        const pivot = ring.indexOf([...ring].sort()[0])
        const key = [...ring.slice(pivot), ...ring.slice(0, pivot)].join('>')
        if (!unique.has(key)) unique.set(key, cycle)
    }
    return [...unique.values()]
}

/**
 * Canonical key for a cycle, stable across rotation and entry point.
 *
 * @param ring - The cycle's packages, without the repeated closing element.
 * @returns A key two spellings of the same ring share.
 */
function ringKey(ring: string[]): string {
    const pivot = ring.indexOf([...ring].sort()[0])
    return [...ring.slice(pivot), ...ring.slice(0, pivot)].join('>')
}

/**
 * Split found cycles into accepted baseline and new regressions.
 *
 * @param cycles - Cycles from {@link findCycles}.
 * @param policy - The parsed policy.
 * @returns The cycles to fail on, and the baseline entries that matched.
 */
function partitionCycles(
    cycles: string[][],
    policy: Policy,
): { fresh: string[][]; accepted: KnownCycle[] } {
    const baseline = new Map<string, KnownCycle>()
    for (const known of policy.knownCycles ?? []) {
        baseline.set(ringKey(known.cycle), known)
    }

    const fresh: string[][] = []
    const accepted: KnownCycle[] = []
    for (const cycle of cycles) {
        const known = baseline.get(ringKey(cycle.slice(0, -1)))
        if (known === undefined) fresh.push(cycle)
        else accepted.push(known)
    }
    return { fresh, accepted }
}

/**
 * Check B — every real import must be declared by the package that makes it.
 *
 * @param edges - The static edges (soft edges are excluded by construction).
 * @param packages - The workspace packages.
 * @returns One finding per undeclared edge, deduplicated by `from → to`.
 */
function findDrift(
    edges: Edge[],
    packages: Map<string, PackageInfo>,
): Edge[] {
    const findings = new Map<string, Edge>()
    for (const edge of edges) {
        if (edge.kind === 'soft') continue
        const pkg = packages.get(edge.from)
        if (pkg === undefined || pkg.declared.has(edge.to)) continue
        const key = `${edge.from}>${edge.to}`
        if (!findings.has(key)) findings.set(key, edge)
    }
    return [...findings.values()]
}

/**
 * Check C — every edge must be permitted by the policy.
 *
 * A `soft` edge is checked against `soft`; every other kind against `allow`.
 *
 * @param edges - All edges, including the folded soft ones.
 * @param policy - The parsed policy.
 * @returns One finding per violating edge, deduplicated by `from → to`.
 */
function findTierViolations(edges: Edge[], policy: Policy): Edge[] {
    const findings = new Map<string, Edge>()
    for (const edge of edges) {
        const entry = policy.packages[edge.from]
        if (entry === undefined) continue
        const permitted = edge.kind === 'soft' ? entry.soft ?? [] : entry.allow
        if (permitted.includes(edge.to)) continue
        const key = `${edge.from}>${edge.to}>${edge.kind}`
        if (!findings.has(key)) findings.set(key, edge)
    }
    return [...findings.values()]
}

/**
 * Render `docs/dependencies.md` from the measured graph.
 *
 * @param packages - The workspace packages.
 * @param edges - All edges.
 * @param cycles - Cycles found by check A.
 * @param policy - The parsed policy, used for the tier listing.
 * @returns The document body.
 */
function generateMarkdown(
    packages: Map<string, PackageInfo>,
    edges: Edge[],
    cycles: string[][],
    policy: Policy,
): string {
    const lines: string[] = [
        '# Lockness Monorepo - Dependency Architecture',
        '',
        '> 🤖 Auto-generated by `deno task deps:analyze`. Do not edit by hand.',
        '>',
        '> The graph below is the **resolved module graph** reported by',
        '> `deno info`, plus the soft edges declared in `deps.policy.jsonc`.',
        '',
        '## Overview',
        '',
        `The monorepo contains **${packages.size} packages**.`,
        '',
    ]

    if (cycles.length > 0) {
        lines.push('## ⚠️ Circular Dependencies Detected', '')
        cycles.forEach((cycle, index) => {
            lines.push(
                `${index + 1}. ${
                    cycle.map((p) => `\`@lockness/${p}\``).join(' → ')
                }`,
            )
        })
        lines.push('')
    } else {
        lines.push(
            '## ✅ No Circular Dependencies',
            '',
            'The dependency graph is acyclic (DAG).',
            '',
        )
    }

    lines.push('## Architecture Layers', '')
    const byTier = new Map<string, string[]>()
    for (const [name, entry] of Object.entries(policy.packages)) {
        const bucket = byTier.get(entry.tier) ?? []
        byTier.set(entry.tier, bucket)
        bucket.push(name)
    }
    const tiersByRank = Object.entries(policy.tiers)
        .sort(([, a], [, b]) => a - b)
        .map(([tier]) => tier)
    for (const tier of tiersByRank) {
        const members = (byTier.get(tier) ?? []).sort()
        if (members.length === 0) continue
        const label = tier.charAt(0).toUpperCase() + tier.slice(1)
        lines.push(
            `### ${label}`,
            '',
            members.map((m) => `\`@lockness/${m}\``).join(' · '),
            '',
        )
    }

    lines.push('## Dependencies by package', '')
    lines.push('| Package | Static | Soft (optional, runtime) |')
    lines.push('| :------ | :----- | :----------------------- |')
    for (const name of [...packages.keys()].sort()) {
        const statics = [
            ...new Set(
                edges.filter((e) => e.from === name && e.kind !== 'soft').map(
                    (e) => e.to,
                ),
            ),
        ].sort()
        const softs = [
            ...new Set(
                edges.filter((e) => e.from === name && e.kind === 'soft').map(
                    (e) => e.to,
                ),
            ),
        ].sort()
        lines.push(
            `| \`${name}\` | ${
                statics.length > 0 ? statics.join(', ') : '—'
            } | ${softs.length > 0 ? softs.join(', ') : '—'} |`,
        )
    }
    lines.push('')

    return lines.join('\n')
}

/**
 * Emit a policy file seeded from the measured graph, for bootstrapping.
 *
 * @param packages - The workspace packages.
 * @param edges - The measured static edges.
 * @returns JSONC text.
 */
function initPolicy(
    packages: Map<string, PackageInfo>,
    edges: Edge[],
): string {
    const entries = [...packages.keys()].sort().map((name) => {
        const allow = [
            ...new Set(
                edges.filter((e) => e.from === name && e.kind !== 'soft').map((
                    e,
                ) => e.to),
            ),
        ].sort()
        return `        "${name}": { "tier": "TODO", "allow": [${
            allow.map((a) => `"${a}"`).join(', ')
        }] }`
    })
    return `{\n    "tiers": { "foundation": 0, "implementation": 1, "orchestration": 2 },\n    "packages": {\n${
        entries.join(',\n')
    }\n    }\n}\n`
}

/**
 * Run every check and report.
 *
 * Exits non-zero when any check fails, so CI gates on it.
 */
async function main(): Promise<void> {
    const packages = await readPackages()
    console.log(`🔍 Scanning ${packages.size} packages...`)

    const staticEdges = await buildGraph(packages)
    console.log(`📦 Resolved ${staticEdges.length} cross-package references`)

    if (Deno.args.includes('--init')) {
        await Deno.writeTextFile(
            POLICY_PATH,
            initPolicy(packages, staticEdges),
        )
        console.log(`📝 Seeded ${POLICY_PATH} — fill in the tiers by hand.`)
        return
    }

    let policy: Policy
    try {
        policy = JSON.parse(stripJsonc(await Deno.readTextFile(POLICY_PATH)))
    } catch (error) {
        console.error(
            `❌ Cannot read deps.policy.jsonc: ${(error as Error).message}`,
        )
        console.error('   Run `deno task deps:analyze --init` to seed it.')
        Deno.exit(1)
    }

    const edges = [...staticEdges, ...softEdges(policy)]
    let failed = false

    // ---- Check A: cycles -------------------------------------------------
    const cycles = findCycles(edges)
    const { fresh, accepted } = partitionCycles(cycles, policy)
    if (fresh.length > 0) {
        failed = true
        console.error(`\n❌ A. ${fresh.length} NEW circular dependenc(ies):`)
        for (const cycle of fresh) console.error(`   ${cycle.join(' → ')}`)
        console.error(
            '   Break the cycle. Do not add it to knownCycles to go green.',
        )
    } else if (accepted.length > 0) {
        console.log(
            `✅ A. No new cycles (${accepted.length} accepted in knownCycles):`,
        )
        for (const known of accepted) {
            console.log(
                `   ⏳ ${known.cycle.join(' → ')} — see #${known.issue}`,
            )
        }
    } else {
        console.log('✅ A. No circular dependencies')
    }

    // A type-only ring cannot deadlock module init, so it does not fail the
    // build — but it is still a layering violation, and invisible above.
    const structural = findCycles(edges, true)
    const extra = structural.filter((cycle) =>
        !cycles.some((known) =>
            ringKey(known.slice(0, -1)) === ringKey(cycle.slice(0, -1))
        )
    )
    for (const cycle of extra) {
        // Name the edges that erase: they are what stops this being a runtime
        // cycle, and they are what someone would have to change to create one.
        const erasing: string[] = []
        for (let i = 0; i < cycle.length - 1; i++) {
            const from = cycle[i]
            const to = cycle[i + 1]
            const kinds = edges.filter((e) => e.from === from && e.to === to)
                .map((e) => e.kind)
            if (!kinds.some((k) => k !== 'type')) {
                erasing.push(`${from} → ${to}`)
            }
        }
        console.log(
            `⚠️  A. Structural cycle, erased at runtime: ${cycle.join(' → ')}`,
        )
        console.log(
            `      Only type-only edges keep it safe: ${erasing.join(', ')}.`,
        )
        console.log(
            '      Making any of those a value import turns this into a real cycle.',
        )
    }

    // ---- Check B: declaration drift --------------------------------------
    const drift = findDrift(staticEdges, packages)
    if (drift.length > 0) {
        failed = true
        console.error(
            `\n❌ B. ${drift.length} import(s) not declared in the importing package's deno.json.`,
        )
        console.error(
            '   These resolve inside the workspace but break for a JSR consumer.',
        )
        for (const edge of drift) {
            console.error(
                `   ${edge.from} → ${edge.to}   (${edge.at})`,
            )
        }
    } else {
        console.log('✅ B. Every import is declared by its own package')
    }

    // ---- Check C: tier policy --------------------------------------------
    const violations = findTierViolations(edges, policy)
    if (violations.length > 0) {
        failed = true
        console.error(
            `\n❌ C. ${violations.length} edge(s) outside the policy:`,
        )
        for (const edge of violations) {
            console.error(
                `   ${edge.from} → ${edge.to} [${edge.kind}]${
                    edge.at !== '' ? `   (${edge.at})` : ''
                }`,
            )
        }
        console.error(
            '   Fix the import, or amend deps.policy.jsonc in its own commit.',
        )
    } else {
        console.log('✅ C. Every edge is permitted by deps.policy.jsonc')
    }

    await Deno.writeTextFile(
        OUTPUT_PATH,
        generateMarkdown(packages, edges, cycles, policy),
    )
    await new Deno.Command(Deno.execPath(), {
        args: ['fmt', OUTPUT_PATH],
        cwd: ROOT,
        stdout: 'null',
        stderr: 'null',
    }).output()
    console.log(`\n📝 Wrote ${OUTPUT_PATH.slice(ROOT.length + 1)}`)

    if (failed) Deno.exit(1)
}

if (import.meta.main) {
    await main()
}
