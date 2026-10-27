/**
 * Tests for `scripts/release_notes.ts` (#364): the renderer of a Release body
 * and the guard that keeps a released upgrade-guide section frozen.
 *
 * Every test builds a throwaway git repository under `Deno.makeTempDir`, with
 * its own isolated git environment: every inherited `GIT_` variable is dropped
 * (a hook exports `GIT_DIR`, which would point `git` at the pushing
 * repository, `b9b07a2f`), system config is off, the global config is an empty
 * file, the identity is fixed and signing is disabled. No fixture reads the
 * real repository, and no test asserts a live item count: every count here
 * comes from the fixture that states it.
 *
 * Ids: `R` render and composition, `P` parser and CommonMark, `G` guard, `N`
 * near-miss, `Z` empty scan and "none recorded", `D` double compose, `E` stderr
 * hygiene, `L` the scan filter, `S` the real task as a subprocess. Each name
 * ends its id with a space, so `R1 ` never prefixes `R10 `.
 *
 * @module tests/release_notes_test
 */

import {
    assert,
    assertEquals,
    assertFalse,
    assertStringIncludes,
    assertThrows,
} from '@std/assert'
import { parse as parseJsonc } from '@std/jsonc'
import { dirname, join } from '@std/path'
import {
    BREAKING_HEADING,
    composeBody,
    CONTINUITY_LINE,
    listScanned,
    main,
    NoneRecordedContradicted,
    parseUpgradeSections,
    type RunResult,
    type Writable,
    writeResult,
} from '../scripts/release_notes.ts'

const BLOB = 'https://github.com/locknessland/lockness-monorepo/blob'
const NONE = 'No breaking change is recorded for this release.'

/** A fixture directory: `dir` is the repository, `root` holds it and its config. */
interface Fixture {
    readonly root: string
    readonly dir: string
    readonly env: Record<string, string>
}

/** The environment every fixture `git` runs under, and the script's too. */
function isolatedEnv(globalConfig: string): Record<string, string> {
    const inherited = Object.fromEntries(
        Object.entries(Deno.env.toObject()).filter(([key]) =>
            !key.startsWith('GIT_')
        ),
    )
    return {
        ...inherited,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: globalConfig,
        GIT_AUTHOR_NAME: 'Fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    }
}

/** A temporary directory that is NOT a git repository. */
async function makeDir(): Promise<Fixture> {
    const root = await Deno.makeTempDir({ prefix: 'release_notes_' })
    const dir = join(root, 'repo')
    await Deno.mkdir(dir)
    const globalConfig = join(root, 'gitconfig')
    await Deno.writeTextFile(globalConfig, '')
    return { root, dir, env: isolatedEnv(globalConfig) }
}

async function git(repo: Fixture, args: string[]): Promise<string> {
    const out = await new Deno.Command('git', {
        args,
        cwd: repo.dir,
        clearEnv: true,
        env: repo.env,
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    if (!out.success) {
        throw new Error(
            `git ${args.join(' ')}: ${new TextDecoder().decode(out.stderr)}`,
        )
    }
    return new TextDecoder().decode(out.stdout)
}

async function makeRepo(): Promise<Fixture> {
    const repo = await makeDir()
    await git(repo, ['init', '-q', '-b', 'main'])
    await git(repo, ['config', 'commit.gpgsign', 'false'])
    await git(repo, ['config', 'tag.gpgsign', 'false'])
    return repo
}

/** Runs `fn` against a fresh repository, deleted afterwards whatever happens. */
async function withRepo(fn: (repo: Fixture) => Promise<void>): Promise<void> {
    const repo = await makeRepo()
    try {
        await fn(repo)
    } finally {
        await Deno.remove(repo.root, { recursive: true })
    }
}

/** Writes (or, for `null`, deletes) working-tree files without committing. */
async function write(
    repo: Fixture,
    files: Record<string, string | null>,
): Promise<void> {
    for (const [path, content] of Object.entries(files)) {
        const abs = join(repo.dir, path)
        if (content === null) {
            await Deno.remove(abs)
        } else {
            await Deno.mkdir(dirname(abs), { recursive: true })
            await Deno.writeTextFile(abs, content)
        }
    }
}

async function commit(
    repo: Fixture,
    files: Record<string, string | null>,
    message = 'docs: fixture',
): Promise<void> {
    await write(repo, files)
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-q', '--allow-empty', '-m', message])
}

async function tag(repo: Fixture, name: string): Promise<void> {
    await git(repo, ['tag', '-a', name, '-m', name])
}

/** Calls the script's `main` against the fixture, with `stdin` as the draft. */
function run(repo: Fixture, args: string[], stdin = ''): Promise<RunResult> {
    return main(args, {
        cwd: repo.dir,
        env: repo.env,
        stdin: () => Promise.resolve(stdin),
    })
}

interface GuideOptions {
    /** Leading spaces before the `##`. */
    readonly indent?: string
    /** Append a closing `##` sequence to the section heading. */
    readonly closing?: boolean
    /** The prose under each item. */
    readonly prose?: string
}

/** An `## Upgrading to v<version>` section with one `###` per title. */
function guide(
    version: string,
    titles: readonly string[],
    opts: GuideOptions = {},
): string {
    const heading = `${opts.indent ?? ''}## Upgrading to v${version}${
        opts.closing ? ' ##' : ''
    }`
    const prose = opts.prose ?? 'What changed, and what to do about it.'
    const items = titles.map((title) => `### ${title}\n\n${prose}\n`)
    return [heading, '', ...items].join('\n')
}

/** A whole guide file: a title and an intro (lines 1–4), then `parts`. */
function doc(...parts: string[]): string {
    return `# Guide\n\nIntro prose.\n\n${parts.join('\n')}`
}

function fence(marker: string, body: string): string {
    return `${marker}md\n${body}${marker}\n`
}

function link(version: string, path: string): string {
    return `${BLOB}/v${version}/${path}#upgrading-to-v${
        version.replaceAll('.', '')
    }`
}

function entry(version: string, path: string, titles: string[]): string {
    return `**\`${path}\`** — [upgrade guide](${link(version, path)})\n\n${
        titles.map((t) => `- ${t}`).join('\n')
    }\n`
}

async function notesFile(repo: Fixture, content: string): Promise<string> {
    const path = join(repo.root, 'notes.md')
    await Deno.writeTextFile(path, content)
    return path
}

async function shortSha(repo: Fixture): Promise<string> {
    return (await git(repo, ['rev-parse', '--short', 'HEAD'])).trim()
}

// ─── R: render and composition ───────────────────────────────────────────────

Deno.test('#364 R1 one guide at the target tag: one entry, every title in document order', async () => {
    await withRepo(async (repo) => {
        const titles = ['1. First', '2. Second', '3. Third']
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', titles)) })
        await tag(repo, 'v0.4.0')

        const result = await run(repo, ['0.4.0'], 'log\n')

        assertEquals(result.code, 0, result.stderr)
        assertStringIncludes(
            result.stdout,
            entry('0.4.0', 'docs/g.md', titles),
        )
        assertEquals(result.stdout.split('**`').length - 1, 1)
    })
})

Deno.test('#364 R2 two guides: two entries, sorted by path', async () => {
    await withRepo(async (repo) => {
        await commit(repo, {
            'packages/b/docs/DOCS.md': doc(guide('0.4.0', ['1. In b'])),
        })
        await commit(repo, { 'docs/a.md': doc(guide('0.4.0', ['1. In a'])) })
        await tag(repo, 'v0.4.0')

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 0, result.stderr)
        const a = result.stdout.indexOf(
            entry('0.4.0', 'docs/a.md', ['1. In a']),
        )
        const b = result.stdout.indexOf(
            entry('0.4.0', 'packages/b/docs/DOCS.md', ['1. In b']),
        )
        assert(a >= 0 && b >= 0, result.stdout)
        assert(a < b, 'entries are sorted by path')
    })
})

Deno.test('#364 R3 the link is pinned to the tag, with the version slug', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. A'])) })
        await tag(repo, 'v0.4.0')

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 0, result.stderr)
        assertStringIncludes(
            result.stdout,
            '(https://github.com/locknessland/lockness-monorepo/blob/v0.4.0/docs/g.md#upgrading-to-v040)',
        )
    })
})

