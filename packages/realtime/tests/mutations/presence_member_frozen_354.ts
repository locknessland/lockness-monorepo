/**
 * @fileoverview #354's mutation battery — a `PresenceMember` is deep-frozen
 * where it is minted, at exactly three sites, and nowhere else.
 *
 * - M1 `admitPresenceMember` returns the admitted copy unfrozen: the #354
 *   defect itself. Measured when the row was recorded: 14 failures — every
 *   (a), (b), (c), (d) and (e) row and the two `admitPresenceMember` (h) rows —
 *   while (f) and (g) passed, which is why the Redis sites carry M5 and M6.
 * - M4 was checked to die of `RangeError: Maximum call stack size exceeded`
 *   in the depth row, not of an assertion.
 * - M2 the walk freezes the root only: `info` stays writable.
 * - M3 the walk skips arrays: `info.tags` stays writable.
 * - M4 the walk is recursive: a deep `info` overflows the stack at admission
 *   (50 000 levels; a recursive walk fails near 16 000).
 * - M5 `#parseRosterValue` returns its member unfrozen: callers sharing one
 *   Redis read see each other's writes.
 * - M6 the control ingest returns `wire.member` unfrozen: a peer's member
 *   reaches `encode` writable.
 * - M7 `#closingRead` freezes `here.members` — freezing too much: the array
 *   is the caller's.
 * - M8 the walk skips a node that is already frozen — the `Object.isFrozen`
 *   short-circuit the JSDoc refuses. `Object.freeze` is shallow, so a frozen
 *   root says nothing about the array under it: killed by the (h) row that
 *   hands the walk a frozen root and frozen `info` over a writable `tags`.
 * - T1 / T2 / T3, type-level: `readonly` removed from `id`; the property-level
 *   `readonly` removed from `info` alone; the `Readonly<…>` around what `info`
 *   holds removed alone. The two `info` rows are independent — removing either
 *   one leaves the other's error standing — so each has its own row (k)
 *   directive and each must be killed by THAT directive. A mutant that does
 *   not type-check is DEAD to `runBattery`, so these run beside it — FIRST,
 *   under the harness's lock on `channel.ts` — and count as killed only when
 *   `deno check` of the suite fails with TS2578 on the row's own directive.
 * - An interrupted type row (SIGINT, SIGTERM or SIGHUP) restores
 *   `channel.ts`. A SIGKILL cannot: it leaves the mutant and the lock behind,
 *   and the next run refuses — naming the `git checkout` that fixes it —
 *   rather than snapshot the mutant as the pristine source.
 *
 * Every row was proven LIVE by the harness run that recorded it: the mutant ran
 * and turned its named witness red.
 *
 * ```bash
 * deno task mutate presence_member_frozen_354
 * ```
 *
 * @module @lockness/realtime/tests/mutations/presence_member_frozen_354
 */

import {
    assertSafeToStart,
    type Mutation,
    reclaimStaleLock,
    runBattery,
} from '@mutations/harness.ts'

const MEMBER = new URL('../../presence_member.ts', import.meta.url)
const REDIS = new URL('../../drivers/redis.ts', import.meta.url)
const MANAGER = new URL('../../manager.ts', import.meta.url)
const CHANNEL = new URL('../../channel.ts', import.meta.url)
const SUITES = [
    new URL('../presence_member_frozen_354.test.ts', import.meta.url).pathname,
]

const PUSH_CHILD =
    "            if (typeof child === 'object' && child !== null) pending.push(child)\n"
const WALK = '    const pending: object[] = [member]\n' +
    '    for (let node = pending.pop(); node !== undefined; node = pending.pop()) {\n' +
    "        // `Object.keys` covers an array's indices too, so arrays are walked.\n" +
    '        for (const key of Object.keys(node)) {\n' +
    '            const child: unknown = (node as Record<string, unknown>)[key]\n' +
    PUSH_CHILD +
    '        }\n' +
    '        Object.freeze(node)\n' +
    '    }\n'

