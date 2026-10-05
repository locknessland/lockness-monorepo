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
 * The `#426` rows close the gaps the #420 review found in drizzle's failure
 * render: `probe()` throwing the driver's own error object, the non-Error
 * branch of `readHead` (a driver that rejects with a string), and the error
 * name — checked for the password, and coerced when it is not a string.
 *
 * The `#441` rows reach what the #425 re-review found unmutated: the identity
 * split itself (not only its marker), the withhold check over the message,
 * and each refusal rule of drizzle's DSN check that no later rule backs up.
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
const DSN = new URL('../../../drizzle/dsn.ts', import.meta.url)
const SUITES = [
    new URL('../log_sanitize.test.ts', import.meta.url).pathname,
    new URL('../../../telemetry/tests/attributes.test.ts', import.meta.url)
        .pathname,
    new URL('../../../drizzle/tests/database.test.ts', import.meta.url)
        .pathname,
    // Holds SC-006, the one test that checks WHICH object `probe()` throws —
    // not only what its message says (#426).
    new URL('../../../drizzle/tests/multi_db.test.ts', import.meta.url)
        .pathname,
    // Holds one test per DSN refusal rule, each on a DSN only that rule
    // refuses (#441).
    new URL('../../../drizzle/tests/dsn.test.ts', import.meta.url).pathname,
]

/** `readHead`'s non-Error branch: a driver that rejects with a bare value. */
const NON_ERROR_HEAD = 'return { name: undefined, message: String(raw) }'

/** The held check, over the name and every piece of the message. */
const HELD_CHECK =
    '(head.name !== undefined && holds(head.name)) || pieces.some(holds)'

/** `readHead`'s coercion of an application-assigned, non-string name. */
const NAME_COERCION = "typeof raw.name === 'string' ? raw.name : 'Error'"

/** The #426 test that drives a probe string holding the password. */
const STRING_WITHHELD =
    '#426 a probe rejecting with a string that holds the password is withheld'