Deno.test('#364 R4 order: continuity line, breaking changes, notes, then stdin', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. A'])) })
        await tag(repo, 'v0.4.0')
        const notes = await notesFile(repo, 'Hand-written notes.\n')
        const tail = '## Features\n\n- the generated log\n'

        const result = await run(repo, ['0.4.0', '--notes', notes], tail)

        assertEquals(result.code, 0, result.stderr)
        const out = result.stdout
        assert(
            out.startsWith(`${CONTINUITY_LINE}\n\n${BREAKING_HEADING}\n`),
            out,
        )
        const breaking = out.indexOf(BREAKING_HEADING)
        const entryAt = out.indexOf(entry('0.4.0', 'docs/g.md', ['1. A']))
        const notesAt = out.indexOf('## Notes\n\nHand-written notes.\n')
        const tailAt = out.lastIndexOf(tail)
        assert(breaking < entryAt, 'the index entry sits under its heading')
        assert(entryAt >= 0 && entryAt < notesAt, 'notes follow the index')
        assert(notesAt < tailAt, 'stdin follows the notes')
        assertEquals(tailAt + tail.length, out.length, 'stdin ends the body')
    })
})

Deno.test('#364 R5 the stdin tail is byte-identical', async () => {
    const tails = [
        'x  \n---\n**Full log** trailing\t \nno final newline',
        'line with trailing spaces   \n---\n\n',
    ]
    for (const tail of tails) {
        await withRepo(async (repo) => {
            await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. A'])) })
            await tag(repo, 'v0.4.0')

            const result = await run(repo, ['0.4.0'], tail)

            assertEquals(result.code, 0, result.stderr)
            assertEquals(result.stdout.slice(-tail.length), tail)
            assertEquals(
                result.stdout.indexOf(tail),
                result.stdout.length - tail.length,
            )
        })
    }
})

Deno.test('#364 R6 an empty --notes file means no Notes heading', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. A'])) })
        await tag(repo, 'v0.4.0')
        const notes = await notesFile(repo, '')

        const result = await run(repo, ['0.4.0', '--notes', notes], 'log\n')

        assertEquals(result.code, 0, result.stderr)
        assertFalse(result.stdout.includes('## Notes'), result.stdout)
    })
})

Deno.test("#364 R7 the index reads the tag's tree, not the working tree", async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. Tagged'])) })
        await tag(repo, 'v0.4.0')
        await commit(repo, {
            'docs/g.md': doc(guide('0.4.0', ['1. Tagged', '2. After the tag'])),
        })

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 0, result.stderr)
        assertStringIncludes(result.stdout, '- 1. Tagged')
        assertFalse(result.stdout.includes('After the tag'), result.stdout)
    })
})

Deno.test('#364 R8 a missing target tag is exit 2, with stdout empty', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. A'])) })

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 2)
        assertEquals(result.stdout, '')
        assertStringIncludes(result.stderr, 'v0.4.0')
    })
})

