/**
 * @fileoverview #348's mutation battery — a crashed instance's swept presence
 * members are announced as left, exactly once, and in order.
 *
 * The remedy spreads one decision over three homes: the release script says
 * which entry left (its reply), the sweep is the only caller of the departure
 * handler and checks what it reports, and the manager announces it through the
 * one announcement home — not on the slot's tail, and with nothing awaited in
 * between. Each row below drops one clause a refactor could drop while the
 * single-instance suite stays green.
 *
 * - M1 the sweep discards the release's reply: the #348 defect itself.
 * - M2 the script replies with the entry even while a holder remains.
 * - M3 `releaseMember` reports a departure too: a second `left`.
 * - M4 the departure is decided from reads BEFORE the release: two sweepers
 *   both see the entry and both announce.
 * - M5 the manager registers without `?.`: a driver without the seam throws.
 * - M6 the departure's `target` is `''`: every peer refuses the frame.
 * - M7 the release decoder accepts an empty bulk as an entry.
 * - M8 the departure is chained on the slot's roster tail: `joined` then
 *   `left` for a member who is present.
 * - M9 one more command exchange is awaited before the handler: same order
 *   inversion. FakeRedis has no `PING`, so the extra exchange is an `EXISTS`
 *   on the instances set — a command it models — which on the serialized
 *   client W8 uses queues behind the in-flight hold exactly as a `PING` would.
 * - M10 the slot-binding check dropped: a broker-planted entry naming another
 *   member is reported as that member's departure.
 * - M11 a registration appends instead of replacing: a manager built twice on
 *   one driver announces every swept departure twice (A6).
 * - M12 `close()` keeps the handler: a sweep in flight when the driver closes
 *   still reports its departure (A6).
 * - M13 the member rule's key check back to a COUNT (`<= 2`), the #348
 *   original: a driver-reported `{ id, smuggled }` passes the manager's
 *   departure check and the room hears `smuggled` in a `left` frame (S3).
 *
 * Every row was proven LIVE by the harness run that recorded it: the mutant ran
 * and turned its named witness red.
 *
 * ```bash
 * deno task mutate presence_sweep_departure_348
 * ```
 *
 * @module @lockness/realtime/tests/mutations/presence_sweep_departure_348
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const REDIS = new URL('../../drivers/redis.ts', import.meta.url)
// M13: the manager's departure handler asks `isPresenceMemberWire`.
const PROTOCOL = new URL('../../protocol.ts', import.meta.url)
const MANAGER = new URL('../../manager.ts', import.meta.url)
const SUITES = [
    new URL('../presence_sweep_departure_348.test.ts', import.meta.url)
        .pathname,
    // M7's witness: the release decoder's FR-004a row.
    new URL('../roster_holders_345.test.ts', import.meta.url).pathname,
]

const RELEASE_CALL =
    '            const released = await this.#release(channel, field, deadId)\n'

const ANNOUNCE_DEPARTURE = '        return this.#announcePresence(\n' +
    "            'left',\n" +
    '            channel,\n' +
    '            departure.member,\n' +
    '            channel,\n' +
    '        )\n'

const MUTATIONS: Mutation[] = [
    {
        label: 'M1 — the sweep discards the release reply (the #348 defect)',
        file: REDIS,
        edits: [[
            RELEASE_CALL,
            '            await this.#release(channel, field, deadId)\n' +
            '            const released: string | undefined = undefined\n',
        ]],
        killedBy: '#348 W1',
    },
    {
        label: "M2 — the script's final `return 0` answers the entry",
        file: REDIS,
        edits: [[
            '    "  redis.call(\'HSET\', KEYS[1], ARGV[1], promoted[2])",\n' +
            "    'end',\n" +
            "    'return 0',\n",
            '    "  redis.call(\'HSET\', KEYS[1], ARGV[1], promoted[2])",\n' +
            "    'end',\n" +
            "    'return mine',\n",
        ]],
        // B still holds 7: sweeping A would announce a member who is present.
        killedBy: '#348 W2',
    },
    {
        label: 'M3 — releaseMember also reports a departure',
        file: REDIS,
        edits: [[
            '        return { gone: released !== undefined }\n',
            '        const member = this.#parseRosterValue(channel, released)\n' +
            '        if (member) {\n' +
            '            await this.#departureHandler?.({ channel, member })\n' +
            '        }\n' +
            '        return { gone: released !== undefined }\n',
        ]],
        killedBy: '#348 W6',
    },
    {
        label: 'M4 — the departure decided from reads before the release',
        file: REDIS,
        edits: [[
            RELEASE_CALL,
            '            const peek = asBulk(await this.command.command(\n' +
            "                'HGET', this.holdersKey(channel, field), deadId))\n" +
            '            const count = asInteger(await this.command.command(\n' +
            "                'HLEN', this.holdersKey(channel, field)))\n" +
            '            await this.#release(channel, field, deadId)\n' +
            '            const released = count === 1 ? peek : undefined\n',
        ]],
        // Right on one sweep; two interleaved sweeps both read the entry
        // before either release, and both announce it.
        killedBy: '#348 W3',
    },
    {
        label: 'M5 — the registration drops `?.`',
        file: MANAGER,
        edits: [[
            '            this.driver.onRosterDeparture?.((departure) =>\n',
            '            this.driver.onRosterDeparture!((departure) =>\n',
        ]],
        killedBy: '#348 W4 a driver without onRosterDeparture still builds',
    },
    {
        label: "M6 — the departure's target is ''",
        file: MANAGER,
        edits: [[
            ANNOUNCE_DEPARTURE,
            '        return this.#announcePresence(\n' +
            "            'left',\n" +
            '            channel,\n' +
            '            departure.member,\n' +
            "            '',\n" +
            '        )\n',
        ]],
        // The peer's ingest refuses a presence frame whose target is not a
        // valid name: the non-winning sweeper's observer never hears it.
        killedBy: '#348 W3',
    },
    {
        label: 'M7 — the release decoder accepts any bulk, the empty one too',
        file: REDIS,
        edits: [[
            '    if (entry) return entry\n',
            '    if (entry !== undefined) return entry\n',
        ]],
        killedBy:
            '#348 FR-004a a release reply other than 0 or a released entry throws',
    },
    {
        label: "M8 — the departure is chained on the slot's roster tail",
        file: MANAGER,
        edits: [[
            ANNOUNCE_DEPARTURE,
            '        const member = departure.member\n' +
            '        const key = `${channel}\\0${String(member.id)}`\n' +
            '        const prior = this.#rosterTails.get(key) ?? Promise.resolve()\n' +
            '        return prior.then(() =>\n' +
            "            this.#announcePresence('left', channel, member, channel)\n" +
            '        )\n',
        ]],
        killedBy: '#348 W8',
    },
    {
        label: 'M9 — one more command exchange awaited before the handler',
        file: REDIS,
        edits: [[
            '                await handler({ channel, member })\n',
            "                await this.command.command('EXISTS', this.instancesKey)\n" +
            '                await handler({ channel, member })\n',
        ]],
        killedBy: '#348 W8',
    },
    {
        label: 'M10 — the slot-binding check dropped',
        file: REDIS,
        edits: [[
            '            if (!sameMemberId(member.id, field)) {\n',
            '            if (member.id === undefined) {\n',
        ]],
        killedBy: '#348 W7 an entry whose member id is not its slot',
    },
    {
        label: 'M11 — a second registration appends instead of replacing',
        file: REDIS,
        edits: [[
            '        this.#departureHandler = handler\n',
            '        const prior = this.#departureHandler\n' +
            '        this.#departureHandler = prior\n' +
            '            ? async (departure) => {\n' +
            '                await prior(departure)\n' +
            '                await handler(departure)\n' +
            '            }\n' +
            '            : handler\n',
        ]],
        killedBy: '#348 A6 the departure handler',
    },
    {
        label: 'M12 — close() keeps the departure handler',
        file: REDIS,
        edits: [[
            '        // A closed driver reports no departure either (#348).\n' +
            '        this.#departureHandler = undefined\n',
            '        // A closed driver reports no departure either (#348).\n',
        ]],
        killedBy: '#348 A6 the departure handler',
    },
    {
        label: 'M13 — the member key rule back to a count: { id, smuggled } ' +
            'is announced as left',
        file: PROTOCOL,
        edits: [[
            '    if (!Object.keys(value).every(isPresenceMemberKey)) return false\n',
            '    if (Object.keys(value).length > 2) return false\n',
        ]],
        killedBy: '#348 S3 a malformed departure from a driver is dropped',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#348 — swept presence members are announced as left',
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
