/**
 * @fileoverview Composes a GitHub Release body from the upgrade guides, and
 * refuses to let a released version's upgrade section gain an item (#364).
 *
 * The GitHub Release for tag `v<X.Y.Z>` is the framework's one changelog
 * (`docs/releasing.md` § Release history). Each breaking change is recorded
 * once, as a `###` item under `## Upgrading to v<X.Y.Z>` in its package's
 * guide; this script is the one place that turns those headings into the
 * Release's breaking-change index, so the index is never written by hand at
 * the moment of the irreversible publish.
 *
 * Two modes run the same functions: scan, near-miss check, empty-scan check,
 * frozen guard.
 *
 * - `--check` takes no version. Its subject tree is the working tree. It runs
 *   in `/ship`'s pre-flight, before anything is bumped or tagged, and writes
 *   nothing to stdout.
 * - `<X.Y.Z> [--notes <file>]` renders. Its subject tree is tag `v<X.Y.Z>`,
 *   and stdin is the draft body the release wrapper generated. It writes the
 *   whole Release body to stdout: the continuity line, the breaking-change
 *   index, the hand-written notes, then stdin byte for byte.
 *
 * Exit codes: `0` emitted or checked; `1` content refused; `2` usage error, a
 * missing tag, or output that could not be written. On a refusal stdout is
 * empty; when stdout itself breaks mid-body the exit is 2, so a caller that
 * judges the exit status can never paste half a body. Every path on stderr is
 * repo-relative. One path escapes this table: if stderr itself cannot be
 * written, {@linkcode writeResult} has nowhere left to report the failure and
 * lets the rejection propagate (documented on its own `@throws`), so the
 * process exits with Deno's uncaught-rejection code, `1`, not the `2` a
 * write failure otherwise gets.
 *
 * Runs with `--allow-read --allow-run=git`: it reads files and git objects,
 * never the network, and never writes a file.
 *
 * @example
 * ```sh
 * deno task release:notes --check
 * gh release view v0.4.0 --json body -q .body \
 *   | deno task release:notes 0.4.0 --notes "$NOTES" > "$BODY"
 * ```
 *
 * @module scripts/release_notes
 */

import { parseArgs } from '@std/cli/parse-args'
import { globToRegExp } from '@std/path/glob-to-regexp'
import { resolve } from '@std/path/resolve'

/** The repository whose blob URLs the index links to. */
const REPOSITORY = 'https://github.com/locknessland/lockness-monorepo'

/** The files that can hold an upgrade section, relative to the repo root. */
const SCAN_GLOBS = [
    'docs/**/*.md',
    'packages/*/docs/**/*.md',
    'packages/*/README.md',
] as const

/**
 * The one filter both enumerators share. `@std/path@1`'s `globToRegExp`
 * mishandles `**` inside a `{a,b}` group, so each glob is converted on its own
 * and the anchored results are joined into one expression, built once.
 */
const SCANNED = new RegExp(
    SCAN_GLOBS.map((glob) =>
        globToRegExp(glob, { extended: true, globstar: true }).source
    ).join('|'),
)

/**
 * The line every Release body opens with, so the JSR version history reads
 * straight across the move from the retired repository. Its reason lives in
 * `docs/releasing.md` § Version history; its wording lives only here.
 */
export const CONTINUITY_LINE =
    'Version numbering continues from `0.1.30`, the last release published from the retired repository.'

/** The heading of the breaking-change index in a Release body. */
export const BREAKING_HEADING = '## ⚠️ Breaking changes'

/** Said only when no guide section exists and no commit contradicts it. */
const NONE_RECORDED = 'No breaking change is recorded for this release.'

const VERSION = /^\d+\.\d+\.\d+$/
const TAG = /^v(\d+\.\d+\.\d+)$/
const EXACT_HEADING = /^Upgrading to v(\d+\.\d+\.\d+)$/
/**
 * A heading that reads as an upgrade section. Wider than the exact form on
 * purpose: leading symbols or emphasis, any spacing, `version`, and a quoted or
 * backticked version all still read as one to a human, so each is caught.
 */
