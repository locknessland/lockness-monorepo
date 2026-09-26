/**
 * @fileoverview #392's mutation battery — `disconnect`'s id form raises a
 * deprecation notice, once per manager instance, for application callers
 * only.
 *
 * The decision lives in three places, all in `manager.ts`: the
 * `typeof target === 'string'` gate in `disconnect` that decides WHETHER
 * `#warnIdForm` runs; `#warnIdForm`'s own `#idFormWarned` guard, which decides
 * HOW MANY TIMES it fires; and `revokeLocal`'s direct `#teardown` call, which
 * is what keeps the framework's own id-form use silent.
 *
 * - M1 — the gate widened: `#warnIdForm` runs for the object form too.
 * - M2 — the gate removed: `#warnIdForm` never runs, not even for the id
 *   form.
 * - M3 — the once-per-instance guard removed: every id-form call fires,
 *   proving the #392 disposition's "once per manager instance" choice is
 *   load-bearing, not incidental.
 * - M4 — `revokeLocal` reverted to the public `disconnect`, which would raise
 *   the notice for the framework's own internal id-form caller.
 *
 * Every row was proven LIVE: the harness ran the mutant and its named witness
 * went red.
 *
 * ```bash
 * deno task mutate deprecate_disconnect_id_392
 * ```
 *
 * @module @lockness/realtime/tests/mutations/deprecate_disconnect_id_392
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const MANAGER = new URL('../../manager.ts', import.meta.url)
const SUITES = [
    new URL('../deprecate_disconnect_id_392.test.ts', import.meta.url)
        .pathname,
]

/** The gate, as shipped. */
const GATE = "        if (typeof target === 'string') this.#warnIdForm()\n"

const MUTATIONS: Mutation[] = [
    {
        label:
            'M1 — the gate widened: #warnIdForm runs for the object form too',
        file: MANAGER,
        edits: [[GATE, '        this.#warnIdForm()\n']],
        killedBy: '#392 W2 ',
    },
    {
        label: 'M2 — the gate removed: #warnIdForm never runs',
        file: MANAGER,
        edits: [[GATE, '']],
        killedBy: '#392 W1 ',
    },
    {
        label:
            'M3 — the once-per-instance guard removed: every id-form call fires',
        file: MANAGER,
        edits: [[
            '    #warnIdForm(): void {\n' +
            '        if (this.#idFormWarned) return\n' +
            '        this.#idFormWarned = true\n',
            '    #warnIdForm(): void {\n',
        ]],
        killedBy: '#392 W1 ',
    },
    {
        label:
            "M4 — revokeLocal reverted to the public disconnect, raising the notice for the framework's own caller",
        file: MANAGER,
        edits: [[
            '        try {\n' +
            '            await this.#teardown(clientId)\n' +
            '        } catch (error) {\n' +
            '            console.warn(\n' +
            '                `realtime: evict teardown for ${safeForLog(clientId)} failed ` +\n',
            '        try {\n' +
            '            await this.disconnect(clientId)\n' +
            '        } catch (error) {\n' +
            '            console.warn(\n' +
            '                `realtime: evict teardown for ${safeForLog(clientId)} failed ` +\n',
        ]],
        killedBy: '#392 W3 ',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                "#392 — disconnect's id form deprecation, once per manager instance, framework callers silent",
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
