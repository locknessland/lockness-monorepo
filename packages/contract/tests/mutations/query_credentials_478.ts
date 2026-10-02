/**
 * @fileoverview The mutation battery for #478 and #438.
 *
 * Runs under the shared contract in `harness.ts`, which refuses to start unless
 * the suites are already green and the target files are clean, and requires
 * every row to name the test that must catch it — so a KILLED row proves the
 * mutated line executed under the named test, not merely that something went
 * red.
 *
 * It is anchored on the files #478 added rather than on `sanitize.ts`'s
 * userinfo code, which `dsn_redaction_301_303.ts` and `bidi_292.ts` already
 * mutate: the credential-name rule and its walk-left net, the
 * compile-diagnostic readings, the order `renderOne` applies the passes in,
 * `importAppFile`'s translation, and drizzle's held query secrets (#438).
 *
 * ```bash
 * deno run -A packages/contract/tests/mutations/query_credentials_478.ts
 * ```
 *
 * @module @lockness/contract/tests/mutations/query_credentials_478
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const CREDENTIALS = new URL(
    '../../logging/credential_params.ts',
    import.meta.url,
)
const DIAGNOSTIC = new URL(
    '../../logging/compile_diagnostic.ts',
    import.meta.url,
)
const SANITIZE = new URL('../../logging/sanitize.ts', import.meta.url)
const APP_FILE = new URL('../../app_file.ts', import.meta.url)
const DSN = new URL('../../../drizzle/dsn.ts', import.meta.url)
const ERROR_NAME = new URL('../../../drizzle/error_name.ts', import.meta.url)
const SUITES = [
    new URL('../query_credentials.test.ts', import.meta.url).pathname,
    new URL('../compile_diagnostic.test.ts', import.meta.url).pathname,
    new URL('../../../drizzle/tests/query_credentials.test.ts', import.meta.url)
        .pathname,
]

const MUTATIONS: Mutation[] = [
    // ---- The credential net -------------------------------------------------
    {
        label: '`%3D` no longer read as an equals sign',
        file: CREDENTIALS,
        edits: [[
            "text[i] === '%' && text[i + 1] === '3' &&",
            "false && text[i + 1] === '3' &&",
        ]],
        killedBy: 'an encoded name, value or equals sign is still redacted',
    },
    {
        label:
            'the walk crosses an encoded separator — `cb%3Fcode` hides `code`',
        file: CREDENTIALS,
        edits: [['if (!isNameCharacter(decoded)) break', 'if (false) break']],
        killedBy:
            'an encoded separator ends a name, so a nested `code` is found',
    },
    {
        label: 'names compared case-sensitively',
        file: CREDENTIALS,
        edits: [[
            'decodeAsciiEscapes(name).toLowerCase()',
            'decodeAsciiEscapes(name)',
        ]],
        killedBy: 'a credential name matches whatever its case',
    },
    {
        label: 'the empty-value guard removed — `?token=` becomes `?token=***`',
        file: CREDENTIALS,
        edits: [['if (end > valueStart) {', 'if (true) {']],
        killedBy: 'an empty credential value is left alone',
    },
    {
        label: "quoted values lose their handling — `password='M'` leaks",
        file: CREDENTIALS,
        edits: [['if (QUOTES.has(quote)) {', 'if (false) {']],
        killedBy: 'a quoted value is redacted up to its closing quote',
    },
    {
        label: 'every value ends at URL separators — `--password=ab&M` leaks',
        file: CREDENTIALS,
        edits: [[
            'inUrl(text, start) ? URL_VALUE_END : RAW_VALUE_END',
            'URL_VALUE_END',
        ]],
        killedBy:
            'outside a URL, a raw value ends only at whitespace or a quote',
    },
    {
        label: 'no value ends at `&` — a URL query loses its neighbours',
        file: CREDENTIALS,
        edits: [[
            'inUrl(text, start) ? URL_VALUE_END : RAW_VALUE_END',
            'RAW_VALUE_END',
        ]],
        killedBy: 'inside a URL query, `&` and `#` still end a value',
    },
    {
        label: 'blanks before `=` no longer skipped — `token =M` leaks',
        file: CREDENTIALS,
        edits: [[
            'const nameEnd = skipBlanksLeft(text, i, copied)',
            'const nameEnd = i',
        ]],
        killedBy: 'spaces or tabs around `=` still mark a pair',
    },
    {
        label: 'ANSI escapes kept during the scan — a coloured name hides',
        file: CREDENTIALS,
        edits: [["const plain = text.replace(ANSI, '')", 'const plain = text']],
        killedBy: 'an ANSI escape inside a name does not hide the pair',
    },
    {
        label: 'trailing digits kept — `password2` is no credential',
        file: CREDENTIALS,
        edits: [['normalised = withoutTrailingDigits(normalised)', '']],
        killedBy:
            'trailing digits, a confirmation suffix and a plural still match',
    },
    {
        label: 'plural stems dropped — `tokens` is no credential',
        file: CREDENTIALS,
        edits: [[
            'normalised.endsWith(stem) || normalised.endsWith(`${stem}s`)',
            'normalised.endsWith(stem)',
        ]],
        killedBy:
            'trailing digits, a confirmation suffix and a plural still match',
    },
    // ---- renderOne's order ----------------------------------------------------
    {
        label: 'query pass moved after the cap',
        file: SANITIZE,
        edits: [
            ['redactQueryCredentials(redacted),', 'redacted,'],
            [
                'const shown = safeForLog(capCodePoints(redacted, MAX_MESSAGE))',
                'const shown = safeForLog(redactQueryCredentials(capCodePoints(redacted, MAX_MESSAGE)))',
            ],
        ],
        killedBy:
            'redaction runs before the cap: the line keeps what the secret pushed out',
    },
    {
        label: 'query pass moved before the userinfo pass',
        file: SANITIZE,
        edits: [
            [
                'const redacted = redactDsnCredentials(message)',
                'const redacted = redactDsnCredentials(redactQueryCredentials(message))',
            ],
            ['redactQueryCredentials(redacted),', 'redacted,'],
        ],
        killedBy: 'userinfo runs before the query pass',
    },
    {
        label: 'the non-Error branch skips the query redaction',
        file: SANITIZE,
        edits: [[
            'redactQueryCredentials(redactDsnCredentials(String(error)))',
            'redactDsnCredentials(String(error))',
        ]],
        killedBy: 'a thrown non-Error value is redacted too',
    },
    {
        label: 'renderError skips the compile-diagnostic recognition',
        file: SANITIZE,
        edits: [[
            'const diagnostic = readCompileDiagnostic(name, raw)',
            'const diagnostic = undefined as ReturnType<typeof readCompileDiagnostic>',
        ]],
        killedBy:
            'renderError keeps only the kind and location of a compile failure',
    },
    // ---- Compile diagnostics ----------------------------------------------------
    {
        label: 'the excerpt-line trigger removed',
        file: DIAGNOSTIC,
        edits: [['excerpt: EXCERPT_LINE.test(text),', 'excerpt: false,']],
        killedBy:
            'an excerpt alone is recognised, should the location line ever go',
    },
    {
        label:
            "the net's location-alone trigger removed — a wrapped V8 error leaks",
        file: DIAGNOSTIC,
        edits: [[
            'if (!shape.excerpt && shape.location === undefined) return undefined',
            'if (!shape.excerpt) return undefined',
        ]],
        killedBy:
            'renderError withholds a V8 compile error wrapped in a plain Error',
    },
    {
        label:
            'the translation stops requiring a location — a gutter-shaped throw is replaced',
        file: DIAGNOSTIC,
        edits: [[
            'if (shape.location === undefined) return undefined\n',
            '\n',
        ]],
        killedBy:
            'importAppFile rethrows a runtime throw that only looks like an excerpt',
    },
    {
        label: 'a non-file location is kept with its credential',
        file: DIAGNOSTIC,
        edits: [['return redactQueryCredentials(url)', 'return url']],
        killedBy: 'a non-file location has its credential pairs redacted',
    },
    {
        label: 'a host-bearing file URL is used as a location',
        file: DIAGNOSTIC,
        edits: [[
            "if (parsed === null || parsed.hostname !== '') return undefined",
            'if (parsed === null) return undefined',
        ]],
        killedBy: 'an unusable file location falls back to the imported file',
    },
    {
        label: 'importAppFile rethrows the raw compile error',
        file: APP_FILE,
        edits: [[
            'throw translateImportFailure(name, message, path, root) ?? error',
            'throw error',
        ]],
        killedBy:
            'importAppFile throws AppFileCompileError with a root-relative file',
    },
    // ---- #438 drizzle held secrets -------------------------------------------
    {
        label: '#438 drizzle stops holding query-string credentials',
        file: DSN,
        edits: [['...queryCredentials(tail, parsed.search),', '']],
        killedBy: 'a probe error echoing the authToken alone is withheld',
    },
    {
        label: '#438 the WHATWG-serialised form is no longer held',
        file: DSN,
        edits: [['forms.push(rewritten[index][1])', 'void rewritten']],
        killedBy:
            'inspectDsn holds an authToken in every form a driver may echo',
    },
    {
        label: '#438 the encodeURIComponent form is no longer held',
        file: DSN,
        edits: [['forms.push(encodeURIComponent(plain))', 'void plain']],
        killedBy:
            'inspectDsn holds an authToken in every form a driver may echo',
    },
    {
        label: '#438 hex escapes compared case-sensitively',
        file: ERROR_NAME,
        edits: [
            ['const haystack = upperHexEscapes(text)', 'const haystack = text'],
            [
                'haystack.includes(upperHexEscapes(secret))',
                'haystack.includes(secret)',
            ],
        ],
        killedBy: 'a held form is matched whatever the case of its hex escapes',
    },
]

Deno.exit(
    await runBattery(
        '#478/#438 mutation battery — credential pairs and compile excerpts',
        SUITES,
        MUTATIONS,
    ),
)
