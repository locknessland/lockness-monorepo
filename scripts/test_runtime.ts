#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Runs the framework's tests on one runtime — the one home of
 * "how tests run on runtime R" (plan 274 §5, #594).
 *
 * ```bash
 * deno task test:runtime --runtime=deno|bun|node [--package=<pkg>]...
 * ```
 *
 * **Which packages.** A runtime lane runs every workspace member whose
 * `package.json` `engines` names that runtime, and only those: `engines` is
 * the one statement of "proven on runtime R". No package list lives in CI or
 * in this file. `--package` (repeatable; `@lockness/x`, `x` or `packages/x`)
 * narrows the run to the packages it names, and runs a named package even
 * when it does not declare the runtime yet — the plan has a package's suite
 * pass on a runtime **before** it declares it, so that run has to be possible.
 *
 * **Which files.** Every file under the package directory that Deno's own
 * test discovery would pick (`test.ts`, `*_test.ts`, `*.test.ts`, and the
 * `tsx`/`mts`/`js`/`mjs`/`jsx` forms), skipping `node_modules/`, `dist/`,
 * dot-directories and any nested workspace member. The same explicit list is
 * handed to every runtime, so the three lanes cannot disagree about what a
 * test file is — the set is what `deno test` runs for that package today. The
 * one difference is a Deno-only `*.deno.test.*` file: it keeps `Deno.test`,
 * cannot load on Bun or Node, and runs on the Deno lane only.
 *
 * **How.** Bun and Node run TypeScript sources from the `node_modules` that
 * one `deno install --frozen` builds from `deno.lock` alone (plan F7): no
 * second lockfile, and no `@lockness/*` resolved from a registry
 * (`manifests --check` refuses one in `deno.lock`). The install runs only when
 * a Bun or Node lane has something to run. Workspace siblings resolve to their
 * `.ts` source through the `lockness-source` export condition. A JSR-only test
 * dependency (`@std/assert`, `@std/testing`, …) reaches Bun and Node because
 * its package declares it as a `devDependencies` entry `"<name>": "jsr:<range>"`:
 * the same install links it, hoisted, at `node_modules/<name>` from JSR's npm
 * endpoint (plan F13, disposition D). `lockness.jsr` would not do: it reaches
 * Deno's import map only. Every runner writes a JUnit report, read back to
 * count the tests that ran:
 *
 * | Runtime | Invocation (per package) |
 * | :------ | :----------------------- |
 * | deno    | `deno test -A --junit-path=<report> <files>` |
 * | bun     | `bun test --conditions=lockness-source --timeout=0 --reporter=junit --reporter-outfile=<report> ./<files>` |
 * | node    | `node --conditions=lockness-source --test --test-concurrency=1 --test-reporter=spec … --test-reporter=junit --test-reporter-destination=<report> <files>` |
 *
 * Bun's `--timeout=0` lifts its 5 s per-test default, which Deno and Node do
 * not have; Node's `--test-concurrency=1` runs files one after another, as
 * `deno test` does. The CI job's `timeout-minutes` bounds a hang.
 *
 * **Verdict.** The lane fails when a runner exits non-zero, or when a package
 * ran **zero** tests on the runtime (plan 274 edge case: a package that
 * declares a runtime proves nothing there if none of its tests ran). Skipped
 * tests do not count as run, nor does the placeholder test Node reports for a
 * file that registered none. A lane with no declared package is not a
 * failure and runs nothing: it prints `no package declares engines.<runtime>`
 * and exits 0.
 *
 * In CI the Deno lane is the existing `test` job (`deno task gate --leaks`),
 * which runs the whole suite; `--runtime=deno` is the same per-package run as
 * the other two, for local comparison. Mutation batteries and coverage stay on
 * Deno (plan 274 §6).
 *
 * The script uses `node:` built-ins only, so it can run unchanged on any of
 * the three runtimes (FR-016); today it is launched by Deno.
 *
 * Exit codes: `0` passed (or nothing to run), `1` a runner failed or a package
 * ran zero tests, `2` a usage error.
 *
 * @example
 * ```bash
 * deno task test:runtime --runtime=bun
 * deno task test:runtime --runtime=node --package=transform
 * ```
 *
 * @module
 */

import { spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { type Member, readMembers } from './manifests.ts'

/** A runtime a lane runs on. */
export type Runtime = 'deno' | 'bun' | 'node'

/** Every runtime, in the order the usage text names them. */
export const RUNTIMES: readonly Runtime[] = ['deno', 'bun', 'node']

/** The parsed command line. */
export interface RuntimeArgs {
    /** The runtime to run on. */
    runtime: Runtime
    /** The `--package` values, in order; empty for "every declared package". */
    packages: string[]
}

/** A command-line error: the script exits `2`. */
export class UsageError extends Error {
    /** @param message - What is wrong with the arguments. */
    constructor(message: string) {
        super(message)
        this.name = 'UsageError'
    }
}

const USAGE =
    'usage: test_runtime.ts --runtime=deno|bun|node [--package=<pkg>]...'

/**
 * Parse the command line. Every argument is `--runtime=<r>` or
 * `--package=<pkg>`; anything else is refused rather than ignored, so a typo
 * never runs a different lane from the one asked for.
 *
 * @param args - The raw arguments.
 * @returns The runtime and the requested packages.
 * @throws {UsageError} On a missing, repeated or unknown `--runtime`, an empty
 *   `--package`, or any other argument.
 *
 * @example
 * ```ts
 * parseRuntimeArgs(['--runtime=bun'])                    // { runtime: 'bun', packages: [] }
 * parseRuntimeArgs(['--runtime=node', '--package=core']) // { runtime: 'node', packages: ['core'] }
 * parseRuntimeArgs(['--runtime=bunn'])                   // throws UsageError
 * ```
 */
export function parseRuntimeArgs(args: readonly string[]): RuntimeArgs {
    let runtime: Runtime | undefined
    const packages: string[] = []
    for (const arg of args) {
        if (arg.startsWith('--runtime=')) {
            const value = arg.slice('--runtime='.length)
            if (runtime !== undefined) {
                throw new UsageError(`--runtime given twice. ${USAGE}`)
            }
            if (!(RUNTIMES as readonly string[]).includes(value)) {
                throw new UsageError(
                    `unknown runtime "${value}" (known: ${
                        RUNTIMES.join(', ')
                    }). ${USAGE}`,
                )
            }
            runtime = value as Runtime
        } else if (arg.startsWith('--package=')) {
            const value = arg.slice('--package='.length)
            if (value === '') {
                throw new UsageError(`--package needs a name. ${USAGE}`)
            }
            packages.push(value)
        } else {
            throw new UsageError(`unknown argument: ${arg}. ${USAGE}`)
        }
    }
    if (runtime === undefined) {
        throw new UsageError(`--runtime is required. ${USAGE}`)
    }
    return { runtime, packages }
}

/** One package a lane will run. */
export interface LaneSelection {
    /** The package name, or its directory for an unnamed member. */
    label: string
    /** The member directory, relative to the root. */
    dir: string
    /** Whether its `engines` names the runtime. */
    declared: boolean
}

/**
 * The label a member is reported under: its name, or its directory.
 *
 * @param member - The member.
 * @returns The label.
 */
function labelOf(member: Member): string {
    return member.pkg.name ?? member.dir
}

/**
 * Whether a member's `engines` names the runtime.
 *
 * @param member - The member.
 * @param runtime - The runtime.
 * @returns `true` when `engines.<runtime>` is present.
 */
function declares(member: Member, runtime: Runtime): boolean {
    return Object.hasOwn(member.pkg.engines ?? {}, runtime)
}

/**
 * Whether a `--package` value names a member: `@lockness/x`, `x` or
 * `packages/x`.
 *
 * @param member - The member.
 * @param wanted - The `--package` value.
 * @returns `true` on a match.
 */
function names(member: Member, wanted: string): boolean {
    const dir = wanted.replace(/^\.\//, '').replace(/\/+$/, '')
    return member.pkg.name === wanted ||
        member.pkg.name === `@lockness/${wanted}` ||
        member.dir === dir ||
        member.dir === `packages/${dir}`
}

/**
 * The packages a lane runs.
 *
 * Without `requested`, every member whose `engines` names the runtime, in
 * workspace order. With it, exactly the members it names, declared or not.
 *
 * @param members - Every workspace member.
 * @param runtime - The lane's runtime.
 * @param requested - The `--package` values; empty for "every declared one".
 * @returns The selection, possibly empty.
 * @throws {UsageError} When a requested package is not a workspace member.
 *
 * @example
 * ```ts
 * selectPackages(members, 'node', [])             // every member declaring engines.node
 * selectPackages(members, 'node', ['transform'])  // [{ label: '@lockness/transform', … }]
 * ```
 */
export function selectPackages(
    members: readonly Member[],
    runtime: Runtime,
    requested: readonly string[],
): LaneSelection[] {
    const toSelection = (member: Member): LaneSelection => ({
        label: labelOf(member),
        dir: member.dir,
        declared: declares(member, runtime),
    })
    if (requested.length === 0) {
        return members.filter((m) => declares(m, runtime)).map(toSelection)
    }
    const chosen: Member[] = []
    for (const wanted of requested) {
        const member = members.find((m) => names(m, wanted))
        if (member === undefined) {
            throw new UsageError(
                `--package=${wanted} is not a workspace member`,
            )
        }
        if (!chosen.includes(member)) chosen.push(member)
    }
    return chosen.map(toSelection)
}

/** Deno's test-file discovery rule, on a basename. */
const TEST_FILE = /^(?:.*[._])?test\.(?:ts|tsx|mts|js|mjs|jsx)$/

/**
 * A Deno-only test file: `*.deno.test.*` (docs/testing.md, "Test API"). It
 * keeps `Deno.test` because what it tests is a Deno mechanism, so only the
 * Deno lane runs it.
 */
const DENO_ONLY_TEST_FILE = /\.deno\.test\.(?:ts|tsx|mts|js|mjs|jsx)$/

/**
 * The test files one runtime runs: all of them on Deno; on Bun and Node, all
 * but the Deno-only `*.deno.test.*` files, which call `Deno.test` and would
 * fail to load there.
 *
 * @param runtime - The lane's runtime.
 * @param files - The package's test files, as {@link testFilesOf} lists them.
 * @returns The files that runtime runs, in the same order.
 *
 * @example
 * ```ts
 * filesForRuntime('node', ['a.test.ts', 'b.deno.test.ts']) // ['a.test.ts']
 * ```
 */
export function filesForRuntime(
    runtime: Runtime,
    files: readonly string[],
): string[] {
    return runtime === 'deno'
        ? [...files]
        : files.filter((file) => !DENO_ONLY_TEST_FILE.test(file))
}

/** Directory names a package's test walk never enters. */
const SKIPPED_DIRS = new Set(['node_modules', 'dist'])

/**
 * Whether a file name is a test file, by Deno's discovery rule.
 *
 * @param name - The basename.
 * @returns `true` for `test.ts`, `x_test.ts`, `x.test.ts` and their
 *   `tsx`/`mts`/`js`/`mjs`/`jsx` forms.
 *
 * @example
 * ```ts
 * isTestFile('router.test.ts')  // true
 * isTestFile('router-test.ts')  // false
 * ```
 */
export function isTestFile(name: string): boolean {
    return TEST_FILE.test(name)
}

/**
 * Every test file of one package, relative to the root, POSIX, sorted.
 *
 * @param root - The workspace root.
 * @param dir - The package directory, relative to the root.
 * @param memberDirs - Every member directory: a nested one is not walked.
 * @returns The test files.
 *
 * @example
 * ```ts
 * await testFilesOf('.', 'packages/vite', ['packages/vite', 'packages/vite/demo'])
 * // ['packages/vite/tests/…', …] — nothing from packages/vite/demo
 * ```
 */
export async function testFilesOf(
    root: string,
    dir: string,
    memberDirs: readonly string[],
): Promise<string[]> {
    const nested = new Set(memberDirs.filter((d) => d !== dir))
    const files: string[] = []
    const walk = async (rel: string): Promise<void> => {
        const entries = await readdir(join(root, rel), { withFileTypes: true })
        for (const entry of entries) {
            const path = `${rel}/${entry.name}`
            if (entry.isDirectory()) {
                if (
                    SKIPPED_DIRS.has(entry.name) ||
                    entry.name.startsWith('.') || nested.has(path)
                ) continue
                await walk(path)
            } else if (entry.isFile() && isTestFile(entry.name)) {
                files.push(path)
            }
        }
    }
    await walk(dir)
    return files.sort()
}

/** A command to spawn. */
export interface Invocation {
    /** The executable. */
    command: string
    /** Its arguments. */
    args: string[]
}

/** The one install a Bun or Node lane runs: `node_modules` from `deno.lock`. */
export const INSTALL: Invocation = {
    command: 'deno',
    args: ['install', '--frozen'],
}

/** The export condition that resolves a workspace sibling to its source. */
const SOURCE_CONDITION = 'lockness-source'

/**
 * The command that runs one package's test files on a runtime.
 *
 * @param runtime - The runtime.
 * @param files - The test files, relative to the root (the working directory).
 * @param report - Where the runner writes its JUnit report.
 * @returns The invocation.
 *
 * @example
 * ```ts
 * testInvocation('deno', ['packages/sse/tests/a.test.ts'], '/tmp/r.xml')
 * // { command: 'deno', args: ['test', '-A', '--junit-path=/tmp/r.xml', 'packages/sse/tests/a.test.ts'] }
 * ```
 */
export function testInvocation(
    runtime: Runtime,
    files: readonly string[],
    report: string,
): Invocation {
    switch (runtime) {
        case 'deno':
            return {
                command: 'deno',
                args: ['test', '-A', `--junit-path=${report}`, ...files],
            }
        case 'bun':
            return {
                command: 'bun',
                args: [
                    'test',
                    `--conditions=${SOURCE_CONDITION}`,
                    '--timeout=0',
                    '--reporter=junit',
                    `--reporter-outfile=${report}`,
                    // Without `./`, Bun reads an argument as a name filter.
                    ...files.map((f) => `./${f}`),
                ],
            }
        case 'node':
            return {
                command: 'node',
                args: [
                    `--conditions=${SOURCE_CONDITION}`,
                    '--test',
                    '--test-concurrency=1',
                    '--test-reporter=spec',
                    '--test-reporter-destination=stdout',
                    '--test-reporter=junit',
                    `--test-reporter-destination=${report}`,
                    ...files,
                ],
            }
    }
}

/**
 * Decode the five predefined XML entities and numeric references.
 *
 * @param text - An attribute value as written.
 * @returns The value.
 */
function decodeXml(text: string): string {
    return text.replace(
        /&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi,
        (_, hex, dec, named) => {
            if (hex !== undefined) {
                return String.fromCodePoint(parseInt(hex, 16))
            }
            if (dec !== undefined) return String.fromCodePoint(Number(dec))
            return {
                amp: '&',
                lt: '<',
                gt: '>',
                quot: '"',
                apos: "'",
            }[(named as string).toLowerCase()] as string
        },
    )
}

/** One `<testcase>` element: its attributes, and its body (`''` if empty). */
const TESTCASE =
    /<testcase((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(?:\/>|>([\s\S]*?)<\/testcase>)/g

/** One attribute inside a start tag. */
const ATTRIBUTE = /([\w:.-]+)\s*=\s*"([^"]*)"/g

/**
 * How many tests ran, according to a JUnit report from Deno, Bun or Node.
 *
 * Every `<testcase>` counts once, except:
 *
 * - one with a `<skipped>` child (skipped or todo) — it did not run;
 * - Node's placeholder for a file that registered no test, which it reports
 *   as a passing test named after the file — the file ran, no test did.
 *
 * @param xml - The report.
 * @returns The number of tests that ran.
 *
 * @example
 * ```ts
 * countTestsRun('<testsuites><testcase name="a"/><testcase name="b"><skipped/></testcase></testsuites>')
 * // 1
 * ```
 */
export function countTestsRun(xml: string): number {
    let ran = 0
    for (const [, attributeText, body = ''] of xml.matchAll(TESTCASE)) {
        if (/<skipped\b/.test(body)) continue
        const attributes = new Map<string, string>()
        for (const [, key, value] of attributeText.matchAll(ATTRIBUTE)) {
            attributes.set(key, decodeXml(value))
        }
        const name = attributes.get('name') ?? ''
        const file = (attributes.get('file') ?? '').replaceAll('\\', '/')
        if (
            name !== '' && isTestFile(name.split('/').at(-1) ?? '') &&
            (file === name || file.endsWith(`/${name}`))
        ) continue
        ran++
    }
    return ran
}

/** What a lane needs from its host; injected so the verdict is testable. */
export interface LaneHost {
    /**
     * Run a command from the root with inherited stdio.
     *
     * @param invocation - The command.
     * @returns Its exit code.
     */
    run(invocation: Invocation): Promise<number>
    /**
     * Read a JUnit report.
     *
     * @param path - The report path.
     * @returns Its text, or `null` when the runner wrote none (Bun writes no
     *   report when no test ran).
     */
    readReport(path: string): Promise<string | null>
    /**
     * Print one line to standard output.
     *
     * @param line - The line.
     */
    log(line: string): void
    /**
     * Print one line to standard error.
     *
     * @param line - The line.
     */
    error(line: string): void
}

/** One package, ready to run. */
export interface LanePackage extends LaneSelection {
    /** Its test files, relative to the root. */
    files: string[]
}

/** A lane's verdict. */
export interface LaneOutcome {
    /** `0` when every package ran at least one test and passed. */
    code: number
    /** One line per failed package, or the failed install. */
    faults: string[]
}

/**
 * Run a lane: the install (Bun and Node, when there is anything to run), then
 * each package in turn. Every package runs even after one fails, so one red
 * lane names every failing package.
 *
 * @param runtime - The runtime.
 * @param packages - The packages, from {@link selectPackages} with their files.
 * @param reportDir - A directory for the JUnit reports.
 * @param host - Process and output access.
 * @param narrowed - Whether `--package` chose the packages: then an empty
 *   selection cannot happen, and an undeclared package is noted.
 * @returns The verdict.
 *
 * @example
 * ```ts
 * const outcome = await runLane('bun', [], '/tmp/reports', host)
 * outcome.code   // 0 — prints "no package declares engines.bun"
 * ```
 */
export async function runLane(
    runtime: Runtime,
    packages: readonly LanePackage[],
    reportDir: string,
    host: LaneHost,
    narrowed = false,
): Promise<LaneOutcome> {
    if (packages.length === 0) {
        host.log(
            `test:runtime ${runtime}: no package declares engines.${runtime}; nothing to run`,
        )
        return { code: 0, faults: [] }
    }
    if (runtime !== 'deno') {
        host.log(`test:runtime ${runtime}: deno install --frozen`)
        const code = await host.run(INSTALL)
        if (code !== 0) {
            const fault = `deno install --frozen failed (exit ${code})`
            host.error(`❌ ${fault}`)
            return { code: 1, faults: [fault] }
        }
    }
    const faults: string[] = []
    for (const [index, pkg] of packages.entries()) {
        if (narrowed && !pkg.declared) {
            host.log(
                `test:runtime ${runtime}: ${pkg.label} does not declare engines.${runtime}; running it because --package named it`,
            )
        }
        if (pkg.files.length === 0) {
            faults.push(
                `${pkg.label}: no test file, so 0 tests ran on ${runtime}`,
            )
            continue
        }
        const report = join(reportDir, `${index}.xml`)
        host.log(
            `── ${pkg.label} on ${runtime} (${pkg.files.length} test file(s))`,
        )
        const code = await host.run(testInvocation(runtime, pkg.files, report))
        const xml = await host.readReport(report)
        const ran = xml === null ? 0 : countTestsRun(xml)
        if (code !== 0) {
            faults.push(`${pkg.label}: the ${runtime} runner exited ${code}`)
        } else if (ran === 0) {
            faults.push(
                `${pkg.label} declares engines.${runtime}, but 0 of its tests ran on ${runtime}`,
            )
        } else {
            host.log(`✅ ${pkg.label}: ${ran} test(s) ran on ${runtime}`)
        }
    }
    for (const fault of faults) host.error(`❌ ${fault}`)
    if (faults.length > 0) return { code: 1, faults }
    host.log(
        `✅ test:runtime ${runtime}: ${packages.length} package(s) passed`,
    )
    return { code: 0, faults }
}

/** Whether this process runs inside GitHub Actions. */
function inActions(): boolean {
    return process.env.GITHUB_ACTIONS === 'true'
}

/**
 * Spawn a command from `cwd` with inherited stdio.
 *
 * @param invocation - The command.
 * @param cwd - The working directory.
 * @returns Its exit code; `1` when it could not start or died on a signal.
 */
function spawnInherited(invocation: Invocation, cwd: string): Promise<number> {
    return new Promise((resolve) => {
        const child = spawn(invocation.command, invocation.args, {
            cwd,
            stdio: 'inherit',
        })
        child.on('error', (error) => {
            console.error(
                `❌ could not start ${invocation.command}: ${error.message}`,
            )
            resolve(1)
        })
        child.on('close', (code) => resolve(code ?? 1))
    })
}

/**
 * The host the script runs with: real processes, grouped log output in
 * Actions.
 *
 * @param root - The workspace root, every command's working directory.
 * @returns The host.
 */
function processHost(root: string): LaneHost {
    const actions = inActions()
    return {
        run: async (invocation) => {
            if (actions) {
                console.log(
                    `::group::${invocation.command} ${
                        invocation.args.slice(0, 2).join(' ')
                    }`,
                )
            }
            try {
                return await spawnInherited(invocation, root)
            } finally {
                if (actions) console.log('::endgroup::')
            }
        },
        readReport: async (path) => {
            try {
                return await readFile(path, 'utf8')
            } catch (error) {
                if ((error as { code?: string }).code === 'ENOENT') return null
                throw error
            }
        },
        log: (line) => console.log(line),
        error: (line) => {
            if (actions) console.log(`::error::${line.replace(/^❌ /, '')}`)
            console.error(line)
        },
    }
}

/**
 * Run the script and decide its exit code. Everything but the final exit
 * lives here, so the verdict is testable in-process.
 *
 * @param args - The command-line arguments.
 * @param root - The workspace root.
 * @param host - Process and output access; defaults to real processes.
 * @returns `0` passed or nothing to run, `1` a lane fault, `2` a usage error.
 *
 * @example
 * ```ts
 * process.exitCode = await main(process.argv.slice(2))
 * ```
 */
export async function main(
    args: readonly string[],
    root: string = fileURLToPath(new URL('..', import.meta.url)),
    host: LaneHost = processHost(root),
): Promise<number> {
    let parsed: RuntimeArgs
    let selection: LaneSelection[]
    let members: Member[]
    try {
        parsed = parseRuntimeArgs(args)
        members = await readMembers(root)
        selection = selectPackages(members, parsed.runtime, parsed.packages)
    } catch (error) {
        if (!(error instanceof UsageError)) throw error
        host.error(`❌ test:runtime: ${error.message}`)
        return 2
    }
    const memberDirs = members.map((m) => m.dir)
    const packages: LanePackage[] = []
    for (const pkg of selection) {
        const files = filesForRuntime(
            parsed.runtime,
            await testFilesOf(root, pkg.dir, memberDirs),
        )
        packages.push({ ...pkg, files })
    }
    const reportDir = await mkdtemp(join(tmpdir(), 'lockness-test-runtime-'))
    try {
        const outcome = await runLane(
            parsed.runtime,
            packages,
            reportDir,
            host,
            parsed.packages.length > 0,
        )
        return outcome.code
    } finally {
        await rm(reportDir, { recursive: true, force: true })
    }
}

if (import.meta.main) {
    process.exitCode = await main(process.argv.slice(2))
}
