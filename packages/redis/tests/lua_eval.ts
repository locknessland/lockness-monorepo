/**
 * @fileoverview A small, honest evaluator for the Lua subset this repo's
 * `EVAL` scripts actually use — shared by the in-memory Redis doubles.
 *
 * It lives beside `fake_server.ts` because what a script does is **Redis**
 * knowledge, not any consumer's: `@lockness/session`, `@lockness/queue`,
 * `@lockness/core`'s scheduler locks and now `@lockness/realtime` all ship
 * scripts, and three separately hand-rolled models of "what Redis does with
 * EVAL" had already accumulated before this file (#276, plan §9 / A10). It is a
 * **test helper** and is never exported from `@lockness/redis`'s public surface.
 *
 * Two disciplines make it worth trusting, and they are the whole point:
 *
 * - **It evaluates the script; it never sniffs it.** Dispatching on script text
 *   (`script.includes('ZRANGEBYSCORE')`) reimplements the semantics in
 *   TypeScript and then tests the reimplementation —
 *   `packages/queue/tests/redis_driver.test.ts` is the in-repo example of that
 *   going wrong.
 * - **It refuses what it does not understand.** An unrecognised statement
 *   throws. A permissive evaluator that skips unknown lines is the same defect
 *   as a fake returning `nil` for an unmodelled command, one layer up: the
 *   script appears to run, does less than it says, and the suite stays green.
 *
 * Supported: `local x = <expr>`, `redis.call('CMD', …)`, `[n]` indexing on a
 * call result or on a bound local, integer `+`/`-` between resolved operands,
 * `return <expr>`, `KEYS[n]` / `ARGV[n]` / `'literal'` / numeric-literal /
 * `false` / bound-variable operands, `unpack(ARGV, n)` as the LAST argument of
 * a call (expanding to `ARGV[n]`…`ARGV[#ARGV]`, possibly nothing), and a
 * positional table constructor `return {a, b, …}` whose elements are any of the
 * above (#341).
 *
 * Arithmetic is Lua's: it yields a **number**, so `HLEN - 1` compares equal to
 * the literal `0` and `return n + 1` is an integer reply. A bulk operand such as
 * `TIME[1]` is coerced, as Lua coerces a numeric string; a non-integer operand
 * is refused. `a - b + c` associates to the left.
 *
 * Control flow (#344, #345): `if <operand> == <operand> then … end`, nested,
 * with the `if … then` and its `end` each on a line of their own. The
 * comparison is Lua's, which is **type-strict** — `'1' == 1` is false — and a
 * numeric literal is a number, so an integer reply compares equal to `1` and a
 * bulk `'1'` does not. A `return` must be the last statement of its block, as
 * Lua's grammar requires; one followed by anything else is refused before a
 * single command runs.
 *
 * A table constructor stops at its first `nil` element, which is what Redis's
 * reply conversion does with a Lua table — so a script that builds one around
 * a missing value is modelled as sending the truncated reply it really sends.
 * Anything else raises: `unpack` of anything but `ARGV` or in a non-final
 * position (Lua truncates it to one value there), a keyed or nested
 * constructor, `false` or a table where a scalar argument is required, any
 * operator but `==`, `+` and `-` (`~=`, `<`, `>`, `and`, `or`, `not`), a table
 * or a call as a comparison operand, `else` / `elseif`, an unclosed `if` or a
 * stray `end`, and loops.
 *
 * **The whole script is parsed before any command runs**, as a real broker
 * compiles it: every statement's shape AND every expression inside it — a
 * `local` right-hand side, both `if` operands, each call argument — goes
 * through the one grammar the evaluator later walks. So a construct outside the
 * subset is refused even inside a branch that would not be taken, and the
 * parse-time check cannot drift from what evaluation accepts. What only a value
 * can decide (an unbound name, indexing a non-table, `false` as an argument)
 * still throws when it is reached.
 *
 * @module @lockness/redis/tests/lua_eval
 */

