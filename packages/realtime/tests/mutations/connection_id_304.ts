/**
 * @fileoverview #304's mutation battery — one charset, three boundaries.
 *
 * Runs under `@lockness/contract`'s shared harness: green baseline before
 * anything is mutated, an atomic per-file lock, anchors matched exactly once,
 * a non-compiling mutant reported DEAD, and every kill attributed to the test
 * that claims it.
 *
 * The three boundary rows exist because the constraint used to live in only one
 * of three paths. A control frame naming an out-of-charset id was already
 * dropped on ingest, while a local evict worked and reconcile recovered it — so
 * an application using such an id had a revocation that worked on one instance
 * and silently nowhere else. Removing any one of these guards puts that back.
 *
 * ```bash
 * deno run -A packages/realtime/tests/mutations/connection_id_304.ts
 * ```
 *
 * @module @lockness/realtime/tests/mutations/connection_id_304
 */

import {
    type Mutation,
    runBattery,
} from '../../../contract/tests/mutations/harness.ts'

const MANAGER = new URL('../../manager.ts', import.meta.url)
const DRIVER = new URL('../../drivers/redis.ts', import.meta.url)
const SUITES = [
    new URL('../connection_id_charset.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    {
        label: 'the register() boundary guard removed',
        file: MANAGER,
        edits: [[
            '        this.#assertUsableId(connection.id)\n        this.connections.set(connection.id, connection)\n    }',
            '        this.connections.set(connection.id, connection)\n    }',
        ]],
        killedBy: 'registering a connection with an out-of-charset id throws',
    },
    {
        label: 'the subscribe() boundary guard removed',
        file: MANAGER,
        edits: [[
            'this.#assertUsableId(connection.id)\n        const kind = channelKind(channel)',
            'const kind = channelKind(channel)',
        ]],
        killedBy: 'subscribing with an out-of-charset id throws too',
    },
    {
        label: 'the evict() boundary guard removed',
        file: MANAGER,
        edits: [['        this.#assertUsableId(clientId)\n', '']],
        killedBy: 'evict() refuses an out-of-charset id',
    },
    {
        label: 'the guard inverted — only VALID ids are refused',
        file: MANAGER,
        edits: [[
            'if (isValidName(id)) return',
            'if (!isValidName(id)) return',
        ]],
        killedBy: 'an ordinary id is accepted by both sites',
    },
    {
        label: 'the id is no longer encoded into the throw message',
        file: MANAGER,
        edits: [['safeForLog(id)', 'id']],
        killedBy: 'the message names the id and the rule',
    },
    {
        label: 'the socket is left open when register() rejects the id',
        file: MANAGER,
        edits: [[
            "                    conn.close(1011, 'unusable connection id')\n",
            '',
        ]],
        killedBy: 'a rejected id closes the socket',
    },
    {
        label: 'the app onOpen runs anyway after a rejected id',
        file: MANAGER,
        edits: [[
            "                    conn.close(1011, 'unusable connection id')\n                    throw error",
            "                    conn.close(1011, 'unusable connection id')",
        ]],
        killedBy: 'a rejected id closes the socket',
    },
    {
        label: 'the legacy filter moved back behind the key build',
        file: DRIVER,
        edits: [['if (!id || !isValidName(id)) continue', 'if (!id) continue']],
        killedBy: 'the legacy path filters before it builds a Redis key',
    },
    {
        label: 'the reconcile filter dropped on the sorted-set path',
        file: DRIVER,
        edits: [[
            'if (id && isValidName(id)) live.add(id)',
            'if (id) live.add(id)',
        ]],
        killedBy: 'reconcile drops a broker-injected id',
    },
    {
        label: 'the reconcile filter dropped on the legacy path',
        file: DRIVER,
        edits: [[
            'for (const id of await this.#legacyRevoked()) {\n            if (isValidName(id)) live.add(id)\n        }',
            'for (const id of await this.#legacyRevoked()) live.add(id)',
        ]],
        killedBy: 'reconcile drops a broker-injected id',
        expectSurvival:
            'EQUIVALENT, and deliberately so as of this branch. The security ' +
            'seat showed the filter was one line too late — `#legacyRevoked` ' +
            'built a Redis key from an unfiltered member before the caller ' +
            'ever saw it — so the real guard moved INSIDE that method. This ' +
            'outer one is now belt-and-braces over a set that is already ' +
            'clean, which is what the comment beside it claims, and an ' +
            'equivalent mutant is the honest way to record a redundancy ' +
            'rather than pretend to a kill.',
    },
]

Deno.exit(
    await runBattery(
        '#304 mutation battery — connection-id charset at three boundaries',
        SUITES,
        MUTATIONS,
    ),
)
