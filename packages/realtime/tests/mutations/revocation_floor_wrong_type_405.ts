/**
 * @fileoverview #405's mutation battery — a wrong-typed revocation-floor key
 * self-heals inside `FLOOR_WRITE`'s own atomic `EVAL`.
 *
 * The decisions live in `drivers/redis.ts`: `FLOOR_WRITE`'s `TYPE` read and its
 * five type-gated `DEL` blocks; `decodeReapReply`, widened to the `{t, kind}`
 * pair (#411: `{t, indexKind, floorKind}` triple, `kind` renamed `floorKind`);
 * `REVOCATION_FLOOR_WRONG_TYPE`, the one heal WARN.
 *
 * Each row drops one clause a refactor could drop while the rest of the suite
 * stays green. Every row was proven LIVE by the harness run that recorded it:
 * the mutant ran and turned its named witness red (`KILLED`, attributed).
 *
 * ```bash
 * deno task mutate revocation_floor_wrong_type_405
 * ```
 *
 * @module @lockness/realtime/tests/mutations/revocation_floor_wrong_type_405
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const REDIS = new URL('../../drivers/redis.ts', import.meta.url)
const SUITES = [
    new URL('../revocation_floor_wrong_type_405.test.ts', import.meta.url)
        .pathname,
]

const MUTATIONS: Mutation[] = [
    {
        label: "N1 the 'string' heal branch never fires",
        file: REDIS,
        edits: [[
            '    "if kind == \'string\' then",\n',
            '    "if kind == \'strings\' then",\n',
        ]],
        killedBy: '#405 a string-typed revocation floor self-heals',
    },
    {
        label: "N2 the 'list' heal branch never fires",
        file: REDIS,
        edits: [[
            '    "if kind == \'list\' then",\n',
            '    "if kind == \'lists\' then",\n',
        ]],
        // FakeRedis never models a list; killed only with a live broker up
        // (LOCKNESS_REDIS_INTEGRATION=1) — the fake-only run reports this row
        // SURVIVED, by design (see the file header).
        killedBy: '#405 (live) a list-typed revocation floor self-heals',
    },
    {
        label: "N3 the 'set' heal branch never fires",
        file: REDIS,
        edits: [[
            '    "if kind == \'set\' then",\n',
            '    "if kind == \'sets\' then",\n',
        ]],
        killedBy: '#405 a set-typed revocation floor self-heals',
    },
    {
        label: "N4 the 'hash' heal branch never fires",
        file: REDIS,
        edits: [[
            '    "if kind == \'hash\' then",\n',
            '    "if kind == \'hashes\' then",\n',
        ]],
        killedBy: '#405 a hash-typed revocation floor self-heals',
    },
    {
        label: "N5 the 'stream' heal branch never fires",
        file: REDIS,
        edits: [[
            '    "if kind == \'stream\' then",\n',
            '    "if kind == \'streams\' then",\n',
        ]],
        // Live-broker only, same reasoning as N2.
        killedBy: '#405 (live) a stream-typed revocation floor self-heals',
    },
    {
        label: 'N6 the TYPE read removed: every FLOOR_WRITE call throws',
        file: REDIS,
        edits: [[
            "    \"local kind = redis.call('TYPE', floor)['ok']\",\n",
            '',
        ]],
        killedBy: '#405 an absent or already-healthy floor never WARNs',
    },
    {
        // Re-anchored after #411 widened the reap's decode from a {t, kind}
        // pair to a {t, indexKind, floorKind} triple: `kind` is now
        // `floorKind`, and the source moved, but the guard this row proves —
        // the floor's own field misread — remains.
        label:
            "N7 decodeReapReply's triple-decode inverted: indexKind and floorKind swapped",
        file: REDIS,
        edits: [[
            '    const indexKind = asBulk(items[1])\n' +
            '    const floorKind = asBulk(items[2])\n',
            '    const indexKind = asBulk(items[2])\n' +
            '    const floorKind = asBulk(items[1])\n',
        ]],
        killedBy: '#405 a string-typed revocation floor self-heals',
    },
    {
        label: 'N8 the heal WARN text changed',
        file: REDIS,
        edits: [[
            "    'healed (#405); the pass completed normally. Prior type:'\n",
            "    'healed (#405); the pass completed normally. Was type:'\n",
        ]],
        killedBy: '#405 a string-typed revocation floor self-heals',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                "#405 — a wrong-typed revocation floor self-heals inside FLOOR_WRITE's EVAL",
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