/**
 * A value a script can hold, shaped as Redis converts a reply into Lua.
 *
 * - `string` — a bulk or status reply.
 * - `number` — an integer reply (`HLEN`), a numeric literal in the script, or
 *   the result of `+`/`-`; returned to the client as an integer.
 * - `false` — a nil reply, top-level (`HGET` of an absent field) or an ELEMENT
 *   of a multi-bulk (`HMGET`). Redis hands Lua `false`, never `nil`: that is
 *   what makes `mine == false` a script's "was it there", and what keeps a
 *   table's length. Mapping a nil reply to `false` is the
 *   {@link RedisCallback}'s job, done once where the caller converts replies —
 *   never per command.
 * - an array — a multi-bulk reply, or a table the script returns; nested.
 * - `undefined` — Lua `nil`: an unbound `KEYS`/`ARGV` slot, or an index past
 *   the end of a table. A callback never returns it for a reply.
 */
export type LuaValue =
    | string
    | number
    | false
    | readonly LuaValue[]
    | undefined

/**
 * Executes one Redis command against the caller's own store.
 *
 * @param command - The command name, upper-cased.
 * @param args - Its already-resolved string arguments.
 * @returns The command's result — a scalar, or an array for multi-value
 *   replies; `false` for a nil reply (see {@link LuaValue}).
 */
export type RedisCallback = (
    command: string,
    args: string[],
) => LuaValue

/** Raised when the script uses a construct this evaluator does not model. */
export class LuaEvalUnsupportedError extends Error {
    /**
     * @param construct - The offending source fragment.
     */
    constructor(construct: string) {
        super(
            `lua_eval: unsupported construct ${JSON.stringify(construct)} — ` +
                'extend the evaluator rather than letting the script silently ' +
                'do less than it says',
        )
        this.name = 'LuaEvalUnsupportedError'
    }
}

/** Strip Lua comments and blank lines, returning executable lines in order. */
function statements(script: string): string[] {
    return script
        .split('\n')
        .map((line) => line.replace(/--.*$/, '').trim())
        .filter((line) => line.length > 0)
}

/** A parsed expression. `text` is its source, for error messages. */
type Expr =
    | {
        readonly kind: 'call'
        readonly text: string
        readonly command: string
        readonly args: readonly Expr[]
        /** `unpack(ARGV, n)` as the final argument: the `n`. */
        readonly unpackFrom?: number
        readonly index?: string
    }
    | {
        readonly kind: 'table'
        readonly text: string
        readonly elements: readonly Expr[]
    }
    | { readonly kind: 'keys'; readonly text: string; readonly n: number }
    | { readonly kind: 'argv'; readonly text: string; readonly n: number }
    | { readonly kind: 'string'; readonly text: string; readonly value: string }
    | { readonly kind: 'number'; readonly text: string; readonly value: number }
    | { readonly kind: 'false'; readonly text: string }
    | {
        readonly kind: 'var'
        readonly text: string
        readonly name: string
        readonly index?: string
    }
    | {
        readonly kind: 'arith'
        readonly text: string
        readonly op: '+' | '-'
        readonly left: Expr
        readonly right: Expr
    }

/** One parsed statement; an `if` owns its own block. */
type LuaNode =
    | { readonly kind: 'local'; readonly name: string; readonly value: Expr }
    | { readonly kind: 'return'; readonly value: Expr }
    | { readonly kind: 'call'; readonly call: Expr }
    | {
        readonly kind: 'if'
        readonly left: Expr
        readonly right: Expr
        readonly body: readonly LuaNode[]
    }

/** `if <operand> == <operand> then` — the only condition modelled. */
const IF_RE = /^if\s+(.+?)\s*==\s*(.+?)\s+then$/s

/** Lua's reserved words; none of them is a variable name. `false` is its own node. */
const KEYWORDS = new Set([
    'and',
    'break',
    'do',
    'else',
    'elseif',
    'end',
    'false',
    'for',
    'function',
    'goto',
    'if',
    'in',
    'local',
    'nil',
    'not',
    'or',
    'repeat',
    'return',
    'then',
    'true',
    'until',
    'while',
])

/**
 * The position of the top-level binary `+`/`-` that splits `expr`, or -1.
 *
 * The LAST one, so `a - b + c` parses as `(a - b) + c`, as Lua's left
 * associativity requires. Quotes and brackets are skipped — `'-inf'` and a
 * call's arguments hold no operator of this expression — and a sign with no
 * operand before it (`-1`, `n - -1`) is unary, not a split.
 */