const MUTATIONS: Mutation[] = [
    {
        label: 'M1 — admitPresenceMember returns the admitted copy unfrozen',
        file: MEMBER,
        edits: [[
            '    return freezePresenceMember(admitted)\n}',
            '    return admitted\n}',
        ]],
        killedBy: '#354 (a) memory',
    },
    {
        label: 'M2 — the walk freezes the root only',
        file: MEMBER,
        edits: [[PUSH_CHILD, '']],
        killedBy: '#354 (a) memory: Reflect.set on info.name',
    },
    {
        label: 'M3 — the walk skips arrays',
        file: MEMBER,
        edits: [[
            PUSH_CHILD,
            "            if (typeof child === 'object' && child !== null && !Array.isArray(child)) pending.push(child)\n",
        ]],
        killedBy: '#354 (a) memory: Reflect.set on info.tags',
    },
    {
        label: 'M4 — the walk is recursive',
        file: MEMBER,
        edits: [[
            WALK,
            '    const walk = (node: object): void => {\n' +
            '        for (const key of Object.keys(node)) {\n' +
            '            const child: unknown = (node as Record<string, unknown>)[key]\n' +
            "            if (typeof child === 'object' && child !== null) walk(child)\n" +
            '        }\n' +
            '        Object.freeze(node)\n' +
            '    }\n' +
            '    walk(member)\n',
        ]],
        killedBy: '#354 (h) depth row',
    },
    {
        label: 'M5 — #parseRosterValue returns its member unfrozen',
        file: REDIS,
        // An identity call in the freeze's place, so the mutant still parses.
        edits: [[
            '            return freezePresenceMember(\n' +
            '                member.info === undefined\n',
            '            return ((unfrozen: PresenceMember) => unfrozen)(\n' +
            '                member.info === undefined\n',
        ]],
        killedBy: '#354 (f) Redis shared read',
    },
    {
        label: 'M6 — the control ingest returns wire.member unfrozen',
        file: REDIS,
        edits: [[
            '            member: wire.member && freezePresenceMember(wire.member),\n',
            '            member: wire.member,\n',
        ]],
        killedBy: '#354 (g) Redis ingest',
    },
    {
        label: 'M7 — #closingRead freezes here.members',
        file: MANAGER,
        edits: [[
            '        return { ok: true, here: { ...here, source } }\n',
            '        return { ok: true, here: { ...here, members: Object.freeze(here.members) as PresenceMember[], source } }\n',
        ]],
        killedBy: '#354 (i) here and here.members',
    },
    {
        label: 'M8 — the walk skips a node that is already frozen',
        file: MEMBER,
        edits: [[
            '    for (let node = pending.pop(); node !== undefined; node = pending.pop()) {\n',
            '    for (let node = pending.pop(); node !== undefined; node = pending.pop()) {\n' +
            '        if (Object.isFrozen(node)) continue\n',
        ]],
        killedBy: '#354 (h) no isFrozen short-circuit',
    },
]

/**
 * A type-level row: `edit` applied to channel.ts must fail `deno check` with
 * TS2578 on the row (k) directive whose text is `witness`.
 */
interface TypeRow {
    label: string
    edit: [string, string]
    witness: string
}

const INFO = '    readonly info?: Readonly<Record<string, unknown>>\n'

const TYPE_ROWS: TypeRow[] = [
    {
        label: 'T1 — readonly removed from PresenceMember.id',
        edit: [
            '    readonly id: string | number\n',
            '    id: string | number\n',
        ],
        witness: '(k) id is readonly',
    },
    {
        label: 'T2 — the property-level readonly removed from info, alone',
        edit: [INFO, '    info?: Readonly<Record<string, unknown>>\n'],
        witness: '(k) the info property is readonly',
    },
    {
        label: 'T3 — the Readonly<…> around what info holds removed, alone',
        edit: [INFO, '    readonly info?: Record<string, unknown>\n'],
        witness: '(k) info holds a Readonly<Record<string, unknown>>',
    },
]

