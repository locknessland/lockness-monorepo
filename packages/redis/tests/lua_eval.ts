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
 * call result, integer `+`/`-` between resolved operands, `return <expr>`, and
 * `KEYS[n]` / `ARGV[n]` / `'literal'` / numeric-literal / bound-variable
 * operands. Anything else raises.
 *
 * @module @lockness/redis/tests/lua_eval
 */

/** A value a script can hold: a scalar, or the array a call like `TIME` returns. */
export type LuaValue = string | readonly string[] | undefined

/**
 * Executes one Redis command against the caller's own store.
 *
 * @param command - The command name, upper-cased.
 * @param args - Its already-resolved string arguments.
 * @returns The command's result — a scalar, or an array for multi-value replies.
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

/** Strip Lua comments and blank lines, returning executable statements in order. */
function statements(script: string): string[] {
    return script
        .split('\n')
        .map((line) => line.replace(/--.*$/, '').trim())
        .filter((line) => line.length > 0)
}

/**
 * Evaluate a script and return whatever it `return`s.
 *
 * @param script - The Lua source given to `EVAL`.
 * @param keys - The `KEYS` array.
 * @param argv - The `ARGV` array.
 * @param call - Executes one command against the caller's store.
 * @returns The script's returned value, or `undefined` when it returns nothing.
 * @throws {LuaEvalUnsupportedError} On any construct outside the supported subset.
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

    /** Resolve a single operand token to a scalar. */
    const scalar = (token: string): string => {
        const value = resolve(token)
        if (Array.isArray(value)) {
            throw new LuaEvalUnsupportedError(
                `${token} (array where a scalar is required)`,
            )
        }
        if (value === undefined) throw new LuaEvalUnsupportedError(token)
        return value as string
    }

    /** Resolve an expression: a call, an index, arithmetic, or an operand. */
    const resolve = (raw: string): LuaValue => {
        const expr = raw.trim()

        // redis.call('CMD', a, b)  — optionally followed by [n]
        const callMatch = expr.match(
            /^redis\.call\(\s*'(\w+)'\s*(?:,\s*(.*))?\)\s*(?:\[(\d+)\])?$/s,
        )
        if (callMatch) {
            const [, command, rawArgs, index] = callMatch
            const args = rawArgs === undefined || rawArgs.trim() === ''
                ? []
                : splitArgs(rawArgs).map(scalar)
            const result = call(command.toUpperCase(), args)
            if (index === undefined) return result
            if (!Array.isArray(result)) {
                throw new LuaEvalUnsupportedError(
                    `${command}[...] (result is not indexable)`,
                )
            }
            return result[Number(index) - 1]
        }

        // Single operands FIRST — a quoted literal may itself contain a sign
        // (`'-inf'`, `'+inf'`), so trying arithmetic before this would split one.
        const keyMatch = expr.match(/^KEYS\[(\d+)\]$/)
        if (keyMatch) return keys[Number(keyMatch[1]) - 1]
        const argMatch = expr.match(/^ARGV\[(\d+)\]$/)
        if (argMatch) return argv[Number(argMatch[1]) - 1]
        const literal = expr.match(/^'([^']*)'$/)
        if (literal) return literal[1]
        if (/^-?\d+$/.test(expr)) return expr
        if (vars.has(expr)) return vars.get(expr)

        // Only then: integer arithmetic between two resolved operands.
        const arith = expr.match(/^(.+?)\s*([+-])\s*(.+)$/)
        if (arith) {
            const left = Number(scalar(arith[1]))
            const right = Number(scalar(arith[3]))
            if (!Number.isFinite(left) || !Number.isFinite(right)) {
                throw new LuaEvalUnsupportedError(expr)
            }
            return String(arith[2] === '+' ? left + right : left - right)
        }

        throw new LuaEvalUnsupportedError(expr)
    }

    for (const statement of statements(script)) {
        const local = statement.match(/^local\s+(\w+)\s*=\s*(.+)$/s)
        if (local) {
            vars.set(local[1], resolve(local[2]))
            continue
        }
        const ret = statement.match(/^return\s+(.+)$/s)
        if (ret) return resolve(ret[1])
        if (statement.startsWith('redis.call(')) {
            resolve(statement)
            continue
        }
        throw new LuaEvalUnsupportedError(statement)
    }
    return undefined
}

/** Split a call's argument list on top-level commas (quotes and brackets respected). */
function splitArgs(raw: string): string[] {
    const out: string[] = []
    let depth = 0
    let quoted = false
    let current = ''
    for (const ch of raw) {
        if (ch === "'") quoted = !quoted
        if (!quoted) {
            if (ch === '(' || ch === '[') depth++
            else if (ch === ')' || ch === ']') depth--
            else if (ch === ',' && depth === 0) {
                out.push(current)
                current = ''
                continue
            }
        }
        current += ch
    }
    if (current.trim() !== '') out.push(current)
    return out
}