Deno.test('#364 R9 a malformed version is exit 2 before any git call', async () => {
    const dir = await makeDir()
    try {
        for (const version of ['v0.4.0', '0.4', '0.4.0-rc1', '0.4.0; rm']) {
            const result = await run(dir, [version])

            assertEquals(result.code, 2, `${version}: ${result.stderr}`)
            assertEquals(result.stdout, '')
            assertStringIncludes(result.stderr, 'usage:')
            assertFalse(
                result.stderr.includes('not a git repository'),
                `${version} reached git: ${result.stderr}`,
            )
        }
    } finally {
        await Deno.remove(dir.root, { recursive: true })
    }
})

// ─── P: parser and CommonMark ────────────────────────────────────────────────

Deno.test('#364 P1 a section inside a backtick fence is not a section', () => {
    const inner = guide('0.4.0', ['1. Fenced'])
    // A four-backtick fence is not closed by a shorter three-backtick line.
    const text = doc(fence('````', `\`\`\`\n${inner}`))

    const parsed = parseUpgradeSections(text, 'docs/g.md')

    assertEquals(parsed.sections, [])
    assertEquals(parsed.nearMisses, [])
})

Deno.test('#364 P2 a section inside a tilde fence is not a section', () => {
    const inner = guide('0.4.0', ['1. Fenced'])
    // A tilde fence is not closed by a backtick line.
    const text = doc(fence('~~~', `\`\`\`\n${inner}`))

    const parsed = parseUpgradeSections(text, 'docs/g.md')

    assertEquals(parsed.sections, [])
})

Deno.test('#364 P3 a heading indented by three spaces counts', () => {
    const text = doc(guide('0.4.0', ['1. A'], { indent: '   ' }))

    const parsed = parseUpgradeSections(text, 'docs/g.md')

    assertEquals(parsed.sections, [
        { path: 'docs/g.md', version: '0.4.0', titles: ['1. A'] },
    ])
})

Deno.test('#364 P4 a heading indented by four spaces is code, not a heading', () => {
    const text = doc(guide('0.4.0', ['1. A'], { indent: '    ' }))

    const parsed = parseUpgradeSections(text, 'docs/g.md')

    assertEquals(parsed.sections, [])
})

Deno.test('#364 P5 closing hashes on the heading count as the heading', () => {
    const text = doc(guide('0.4.0', ['1. A'], { closing: true }))

    const parsed = parseUpgradeSections(text, 'docs/g.md')

    assertEquals(parsed.sections, [
        { path: 'docs/g.md', version: '0.4.0', titles: ['1. A'] },
    ])
})

Deno.test('#364 P6 a #### under an item is not a title', () => {
    const text = doc(
        guide('0.4.0', ['1. A'], { prose: 'Prose.\n\n#### A detail\n' }),
    )

    const parsed = parseUpgradeSections(text, 'docs/g.md')

    assertEquals(parsed.sections[0]?.titles, ['1. A'])
})

Deno.test('#364 P7 the section ends at the next level-2 or level-1 heading', () => {
    const text = doc(
        guide('0.4.0', ['1. A']),
        '## Another section\n\n### Not an item\n',
        guide('0.3.0', ['1. B']),
        '# A level-1 heading\n\n### Not an item either\n',
    )

    const parsed = parseUpgradeSections(text, 'docs/g.md')

    assertEquals(parsed.sections, [
        { path: 'docs/g.md', version: '0.4.0', titles: ['1. A'] },
        { path: 'docs/g.md', version: '0.3.0', titles: ['1. B'] },
    ])
})

Deno.test('#382 P14 a setext level-2 or level-1 heading ends the section too', () => {
    const text = doc(
        guide('0.4.0', ['1. A']),
        'Another section\n---\n\n### Not an item\n',
        guide('0.3.0', ['1. B']),
        'A level-1 heading\n===\n\n### Not an item either\n',
    )

    const parsed = parseUpgradeSections(text, 'docs/g.md')

    assertEquals(parsed.sections, [
        { path: 'docs/g.md', version: '0.4.0', titles: ['1. A'] },
        { path: 'docs/g.md', version: '0.3.0', titles: ['1. B'] },
    ])
    assertEquals(parsed.nearMisses, [])
})

Deno.test('#364 P8 a fence that closes gives the lines after it back to the parser', () => {
    const cases: readonly (readonly [string, string])[] = [
        ['backtick fence', fence('```', 'code\n')],
        ['tilde fence', fence('~~~', 'code\n')],
        ['closed by a longer run', '```md\ncode\n`````\n'],
        ['indented closing run', '~~~\ncode\n   ~~~\n'],
        ['closing run with trailing spaces', '```\ncode\n```   \n'],
    ]
    for (const [label, block] of cases) {
        const text = doc(block, guide('0.4.0', ['1. After the fence']))

        const parsed = parseUpgradeSections(text, 'docs/g.md')

        assertEquals(parsed.sections, [
            {
                path: 'docs/g.md',
                version: '0.4.0',
                titles: ['1. After the fence'],
            },
        ], label)
    }
})

Deno.test('#364 P9 a run that cannot close the fence keeps it open', () => {
    const cases: readonly (readonly [string, string])[] = [
        ['shorter run', '````\ncode\n```\n'],
        ['other character', '```\ncode\n~~~\n'],
        ['run with an info string', '```\ncode\n```ts\n'],
        ['four-space indent', '```\ncode\n    ```\n'],
    ]
    for (const [label, block] of cases) {
        const text = doc(block, guide('0.4.0', ['1. Still fenced']))

        const parsed = parseUpgradeSections(text, 'docs/g.md')

        assertEquals(parsed.sections, [], label)
    }
})

