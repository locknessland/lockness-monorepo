/**
 * @fileoverview The shared Lua-subset evaluator (#276).
 *
 * Two properties matter and both are asserted here: it **evaluates** rather than
 * sniffing script text, and it **refuses** what it does not model instead of
 * skipping it. A permissive evaluator would make a script appear to run while
 * doing less than it says — the same defect class as a fake answering `nil` to
 * an unmodelled command.
 *
 * @module @lockness/redis/tests/lua_eval
 */

import { assertEquals, assertThrows } from '@std/assert'
import { evalLua, LuaEvalUnsupportedError } from './lua_eval.ts'

/** A recording stub standing in for a store. */
function recorder(replies: Record<string, string | string[]> = {}) {
    const calls: Array<[string, string[]]> = []
    return {
        calls,
        call: (command: string, args: string[]) => {
            calls.push([command, args])
            return replies[command]
        },
    }
}

Deno.test('lua_eval - resolves KEYS, ARGV and literals into a call', () => {
    const r = recorder()
    evalLua(
        "redis.call('ZADD', KEYS[1], 'GT', ARGV[1], ARGV[2])",
        ['app:rt:revocations'],
        ['1700', 'conn-1'],
        r.call,
    )
    assertEquals(r.calls, [[
        'ZADD',
        ['app:rt:revocations', 'GT', '1700', 'conn-1'],
    ]])
})

Deno.test('lua_eval - indexes a call result, as TIME[1] requires', () => {
    const r = recorder({ TIME: ['1400', '512'] })
    const out = evalLua("return redis.call('TIME')[1]", [], [], r.call)
    assertEquals(out, '1400')
})

Deno.test('lua_eval - does integer arithmetic between resolved operands', () => {
    const r = recorder({ TIME: ['1000', '0'] })
    evalLua(
        "local t = redis.call('TIME')[1]\n" +
            "redis.call('ZADD', KEYS[1], 'GT', t + ARGV[1], ARGV[2])",
        ['k'],
        ['300', 'conn-1'],
        r.call,
    )
    assertEquals(r.calls[1], ['ZADD', ['k', 'GT', '1300', 'conn-1']])
})

Deno.test('lua_eval - runs statements in order and returns the last call', () => {
    const r = recorder({ TIME: ['500', '0'], ZRANGEBYSCORE: ['a', 'b'] })
    const out = evalLua(
        "local t = redis.call('TIME')[1]\n" +
            "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', t)\n" +
            "return redis.call('ZRANGEBYSCORE', KEYS[1], t, '+inf')",
        ['k'],
        [],
        r.call,
    )
    assertEquals(r.calls.map((c) => c[0]), [
        'TIME',
        'ZREMRANGEBYSCORE',
        'ZRANGEBYSCORE',
    ])
    assertEquals(r.calls[1][1], ['k', '-inf', '500'])
    assertEquals(out, ['a', 'b'])
})

Deno.test('lua_eval - ignores comments and blank lines', () => {
    const r = recorder({ TIME: ['7', '0'] })
    const out = evalLua(
        "-- a comment\n\nreturn redis.call('TIME')[1] -- trailing\n",
        [],
        [],
        r.call,
    )
    assertEquals(out, '7')
})

Deno.test('lua_eval - THROWS on a construct it does not model, never skips it', () => {
    const r = recorder()
    assertThrows(
        () => evalLua('for i = 1, 10 do end', [], [], r.call),
        LuaEvalUnsupportedError,
    )
    assertEquals(r.calls.length, 0, 'nothing ran')
})

Deno.test('lua_eval - THROWS on an unbound variable rather than resolving it to nil', () => {
    assertThrows(
        () =>
            evalLua("redis.call('SET', mystery, '1')", [], [], recorder().call),
        LuaEvalUnsupportedError,
    )
})

Deno.test('lua_eval - THROWS when indexing a non-array reply', () => {
    const r = recorder({ GET: 'scalar' })
    assertThrows(
        () =>
            evalLua("return redis.call('GET', KEYS[1])[1]", ['k'], [], r.call),
        LuaEvalUnsupportedError,
    )
})