function arithmeticSplit(expr: string): number {
    let depth = 0
    let quoted = false
    let found = -1
    let previous = ''
    for (let i = 0; i < expr.length; i++) {
        const ch = expr[i]
        if (ch === "'") quoted = !quoted
        else if (!quoted) {
            if ('([{'.includes(ch)) depth++
            else if (')]}'.includes(ch)) depth--
            else if (
                depth === 0 && (ch === '+' || ch === '-') &&
                previous !== '' && !'+-=(,{['.includes(previous)
            ) {
                found = i
            }
        }
        if (ch.trim() !== '') previous = ch
    }
    return found
}

/**
 * Parse an expression, refusing anything outside the subset.
 *
 * Pure syntax: nothing is resolved and no command runs, so it is safe on a
 * branch that will never execute.
 *
 * @throws {LuaEvalUnsupportedError} On any construct outside the subset.
 */
function parseExpr(raw: string): Expr {
    const text = raw.trim()
    if (text === '') throw new LuaEvalUnsupportedError(raw)

    // Operators FIRST, at top level only: `redis.call('HLEN', KEYS[1]) - 1` is
    // arithmetic on a call, not a call with a trailing fragment.
    const split = arithmeticSplit(text)
    if (split !== -1) {
        return {
            kind: 'arith',
            text,
            op: text[split] === '+' ? '+' : '-',
            left: parseExpr(text.slice(0, split)),
            right: parseExpr(text.slice(split + 1)),
        }
    }

    // redis.call('CMD', a, b)  — optionally followed by [n]
    const callMatch = text.match(
        /^redis\.call\(\s*'(\w+)'\s*(?:,\s*(.*))?\)\s*(?:\[(\d+)\])?$/s,
    )
    if (callMatch) {
        const [, command, rawArgs, index] = callMatch
        return {
            kind: 'call',
            text,
            command,
            index,
            ...parseCallArgs(rawArgs),
        }
    }

    // A positional table constructor: `{a, b, …}`.
    const table = text.match(/^\{(.*)\}$/s)
    if (table) {
        const body = table[1].trim()
        const elements = (body === '' ? [] : listParts(body)).map((element) => {
            if (/[{}=]/.test(element.replace(/'[^']*'/g, ''))) {
                throw new LuaEvalUnsupportedError(element.trim())
            }
            return parseExpr(element)
        })
        return { kind: 'table', text, elements }
    }

    const keyMatch = text.match(/^KEYS\[(\d+)\]$/)
    if (keyMatch) return { kind: 'keys', text, n: Number(keyMatch[1]) }
    const argMatch = text.match(/^ARGV\[(\d+)\]$/)
    if (argMatch) return { kind: 'argv', text, n: Number(argMatch[1]) }
    const literal = text.match(/^'([^']*)'$/)
    if (literal) return { kind: 'string', text, value: literal[1] }
    // A numeric literal is a Lua NUMBER: `return 1` is an integer reply,
    // and `n == 1` compares against an integer, never the string '1'.
    if (/^-?\d+$/.test(text)) {
        return { kind: 'number', text, value: Number(text) }
    }
    if (text === 'false') return { kind: 'false', text }
    const name = text.match(/^([A-Za-z_]\w*)(?:\[(\d+)\])?$/)
    if (name && !KEYWORDS.has(name[1])) {
        return { kind: 'var', text, name: name[1], index: name[2] }
    }

    throw new LuaEvalUnsupportedError(text)
}

/**
 * Parse a call's argument list, admitting `unpack(ARGV, n)` only as the last.
 *
 * Only the LAST position expands: Lua truncates a multi-value expression
 * anywhere else to its first value, and modelling it as a full expansion would
 * pass a script that sends different arguments on a real broker.
 */
