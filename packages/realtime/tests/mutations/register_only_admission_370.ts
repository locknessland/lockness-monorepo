/**
 * @fileoverview #370 and #363's mutation battery — `register` is the only way
 * in, one owner object per connection id, and every teardown the framework runs
 * acts only on the owner.
 *
 * The decisions live in these homes, all in `manager.ts`: `#assertAdmissible`
 * (clause 1 retired, clause 2 any different holder); `#assertBound`
 * (`subscribe`'s decider: admissible, then registered); `#isOwner` and its
 * three askers — `disconnect`'s object form, `disconnect`'s `finally`, and
 * `handlerHooks.onMessage`; and `handlerHooks.onClose` passing the object.
 *
 * - M1 `#assertBound`'s unregistered throw removed.
 * - M2 the pre-check asks `#assertAdmissible` — only the authorizer's call
 *   count sees it.
 * - M3 clause 2 narrowed back to a retiring holder (the #361 rule).
 * - M4 clause 2 removed.
 * - M5 clause 2 over-widened to any binding — the same object is refused.
 * - M6 clause 1 removed.
 * - M7 `#assertBound` asks the binding before admissibility.
 * - M8 (survives) the post-check asks `#assertAdmissible`.
 * - M9 (survives) `subscribe`'s binding write restored below the caps.
 * - M10 `disconnect`'s object-form owner check removed.
 * - M11 `disconnect`'s `finally` guard removed.
 * - M12 `handlerHooks.onMessage`'s owner gate removed.
 * - M13 `handlerHooks.onClose` passes the id.
 *
 * M8 and M9 are equivalent mutants; the reasons are `#assertBound`'s JSDoc and
 * are not restated here. Every other row was proven LIVE: the harness ran the
 * mutant and its named witness went red, attributed. Every `killedBy` ends in
 * a space, so `W1 ` is not a prefix of `W11`–`W13`.
 *
 * ```bash
 * deno task mutate register_only_admission_370
 * ```
 *
 * @module @lockness/realtime/tests/mutations/register_only_admission_370
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const MANAGER = new URL('../../manager.ts', import.meta.url)
const SUITES = [
    new URL('../register_only_admission_370.test.ts', import.meta.url).pathname,
    new URL('../disconnect_admission_361.test.ts', import.meta.url).pathname,
]

/** Clause 2 as shipped: any different holder. */
const CLAUSE_2 =
    '        if (bound !== undefined && bound !== connection) {\n' +
    '            throw new ConnectionIdInUseError()\n' +
    '        }\n'

/** `#assertBound`'s body as shipped. */
const BOUND_BODY = '        this.#assertAdmissible(connection)\n' +
    '        if (!this.connections.has(connection.id)) {\n' +
    '            throw new ConnectionNotRegisteredError()\n' +
    '        }\n'

/** The two equivalent rows point here rather than restate the reason. */
const SEE_ASSERT_BOUND =
    "(none — equivalent) — see `#assertBound`'s JSDoc in " +
    'manager.ts, which is the home of why this mutant cannot change behaviour.'