/** The #426 test that drives a probe string holding only the exact DSN. */
const STRING_SHOWN =
    '#426 a probe rejecting with a string that holds only the exact DSN'

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
        // Re-anchored when #436 folded both redactions into one chain: the
        // mutant still drops the userinfo pass for an Error's message, and
        // only that pass, as it did before.
        edits: [[
            'const redacted = redactCredentials(message)',
            'const redacted = redactQueryCredentials(message)',
        ]],
        killedBy: 'a credential in a cause is redacted like any other',
    },
    {
        label: 'the non-Error branch skips redaction entirely',
        file: SOURCE,
        // Re-anchored when #478 added the query-credential redaction to this
        // branch: the mutant now skips both redactions, as it skipped the one.
        // Re-anchored again when #436 folded both into `redactCredentials`.
        edits: [[
            'redactCredentials(String(error))',
            'String(error)',
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
        edits: [[
            "const DSN_MARKER = '<dsn redacted>'",
            "const DSN_MARKER = ''",
        ]],
        // Was a known survivor while the pattern ran first and the identity
        // leg never fired. Since #420 the exact DSN is stripped from the raw
        // message before the pattern, and a fake client reaches the leg.
        killedBy:
            '#420 a driver message carrying the exact DSN is redacted by identity',
    },
    {
        label: "drizzle's head-only render dropped",
        file: DRIZZLE,
        edits: [[
            'renderError(error, { followCause: false })',
            'renderError(error)',
        ]],
        // Reachable since #420: `setDriverFactory` lets a fake client reject
        // `probe()` with an error that carries a cause.
        killedBy:
            '#420 with no DSN held, the render is untouched and head-only',
    },
    // ---- #426: the branches of drizzle's failure render no test reached --
    {
        label:
            '#426 SECURITY — probe() re-throws the raw driver error, not the render',
        file: DRIZZLE,
        edits: [[
            'throw new Error(renderFailure(error, held, probeWithheld))',
            'throw error',
        ]],
        // The error object carries the credential on a property and in its
        // cause, which no message assertion sees.
        killedBy:
            'SC-006: a connection failure does not leak credentials from the error object',
    },
    {
        label:
            '#426 SECURITY — the held check skipped for a non-Error: a probe string leaks',
        file: DRIZZLE,
        edits: [[
            HELD_CHECK,
            'head.name !== undefined && (holds(head.name) || pieces.some(holds))',
        ]],
        killedBy: STRING_WITHHELD,
    },
    {
        label:
            '#426 SECURITY — the same skip, on the import error ConnectionResult returns',
        file: DRIZZLE,
        edits: [[
            HELD_CHECK,
            'head.name !== undefined && (holds(head.name) || pieces.some(holds))',
        ]],
        killedBy:
            '#426 an import error rejected as a string that holds the password',
    },
    {
        label: '#426 a non-Error reads as unreadable — every string a sentinel',
        file: DRIZZLE,
        edits: [[NON_ERROR_HEAD, 'return undefined']],
        killedBy: STRING_SHOWN,
    },
    {
        label: '#426 a non-Error borrows the name `Error` it never had',
        file: DRIZZLE,
        edits: [[
            NON_ERROR_HEAD,
            "return { name: 'Error', message: String(raw) }",
        ]],
        killedBy: STRING_WITHHELD,
    },
    {
        label: "#426 a non-Error's text is dropped",
        file: DRIZZLE,
        edits: [[NON_ERROR_HEAD, "return { name: undefined, message: '' }"]],
        killedBy: STRING_SHOWN,
    },
    {
        label:
            '#426 a non-Error rendered raw — the identity replacement skipped',
        file: DRIZZLE,
        edits: [[
            'error = head.name === undefined\n            ? message',
            'error = head.name === undefined\n            ? raw',
        ]],
        killedBy: STRING_SHOWN,
    },
    {
        label:
            '#426 SECURITY — the check on the name dropped: a name holding the password renders',
        file: DRIZZLE,
        edits: [[HELD_CHECK, 'pieces.some(holds)']],
        killedBy: '#426 an error name holding the password withholds',
    },
    {
        label: '#426 SECURITY — the withheld sentence shows the unvetted name',
        file: DRIZZLE,
        edits: [[
            'return withheld(shownName(head.name, held.secrets))',
            'return withheld(head.name)',
        ]],
        killedBy: '#426 an error name holding the password withholds',
    },
    {
        label: '#426 a non-string name handed to the check uncoerced',
        file: DRIZZLE,
        edits: [[NAME_COERCION, 'raw.name']],
        killedBy: '#426 a non-string error name falls back to Error',
    },
    {
        label: '#426 a non-string name falls back to no name at all',
        file: DRIZZLE,
        edits: [[
            NAME_COERCION,
            "typeof raw.name === 'string' ? raw.name : undefined",
        ]],
        killedBy: '#426 a non-string error name falls back to Error',
    },
    {
        label: '#426 a non-string name String()-ed into the render',
        file: DRIZZLE,
        edits: [[NAME_COERCION, 'String(raw.name)']],
        killedBy: '#426 a non-string error name falls back to Error',
    },
    // ---- #441: the identity split, the withhold check, the DSN refusals ----
    {
        label:
            "#441 SECURITY — drizzle's identity split skipped: the exact DSN is never cut out",
        file: DRIZZLE,
        edits: [[
            'const pieces = head.message.split(held.dsn)',
            'const pieces = [head.message]',
        ]],
        killedBy:
            '#420 a driver message carrying the exact DSN is redacted by identity',
    },
    {
        label:
            '#441 SECURITY — the withhold check skips the message: a password in driver text renders',
        file: DRIZZLE,
        edits: [[HELD_CHECK, 'head.name !== undefined && holds(head.name)']],
        killedBy:
            '#425 a short password is withheld, never replaced inside driver text',
    },
    {
        label:
            '#441 R0 — the control-character check dropped: a trailing newline passes',
        file: DSN,
        edits: [[
            "if (hasControlCharacter(url) || url.startsWith(' ')) return REFUSED",
            "if (url.startsWith(' ')) return REFUSED",
        ]],
        killedBy: '#441 R0 refuses a trailing newline',
    },
    {
        label: '#441 R3 — only the first host entry checked',
        file: DSN,
        edits: [[
            '!entries.every((entry) => HOST.test(entry))',
            '!HOST.test(entries[0])',
        ]],
        killedBy: '#441 R3 checks every entry of a host list',
    },
    {
        label:
            '#441 R5 — a comma host list before the host part no longer refused',
        file: DSN,
        edits: [[
            'if (first >= 0 && first < authorityStart + at + 1) return REFUSED',
            'void first',
        ]],
        killedBy: '#441 R5 refuses a comma host list repeated in the user',
    },
    {
        label: '#441 R5 — a `$` in a comma host list no longer refused',
        file: DSN,
        edits: [["if (list.includes('$')) return REFUSED", 'void list']],
        killedBy: '#441 R5 refuses a `$` in a comma host list',
    },
]

Deno.exit(
    await runBattery(
        '#301/#302/#303 mutation battery — DSN redaction and the cause chain',
        SUITES,
        MUTATIONS,
    ),
)