/** Run `deno check` over the suites; returns its exit code and output. */
async function check(): Promise<{ code: number; out: string }> {
    const run = await new Deno.Command(Deno.execPath(), {
        args: ['check', ...SUITES],
    }).output()
    const out = new TextDecoder().decode(run.stdout) +
        new TextDecoder().decode(run.stderr)
    // deno-lint-ignore no-control-regex
    return { code: run.code, out: out.replace(/\x1b\[[0-9;]*m/g, '') }
}

/**
 * Refuse, naming the fix, when a killed run left `channel.ts` mutated.
 *
 * A SIGKILL mid-row runs neither the restore nor the lock's disposal. The
 * harness then declines to reclaim the lock because the file is not pristine
 * — correctly — but its refusal reads as "another battery holds the lock",
 * which sends the reader looking for a process that does not exist. The
 * battery cannot tell a leftover mutant from the developer's own uncommitted
 * edit, so it restores nothing: it stops and says which command does.
 *
 * @throws {Error} If the lock's owner is gone and `channel.ts` is modified.
 */
async function refuseLeftoverMutant(): Promise<void> {
    const lock = `${CHANNEL.pathname}.mutation-lock`
    const decision = await reclaimStaleLock(lock, CHANNEL.pathname)
    if (decision.outcome === 'reclaimed') {
        console.warn(
            `mutation harness: reclaimed a stale lock — ${lock}, held by pid ` +
                `${decision.pid}, which is gone.`,
        )
    }
    // `unsafe` with no pid is an unreadable lock, not a modified file: the
    // harness's own refusal names that one correctly.
    if (decision.outcome !== 'unsafe' || decision.pid === undefined) return
    throw new Error(
        `a killed #354 run (pid ${decision.pid}) left ${lock} behind, and ` +
            'channel.ts is modified.\n\nIf the change is a leftover type-row ' +
            'mutant (a `readonly` missing from PresenceMember), restore it and ' +
            'drop the lock:\n\n' +
            '    git checkout -- packages/realtime/channel.ts\n' +
            `    rm ${lock}\n\n` +
            'If it is your own work, commit or stash it first. Nothing was ' +
            'mutated by this run.',
    )
}

/**
 * The type-level rows, under the harness's lock on channel.ts (which also
 * re-proves the suite green before anything is mutated).
 *
 * @returns The number of rows that did not die as recorded.
 */
async function runTypeRows(): Promise<number> {
    await refuseLeftoverMutant()
    using _lock = await assertSafeToStart(SUITES, [CHANNEL])
    const original = await Deno.readTextFile(CHANNEL)
    const restore = () => Deno.writeTextFileSync(CHANNEL, original)
    // Removed before `runBattery` starts: listeners run in registration order,
    // and a stale one exiting first would skip the harness's own restore.
    // SIGHUP too: closing the terminal a battery runs in is the common way to
    // lose one, and its default action is to exit without the restore.
    const onSignal = () => {
        restore()
        Deno.exit(130)
    }
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
    for (const signal of signals) Deno.addSignalListener(signal, onSignal)
    try {
        return await typeRows(original, restore)
    } finally {
        for (const signal of signals) {
            Deno.removeSignalListener(signal, onSignal)
        }
    }
}

/**
 * Whether `deno check` reported TS2578 on the directive whose text holds
 * `witness`. Deno prints the unused directive's own line under the error
 * code, so the attribution reads the error block, not the whole output.
 *
 * @param out - `deno check`'s output, ANSI stripped.
 * @param witness - Text unique to one row (k) directive.
 * @returns True when that directive is the one reported unused.
 */
function killedBy(out: string, witness: string): boolean {
    return out.split(/(?=TS\d{4} \[ERROR\])/).some((block) =>
        block.startsWith('TS2578') && block.includes(witness)
    )
}

/**
 * Apply each type-level row to `channel.ts`, check, and restore.
 *
 * @param original - The pristine source.
 * @param restore - Writes `original` back.
 * @returns The number of rows that did not die as recorded.
 */
async function typeRows(
    original: string,
    restore: () => void,
): Promise<number> {
    let unexpected = 0
    const baseline = await check()
    if (baseline.code !== 0) {
        console.log(
            `DEAD         type rows — deno check is red before mutating`,
        )
        return TYPE_ROWS.length
    }
    for (const row of TYPE_ROWS) {
        const [from, to] = row.edit
        if (original.split(from).length - 1 !== 1) {
            console.log(
                `DEAD MUTANT  ${row.label} — the anchor did not match once`,
            )
            unexpected++
            continue
        }
        let result: { code: number; out: string }
        try {
            // Synchronous, like the restore: a signal landing mid-write cannot
            // interleave with it and leave a half-written mutant behind.
            Deno.writeTextFileSync(CHANNEL, original.replace(from, to))
            result = await check()
        } finally {
            restore()
        }
        if (result.code !== 0 && killedBy(result.out, row.witness)) {
            console.log(`KILLED       ${row.label} (TS2578, row (k))`)
        } else if (result.code !== 0) {
            console.log(
                `MISATTRIBUTED ${row.label} — deno check failed, but not with ` +
                    `TS2578 on the directive "${row.witness}"`,
            )
            unexpected++
        } else {
            console.log(`SURVIVED     ${row.label}`)
            unexpected++
        }
    }
    if (await Deno.readTextFile(CHANNEL) !== original) {
        console.log(`STILL MUTATED ${CHANNEL.pathname}`)
        unexpected++
    }
    return unexpected
}

if (import.meta.main) {
    const types = await runTypeRows()
    console.log(`${types} unexpected type-level survivor(s).\n`)
    const runtime = await runBattery(
        '#354 — a presence member is deep-frozen where it is minted',
        SUITES,
        MUTATIONS,
    )
    Deno.exit(runtime + types > 0 ? 1 : 0)
}