Deno.test('#364 P10 a setext upgrade heading is reported as a near-miss', () => {
    for (const underline of ['---', '===', '   ------  ']) {
        const text = doc(
            `Upgrading to v0.4.0\n${underline}\n\n### 1. A\n`,
        )

        const parsed = parseUpgradeSections(text, 'docs/g.md')

        assertEquals(parsed.sections, [], underline)
        assertEquals(parsed.nearMisses, [
            { path: 'docs/g.md', line: 5, heading: 'Upgrading to v0.4.0' },
        ], underline)
    }
})

Deno.test('#364 P11 prose followed by a thematic break is not a setext near-miss', () => {
    const text = doc(
        'Some prose about upgrading.\n\n---\n',
        // Prose that reads as a near-miss: only the blank line keeps the
        // `---` below it from underlining it into a setext heading (#382).
        'Upgrading to v0.4.0 is covered below.\n\n---\n',
        '- Upgrading to v0.4.0 is covered below\n---\n',
    )

    const parsed = parseUpgradeSections(text, 'docs/g.md')

    assertEquals(parsed.nearMisses, [])
})

Deno.test('#364 P12 a section with no ### item is reported, not indexed empty', () => {
    const text = doc(
        '## Upgrading to v0.4.0\n\nProse, and no item.\n',
        '## Next\n',
    )

    const parsed = parseUpgradeSections(text, 'docs/g.md')

    assertEquals(parsed.sections, [])
    assertEquals(parsed.emptySections, [
        { path: 'docs/g.md', line: 5, heading: '## Upgrading to v0.4.0' },
    ])
})

Deno.test('#364 P13 an empty section is exit 1 in the subject tree, in both modes', async () => {
    await withRepo(async (repo) => {
        await commit(repo, {
            'docs/g.md': doc('## Upgrading to v0.4.0\n\nNothing yet.\n'),
        })
        await tag(repo, 'v0.4.0')

        for (const args of [['--check'], ['0.4.0']]) {
            const result = await run(repo, args)

            assertEquals(result.code, 1, `${args}: ${result.stderr}`)
            assertEquals(result.stdout, '')
            assertStringIncludes(result.stderr, 'docs/g.md:5')
        }
    })
})

// ─── L: the scan filter ──────────────────────────────────────────────────────

Deno.test('#364 L1 listScanned keeps exactly the three globs, anchored at both ends', () => {
    const table: readonly (readonly [string, boolean])[] = [
        ['docs/a.md', true],
        ['docs/x/y/a.md', true],
        ['packages/p/docs/DOCS.md', true],
        ['packages/p/docs/x/y.md', true],
        ['packages/p/README.md', true],
        // Anchored at the start: a scanned shape nested under another root.
        ['x/docs/a.md', false],
        ['vendor/packages/p/README.md', false],
        ['.specnaut/docs/a.md', false],
        // Anchored at the end: a scanned shape with a suffix.
        ['docs/a.md.bak', false],
        ['docs/a.mdx', false],
        ['packages/p/README.md.orig', false],
        // Outside every glob.
        ['README.md', false],
        ['packages/p/AGENTS.md', false],
        ['packages/p/q/README.md', false],
        ['packages/p/docs.md', false],
        ['xdocs/a.md', false],
    ]
    const kept = listScanned(table.map(([path]) => path))

    for (const [path, expected] of table) {
        assertEquals(kept.includes(path), expected, path)
    }
    assertEquals(kept, [...kept].sort(), 'sorted')
})

// ─── E: stderr hygiene ───────────────────────────────────────────────────────

Deno.test('#364 E1 stderr names repo-relative paths, never the absolute one', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.3.0', ['1. A'])) })
        await tag(repo, 'v0.3.0')
        await write(repo, {
            'docs/g.md': doc(guide('0.3.0', ['1. A', '2. Added'])),
            'docs/n.md': doc('## Upgrade to v0.4.0\n'),
        })
        const notes = await notesFile(repo, 'n\n')
        const real = await Deno.realPath(repo.root)

        const results = [
            await run(repo, ['--check']),
            await run(repo, ['0.4.0', '--notes', notes]),
            await run(repo, ['0.3.0', '--notes', join(repo.root, 'absent')]),
        ]

        assertStringIncludes(results[0].stderr, 'docs/n.md')
        for (const result of results) {
            assert(result.code !== 0)
            assertFalse(result.stderr.includes(repo.root), result.stderr)
            assertFalse(result.stderr.includes(real), result.stderr)
        }
    })
})

Deno.test('#364 E3 an absolute path inside an unexpected error is made relative', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': '# G\n' })
        // A tracked symlink to nowhere: git lists it, reading it fails, and
        // the runtime's error message names the absolute path it tried.
        // Two outside facts carry this fixture: the filesystem must support
        // symlinks, and Deno's `NotFound` message must keep naming the path
        // it tried. If either changes, no absolute path reaches stderr and
        // the relativize assertions below pass vacuously; the
        // `./docs/link.md` assertion is the one that would then fail.
        await Deno.symlink('missing-target.md', join(repo.dir, 'docs/link.md'))
        await commit(repo, {})
        const real = await Deno.realPath(repo.root)

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 2, result.stderr)
        assertEquals(result.stdout, '')
        assertStringIncludes(result.stderr, './docs/link.md')
        assertFalse(result.stderr.includes(repo.root), result.stderr)
        assertFalse(result.stderr.includes(real), result.stderr)
        assertFalse(result.stderr.includes('    at '), 'no stack trace')
    })
})

Deno.test('#364 E4 a failed git call is exit 2, stdout empty, no absolute path', async () => {
    const dir = await makeDir()
    try {
        const real = await Deno.realPath(dir.root)

        const result = await run(dir, ['--check'])

        assertEquals(result.code, 2, result.stderr)
        assertEquals(result.stdout, '')
        assertStringIncludes(result.stderr, 'git ')
        assertFalse(result.stderr.includes(dir.root), result.stderr)
        assertFalse(result.stderr.includes(real), result.stderr)
    } finally {
        await Deno.remove(dir.root, { recursive: true })
    }
})

