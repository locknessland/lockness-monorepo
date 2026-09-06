/**
 * @fileoverview #288's mutation battery, as a runnable script.
 *
 * **A mutation table in a comment is a claim; this is the thing that checks
 * it.** The counts in `tests/prefix_anchoring.test.ts`'s header came from a
 * script that lived in a scratch directory, so a reader could not reproduce
 * them and a later change could not invalidate them. The review gate flagged
 * exactly that. It lives in the tree now.
 *
 * Every row asserts its anchor matches **exactly once** and that the file
 * actually changed on disk **before** any test result is read. A mutation that
 * never executed reads as a result: recorded four times in one session, twice
 * as a false RED and twice as a false GREEN.
 *
 * ```bash
 * deno run -A packages/realtime/tests/mutations/prefix_288.ts
 * ```
 *
 * Exit code is the number of surviving mutants, so CI can gate on it.
 *
 * @module @lockness/realtime/tests/mutations/prefix_288
 */

const DRIVER = new URL('../../drivers/redis.ts', import.meta.url)
const SUITE = new URL('../prefix_anchoring.test.ts', import.meta.url)
const TEST_PATH =
    new URL('../prefix_anchoring.test.ts', import.meta.url).pathname

/** One mutation: where it applies, what it replaces, and whether it may survive. */
interface Mutation {
    label: string
    file: URL
    from: string
    to: string
    /**
     * An **equivalent mutant** — provably cannot change behaviour, so a GREEN
     * reading is the correct one and the reason is recorded rather than hidden.
     */
    equivalent?: string
}

const MUTATIONS: readonly Mutation[] = [
    {
        label: 'separator reverted to the pre-#288 `:`',
        file: DRIVER,
        from: 'return `${this.prefix}${RESERVED_SEPARATOR_LEAD}event:`',
        to: 'return `${this.prefix}:`',
    },
    {
        label: 'control topic given a `:` separator',
        file: DRIVER,
        from: 'return `${this.prefix}${RESERVED_SEPARATOR_LEAD}control`',
        to: 'return `${this.prefix}:control`',
    },
    {
        label: 'presenceKey un-anchored',
        file: DRIVER,
        from:
            'return `${this.prefix}${RESERVED_SEPARATOR_LEAD}presence:${channel}`',
        to: 'return `${this.prefix}:presence:${channel}`',
    },
    {
        label: 'instancesKey un-anchored',
        file: DRIVER,
        from: 'return `${this.prefix}${RESERVED_SEPARATOR_LEAD}instances`',
        to: 'return `${this.prefix}:instances`',
    },
    {
        label: 'the `__` refusal disabled',
        file: DRIVER,
        from: '    if (prefix.includes(RESERVED_SEPARATOR_LEAD)) {',
        to: '    if (false && prefix.includes(RESERVED_SEPARATOR_LEAD)) {',
    },
    {
        label: 'the guard refuses an UNRELATED sequence',
        file: DRIVER,
        from: '    if (prefix.includes(RESERVED_SEPARATOR_LEAD)) {',
        to: "    if (prefix.includes('::')) {",
    },
    {
        label: 'the charset allowlist disabled',
        file: DRIVER,
        from: '    if (!PREFIX_RE.test(prefix)) {',
        to: '    if (false && !PREFIX_RE.test(prefix)) {',
    },
    {
        label: 'the glob-character loop disabled',
        file: DRIVER,
        from: '        if (prefix.includes(char)) {',
        to: '        if (false && prefix.includes(char)) {',
    },
    {
        label: 'the length cap loosened to 999',
        file: DRIVER,
        from: '/^[A-Za-z0-9:._-]{1,64}$/',
        to: '/^[A-Za-z0-9:._-]{1,999}$/',
    },
    {
        label: "onMessage's shape-mismatch drop removed",
        file: DRIVER,
        from: '            if (!topic.startsWith(marker)) {',
        to: '            if (false) {',
    },
    {
        label: 'the strip changed to `split(marker)[1]`',
        file: DRIVER,
        from: '            const channel = topic.slice(marker.length)',
        to: "            const channel = topic.split(marker)[1] ?? ''",
    },
    {
        label: 'the strip reverted to the pre-#288 offset',
        file: DRIVER,
        from: '            const channel = topic.slice(marker.length)',
        to: '            const channel = topic.slice(this.prefix.length + 1)',
    },
    {
        label: 'the strip changed to `replace(marker, ...)`',
        file: DRIVER,
        from: '            const channel = topic.slice(marker.length)',
        to: "            const channel = topic.replace(marker, '')",
        equivalent:
            'The `startsWith` guard immediately above has already established ' +
            'that the marker occurs at position 0, so "remove the first " ' +
            'occurrence" and "drop that many characters" cannot disagree. ' +
            'Recorded rather than deleted: an earlier comment claimed this ' +
            'mutation WOULD corrupt the channel, and the battery is what ' +
            'disproved it.',
    },
    {
        label: 'globMatches neutered',
        file: SUITE,
        from: "    return new RegExp(`^${out}$`, 's').test(topic)",
        to: '    return false',
    },
]

/** Run the anchoring suite and report whether anything failed, and what. */
async function suite(): Promise<{ red: boolean; names: string[] }> {
    const run = await new Deno.Command(Deno.execPath(), {
        args: ['test', '--allow-all', TEST_PATH],
    }).output()
    const raw = new TextDecoder().decode(run.stdout) +
        new TextDecoder().decode(run.stderr)
    // deno-lint-ignore no-control-regex
    const out = raw.replace(/\x1b\[[0-9;]*m/g, '')
    const summary = out.match(/(\d+) passed \| (\d+) failed/)
    if (!summary) {
        throw new Error(
            'the suite produced no summary line — read the whole output, ' +
                'never a tail: a `| tail -1` once reported 0/10 passing for a ' +
                'run that passed 10/10, because it caught a blank line.',
        )
    }
    const names = [
        ...new Set(
            out.split('\n').filter((line) => line.includes(' ... FAILED'))
                .map((line) => line.split(' ...')[0].trim()),
        ),
    ]
    return { red: Number(summary[2]) > 0, names }
}

let survivors = 0
console.log('#288 mutation battery\n')
for (const mutation of MUTATIONS) {
    const original = await Deno.readTextFile(mutation.file)
    const hits = original.split(mutation.from).length - 1
    if (hits !== 1) {
        console.log(
            `DEAD MUTANT  ${mutation.label} — anchor matched ${hits} times, ` +
                'expected 1. The source moved; fix the anchor rather than ' +
                'reading this run.',
        )
        survivors++
        continue
    }
    await Deno.writeTextFile(
        mutation.file,
        original.replace(mutation.from, mutation.to),
    )
    // Prove the write landed before trusting anything the suite says.
    if (await Deno.readTextFile(mutation.file) === original) {
        await Deno.writeTextFile(mutation.file, original)
        console.log(`DEAD MUTANT  ${mutation.label} — file unchanged`)
        survivors++
        continue
    }
    let result: { red: boolean; names: string[] }
    try {
        result = await suite()
    } finally {
        await Deno.writeTextFile(mutation.file, original)
    }
    if (mutation.equivalent) {
        console.log(
            `EQUIVALENT   ${mutation.label}\n             ${mutation.equivalent}`,
        )
        continue
    }
    if (result.red) {
        console.log(
            `KILLED       ${mutation.label}\n             by ${
                result.names.map((n) => n.split(':')[0]).join(', ')
            }`,
        )
    } else {
        console.log(`SURVIVED     ${mutation.label}`)
        survivors++
    }
}
console.log(`\n${survivors} survivor(s).`)
Deno.exit(survivors)