const MUTATIONS: Mutation[] = [
    {
        label: "M1 — #assertBound's unregistered throw removed",
        file: MANAGER,
        edits: [[BOUND_BODY, '        this.#assertAdmissible(connection)\n']],
        killedBy: '#370 W1 ',
    },
    {
        label: 'M2 — the pre-check asks #assertAdmissible',
        file: MANAGER,
        edits: [[
            '        const kind = channelKind(channel)\n' +
            '        this.#assertBound(connection)\n',
            '        const kind = channelKind(channel)\n' +
            '        this.#assertAdmissible(connection)\n',
        ]],
        killedBy: '#370 W1 ',
    },
    {
        label: 'M3 — clause 2 narrowed back to a retiring holder',
        file: MANAGER,
        edits: [[
            CLAUSE_2,
            '        if (bound !== undefined && this.#retired.has(bound)) {\n' +
            '            throw new ConnectionIdInUseError()\n' +
            '        }\n',
        ]],
        killedBy: '#370 W4 ',
    },
    {
        label: 'M4 — clause 2 removed',
        file: MANAGER,
        edits: [[
            '        const bound = this.connections.get(connection.id)\n' +
            CLAUSE_2,
            '',
        ]],
        killedBy: '#370 W4 ',
    },
    {
        label: 'M5 — clause 2 over-widened to any binding',
        file: MANAGER,
        edits: [[
            CLAUSE_2,
            '        if (bound !== undefined) {\n' +
            '            throw new ConnectionIdInUseError()\n' +
            '        }\n',
        ]],
        killedBy: '#370 W6 ',
    },
    {
        label: 'M6 — clause 1 removed',
        file: MANAGER,
        edits: [[
            '        if (this.#retired.has(connection)) {\n' +
            '            throw new ConnectionDisconnectedError(connection.id)\n' +
            '        }\n' +
            '        const bound = this.connections.get(connection.id)\n',
            '        const bound = this.connections.get(connection.id)\n',
        ]],
        killedBy: '#361 W5 ',
    },
    {
        label: 'M7 — #assertBound asks the binding before admissibility',
        file: MANAGER,
        edits: [[
            BOUND_BODY,
            '        if (!this.connections.has(connection.id)) {\n' +
            '            throw new ConnectionNotRegisteredError()\n' +
            '        }\n' +
            '        this.#assertAdmissible(connection)\n',
        ]],
        killedBy: '#370 W9 ',
    },
    {
        label: 'M8 — the post-check asks #assertAdmissible',
        file: MANAGER,
        edits: [[
            "        // authorizer ran. No await from here to the join's adds.\n" +
            '        this.#assertBound(connection)\n',
            "        // authorizer ran. No await from here to the join's adds.\n" +
            '        this.#assertAdmissible(connection)\n',
        ]],
        killedBy: '(none — equivalent)',
        expectSurvival: SEE_ASSERT_BOUND,
    },
    {
        label: "M9 — subscribe's binding write restored below the caps",
        file: MANAGER,
        edits: [[
            '            connection.identity !== null,\n' +
            '        )\n' +
            '\n' +
            '        // `member` is set',
            '            connection.identity !== null,\n' +
            '        )\n' +
            '        this.connections.set(connection.id, connection)\n' +
            '\n' +
            '        // `member` is set',
        ]],
        killedBy: '(none — equivalent)',
        expectSurvival: SEE_ASSERT_BOUND,
    },
    {
        label: "M10 — disconnect's object-form owner check removed",
        file: MANAGER,
        edits: [[
            "        if (typeof target !== 'string' && !this.#isOwner(target)) {\n" +
            "            return 'not-owned'\n" +
            '        }\n',
            '',
        ]],
        killedBy: '#370 W12 (i) ',
    },
    {
        label: "M11 — disconnect's finally guard removed",
        file: MANAGER,
        edits: [[
            '            if (bound !== undefined && this.#isOwner(bound)) {\n' +
            '                this.#channelsByClient.delete(clientId)\n' +
            '                this.connections.delete(clientId)\n' +
            '            }\n',
            '            this.#channelsByClient.delete(clientId)\n' +
            '            this.connections.delete(clientId)\n',
        ]],
        killedBy: '#370 W12 (ii) ',
    },
    {
        label: "M12 — handlerHooks.onMessage's owner gate removed",
        file: MANAGER,
        edits: [[
            '                if (!this.#isOwner(conn)) return\n' +
            '                return userHooks.onMessage?.(conn, data)\n',
            '                return userHooks.onMessage?.(conn, data)\n',
        ]],
        killedBy: '#370 W13 ',
    },
    {
        label: 'M13 — handlerHooks.onClose passes conn.id',
        file: MANAGER,
        edits: [[
            '                    await this.disconnect(conn)\n',
            '                    await this.disconnect(conn.id)\n',
        ]],
        killedBy: '#370 W11 ',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#370/#363 — register is the only way in; teardown acts only on the owner',
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