Deno.test('#364 E5 an unknown flag or a stray argument is exit 2 with usage', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': '# G\n' })
        await tag(repo, 'v0.4.0')
        const cases = [
            ['--bogus'],
            ['0.4.0', '--draft'],
            ['--check', '0.4.0'],
            ['--check', '--notes', 'x'],
            ['0.4.0', '0.5.0'],
            [],
        ]
        for (const args of cases) {
            const result = await run(repo, args)

            assertEquals(result.code, 2, `${args}: ${result.stderr}`)
            assertEquals(result.stdout, '')
            assertStringIncludes(result.stderr, 'usage:')
        }
    })
})

/** A stream that keeps, decoded, everything written to it. */
function sink(): {
    readonly written: string[]
    write(bytes: Uint8Array): Promise<number>
} {
    const written: string[] = []
    return {
        written,
        write: (bytes) => {
            written.push(new TextDecoder().decode(bytes))
            return Promise.resolve(bytes.length)
        },
    }
}

Deno.test('#382 E6 a closed stdout pipe is exit 2, with no stack and no path', async () => {
    const stderr = sink()
    const stdout = {
        write: (): Promise<number> =>
            Promise.reject(
                new Deno.errors.BrokenPipe(
                    'Broken pipe (os error 32): /abs/root/scripts/release_notes.ts',
                ),
            ),
    }

    const code = await writeResult(
        {
            code: 0,
            stdout: 'the body',
            stderr: 'release:notes: scanned 1 files',
        },
        { stdout, stderr },
    )

    const text = stderr.written.join('')
    assertEquals(code, 2)
    assertStringIncludes(text, 'release:notes: scanned 1 files\n')
    assertStringIncludes(text, 'BrokenPipe')
    assertFalse(text.includes('/abs/root'), text)
    assertFalse(text.includes('    at '), 'no stack trace')
})

/**
 * Two streams that both push into one shared, tagged log, so the order
 * between stdout and stderr writes is observable — recording each stream into
 * its own array (as {@linkcode sink} does) cannot witness cross-stream order
 * at all, since each array only ever sees its own writes.
 */
function loggedStreams(
    log: string[],
): { readonly stdout: Writable; readonly stderr: Writable } {
    const tagged = (tag: string): Writable => ({
        write: (bytes) => {
            log.push(`${tag}: ${new TextDecoder().decode(bytes)}`)
            return Promise.resolve(bytes.length)
        },
    })
    return { stdout: tagged('stdout'), stderr: tagged('stderr') }
}

Deno.test('#382 E7 writeResult writes stderr, then stdout, and returns the code', async () => {
    const log: string[] = []
    const { stdout, stderr } = loggedStreams(log)

    const code = await writeResult(
        { code: 1, stdout: 'the body', stderr: 'release:notes: refused' },
        { stdout, stderr },
    )

    assertEquals(code, 1)
    assertEquals(log, [
        'stderr: release:notes: refused\n',
        'stdout: the body',
    ])
})

// ─── S: the real task, as a subprocess ───────────────────────────────────────

const REPO_ROOT = new URL('../', import.meta.url)

/**
 * The `release:notes` task's own command line, from the root `deno.jsonc`, with
 * its script path made absolute. `deno task --cwd` would resolve that relative
 * path against the fixture, so the command is run directly instead — with the
 * task's exact permission flags, through the script's `import.meta.main` path.
 */
async function taskCommand(): Promise<string[]> {
    const config = parseJsonc(
        await Deno.readTextFile(new URL('deno.jsonc', REPO_ROOT)),
    ) as { tasks: Record<string, string> }
    const words = config.tasks['release:notes'].split(' ')
    assertEquals(words.slice(0, 2), ['deno', 'run'])
    const script = words.at(-1)!
    return [
        ...words.slice(1, -1),
        new URL(script, REPO_ROOT).pathname,
    ]
}

/** Runs the real `release:notes` task command inside the fixture. */
async function task(repo: Fixture, args: string[]): Promise<RunResult> {
    const out = await new Deno.Command(Deno.execPath(), {
        args: [...await taskCommand(), ...args],
        cwd: repo.dir,
        clearEnv: true,
        env: { ...repo.env, NO_COLOR: '1' },
        stdin: 'null',
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    return {
        code: out.code as 0 | 1 | 2,
        stdout: new TextDecoder().decode(out.stdout),
        stderr: new TextDecoder().decode(out.stderr),
    }
}

Deno.test('#364 S2 settings.json asks before any promote, non-draft create or run rerun (FR-021)', async () => {
    // Ask rules are checked before allow rules, so these three prompt even
    // under /ship's allowed-tools. This reads the repo's own settings file.
    const settings = parseJsonc(
        await Deno.readTextFile(new URL('.claude/settings.json', REPO_ROOT)),
    ) as { permissions?: { ask?: unknown } }
    const ask = settings.permissions?.ask

    assert(Array.isArray(ask), 'permissions.ask is a list')
    for (
        const rule of [
            'Bash(gh release edit *--draft*)',
            'Bash(gh release create *)',
            'Bash(gh run rerun *)',
        ]
    ) {
        assert(ask.includes(rule), `missing ask rule ${rule}`)
    }
})

Deno.test('#364 S1 the real task: exit 0 on a clean tree, 1 on a near-miss, 2 on a bad version', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. A'])) })
        await tag(repo, 'v0.4.0')
        const real = await Deno.realPath(repo.root)

        const clean = await task(repo, ['--check'])
        assertEquals(clean.code, 0, clean.stderr)
        assertEquals(clean.stdout, '')
        assertStringIncludes(clean.stderr, 'scanned 1 files')

        await write(repo, { 'docs/n.md': doc('## Upgrade to v0.5.0\n') })
        const refused = await task(repo, ['--check'])
        const usage = await task(repo, ['v0.4.0'])

        assertEquals(refused.code, 1, refused.stderr)
        assertStringIncludes(refused.stderr, 'docs/n.md:5')
        assertEquals(usage.code, 2, usage.stderr)
        assertStringIncludes(usage.stderr, 'usage:')
        for (const result of [refused, usage]) {
            assertEquals(result.stdout, '')
            assertFalse(result.stderr.includes(repo.root), result.stderr)
            assertFalse(result.stderr.includes(real), result.stderr)
            assertFalse(result.stderr.includes('    at '), 'no stack trace')
        }
    })
})

