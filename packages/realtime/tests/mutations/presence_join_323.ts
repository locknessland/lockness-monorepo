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
    new URL('../presence_rejoin_327.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    // ── the order itself ───────────────────────────────────────────────────
    {
        label: '#323 the announcement moves back ABOVE the authoritative write',
        file: MANAGER,
        edits: [
            [
                // RE-ANCHORED by #327: `// Track it as a local member …` went
                // with the capture-and-restore preamble. The claim line plus
                // the roster comment is the new unique pair — `#joinLocal`
                // alone appears twice in the method.
                '            members.set(connection.id, member)\n' +
                '            await this.#joinLocal(channel, connection.id)\n' +
                "            // The authoritative roster is the driver's",
                '            this.emitPresence(channel, {\n' +
                "                type: 'presence',\n" +
                '                channel,\n' +
                "                action: 'joined',\n" +
                '                member,\n' +
                '            })\n' +
                '            members.set(connection.id, member)\n' +
                '            await this.#joinLocal(channel, connection.id)\n' +
                "            // The authoritative roster is the driver's",
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
            // RE-ANCHORED by #327. This used to wrap the call in
            // `if (!wasSubscribed) {`, and the anchor had to be multi-line
            // because the 20-space form was a SUBSTRING of the 24-space form
            // inside that guard — a single-line anchor matched once, passed the
            // harness's exactly-once check, and amputated a deeper line. The
            // re-join guard removed the conditional, so the deeper form no
            // longer exists and one line is now both unique and unambiguous.
            // Verified: exactly one occurrence, at no other indent.
            '                    await this.#leaveLocal(channel, connection.id)\n',
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
            // RE-ANCHORED by #327: the restore-or-delete branch collapsed to an
            // unconditional delete once a re-join could no longer reach this
            // write. The mutation is the same one — drop the local undo — and
            // it is now one line.
            '                    members.delete(connection.id)\n',
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
            // RE-ANCHORED by #327. The injected await must land between
            // `#checkChannelCaps` and the adds it spends; since #327 the CLAIM
            // sits in that same run, so the await goes above both.
            '            members.set(connection.id, member)\n' +
            '            await this.#joinLocal(channel, connection.id)\n',
            '            if (this.roster) await this.roster.addMember(channel, member)\n' +
            '            members.set(connection.id, member)\n' +
            '            await this.#joinLocal(channel, connection.id)\n',
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
    // ── RETIRED by #327, with the reason, rather than deleted ──────────────
    //
    // `#323 the compensation deletes unconditionally instead of restoring`
    // stood here. It restored the code that reached #323's review gate — a
    // failed RE-join evicting a membership the call never created — and it was
    // killed by `a failed RE-join does not evict the membership it already
    // had`.
    //
    // Both the mutation and its witness are unreachable now, and for the same
    // reason: #327's guard returns before `#joinLocal`, so a re-join never
    // reaches the roster write and cannot fail there. The compensation IS
    // unconditional today — this row's "mutation" is the shipped code, so it
    // could only ever report a survivor, and a row that cannot die is a row
    // that measures nothing.
    //
    // This is not a coverage loss. The asymmetry it guarded was deleted with
    // it, and what replaced it is `#327 the re-join guard is removed` below:
    // where this row asked "does the compensation know a re-join from a first
    // join?", that one asks "can a re-join get here at all?" — the stronger
    // question, because the answer is no by construction.

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
    // ── #327: a re-join is not a join ──────────────────────────────────────
    {
        // SUCCESSOR to the row retired above — `#323 the compensation deletes
        // unconditionally instead of restoring` — carried forward here per
        // docs/testing.md's rule that a retired row's reason travels to the row
        // that now covers it. That row asked whether the compensation could
        // tell a re-join from a first join; this one asks whether a re-join can
        // reach the compensation at all, and the answer is no by construction.
        label: '#327 the re-join guard is removed (a re-join joins again)',
        file: MANAGER,
        edits: [[
            '            if (members.has(connection.id)) {\n' +
            '                return await this.#closingRead(channel)\n' +
            '            }\n',
            '',
        ]],
        // The whole defect, restored: a subscribe to a held channel announces
        // `joined` locally, publishes `presence-join` — which every other
        // instance re-emits — and rewrites a roster entry identical to the one
        // already there. Verified live before this row was written: with the
        // guard gone, three of the four #327 witnesses fail.
        killedBy: 'a re-join announces NOTHING and writes NOTHING',
    },
    {
        label: '#327 the membership claim moves back BELOW `#joinLocal`',
        file: MANAGER,
        edits: [[
            '            members.set(connection.id, member)\n' +
            '            await this.#joinLocal(channel, connection.id)\n',
            '            await this.#joinLocal(channel, connection.id)\n' +
            '            members.set(connection.id, member)\n',
        ]],
        // MOVED, not deleted — the ordering IS the invariant, and a mutation
        // that removes the claim entirely would break the sequential case too
        // and prove nothing about the race. `#joinLocal` awaits `#watch`, so
        // with the claim below it K pipelined frames all read "not a member"
        // and all perform a full join. This is #323's cap discipline applied to
        // the second check-then-act pair in the method: the check and the thing
        // it spends stay in one synchronous turn.
        //
        // Verified live before this row was written, and it is the row that
        // matters most: the guard passes the SEQUENTIAL re-join test with this
        // mutation applied. Only the pipelined witness dies.
        killedBy: 'K pipelined subscribe frames produce exactly ONE join',
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