const NEAR_MISS =
    /^[^\p{L}\p{N}]*upgrad(e|ing)\s+to\s+(version\s+)?[`'"*_]*v?\d/iu
const MARKED_SUBJECT = /^\w+(\([^)]*\))?!:/
/** Conventional Commits accepts both spellings of the footer token. */
const MARKED_FOOTER = /BREAKING[ -]CHANGE/

const USAGE = [
    'usage: deno task release:notes <X.Y.Z> [--notes <file>] < draft-body.md',
    '       deno task release:notes --check',
].join('\n')

/** One `## Upgrading to v<X.Y.Z>` section of one file, and its `###` titles. */
export interface UpgradeSection {
    /** The file, relative to the repository root. */
    readonly path: string
    /** The version, without the `v`. */
    readonly version: string
    /** The direct level-3 children, verbatim, in document order. */
    readonly titles: readonly string[]
}

/**
 * A heading the parser reports rather than indexes: a near-miss (it reads like
 * an upgrade section but is not the exact form) or an exact section with no
 * `###` item under it.
 */
export interface HeadingAt {
    /** The file, relative to the repository root. */
    readonly path: string
    /** The 1-based line of the heading. */
    readonly line: number
    /** The heading line (for a setext heading, its text line), trimmed. */
    readonly heading: string
}

/** What {@linkcode parseUpgradeSections} finds in one file. */
export interface ParsedGuide {
    /** Every exact section with at least one item, in document order. */
    readonly sections: readonly UpgradeSection[]
    /** Every near-miss heading; the caller decides whether it is fatal. */
    readonly nearMisses: readonly HeadingAt[]
    /**
     * Every exact section heading with no `###` item under it; the caller
     * decides whether it is fatal. It is never indexed as an empty entry.
     */
    readonly emptySections: readonly HeadingAt[]
}

/**
 * Which versions the guard judges.
 *
 * - `render`: the subject is the target tag's tree; every version below the
 *   target is released and judged.
 * - `check`: the subject is the working tree; every version up to the highest
 *   `v*` tag is judged, and the one above it (the next release) is skipped.
 *   With no `v*` tag at all (`highest: null`), every version is judged.
 */
export type GuardMode =
    | { readonly kind: 'render'; readonly target: string }
    | { readonly kind: 'check'; readonly highest: string | null }

/** Why the guard refuses: a tag it needs is missing, or a title was added. */
export type GuardFinding =
    | { readonly kind: 'missing-tag'; readonly version: string }
    | {
        readonly kind: 'added'
        readonly version: string
        readonly path: string
        readonly title: string
    }

/**
 * A commit that marks itself breaking: a `type!:` subject, or a
 * `BREAKING CHANGE` / `BREAKING-CHANGE` footer.
 */
export interface BreakingCommit {
    /** The abbreviated SHA. */
    readonly sha: string
    /** The subject line. */
    readonly subject: string
}

/** What {@linkcode main} reads from its caller instead of the process. */
export interface MainIo {
    /** The repository root every git call and relative path resolves from. */
    readonly cwd: string
    /** Reads the draft body. Called in render mode only. */
    readonly stdin?: () => Promise<string>
    /**
     * The whole environment for `git`. Omitted, `git` inherits this process's
     * environment; given, it replaces it (tests drop every `GIT_` variable).
     */
    readonly env?: Readonly<Record<string, string>>
}

/** The outcome of one run: what to print, and the exit code. */
export interface RunResult {
    /** `0` emitted or checked, `1` content refused, `2` usage or missing tag. */
    readonly code: 0 | 1 | 2
    /** The Release body in render mode; empty otherwise and on any failure. */
    readonly stdout: string
    /** Diagnostics, with repo-relative paths only. */
    readonly stderr: string
}

/**
 * Keeps the paths an upgrade section may live in: `docs/**\/*.md`,
 * `packages/*\/docs/**\/*.md` and `packages/*\/README.md`.
 *
 * Both subject trees enumerate through this one filter — the working tree from
 * `git ls-files`, a tag from `git ls-tree` — so they can never disagree about
 * what was scanned.
 *
 * @param paths Repo-relative paths, as git lists them.
 * @returns The scanned subset, sorted.
 *
 * @example
 * ```ts
 * listScanned(['docs/realtime.md', 'packages/core/AGENTS.md'])
 * // ['docs/realtime.md']
 * ```
 */
export function listScanned(paths: readonly string[]): string[] {
    return [...new Set(paths.filter((path) => SCANNED.test(path)))].sort()
}

/**
 * Finds the upgrade sections of one Markdown file, and its near-miss headings.
 *
 * CommonMark, as far as headings go: an ATX heading has 0–3 leading spaces and
 * optional closing `#`s; four spaces is code; lines inside a fence opened by
 * three or more backticks or tildes are skipped until the same character
 * closes it at no shorter length. A section is an ATX level-2 heading whose text
 * is exactly `Upgrading to v<X.Y.Z>`; it ends at the next level-1 or level-2
 * heading (ATX or setext), and its titles are its direct level-3 children,
 * verbatim. A section with no title is reported in `emptySections`, never
 * indexed. Any other heading, of any level and either style, whose text reads
 * like an upgrade section (`Upgrade to v…`, a lowercase or backticked version,
 * a leading symbol, `version 0.4.0`) is a near-miss.
 *
 * @param text The file's content.
 * @param path The file, relative to the repository root.
 * @returns The sections in document order, the near-misses, and the empty
 *   sections.
 *
 * @example
 * ```ts
 * parseUpgradeSections('## Upgrading to v0.4.0\n\n### 1. A\n', 'docs/g.md')
 * // { sections: [{ path: 'docs/g.md', version: '0.4.0', titles: ['1. A'] }],
 * //   nearMisses: [], emptySections: [] }
 * ```
 */
export function parseUpgradeSections(text: string, path: string): ParsedGuide {
    const sections: UpgradeSection[] = []
    const nearMisses: HeadingAt[] = []
    const emptySections: HeadingAt[] = []
    let fence: Fence | null = null
    let paragraph: Paragraph | null = null
    let current: (HeadingAt & { version: string; titles: string[] }) | null =
        null

    const closeSection = (): void => {
        if (!current) return
        const { version, titles, line, heading } = current
        if (titles.length === 0) emptySections.push({ path, line, heading })
        else sections.push({ path, version, titles })
        current = null
    }

    text.split(/\r?\n/).forEach((line, index) => {
        if (fence) {
            if (closesFence(line, fence)) fence = null
            return
        }
        fence = opensFence(line)
        if (fence) {
            paragraph = null
            return
        }

        const heading = readHeading(line, paragraph, index + 1)
        if (!heading) {
            paragraph = nextParagraph(paragraph, line, index + 1)
            return
        }
        paragraph = null
        if (heading.level <= 2) closeSection()

        const at = { path, line: heading.line, heading: heading.shown }
        if (heading.opens) {
            current = { ...at, version: heading.opens, titles: [] }
        } else if (NEAR_MISS.test(heading.text)) {
            nearMisses.push(at)
        } else if (current && heading.level === 3) {
            current.titles.push(heading.text)
        }
    })
    closeSection()
    return { sections, nearMisses, emptySections }
}

/**
 * The versions the guard must judge, given the sections of the subject tree.
 *
 * @param subject The sections found in the subject tree.
 * @param mode Which versions count as released.
 * @returns The judged versions, unique and ascending.
 *
 * @example
 * ```ts
 * judgedVersions(sections, { kind: 'render', target: '0.4.0' })
 * // every section version below 0.4.0
 * ```
 */
export function judgedVersions(
    subject: readonly UpgradeSection[],
    mode: GuardMode,
): string[] {
    const versions = [...new Set(subject.map((s) => s.version))]
    return versions.filter((version) =>
        mode.kind === 'render'
            ? compareVersions(version, mode.target) < 0
            // With no `v*` tag at all there is no "next release" to skip:
            // every section is judged, and each one's missing tag refuses.
            : mode.highest === null ||
                compareVersions(version, mode.highest) <= 0
    ).sort(compareVersions)
}

/**
 * The frozen rule: a released version never gains a title.
 *
 * For each version the mode judges, its titles in the subject tree (across
 * every scanned file) must be a subset of its titles at tag `v<P>`. Removing a
 * title, pruning a section, editing prose or moving a guide all pass; adding
 * or retitling one does not. A judged version whose tag is absent from
 * `tagTitles` is a missing tag.
 *
 * @param subject The sections found in the subject tree.
 * @param tagTitles For each judged version whose tag exists, its titles at
 *   that tag, across every scanned file.
 * @param mode Which versions are judged.
 * @returns Every finding; empty when the subject passes.
 *
 * @example
 * ```ts
 * guard(
 *     [{ path: 'docs/g.md', version: '0.3.0', titles: ['1. A', '2. B'] }],
 *     new Map([['0.3.0', ['1. A']]]),
 *     { kind: 'check', highest: '0.3.0' },
 * )
 * // [{ kind: 'added', version: '0.3.0', path: 'docs/g.md', title: '2. B' }]
 * ```
 */
export function guard(
    subject: readonly UpgradeSection[],
    tagTitles: ReadonlyMap<string, readonly string[]>,
    mode: GuardMode,
): GuardFinding[] {
    const findings: GuardFinding[] = []
    for (const version of judgedVersions(subject, mode)) {
        const released = tagTitles.get(version)
        if (!released) {
            findings.push({ kind: 'missing-tag', version })
            continue
        }
        const known = new Set(released)
        for (const section of subject) {
            if (section.version !== version) continue
            for (const title of section.titles) {
                if (!known.has(title)) {
                    findings.push({
                        kind: 'added',
                        version,
                        path: section.path,
                        title,
                    })
                }
            }
        }
    }
    return findings
}

/**
 * Raised by {@linkcode composeBody} when a release has no guide section yet its
 * range carries commits that mark themselves breaking.
 *
 * @example
 * ```ts
 * try {
 *     composeBody('0.4.0', [], '', log, [{ sha: 'abc1234', subject: 'feat!: x' }])
 * } catch (error) {
 *     if (error instanceof NoneRecordedContradicted) console.error(error.commits)
 * }
 * ```
 */
export class NoneRecordedContradicted extends Error {
    /**
     * @param version The release, `X.Y.Z`.
     * @param commits The marked commits that contradict "none recorded".
     */
    constructor(
        readonly version: string,
        readonly commits: readonly BreakingCommit[],
    ) {
        super(
            [
                `release:notes: no guide has "## Upgrading to v${version}", yet the range carries commits marked breaking:`,
                ...commits.map((c) => `  ${c.sha} ${c.subject}`),
                'Record each one as a "###" item in its package guide, or unmark it, before this release says "none recorded".',
            ].join('\n'),
        )
        this.name = 'NoneRecordedContradicted'
    }
}

/**
 * Composes the whole Release body, in its one order: the continuity line, the
 * breaking-change index, `## Notes`, then the generated log byte for byte.
 *
 * The index holds one entry per guide that has a section for `version`, sorted
 * by path: a link pinned to the tag, then each title verbatim. With no such
 * section it says that none is recorded — which the caller may only let it say
 * when no commit in the release range marks itself breaking.
 *
 * @param version The release, `X.Y.Z`.
 * @param sections The sections of the tag's tree; other versions are ignored.
 * @param notes The hand-written notes; omitted when blank.
 * @param stdin The generated log, appended unchanged.
 * @param breakingCommits The marked commits of the release range.
 * @returns The body.
 * @throws {NoneRecordedContradicted} When no section exists for `version` but
 *   `breakingCommits` is not empty: "none recorded" would be contradicted. This
 *   is the one place that rule is decided.
 *
 * @example
 * ```ts
 * composeBody('0.4.0', sections, '', generatedLog)
 * ```
 */
export function composeBody(
    version: string,
    sections: readonly UpgradeSection[],
    notes: string,
    stdin: string,
    breakingCommits: readonly BreakingCommit[] = [],
): string {
    const byPath = new Map<string, string[]>()
    for (const section of sections) {
        if (section.version !== version) continue
        byPath.set(section.path, [
            ...(byPath.get(section.path) ?? []),
            ...section.titles,
        ])
    }
    if (byPath.size === 0 && breakingCommits.length > 0) {
        throw new NoneRecordedContradicted(version, breakingCommits)
    }

    const lines = [CONTINUITY_LINE, '', BREAKING_HEADING, '']
    if (byPath.size === 0) lines.push(NONE_RECORDED, '')
    for (const path of [...byPath.keys()].sort()) {
        lines.push(
            `**\`${path}\`** — [upgrade guide](${guideLink(version, path)})`,
            '',
            ...byPath.get(path)!.map((title) => `- ${title}`),
            '',
        )
    }
    let body = lines.join('\n')
    if (notes.trim() !== '') {
        body += `\n## Notes\n\n${notes}${notes.endsWith('\n') ? '' : '\n'}`
    }
    return stdin === '' ? body : `${body}\n${stdin}`
}

/**
 * Runs the script: `--check`, or render `<X.Y.Z>`. All git and file I/O
 * happens here; every decision is one of the pure functions above.
 *
 * @param args The command-line arguments.
 * @param io The repository root, the stdin reader, and optionally the
 *   environment `git` runs under.
 * @returns The exit code, and what to write to stdout and stderr.
 *
 * @example
 * ```ts
 * const { code, stderr } = await main(['--check'], { cwd: Deno.cwd() })
 * ```
 */
export async function main(args: string[], io: MainIo): Promise<RunResult> {
    const log: string[] = []
    // Replaced by every spelling of the root; if even that fails, the failure
    // is itself reported below, relativized against `cwd` as given.
    let roots = [io.cwd]
    try {
        roots = await rootSpellings(io.cwd)
        const cli = parseCli(args)
        const stdout = cli.kind === 'check'
            ? await runCheck(io, log)
            : await runRender(io, log, cli.version, cli.notes)
        return { code: 0, stdout, stderr: relativize(log, roots) }
    } catch (error) {
        // Anything that is not a deliberate refusal is still a refusal: exit
        // 2, its message only (never a stack), with every path made relative.
        const stop = error instanceof Stop ? error : new Stop(2, [
            `release:notes: unexpected ${
                error instanceof Error ? error.name : 'error'
            }: ${error instanceof Error ? error.message : String(error)}`,
        ])
        return {
            code: stop.code,
            stdout: '',
            stderr: relativize([...log, ...stop.lines], roots),
        }
    }
}

/** A byte sink that may write only part of what it is given. */
export interface Writable {
    /**
     * Writes a prefix of `bytes`.
     *
     * @param bytes The bytes to write.
     * @returns How many bytes were written.
     */
    write(bytes: Uint8Array): Promise<number>
}

/** Where {@linkcode writeResult} prints: the process streams, or a test's. */
export interface OutputStreams {
    /** Receives the Release body. */
    readonly stdout: Writable
    /** Receives the diagnostics. */
    readonly stderr: Writable
}

/**
 * Prints a {@linkcode RunResult} — stderr first, then stdout — and returns the
 * exit code to use.
 *
 * Writing is held to the same rule as {@linkcode main}: a failure is exit 2
 * with the error's name only, never a stack and never a path. The common case
 * is a closed pipe, when whoever reads stdout exits before the body is
 * written; a caller that sees exit 2 knows the body it holds is incomplete.
 *
 * @param result What {@linkcode main} returned.
 * @param streams Where to print it.
 * @returns `result.code` when every byte was written, `2` otherwise.
 * @throws When stderr itself cannot be written, so that the failure cannot be
 *   reported either; the rejection is left to the runtime.
 *
 * @example
 * ```ts
 * const result = await main(Deno.args, { cwd: Deno.cwd() })
 * Deno.exit(await writeResult(result, { stdout: Deno.stdout, stderr: Deno.stderr }))
 * ```
 */
export async function writeResult(
    result: RunResult,
    streams: OutputStreams,
): Promise<0 | 1 | 2> {
    try {
        if (result.stderr !== '') {
            await writeAll(streams.stderr, `${result.stderr}\n`)
        }
        await writeAll(streams.stdout, result.stdout)
        return result.code
    } catch (error) {
        // The error's message may name an absolute path, so only its name is
        // reported. If stderr is what failed, this write fails too and the
        // rejection escapes: there is nowhere left to report it.
        await writeAll(
            streams.stderr,
            `release:notes: cannot write the output (${
                error instanceof Error ? error.name : 'unknown error'
            }); what was written is incomplete\n`,
        )
        return 2
    }
}

// ─── modes ───────────────────────────────────────────────────────────────────

async function runCheck(io: MainIo, log: string[]): Promise<string> {
    const files = scanned(await workingTreeFiles(io), 'the working tree', log)
    const parsed = await parseAll(
        files,
        (path) => Deno.readTextFile(resolve(io.cwd, path)),
    )
    refuseMalformed(parsed)
    const released = await releasedVersions(io)
    await enforceGuard(io, parsed.sections, {
        kind: 'check',
        highest: released.at(-1) ?? null,
    }, released)
    return ''
}

async function runRender(
    io: MainIo,
    log: string[],
    version: string,
    notesPath: string | undefined,
): Promise<string> {
    const released = await releasedVersions(io)
    if (!released.includes(version)) {
        throw new Stop(2, [
            `release:notes: tag v${version} does not exist here; render reads the tagged tree, so tag first (or fetch the tags)`,
        ])
    }
    const notes = await readNotes(io, notesPath)
    const draft = io.stdin ? await io.stdin() : ''
    if (alreadyComposed(draft)) {
        throw new Stop(1, [
            'release:notes: stdin already carries a composed preamble (the continuity line or the breaking-changes heading); a body is composed once, from the draft the wrapper generated',
        ])
    }

    const tag = `v${version}`
    const files = scanned(await tagFiles(io, tag), `tag ${tag}`, log)
    const parsed = await parseAll(files, (path) => show(io, tag, path))
    refuseMalformed(parsed)
    await enforceGuard(io, parsed.sections, {
        kind: 'render',
        target: version,
    }, released)

    // The range is read only when it can matter; composeBody decides.
    const own = parsed.sections.some((s) => s.version === version)
    const marked = own ? [] : await markedCommits(io, version, released)
    try {
        return composeBody(version, parsed.sections, notes, draft, marked)
    } catch (error) {
        if (error instanceof NoneRecordedContradicted) {
            throw new Stop(1, [error.message])
        }
        throw error
    }
}

// ─── the steps both modes share ──────────────────────────────────────────────

function scanned(paths: string[], where: string, log: string[]): string[] {
    const files = listScanned(paths)
    if (files.length === 0) {
        throw new Stop(1, [
            `release:notes: scanned 0 files under ${
                SCAN_GLOBS.join(', ')
            } in ${where}`,
        ])
    }
    log.push(`release:notes: scanned ${files.length} files in ${where}`)
    return files
}

async function parseAll(
    files: readonly string[],
    read: (path: string) => Promise<string>,
): Promise<ParsedGuide> {
    const sections: UpgradeSection[] = []
    const nearMisses: HeadingAt[] = []
    const emptySections: HeadingAt[] = []
    for (const path of files) {
        const parsed = parseUpgradeSections(await read(path), path)
        sections.push(...parsed.sections)
        nearMisses.push(...parsed.nearMisses)
        emptySections.push(...parsed.emptySections)
    }
    return { sections, nearMisses, emptySections }
}

/**
 * Near-misses and empty sections are fatal in the subject tree only; the same
 * shapes at an earlier tag are history the guard reads past (F1).
 */
function refuseMalformed(parsed: ParsedGuide): void {
    const lines: string[] = []
    if (parsed.nearMisses.length > 0) {
        lines.push(
            'release:notes: heading(s) that look like an upgrade section but are not "## Upgrading to v<X.Y.Z>":',
            ...parsed.nearMisses.map((m) =>
                `  ${m.path}:${m.line}: ${m.heading}`
            ),
            'Write the exact form, or reword the heading so it does not read as one.',
        )
    }
    if (parsed.emptySections.length > 0) {
        lines.push(
            'release:notes: upgrade section(s) with no "###" item under them:',
            ...parsed.emptySections.map((m) =>
                `  ${m.path}:${m.line}: ${m.heading}`
            ),
            'Record each breaking change as a "###" item, or remove the empty heading.',
        )
    }
    if (lines.length > 0) throw new Stop(1, lines)
}

async function enforceGuard(
    io: MainIo,
    subject: readonly UpgradeSection[],
    mode: GuardMode,
    released: readonly string[],
): Promise<void> {
    const tagTitles = new Map<string, string[]>()
    for (const version of judgedVersions(subject, mode)) {
        if (released.includes(version)) {
            tagTitles.set(version, await titlesAtTag(io, version))
        }
    }
    const findings = guard(subject, tagTitles, mode)
    const missing = findings.filter((f) => f.kind === 'missing-tag')
    const added = findings.filter((f): f is AddedTitle => f.kind === 'added')
    if (missing.length > 0) {
        throw new Stop(
            2,
            missing.map((f) =>
                `release:notes: a section for ${f.version} exists, but tag v${f.version} does not: either tags are missing here (fetch them), or the section names a version that was never released`
            ),
        )
    }
    if (added.length > 0) {
        throw new Stop(1, [
            'release:notes: a released version gained a title after its tag:',
            ...added.map((f) => `  ${f.version} ${f.path}: ${f.title}`),
            'A title added (or retitled) under a released version ships unannounced. Move it under the next unreleased version, or revert the retitle.',
        ])
    }
}

/** A version's titles at its own tag, across every scanned file. */
async function titlesAtTag(io: MainIo, version: string): Promise<string[]> {
    const tag = `v${version}`
    const files = listScanned(await tagFiles(io, tag))
    // Near-misses in an earlier tag's tree are history, never fatal (F1).
    const { sections } = await parseAll(files, (path) => show(io, tag, path))
    return sections.filter((s) => s.version === version).flatMap((s) =>
        s.titles
    )
}

/** Commits in `<prev>..v<version>` that mark themselves breaking. */
async function markedCommits(
    io: MainIo,
    version: string,
    released: readonly string[],
): Promise<BreakingCommit[]> {
    const previous = released.filter((v) => compareVersions(v, version) < 0)
        .at(-1)
    const range = previous ? `v${previous}..v${version}` : `v${version}`
    const out = await git(io, [
        'log',
        '--format=%h%x00%s%x00%b%x1e',
        range,
    ])
    return out.split('\x1e').map((record) => record.replace(/^\n/, ''))
        .filter((record) => record !== '')
        .map((record) => record.split('\x00'))
        .filter(([, subject = '', body = '']) =>
            MARKED_SUBJECT.test(subject) || MARKED_FOOTER.test(body)
        )
        .map(([sha, subject = '']) => ({ sha, subject }))
}

function alreadyComposed(draft: string): boolean {
    return draft.includes(CONTINUITY_LINE) ||
        draft.split(/\r?\n/).some((line) => line.trim() === BREAKING_HEADING)
}

async function readNotes(
    io: MainIo,
    notesPath: string | undefined,
): Promise<string> {
    if (notesPath === undefined) return ''
    try {
        return await Deno.readTextFile(resolve(io.cwd, notesPath))
    } catch (error) {
        // The path is the caller's, often a temporary file outside the tree:
        // it is not echoed, so no local layout reaches stderr (S6).
        throw new Stop(2, [
            `release:notes: cannot read the --notes file (${
                error instanceof Error ? error.name : 'unknown error'
            })`,
        ])
    }
}

// ─── git ─────────────────────────────────────────────────────────────────────

async function git(io: MainIo, args: string[]): Promise<string> {
    const out = await new Deno.Command('git', {
        args,
        cwd: io.cwd,
        stdout: 'piped',
        stderr: 'piped',
        ...(io.env ? { clearEnv: true, env: { ...io.env } } : {}),
    }).output()
    if (!out.success) {
        const reason = new TextDecoder().decode(out.stderr).trim()
            .split('\n')[0]
        throw new Stop(2, [`release:notes: git ${args[0]} failed: ${reason}`])
    }
    return new TextDecoder().decode(out.stdout)
}

/** Tracked and untracked-unignored files, minus those deleted on disk. */
async function workingTreeFiles(io: MainIo): Promise<string[]> {
    const listed = await git(io, [
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
    ])
    const deleted = new Set(
        (await git(io, ['ls-files', '-z', '--deleted'])).split('\0'),
    )
    return listed.split('\0').filter((p) => p !== '' && !deleted.has(p))
}

async function tagFiles(io: MainIo, tag: string): Promise<string[]> {
    const out = await git(io, ['ls-tree', '-r', '-z', '--name-only', tag])
    return out.split('\0').filter((p) => p !== '')
}

function show(io: MainIo, tag: string, path: string): Promise<string> {
    return git(io, ['show', `${tag}:${path}`])
}

/** Every `v<X.Y.Z>` tag, as versions, ascending. */
async function releasedVersions(io: MainIo): Promise<string[]> {
    const out = await git(io, ['tag', '--list', 'v*'])
    return out.split('\n').map((name) => TAG.exec(name.trim())?.[1])
        .filter((v): v is string => v !== undefined)
        .sort(compareVersions)
}

// ─── small pieces ────────────────────────────────────────────────────────────

type AddedTitle = Extract<GuardFinding, { readonly kind: 'added' }>

/** A refusal: the exit code and the stderr lines explaining it. */
class Stop extends Error {
    constructor(readonly code: 1 | 2, readonly lines: string[]) {
        super(lines.join('\n'))
    }
}

type Cli =
    | { readonly kind: 'check' }
    | {
        readonly kind: 'render'
        readonly version: string
        readonly notes: string | undefined
    }

/** Validates the arguments before any git call. */
function parseCli(args: string[]): Cli {
    const unknown: string[] = []
    const parsed = parseArgs(args, {
        boolean: ['check'],
        string: ['notes'],
        unknown: (arg) => {
            if (arg.startsWith('-')) unknown.push(arg)
            return !arg.startsWith('-')
        },
    })
    const positional = parsed._.map(String)
    if (unknown.length > 0) {
        throw new Stop(2, [`release:notes: unknown flag ${unknown[0]}`, USAGE])
    }
    if (parsed.check) {
        if (positional.length > 0 || parsed.notes !== undefined) {
            throw new Stop(2, [
                'release:notes: --check takes no version and no --notes',
                USAGE,
            ])
        }
        return { kind: 'check' }
    }
    const [version, ...rest] = positional
    if (version === undefined || rest.length > 0 || !VERSION.test(version)) {
        throw new Stop(2, [
            `release:notes: expected one version X.Y.Z, got ${
                positional.length === 0 ? 'none' : JSON.stringify(positional)
            }`,
            USAGE,
        ])
    }
    return { kind: 'render', version, notes: parsed.notes }
}

interface Fence {
    readonly char: '`' | '~'
    readonly length: number
}

function opensFence(line: string): Fence | null {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (!match) return null
    const char = match[1][0] as '`' | '~'
    // A backtick fence's info string may not contain a backtick (CommonMark).
    if (char === '`' && match[2].includes('`')) return null
    return { char, length: match[1].length }
}

function closesFence(line: string, fence: Fence): boolean {
    const run = /^ {0,3}(`+|~+)[ \t]*$/.exec(line)?.[1]
    return run !== undefined && run[0] === fence.char &&
        run.length >= fence.length
}

/** A setext underline: `=` (level 1) or `-` (level 2), up to 3 spaces in. */
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/

/** `***`, `___`, `- - -` and the like: a break, never paragraph text. */
const THEMATIC_BREAK = /^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/

/** A line that interrupts a paragraph and cannot carry a setext underline. */
const NOT_PARAGRAPH = /^ {0,3}([-*+][ \t]|\d{1,9}[.)][ \t]|>|<|\|)|^ {4}/

/** The open paragraph: its first line, and its lines joined by spaces. */
interface Paragraph {
    readonly line: number
    readonly text: string
}

/**
 * Tracks the paragraph a later setext underline would turn into a heading.
 * A blank line, a list item, a quote, a table row, HTML or indented code ends
 * it; any other text line starts or continues it.
 */
function nextParagraph(
    paragraph: Paragraph | null,
    line: string,
    lineNumber: number,
): Paragraph | null {
    if (line.trim() === '' || NOT_PARAGRAPH.test(line)) return null
    if (SETEXT_UNDERLINE.test(line) || THEMATIC_BREAK.test(line)) return null
    return paragraph
        ? { line: paragraph.line, text: `${paragraph.text} ${line.trim()}` }
        : { line: lineNumber, text: line.trim() }
}

/** A heading, as {@linkcode parseUpgradeSections} reports and classifies it. */
interface Heading {
    readonly level: number
    /** The text the regexes judge: markers and closing `#`s stripped. */
    readonly text: string
    /** The 1-based line a finding points at. */
    readonly line: number
    /** What a finding prints: the trimmed ATX line, or the setext text. */
    readonly shown: string
    /** The version of the section this heading opens, or `null`. */
    readonly opens: string | null
}

/**
 * The heading `line` completes, if any. A setext underline turns the open
 * paragraph into a heading reported at the paragraph's first line; otherwise
 * the line itself may be an ATX heading.
 */
function readHeading(
    line: string,
    paragraph: Paragraph | null,
    lineNumber: number,
): Heading | null {
    if (paragraph && SETEXT_UNDERLINE.test(line)) {
        return {
            level: line.trim()[0] === '=' ? 1 : 2,
            text: paragraph.text,
            line: paragraph.line,
            shown: paragraph.text,
            // Only an ATX level-2 heading can open a section; a setext one
            // that reads like it is a near-miss, like any other variant.
            opens: null,
        }
    }
    const atx = atxHeading(line)
    if (!atx) return null
    const exact = atx.level === 2 ? EXACT_HEADING.exec(atx.text) : null
    return {
        ...atx,
        line: lineNumber,
        shown: line.trim(),
        opens: exact?.[1] ?? null,
    }
}

function atxHeading(line: string): { level: number; text: string } | null {
    const match = /^ {0,3}(#{1,6})([ \t].*)?$/.exec(line)
    if (!match) return null
    const text = (match[2] ?? '').trim().replace(/(^|[ \t]+)#+$/, '').trim()
    return { level: match[1].length, text }
}

function guideLink(version: string, path: string): string {
    return `${REPOSITORY}/blob/v${version}/${path}#upgrading-to-v${
        version.replaceAll('.', '')
    }`
}

function compareVersions(a: string, b: string): number {
    const x = a.split('.').map(Number)
    const y = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
        if (x[i] !== y[i]) return x[i] - y[i]
    }
    return 0
}

/** The spellings of the repository root that must never reach stderr. */
async function rootSpellings(cwd: string): Promise<string[]> {
    const real = await Deno.realPath(cwd)
    return [...new Set([cwd, real])].filter((p) => p.length > 1)
        .sort((a, b) => b.length - a.length)
}

/** Joins the stderr lines, with any absolute root spelling made relative. */
function relativize(
    lines: readonly string[],
    roots: readonly string[],
): string {
    let text = lines.join('\n')
    for (const root of roots) text = text.replaceAll(root, '.')
    return text
}

async function writeAll(stream: Writable, text: string): Promise<void> {
    let bytes = new TextEncoder().encode(text)
    while (bytes.length > 0) bytes = bytes.subarray(await stream.write(bytes))
}

if (import.meta.main) {
    const result = await main(Deno.args, {
        cwd: Deno.cwd(),
        stdin: () => new Response(Deno.stdin.readable).text(),
    })
    Deno.exit(
        await writeResult(result, { stdout: Deno.stdout, stderr: Deno.stderr }),
    )
}