Deno.test('#364 E2 stderr reports how many files were scanned', async () => {
    await withRepo(async (repo) => {
        await commit(repo, {
            'docs/a.md': '# A\n',
            'docs/sub/b.md': '# B\n',
            'packages/x/docs/DOCS.md': '# X\n',
            'packages/x/README.md': '# X\n',
            // Not scanned: outside every glob.
            'README.md': '# Root\n',
            'packages/x/AGENTS.md': '# Brief\n',
            '.specnaut/specs/a.md': '# Spec\n',
            'docs/notes.txt': 'text\n',
        })
        await tag(repo, 'v0.4.0')

        const checked = await run(repo, ['--check'])
        const rendered = await run(repo, ['0.4.0'])

        assertEquals(checked.code, 0, checked.stderr)
        assertStringIncludes(checked.stderr, 'scanned 4 files')
        assertEquals(rendered.code, 0, rendered.stderr)
        assertStringIncludes(rendered.stderr, 'scanned 4 files')
    })
})

// ─── G: the frozen guard ─────────────────────────────────────────────────────

Deno.test('#364 G1 --check: a title added to a released section is exit 1', async () => {
    await withRepo(async (repo) => {
        await commit(repo, {
            'docs/g.md': doc(guide('0.3.0', ['1. A', '2. B'])),
        })
        await tag(repo, 'v0.3.0')
        await write(repo, {
            'docs/g.md': doc(guide('0.3.0', ['1. A', '2. B', '3. Mis-filed'])),
        })

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 1)
        assertEquals(result.stdout, '')
        assertStringIncludes(result.stderr, '0.3.0')
        assertStringIncludes(result.stderr, 'docs/g.md')
        assertStringIncludes(result.stderr, '3. Mis-filed')
    })
})

Deno.test('#364 G2 --check: a retitle is exit 1, because it adds a title', async () => {
    await withRepo(async (repo) => {
        await commit(repo, {
            'docs/g.md': doc(guide('0.3.0', ['1. A', '2. B'])),
        })
        await tag(repo, 'v0.3.0')
        await write(repo, {
            'docs/g.md': doc(guide('0.3.0', ['1. A', '2. B, reworded'])),
        })

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 1)
        assertStringIncludes(result.stderr, '2. B, reworded')
    })
})

Deno.test("#364 G3 render: the target tag's tree adds a title to a released version", async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.3.0', ['1. A'])) })
        await tag(repo, 'v0.3.0')
        await commit(repo, {
            'docs/g.md': doc(
                guide('0.4.0', ['1. New']),
                guide('0.3.0', ['1. A', '2. Mis-filed']),
            ),
        })
        await tag(repo, 'v0.4.0')

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 1)
        assertEquals(result.stdout, '')
        assertStringIncludes(result.stderr, '2. Mis-filed')
    })
})

Deno.test('#364 G4 --check: a section for an untagged version below the highest tag is exit 2', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': '# G\n' })
        await tag(repo, 'v0.2.0')
        await commit(repo, { 'docs/h.md': '# H\n' })
        await tag(repo, 'v0.3.0')
        await write(repo, { 'docs/g.md': doc(guide('0.2.5', ['1. Ghost'])) })

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 2)
        assertEquals(result.stdout, '')
        assertStringIncludes(result.stderr, 'v0.2.5')
    })
})

Deno.test('#364 G5 render: a section for an untagged version below the target is exit 2', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': '# G\n' })
        await tag(repo, 'v0.3.0')
        await commit(repo, {
            'docs/g.md': doc(
                guide('0.4.0', ['1. A']),
                guide('0.3.5', ['1. B']),
            ),
        })
        await tag(repo, 'v0.4.0')

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 2)
        assertEquals(result.stdout, '')
        assertStringIncludes(result.stderr, 'v0.3.5')
    })
})

Deno.test('#364 G6 --check: the next release, above the highest tag, is skipped', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.3.0', ['1. A'])) })
        await tag(repo, 'v0.3.0')
        await write(repo, {
            'docs/g.md': doc(
                guide('0.4.0', ['1. Next']),
                guide('0.3.0', ['1. A']),
            ),
        })

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 0, result.stderr)
        assertEquals(result.stdout, '')
    })
})

Deno.test('#364 G7 --check: prose edited under a released title passes', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.3.0', ['1. A'])) })
        await tag(repo, 'v0.3.0')
        await write(repo, {
            'docs/g.md': doc(
                guide('0.3.0', ['1. A'], { prose: 'A typo, fixed.' }),
            ),
        })

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 0, result.stderr)
    })
})

Deno.test('#364 G8 --check: a released section pruned from the tree passes', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.3.0', ['1. A'])) })
        await tag(repo, 'v0.3.0')
        await write(repo, { 'docs/g.md': doc('Nothing to upgrade.\n') })

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 0, result.stderr)
    })
})

