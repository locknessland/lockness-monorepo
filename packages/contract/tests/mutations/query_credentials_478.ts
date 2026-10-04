/**
 * @fileoverview The mutation battery for #478 and #438, the #494
 * regressions their fold-in introduced (rows labelled `#494`), the gaps
 * the #494 reviews found (rows labelled `#499`), and the raw value that hid
 * the credential pair after it (rows labelled `#500`).
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
        edits: [[
            'if (!isNameCharacter(decoded)) break\n            j -= 3',
            'if (false) break\n            j -= 3',
        ]],
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
        edits: [[
            'if (!QUOTES.has(text[at])) return undefined',
            'return undefined',
        ]],
        killedBy: 'a quoted value is redacted up to its closing quote',
    },
    {
        label: 'every value ends at URL separators — `--password=ab&M` leaks',
        file: CREDENTIALS,
        edits: [[
            'const ends = url ? URL_VALUE_END : RAW_VALUE_END',
            'const ends = URL_VALUE_END',
        ]],
        killedBy:
            'outside a URL, a raw value ends only at whitespace or a quote',
    },
    {
        label: 'no value ends at `&` — a URL query loses its neighbours',
        file: CREDENTIALS,
        edits: [[
            'const ends = url ? URL_VALUE_END : RAW_VALUE_END',
            'const ends = RAW_VALUE_END',
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
            'CREDENTIAL_STEMS.some((stem) => normalised.endsWith(`${stem}s`))',
            'false',
        ]],
        killedBy:
            'trailing digits, a confirmation suffix and a plural still match',
    },
    {
        label: 'an escaped opener read as raw — `--password=\\"M\\"` leaks',
        file: CREDENTIALS,
        edits: [[
            "text[at] === '\\\\' && QUOTES.has(text[at + 1])",
            'false',
        ]],
        killedBy:
            'a backslash-escaped quote opens a value that closes at its escaped twin',
    },
    {
        label: 'an escaped quote ends a quoted value — its tail leaks',
        file: CREDENTIALS,
        edits: [["if (text[j] === '\\\\') {", 'if (false) {']],
        killedBy: 'an escaped quote inside a quoted value does not end it',
    },
    {
        label: 'a bare `code` masked everywhere — `code=23505` is lost',
        file: CREDENTIALS,
        edits: [["if (match === 'exact' && !url) {", 'if (false) {']],
        killedBy:
            'a bare `code` outside a URL is a diagnostic, not an OAuth code',
    },
    {
        label:
            '#494 R1 blanks after `=` skipped only after blanks — `password= M` leaks',
        file: CREDENTIALS,
        edits: [[
            'const valueStart = skipBlanksRight(text, i + equalsLength)',
            'const valueStart = nameEnd < i ? skipBlanksRight(text, i + equalsLength) : i + equalsLength',
        ]],
        killedBy: 'blanks after `=` are skipped even with none before it',
    },
    {
        label: 'a known count name masked — `max_tokens=4096` is lost',
        file: CREDENTIALS,
        edits: [[
            "match === 'count' && isDigits(text, valueStart, end)",
            'false',
        ]],
        killedBy:
            'a known count name with an all-digit value is a count, not a secret',
    },
    {
        label: '#494 R2 every plural is a count — `api_tokens=123456` is shown',
        file: CREDENTIALS,
        edits: [[
            'COUNT_WORDS.some((word) => normalised.includes(word))',
            'true',
        ]],
        killedBy: 'only a known count name keeps an all-digit value',
    },
    {
        label:
            '#494 R4 `&amp;` is not a query separator — an href `code` leaks',
        file: CREDENTIALS,
        edits: [[
            'return isEscapedAmpersand(text, start - AMP.length) ||',
            'return false ||',
        ]],
        killedBy: 'an OAuth `code` after an HTML-escaped `&amp;` is in a query',
    },
    {
        label:
            '#494 R4 a form body is not a query — `code=M&grant_type=` leaks',
        file: CREDENTIALS,
        edits: [['runs.at(text, valueStart).query', 'false']],
        killedBy: 'a `code` ending at `&` and another pair is a form body',
    },
    {
        label:
            '#499 a form body ignores `&amp;` — `code=M&amp;grant_type=` leaks',
        file: CREDENTIALS,
        edits: [[
            'const start = isEscapedAmpersand(text, at) ? at + AMP.length : at + 1',
            'const start = at + 1',
        ]],
        killedBy: 'a `code` ending at `&` and another pair is a form body',
    },
    {
        // Killed by wall-clock alone: no structural signal exists, because the
        // memo is private state of a pure function, and a scan-step count
        // would put a test-only counter into the production module. Margin
        // measured at #500: the mutant takes 4.9-8.6 s against the 1000 ms
        // threshold (the real scan, 3-4 ms), so a runner roughly 5x faster
        // would report SURVIVED. Re-measure if the row ever survives.
        label:
            '#499 the form run re-read at every `code=` — the scan goes quadratic',
        file: CREDENTIALS,
        edits: [[
            'if (this.#last.end < from) this.#last = readFormRun(text, from)',
            'if (true) this.#last = readFormRun(text, from)',
        ]],
        killedBy: 'the scan stays linear on a run of bare `code=` pairs',
    },
    {
        label:
            '#499 every name after `&amp;` in URL mode — `password=M&lt;…` shows its tail',
        file: CREDENTIALS,
        edits: [[
            'if (URL_SEPARATORS.has(text[start - 1])) return true',
            'if (URL_SEPARATORS.has(text[start - 1]) || isEscapedAmpersand(text, start - AMP.length)) return true',
        ]],
        killedBy:
            'after `&amp;`, a credential other than `code` keeps the raw end',
    },
    {
        label:
            '#500 a raw value runs through `&<credential>=` — a quoted `token="M"` after it shows',
        file: CREDENTIALS,
        edits: [[
            "if (!url && text[end] === '&' && startsCredentialPair(text, end)) {",
            'if (false) {',
        ]],
        killedBy: 'a credential pair after a raw `&` is masked by its own rule',
    },
    {
        label:
            '#500 a raw value cut before any `name=` — `--password=ab&x=M` shows its tail',
        file: CREDENTIALS,
        edits: [[
            'return name !== undefined && classifyName(name) !== undefined',
            'return name !== undefined',
        ]],
        killedBy:
            'a raw value runs on through `&` that starts no credential pair',
    },
    {
        label:
            '#500 the lookahead reads `amp;` as the name — `&amp;token="M"` shows',
        file: CREDENTIALS,
        edits: [[
            'const start = isEscapedAmpersand(text, at) ? at + AMP.length : at + 1',
            'const start = at + 1',
        ]],
        killedBy: 'a credential pair after `&amp;` is masked by its own rule',
    },
    {
        label:
            '#500 the lookahead skips no blanks before `=` — `&amp;api_key =M` shows',
        file: CREDENTIALS,
        edits: [[
            'return equalsAt(text, skipBlanksRight(text, end)) > 0',
            'return equalsAt(text, end) > 0',
        ]],
        killedBy: 'a credential pair after `&amp;` is masked by its own rule',
    },
    {
        label: '#500 the lookahead stops at `%XX` — `&api%5Fkey="M"` shows',
        file: CREDENTIALS,
        edits: [[
            "if (text[j] === '%' && isHex(text[j + 1]) && isHex(text[j + 2])) {",
            'if (false) {',
        ]],
        killedBy: 'a credential pair after a raw `&` is masked by its own rule',
    },
    {
        label:
            '#500 the lookahead crosses `%26` — `&M%26token=` cuts and shows `M`',
        file: CREDENTIALS,
        edits: [[
            'if (!isNameCharacter(decoded)) break\n            j += 3',
            'if (false) break\n            j += 3',
        ]],
        killedBy:
            'a raw value runs on through `&` that starts no credential pair',
    },
    {
        label:
            '#494 P1 a serialised backslash escapes nothing — an inner `\\\\\\"` ends the value',
        file: CREDENTIALS,
        edits: [["j += text[j + 2] === '\\\\' ? 4 : 3", 'j += 2']],
        killedBy:
            'an escaped quote inside an escaped-quote value does not end it',
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
            '...shape.location }\n    if (shape.location === undefined) return undefined',
            '...shape.location }\n    return undefined',
        ]],
        killedBy:
            'renderError withholds a V8 compile error wrapped in a plain Error',
    },
    {
        label:
            "the net's location narrowing removed — Module not found is relabelled",
        file: DIAGNOSTIC,
        edits: [[
            "if (shape.kind !== 'SyntaxError' && !shape.compilePhrase) return undefined",
            '',
        ]],
        killedBy: 'a missing import with a trailing location renders unchanged',
    },
    {
        label: "the net's V8-phrase leg removed — a wrapped regex error leaks",
        file: DIAGNOSTIC,
        edits: [[
            "if (shape.kind !== 'SyntaxError' && !shape.compilePhrase)",
            "if (shape.kind !== 'SyntaxError')",
        ]],
        killedBy:
            'renderError withholds a V8 compile error wrapped in a plain Error',
    },
    {
        label:
            '#494 R3 `SyntaxError: ` mid-message is no signal — a flattened excerpt leaks',
        file: DIAGNOSTIC,
        edits: [[
            'compilePhrase: text.includes(SYNTAX_ERROR_SIGNAL) ||',
            'compilePhrase:',
        ]],
        killedBy:
            'a wrapped parse error with its newlines flattened is withheld',
    },
    {
        label:
            '#494 the link-error phrase dropped — a wrapped link error leaks',
        file: DIAGNOSTIC,
        edits: [["    'does not provide an export named',\n", '']],
        killedBy: 'renderError withholds a wrapped link error by its V8 phrase',
    },
    {
        label:
            'the translation stops requiring a location — a gutter-shaped throw is replaced',
        file: DIAGNOSTIC,
        edits: [[
            'if (shape.location === undefined) return undefined\n    if (!shape.excerpt',
            'if (!shape.excerpt',
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
