/**
 * @fileoverview #323's mutation battery — a join announces nothing it cannot back.
 *
 * The defect this branch closed was an ORDER, and an order is the thing a test
 * suite is worst at holding: it is invisible in every signature, it survives
 * every type check, and the witness that claims to pin it usually observes the
 * write rather than the announcement. `roster_control_atomicity.test.ts` was
 * exactly that — it recorded driver ops and its connection double had
 * `send: () => {}`, so a clean join read identically before and after the
 * announcement moved. It logs frames now, and these rows are what check that
 * the ordering is really held rather than merely written down.
 *
 * Every row names the test it dies to. A row that stops dying has not become
 * safe; it has lost its witness.
 *
 * ```bash
 * deno run -A packages/realtime/tests/mutations/presence_join_323.ts
 * ```
 *
 * @module @lockness/realtime/tests/mutations/presence_join_323
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const MANAGER = new URL('../../manager.ts', import.meta.url)
const SUITES = [
    new URL('../prefix_anchoring.test.ts', import.meta.url).pathname,
    new URL('../presence_join_compensation_323.test.ts', import.meta.url)
        .pathname,
    new URL('../emit_isolation_323.test.ts', import.meta.url).pathname,
    new URL('../roster_control_atomicity.test.ts', import.meta.url).pathname,
    new URL('../presence_cap_concurrency_323.test.ts', import.meta.url)
        .pathname,
]

const MUTATIONS: Mutation[] = [
    // ── the order itself ───────────────────────────────────────────────────
    {
        label: '#323 the announcement moves back ABOVE the authoritative write',
        file: MANAGER,
        edits: [
            [
                '            await this.#joinLocal(channel, connection.id)\n' +
                '            // Track it as a local member so a later leave knows what to remove.',
                '            this.emitPresence(channel, {\n' +
                "                type: 'presence',\n" +
                '                channel,\n' +
                "                action: 'joined',\n" +
                '                member,\n' +
                '            })\n' +
                '            await this.#joinLocal(channel, connection.id)\n' +
                '            // Track it as a local member so a later leave knows what to remove.',
            ],
        ],
        // Restores the shipped defect exactly: subscribers hold a `joined` for
        // a member the roster never received. Note the mutant announces TWICE
        // on a clean join, which is harmless here — the row is killed by the
        // FAILING join, where the original emit is never reached.
        killedBy: 'a rejected roster write announces NOTHING',
    },
    {
        label: '#323 the newcomer is no longer excluded from its own join',
        file: MANAGER,
        edits: [[
            '            }, { except: connection.id })',
            '            })',
        ]],
        // The exclusion used to be a consequence of WHERE the call sat. This
        // row is why it is now an argument: with the call below `#joinLocal`,
        // dropping `except` puts the joiner in its own announcement, and
        // nothing about the statement order would tell you.
        killedBy: 'the joiner never receives its own `joined`',
    },
    // ── the compensation ───────────────────────────────────────────────────
    {
        label: '#323 the failed join keeps its local membership',
        file: MANAGER,
        edits: [[
            // MULTI-LINE, and that is not cosmetic: the 20-space form of this
            // call is a SUBSTRING of the 24-space form inside the guard, so a
            // single-line anchor matches once, passes the harness's
            // exactly-once check, and amputates the tail of a deeper line. A
            // kill obtained that way proves nothing.
            '                    if (!wasSubscribed) {\n' +
            '                        await this.#leaveLocal(channel, connection.id)\n' +
            '                    }\n',
            '',
        ]],
        // The channel stays hosted with no members — a broker subscription
        // taken by a join that failed and never released.
        killedBy: 'a failed first join releases the channel subscription',
    },
    {
        label: '#323 the failed join keeps its presence-map entry',
        file: MANAGER,
        edits: [[
            '                    if (priorMember === undefined) {\n' +
            '                        members.delete(connection.id)\n' +
            '                    } else {\n' +
            '                        members.set(connection.id, priorMember)\n' +
            '                    }\n',
            '',
        ]],
        // The residue a retry trips over: the local view believes a member the
        // roster refused, and a later leave announces a `left` for a join that
        // never happened.
        killedBy: 'a rejected roster write leaves no local residue',
    },
    {
        label: '#323 the rejection is swallowed instead of propagated',
        file: MANAGER,
        edits: [[
            // Anchored BELOW the throw — on the two closing braces, the `catch`
            // and the `if (this.roster)`. `throw error` alone also matches
            // `handlerHooks`'s onOpen, and every attempt to anchor on what
            // PRECEDES the throw has broken, twice, because the compensation
            // above it is exactly the part this branch kept changing. What
            // follows a rethrow is the stable side.
            '                    throw error\n' +
            '                }\n' +
            '            }\n',
            '                }\n' +
            '            }\n',
        ]],
        // Fail-open on the seam the whole branch exists to make loud: the
        // caller is told the join succeeded, and the announcement then goes out
        // for a member with no roster entry — the original defect, reached by
        // the opposite route.
        killedBy: 'a rejected roster write announces NOTHING',
    },
    // ── the cap, and where its hazard actually is ──────────────────────────
    {
        label:
            '#323 an await lands BETWEEN the cap check and the counter it spends',
        file: MANAGER,
        edits: [[
            '            await this.#joinLocal(channel, connection.id)\n' +
            '            // Track it as a local member',
            '            if (this.roster) await this.roster.addMember(channel, member)\n' +
            '            await this.#joinLocal(channel, connection.id)\n' +
            '            // Track it as a local member',
        ]],
        // This is the "obvious fix" — authoritative write first, so nothing is
        // visible before the roster accepts — and it is why #323 moved the
        // ANNOUNCEMENT instead. `#checkChannelCaps` reads `subscriptions.size`
        // and `#joinLocal`'s adds spend it in the same turn; ANY await between
        // them lets K pipelined joins read one count and all act on it — the
        // round-trip's duration is irrelevant, one microtask is enough.
        // Measured at 5 admitted against 1 free slot.
        killedBy: 'K concurrent joins against ONE free slot admit exactly one',
    },
    {
        label:
            '#323 the compensation deletes unconditionally instead of restoring',
        file: MANAGER,
        edits: [[
            '                    if (priorMember === undefined) {\n' +
            '                        members.delete(connection.id)\n' +
            '                    } else {\n' +
            '                        members.set(connection.id, priorMember)\n' +
            '                    }\n' +
            '                    if (!wasSubscribed) {\n' +
            '                        await this.#leaveLocal(channel, connection.id)\n' +
            '                    }\n',
            '                    members.delete(connection.id)\n' +
            '                    await this.#leaveLocal(channel, connection.id)\n',
        ]],
        // The exact code that reached the review gate, restored. A failed
        // RE-join then evicts a membership this call never created, and
        // `#leaveLocal` taking the set to zero releases the broker
        // subscription — the instance goes deaf on a channel that still has a
        // live authorized subscriber. Every first-join test stays green, which
        // is why this is a row and not a comment.
        killedBy:
            'a failed RE-join does not evict the membership it already had',
    },
    {
        label:
            '#323 the roster script receives its two KEYS in the wrong order',
        file: new URL('../../drivers/redis.ts', import.meta.url),
        edits: [[
            '            this.presenceKey(channel),\n' +
            '            this.ownedKey(this.instanceId),\n' +
            '            field,\n' +
            '            JSON.stringify(entry),',
            '            this.ownedKey(this.instanceId),\n' +
            '            this.presenceKey(channel),\n' +
            '            field,\n' +
            '            JSON.stringify(entry),',
        ]],
        // `prefix_anchoring`'s helper reads KEYS[1] to learn the presence key a
        // prefix derives. Swapped, it reads the OWNED key — which embeds a
        // per-driver UUID, so every collision assertion in that file then
        // compares strings that can never collide and the whole suite passes
        // while guarding nothing. It SURVIVED that file before the helper
        // learned to check which key it had.
        killedBy: 'two accepted prefixes cannot derive the same KEY',
    },
    // ── the fan-out ────────────────────────────────────────────────────────
    {
        label: '#323 one unusable socket aborts the whole fan-out again',
        file: MANAGER,
        edits: [[
            // Anchored through the message, not the `catch` shape: the two
            // post-write dispositions in `subscribe` have the same first two
            // lines, and the harness refuses an ambiguous anchor.
            '                console.warn(\n' +
            '                    `realtime: a presence frame could not be delivered on ${',
            '                if (error) throw error\n' +
            '                console.warn(\n' +
            '                    `realtime: a presence frame could not be delivered on ${',
        ]],
        // NEUTRALISED by re-throwing, not by dismantling the `try`. The first
        // attempt spliced the send out of the block and did not type-check, and
        // a mutant that fails to compile is recorded DEAD — it proves nothing
        // about the suite. Guarding the throw behind `if (error)` also keeps
        // the warn reachable, so no unreachable-code rule fires on the mutant.
        killedBy: 'a throwing socket does not silence the subscribers after it',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#323 — the join announces nothing it cannot back',
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