Deno.test('#364 G9 --check: a guide moved to another scanned path passes', async () => {
    await withRepo(async (repo) => {
        const content = doc(guide('0.3.0', ['1. A']))
        await commit(repo, { 'docs/g.md': content })
        await tag(repo, 'v0.3.0')
        // One commit that removes the old path and adds the new: a move.
        await commit(repo, {
            'docs/g.md': null,
            'packages/x/docs/g.md': content,
        })

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 0, result.stderr)
    })
})

Deno.test('#364 G10 --check: a released title removed passes', async () => {
    await withRepo(async (repo) => {
        await commit(repo, {
            'docs/g.md': doc(guide('0.3.0', ['1. A', '2. B'])),
        })
        await tag(repo, 'v0.3.0')
        await write(repo, { 'docs/g.md': doc(guide('0.3.0', ['1. A'])) })

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 0, result.stderr)
    })
})

Deno.test('#364 G11 --check with no v* tag at all: a section cannot be judged, exit 2', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. A'])) })

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 2, result.stderr)
        assertEquals(result.stdout, '')
        assertStringIncludes(result.stderr, 'v0.4.0')
    })
})

// ─── N: near-miss headings ───────────────────────────────────────────────────

Deno.test('#364 N7 the near-miss net covers backticks, spacing, "version" and a leading symbol', () => {
    const headings = [
        '## Upgrading to `v0.4.0`',
        '## Upgrading  to v0.4.0',
        '## Upgrading to version 0.4.0',
        '## ⚠️ Upgrading to v0.4.0',
        '## → Upgrade to v0.4.0',
        '## **Upgrading to v0.4.0**',
    ]
    for (const heading of headings) {
        const parsed = parseUpgradeSections(doc(`${heading}\n`), 'docs/g.md')

        assertEquals(parsed.sections, [], heading)
        assertEquals(parsed.nearMisses.length, 1, heading)
    }
})

const NEAR_MISSES: readonly (readonly [string, string])[] = [
    ['N1', '## Upgrading to 0.4.0'],
    ['N2', '### upgrading to v0.4.0'],
    ['N3', '## Upgrade to v0.4.0'],
    ['N4', '## Upgrading to v0.4.0 (breaking)'],
]

for (const [id, heading] of NEAR_MISSES) {
    Deno.test(`#364 ${id} near-miss "${heading}" is exit 1 in the subject tree`, async () => {
        await withRepo(async (repo) => {
            // doc() puts the first part on line 5.
            await commit(repo, { 'docs/g.md': doc(`${heading}\n`) })
            await tag(repo, 'v0.4.0')

            const checked = await run(repo, ['--check'])
            const rendered = await run(repo, ['0.4.0'])

            for (const result of [checked, rendered]) {
                assertEquals(result.code, 1, result.stderr)
                assertEquals(result.stdout, '')
                assertStringIncludes(result.stderr, 'docs/g.md:5')
            }
        })
    })
}

Deno.test("#364 N5 a near-miss only in an earlier tag's tree is not fatal", async () => {
    await withRepo(async (repo) => {
        await commit(repo, {
            'docs/g.md': doc(
                guide('0.3.0', ['1. A']),
                '## upgrading to 0.2.0\n',
            ),
        })
        await tag(repo, 'v0.3.0')
        await commit(repo, {
            'docs/g.md': doc(
                guide('0.4.0', ['1. B']),
                guide('0.3.0', ['1. A']),
            ),
        })
        await tag(repo, 'v0.4.0')

        const checked = await run(repo, ['--check'])
        const rendered = await run(repo, ['0.4.0'])

        assertEquals(checked.code, 0, checked.stderr)
        assertEquals(rendered.code, 0, rendered.stderr)
    })
})

Deno.test('#364 N6 the upgrade and realtime headings that merely mention upgrading pass', async () => {
    const upgrade = doc(
        '### Upgrade to Latest Version\n\nText.\n',
        '### Upgrade to Specific Version\n\nText.\n',
    )
    const realtime = doc(
        '#### Rolling back to `0.3.0`, then upgrading again\n\nText.\n',
    )
    assertEquals(
        parseUpgradeSections(upgrade, 'packages/upgrade/docs/DOCS.md')
            .nearMisses,
        [],
    )
    assertEquals(
        parseUpgradeSections(realtime, 'docs/realtime.md').nearMisses,
        [],
    )
    await withRepo(async (repo) => {
        await commit(repo, {
            'packages/upgrade/docs/DOCS.md': upgrade,
            'packages/upgrade/README.md': upgrade,
            'docs/realtime.md': realtime,
        })

        const result = await run(repo, ['--check'])

        assertEquals(result.code, 0, result.stderr)
    })
})

// ─── Z: empty scan, and "none recorded" ──────────────────────────────────────

Deno.test('#364 Z1 an empty scan is exit 1, in both modes', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'README.md': '# Root\n', 'docs/a.txt': 'x\n' })
        await tag(repo, 'v0.4.0')

        for (const args of [['--check'], ['0.4.0']]) {
            const result = await run(repo, args)

            assertEquals(result.code, 1, `${args}: ${result.stderr}`)
            assertEquals(result.stdout, '')
            assertStringIncludes(result.stderr, 'scanned 0 files under ')
            assertStringIncludes(result.stderr, 'docs/**/*.md')
        }
    })
})

/** v0.3.0, then `messages` as commits, then v0.4.0 — the guide has no section. */
async function rangeRepo(
    repo: Fixture,
    messages: readonly string[],
    before: readonly string[] = [],
): Promise<void> {
    for (const message of before) await commit(repo, {}, message)
    await commit(repo, { 'docs/g.md': doc('No upgrade needed.\n') })
    await tag(repo, 'v0.3.0')
    for (const message of messages) await commit(repo, {}, message)
    await tag(repo, 'v0.4.0')
}

