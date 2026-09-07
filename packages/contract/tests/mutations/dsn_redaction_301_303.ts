/**
 * @fileoverview The mutation battery for #301, #302 and #303.
 *
 * Runs under the shared contract in `harness.ts` beside it — which refuses to
 * start unless the suites are already green and the target files are clean, and
 * requires every row to name the test that must catch it. Before that contract
 * existed, `KILLED` meant only "the suite went red": a row could be killed by an
 * unrelated control while the control it claimed to prove was absent, and this
 * battery and `bidi_292.ts` mutate the same file and run the same suite, so
 * neither could notice the other's coverage disappearing.
 *
 * Three rows aim at the terminator class rather than at the redaction itself.
 * That is where #301 lived: the rule looked right, and the class it was built on
 * quietly contained U+FEFF.
 *
 * ```bash
 * deno run -A packages/contract/tests/mutations/dsn_redaction_301_303.ts
 * ```
 *
 * @module @lockness/contract/tests/mutations/dsn_redaction_301_303
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const SOURCE = new URL('../../logging/sanitize.ts', import.meta.url)
const TELEMETRY = new URL('../../../telemetry/attributes.ts', import.meta.url)
const DRIZZLE = new URL('../../../drizzle/mod.ts', import.meta.url)
const SUITES = [
    new URL('../log_sanitize.test.ts', import.meta.url).pathname,
    new URL('../../../telemetry/tests/attributes.test.ts', import.meta.url)
        .pathname,
    new URL('../../../drizzle/tests/database.test.ts', import.meta.url)
        .pathname,
]

const MUTATIONS: Mutation[] = [
    {
        label:
            '#301 HIGH — `/` back as a terminator, so a slashed password leaks',
        file: SOURCE,
        edits: [['"?#<>]+', '/"?#<>]+']],
        killedBy: 'redacts a password containing a slash',
    },
    {
        label:
            '#301 — `\\\\s` back in the terminator class, so U+FEFF ends the match',
        file: SOURCE,
        edits: [['[^@ \\t\\n\\r\\f\\v"?#<>]+', '[^@\\s"?#<>]+']],
        killedBy: 'no non-ASCII whitespace can end the userinfo match',
    },
    {
        label: 'drop whitespace from the terminator class — prose gets eaten',
        file: SOURCE,
        edits: [['[^@ \\t\\n\\r\\f\\v"?#<>]+', '[^@"?#<>]+']],
        killedBy: 'does not eat things that only look like a DSN',
    },
    {
        label:
            'the RFC delimiters dropped — the ***:*** signal becomes forgeable',
        file: SOURCE,
        edits: [['[^@ \\t\\n\\r\\f\\v"?#<>]+', '[^@ \\t\\n\\r\\f\\v]+']],
        killedBy: 'does not eat things that only look like a DSN',
    },
    {
        label:
            'the scheme group unbounded again — quadratic backtracking returns',
        file: SOURCE,
        edits: [['[a-z][a-z0-9+.-]{0,31}', '[a-z][a-z0-9+.-]*']],
        killedBy: 'a long scheme-legal run does not stall the event loop',
    },
    {
        label:
            'the port-shaped guard removed — a host:port with an @ in the path is eaten',
        file: SOURCE,
        edits: [['PORT_SHAPED.test(userinfo)', 'false']],
        killedBy: 'does not eat things that only look like a DSN',
    },
    {
        label:
            'the crossed-slash guard removed — every scoped-package URL is eaten',
        file: SOURCE,
        edits: [["userinfo.includes('/') &&", 'false &&']],
        killedBy: 'does not eat things that only look like a DSN',
    },
    {
        label:
            '#303 — the `:` gate restored, so a bare token is logged verbatim',
        file: SOURCE,
        edits: [[
            "return `${scheme}${hasColon ? '***:***' : '***'}@`",
            'return hasColon ? `${scheme}***:***@` : match',
        ]],
        killedBy: 'redacts a colon-less userinfo',
    },
    {
        label: 'both userinfo shapes collapse to `***:***`',
        file: SOURCE,
        edits: [["hasColon ? '***:***' : '***'", "'***:***'"]],
        killedBy: 'keeps the two userinfo shapes distinguishable',
    },
    {
        label: 'both userinfo shapes collapse to `***`',
        file: SOURCE,
        edits: [["hasColon ? '***:***' : '***'", "'***'"]],
        killedBy: 'keeps the two userinfo shapes distinguishable',
    },
    {
        label: '#302 — the cause chain bound dropped to zero',
        file: SOURCE,
        edits: [['const MAX_CAUSE_LINKS = 2', 'const MAX_CAUSE_LINKS = 0']],
        killedBy: 'follows the cause chain instead of dropping it',
    },
    {
        label: 'the cause chain bound off by one — 1 instead of 2',
        file: SOURCE,
        edits: [['const MAX_CAUSE_LINKS = 2', 'const MAX_CAUSE_LINKS = 1']],
        killedBy: 'the chain is bounded and a cycle terminates',
    },
    {
        label: 'the cause chain bound off by one — 3 instead of 2',
        file: SOURCE,
        edits: [['const MAX_CAUSE_LINKS = 2', 'const MAX_CAUSE_LINKS = 3']],
        killedBy: 'the chain is bounded and a cycle terminates',
    },
    {
        label: 'the cycle guard removed',
        file: SOURCE,
        edits: [['if (seen.has(current)) {', 'if (false) {']],
        killedBy: 'the chain is bounded and a cycle terminates',
    },
    {
        label: 'the head/link branch inverted — link === 1 instead of 0',
        file: SOURCE,
        edits: [['rendered += link === 0', 'rendered += link === 1']],
        killedBy: 'follows the cause chain instead of dropping it',
    },
    {
        label: 'the ` caused by: ` separator loses its leading space',
        file: SOURCE,
        edits: [['` caused by: ${', '`caused by: ${']],
        killedBy: 'follows the cause chain instead of dropping it',
    },
    {
        label: 'a cause skips redaction — the hole the fix could have opened',
        file: SOURCE,
        edits: [[
            'const redacted = redactDsnCredentials(message)',
            'const redacted = message',
        ]],
        killedBy: 'a credential in a cause is redacted like any other',
    },
    {
        label: 'the non-Error branch skips redaction entirely',
        file: SOURCE,
        edits: [[
            'capCodePoints(redactDsnCredentials(String(error)), MAX_MESSAGE)',
            'capCodePoints(String(error), MAX_MESSAGE)',
        ]],
        killedBy: 'a non-Error at the TOP level is redacted too',
    },
    {
        label: 'the error name uncapped — one name inflates the whole line',
        file: SOURCE,
        edits: [['capCodePoints(name, MAX_NAME)', 'name']],
        killedBy: 'a hostile error name cannot inflate the line',
    },
    {
        label:
            'renderOne loses its try/catch — a hostile cause takes the process down',
        file: SOURCE,
        edits: [[
            "return '[unrenderable error]'",
            "throw new Error('rethrown')",
        ]],
        killedBy: 'is total, whatever a cause does',
    },
    {
        label: 'the cause READ loses its guard — a throwing getter escapes',
        file: SOURCE,
        edits: [[
            "rendered += ' caused by: [unreadable cause]'",
            "throw new Error('rethrown')",
        ]],
        killedBy: 'is total, whatever a cause does',
    },
    {
        label: 'the null half of the cause-chain terminator dropped',
        file: SOURCE,
        edits: [[
            'if (current === undefined || current === null) break',
            'if (current === undefined) break',
        ]],
        killedBy: 'renders a non-Error cause through the same rules',
    },
    {
        label: 'the sink policy inverted — followCause: false starts following',
        file: SOURCE,
        edits: [[
            'options.followCause === false ? 0 : MAX_CAUSE_LINKS',
            'options.followCause !== false ? 0 : MAX_CAUSE_LINKS',
        ]],
        killedBy: 'the sink policy is honoured in both directions',
    },
    {
        label: "telemetry's head-only carve-out dropped",
        file: TELEMETRY,
        edits: [[
            'renderError(error, { followCause: false })',
            'renderError(error)',
        ]],
        killedBy: 'a span carries the head error only',
    },
    {
        label: "drizzle's identity redaction dropped",
        file: DRIZZLE,
        edits: [["'<dsn redacted>',", "'',"]],
        killedBy: 'no password shape reaches the returned error',
        expectSurvival:
            'KNOWN SURVIVOR, and the test beside it says why. The only in-repo error that embeds the DSN is `TypeError: Invalid URL`, and the characters that make WHATWG throw are exactly the ones the shared encoder now spans — so the encoder gets there first every time and this leg never fires. It is the net for a third-party client that puts the DSN in a message of its own shaping, which no driver in this tree does. Recorded rather than deleted: an untestable defence is still a defence, and a battery that hides its survivors cannot be audited.',
    },
    {
        label: "drizzle's head-only render dropped",
        file: DRIZZLE,
        edits: [[
            'renderError(error, { followCause: false })',
            'renderError(error)',
        ]],
        killedBy: 'no password shape reaches the returned error',
        expectSurvival:
            'KNOWN SURVIVOR, same reason. No connect() error reachable from this repo carries a cause at all, so following one or not is indistinguishable through the public API. The change is still right: this is the only renderError site whose result is RETURNED rather than logged, and the comment above it asserted "renderError drops the cause" — which #302 made false. The code now makes that comment true again.',
    },
]

Deno.exit(
    await runBattery(
        '#301/#302/#303 mutation battery — DSN redaction and the cause chain',
        SUITES,
        MUTATIONS,
    ),
)