function parseCallArgs(
    rawArgs: string | undefined,
): { args: Expr[]; unpackFrom?: number } {
    if (rawArgs === undefined || rawArgs.trim() === '') return { args: [] }
    const parts = listParts(rawArgs)
    const args: Expr[] = []
    let unpackFrom: number | undefined
    parts.forEach((part, index) => {
        const unpack = part.trim().match(/^unpack\(\s*(\w+)\s*,\s*(\d+)\s*\)$/)
        if (!unpack) {
            if (/^unpack\s*\(/.test(part.trim())) {
                throw new LuaEvalUnsupportedError(part.trim())
            }
            args.push(parseExpr(part))
            return
        }
        if (unpack[1] !== 'ARGV' || index !== parts.length - 1) {
            throw new LuaEvalUnsupportedError(part.trim())
        }
        unpackFrom = Number(unpack[2])
    })
    return { args, unpackFrom }
}

/**
 * One side of an `==`: an operand, never a call or a table. A table is refused
 * too — Lua compares tables by identity, which no script here relies on and
 * this evaluator does not model.
 */
function parseOperand(raw: string): Expr {
    const expr = parseExpr(raw)
    if (expr.kind === 'call' || expr.kind === 'table') {
        throw new LuaEvalUnsupportedError(expr.text)
    }
    return expr
}

/** Parse one plain (non-`if`, non-`end`) line into its statement. */
function parseStatement(line: string): LuaNode {
    const local = line.match(/^local\s+([A-Za-z_]\w*)\s*=\s*(.+)$/s)
    if (local && !KEYWORDS.has(local[1])) {
        return { kind: 'local', name: local[1], value: parseExpr(local[2]) }
    }
    const ret = line.match(/^return\s+(.+)$/s)
    if (ret) return { kind: 'return', value: parseExpr(ret[1]) }
    if (line.startsWith('redis.call(')) {
        // A bare call statement; `redis.call(…)[n]` alone is not a statement.
        const call = parseExpr(line)
        if (call.kind === 'call' && call.index === undefined) {
            return { kind: 'call', call }
        }
    }
    throw new LuaEvalUnsupportedError(line)
}

/**
 * Parse lines into nested blocks, refusing anything outside the subset.
 *
 * It runs before any command, so a malformed block, a `return` followed by a
 * statement, or an unmodelled construct — a statement or any expression within
 * one — in a branch that would not be taken all throw with nothing executed.
 */
function parseBlock(
    lines: readonly string[],
    start: number,
    nested: boolean,
): { block: LuaNode[]; next: number } {
    const block: LuaNode[] = []
    let pos = start
    while (pos < lines.length) {
        const line = lines[pos]
        if (block.at(-1)?.kind === 'return' && line !== 'end') {
            // Lua's grammar: `return` is the last statement of its block.
            throw new LuaEvalUnsupportedError(
                `${lines[pos - 1]} (followed by ${line})`,
            )
        }
        if (line === 'end') {
            if (!nested) throw new LuaEvalUnsupportedError(line)
            return { block, next: pos + 1 }
        }
        const cond = line.match(IF_RE)
        if (cond) {
            const left = parseOperand(cond[1])
            const right = parseOperand(cond[2])
            const inner = parseBlock(lines, pos + 1, true)
            block.push({ kind: 'if', left, right, body: inner.block })
            pos = inner.next
            continue
        }
        block.push(parseStatement(line))
        pos++
    }
    if (nested) throw new LuaEvalUnsupportedError('if … (no matching end)')
    return { block, next: pos }
}

/**
 * Take the 1-based `index` element of a table, as Lua's `t[n]` does.
 *
 * @throws {LuaEvalUnsupportedError} When the value is not a table.
 */
function indexed(result: LuaValue, index: string, label: string): LuaValue {
    if (!Array.isArray(result)) {
        throw new LuaEvalUnsupportedError(
            `${label}[...] (result is not indexable)`,
        )
    }
    return result[Number(index) - 1]
}

/**
 * Evaluate a script and return whatever it `return`s.
 *
 * @param script - The Lua source given to `EVAL`.
 * @param keys - The `KEYS` array.
 * @param argv - The `ARGV` array.
 * @param call - Executes one command against the caller's store.
 * @returns The script's returned value, or `undefined` when it returns nothing.
 * @throws {LuaEvalUnsupportedError} On any construct outside the supported
 *   subset — before any command runs when it is syntactic.
 * @example
 * ```typescript
 * const out = evalLua(
 *   "local t = redis.call('TIME')[1]\nreturn redis.call('ZRANGEBYSCORE', KEYS[1], t, '+inf')",
 *   ['app:rt:revocations'],
 *   [],
 *   (cmd, args) => store.run(cmd, args),
 * )
 * ```
 */
export function evalLua(
    script: string,
    keys: readonly string[],
    argv: readonly string[],
    call: RedisCallback,
): LuaValue {
    const vars = new Map<string, LuaValue>()

    /** Evaluate an expression that must be a scalar argument. */
    const scalar = (expr: Expr): string => {
        const value = evaluate(expr)
        if (Array.isArray(value)) {
            throw new LuaEvalUnsupportedError(
                `${expr.text} (array where a scalar is required)`,
            )
        }
        if (value === undefined || value === false) {
            throw new LuaEvalUnsupportedError(expr.text)
        }
        return String(value)
    }

    /** An arithmetic operand: a number, or a string Lua would coerce to one. */
    const integer = (expr: Expr): number => {
        const value = evaluate(expr)
        const number = typeof value === 'number'
            ? value
            : typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)
            ? Number(value)
            : NaN
        if (!Number.isInteger(number)) {
            throw new LuaEvalUnsupportedError(`${expr.text} (not an integer)`)
        }
        return number
    }

    /** Evaluate a parsed expression. */
    const evaluate = (expr: Expr): LuaValue => {
        switch (expr.kind) {
            case 'call': {
                const args = expr.args.map(scalar)
                if (expr.unpackFrom !== undefined) {
                    args.push(...argv.slice(expr.unpackFrom - 1))
                }
                const result = call(expr.command.toUpperCase(), args)
                if (expr.index === undefined) return result
                return indexed(result, expr.index, expr.command)
            }
            case 'table': {
                // Truncated at the first nil element, as Redis's Lua-to-reply
                // conversion does.
                const out: LuaValue[] = []
                for (const element of expr.elements) {
                    const value = evaluate(element)
                    if (value === undefined) break
                    out.push(value)
                }
                return out
            }
            case 'keys':
                return keys[expr.n - 1]
            case 'argv':
                return argv[expr.n - 1]
            case 'string':
            case 'number':
                return expr.value
            case 'false':
                return false
            case 'var': {
                if (!vars.has(expr.name)) {
                    throw new LuaEvalUnsupportedError(
                        `${expr.text} (unbound variable)`,
                    )
                }
                const value = vars.get(expr.name)
                if (expr.index === undefined) return value
                return indexed(value, expr.index, expr.name)
            }
            case 'arith': {
                // A NUMBER, as in Lua: `n - 1 == 0` holds, `return n + 1` is
                // an integer reply.
                const left = integer(expr.left)
                const right = integer(expr.right)
                return expr.op === '+' ? left + right : left - right
            }
        }
    }

    /** One side of an `==`, at run time: a table value is still refused. */
    const operand = (expr: Expr): LuaValue => {
        const value = evaluate(expr)
        if (Array.isArray(value)) {
            throw new LuaEvalUnsupportedError(
                `${expr.text} (table in a comparison)`,
            )
        }
        return value
    }

    /** Run a block; `done` is set once a `return` ran inside it. */
    const run = (
        block: readonly LuaNode[],
    ): { done: boolean; value: LuaValue } => {
        for (const node of block) {
            if (node.kind === 'if') {
                // Type-strict, as Lua's `==` is: '1' == 1 is false.
                if (operand(node.left) === operand(node.right)) {
                    const out = run(node.body)
                    if (out.done) return out
                }
                continue
            }
            if (node.kind === 'local') {
                vars.set(node.name, evaluate(node.value))
                continue
            }
            if (node.kind === 'return') {
                return { done: true, value: evaluate(node.value) }
            }
            evaluate(node.call)
        }
        return { done: false, value: undefined }
    }

    return run(parseBlock(statements(script), 0, false).block).value
}

/** Split a comma list on top-level commas (quotes and brackets respected). */
function listParts(raw: string): string[] {
    const out: string[] = []
    let depth = 0
    let quoted = false
    let current = ''
    for (const ch of raw) {
        if (ch === "'") quoted = !quoted
        if (!quoted) {
            if (ch === '(' || ch === '[' || ch === '{') depth++
            else if (ch === ')' || ch === ']' || ch === '}') depth--
            else if (ch === ',' && depth === 0) {
                out.push(current)
                current = ''
                continue
            }
        }
        current += ch
    }
    // Every part is kept, the last one too: `f(a, )` is a Lua syntax error,
    // and an empty part is what makes `parseExpr` say so.
    out.push(current)
    return out
}