Deno.test('#364 Z2 no section and no marked commit: "none recorded"', async () => {
    await withRepo(async (repo) => {
        await rangeRepo(repo, ['fix: a plain fix', 'feat(core): a feature'])

        const result = await run(repo, ['0.4.0'], 'log\n')

        assertEquals(result.code, 0, result.stderr)
        assertStringIncludes(result.stdout, `${BREAKING_HEADING}\n\n${NONE}\n`)
    })
})

Deno.test('#364 Z3 a feat!: commit in range refuses "none recorded"', async () => {
    await withRepo(async (repo) => {
        await rangeRepo(repo, ['feat!: drop the old API'])
        const sha = await shortSha(repo)

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 1)
        assertEquals(result.stdout, '')
        assertStringIncludes(result.stderr, sha)
        assertStringIncludes(result.stderr, 'feat!: drop the old API')
    })
})

Deno.test('#364 Z4 a scoped fix(realtime)!: commit refuses "none recorded"', async () => {
    await withRepo(async (repo) => {
        await rangeRepo(repo, ['fix(realtime)!: refuse oversized members'])

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 1)
        assertStringIncludes(result.stderr, 'fix(realtime)!:')
    })
})

Deno.test('#364 Z5 a BREAKING CHANGE footer refuses "none recorded"', async () => {
    await withRepo(async (repo) => {
        await rangeRepo(repo, [
            'fix: tighten a bound\n\nBREAKING CHANGE: the bound now refuses',
        ])

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 1)
        assertStringIncludes(result.stderr, 'fix: tighten a bound')
    })
})

Deno.test('#364 Z6 no previous tag: the whole history is scanned', async () => {
    await withRepo(async (repo) => {
        await commit(repo, {}, 'feat!: the very first break')
        await commit(repo, { 'docs/g.md': doc('No upgrade needed.\n') })
        await tag(repo, 'v0.4.0')

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 1)
        assertStringIncludes(result.stderr, 'feat!: the very first break')
    })
})

Deno.test('#364 Z7 a marked commit before the previous tag does not block', async () => {
    await withRepo(async (repo) => {
        await rangeRepo(repo, ['fix: plain'], ['feat!: an old break'])

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 0, result.stderr)
        assertStringIncludes(result.stdout, NONE)
    })
})

Deno.test('#364 Z8 a hyphenated BREAKING-CHANGE footer refuses "none recorded"', async () => {
    await withRepo(async (repo) => {
        await rangeRepo(repo, [
            'fix: tighten a bound\n\nBREAKING-CHANGE: the bound now refuses',
        ])

        const result = await run(repo, ['0.4.0'])

        assertEquals(result.code, 1)
        assertEquals(result.stdout, '')
        assertStringIncludes(result.stderr, 'fix: tighten a bound')
    })
})

Deno.test('#382 Z9 composeBody throws NoneRecordedContradicted, naming each marked commit', () => {
    const commits = [
        { sha: 'abc1234', subject: 'feat!: drop the old API' },
        { sha: 'def5678', subject: 'fix: tighten a bound' },
    ]
    // A section for another version is not a section for this release.
    const other = [{ path: 'docs/g.md', version: '0.3.0', titles: ['1. A'] }]

    const error = assertThrows(
        () => composeBody('0.4.0', other, '', 'log\n', commits),
        NoneRecordedContradicted,
    )

    assertEquals(error.name, 'NoneRecordedContradicted')
    assertEquals(error.version, '0.4.0')
    assertEquals(error.commits, commits)
    assertStringIncludes(error.message, '"## Upgrading to v0.4.0"')
    assertStringIncludes(error.message, '\n  abc1234 feat!: drop the old API\n')
    assertStringIncludes(error.message, '\n  def5678 fix: tighten a bound\n')
})

Deno.test('#382 Z10 composeBody lets marked commits through when the release has its own section', () => {
    const own = [{ path: 'docs/g.md', version: '0.4.0', titles: ['1. A'] }]

    const body = composeBody('0.4.0', own, '', '', [
        { sha: 'abc1234', subject: 'feat!: drop the old API' },
    ])

    assertFalse(body.includes(NONE), body)
    assertStringIncludes(body, '- 1. A\n')
})

Deno.test('#364 R10 a whitespace-only --notes file means no Notes heading', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. A'])) })
        await tag(repo, 'v0.4.0')
        const notes = await notesFile(repo, '  \n\t\n\n')

        const result = await run(repo, ['0.4.0', '--notes', notes], 'log\n')

        assertEquals(result.code, 0, result.stderr)
        assertFalse(result.stdout.includes('## Notes'), result.stdout)
    })
})

// ─── D: double compose ───────────────────────────────────────────────────────

Deno.test('#364 D1 stdin already carrying the continuity line is exit 1', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. A'])) })
        await tag(repo, 'v0.4.0')

        const result = await run(repo, ['0.4.0'], `${CONTINUITY_LINE}\n\nlog\n`)

        assertEquals(result.code, 1)
        assertEquals(result.stdout, '')
    })
})

Deno.test('#364 D2 stdin already carrying the breaking heading is exit 1', async () => {
    await withRepo(async (repo) => {
        await commit(repo, { 'docs/g.md': doc(guide('0.4.0', ['1. A'])) })
        await tag(repo, 'v0.4.0')

        const result = await run(
            repo,
            ['0.4.0'],
            `${BREAKING_HEADING}\n\n- x\n`,
        )

        assertEquals(result.code, 1)
        assertEquals(result.stdout, '')
    })
})
