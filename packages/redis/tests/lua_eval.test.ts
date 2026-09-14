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

Deno.test('lua_eval - expands unpack(ARGV, n) into the trailing arguments of a call', () => {
    const r = recorder()
    evalLua(
        "redis.call('HMGET', KEYS[1], unpack(ARGV, 2))",
        ['h'],
        ['10', '', 'a', 'b'],
        r.call,
    )
    assertEquals(r.calls, [['HMGET', ['h', '', 'a', 'b']]])
})

Deno.test('lua_eval - unpack past the end of ARGV expands to no argument', () => {
    const r = recorder()
    evalLua(
        "redis.call('HMGET', KEYS[1], unpack(ARGV, 3))",
        ['h'],
        ['1'],
        r.call,
    )
    assertEquals(r.calls, [['HMGET', ['h']]])
})

Deno.test('lua_eval - THROWS on unpack anywhere but the last argument', () => {
    // Lua truncates a non-final multi-value expression to its first value; a
    // silent full expansion here would pass a script that sends different
    // arguments on a real broker.
    const r = recorder()
    assertThrows(
        () =>
            evalLua(
                "redis.call('HMGET', unpack(ARGV, 2), KEYS[1])",
                ['h'],
                ['1', 'a'],
                r.call,
            ),
        LuaEvalUnsupportedError,
    )
    assertEquals(r.calls.length, 0, 'nothing ran')
})

Deno.test('lua_eval - THROWS on unpack of anything but ARGV', () => {
    assertThrows(
        () =>
            evalLua(
                "redis.call('HMGET', KEYS[1], unpack(KEYS, 1))",
                ['h'],
                [],
                recorder().call,
            ),
        LuaEvalUnsupportedError,
    )
})

Deno.test('lua_eval - returns a table constructor of nested tables, numbers and false', () => {
    const calls: Array<[string, string[]]> = []
    const out = evalLua(
        "local n = redis.call('HLEN', KEYS[1])\n" +
            "local sample = redis.call('HRANDFIELD', KEYS[1], ARGV[1], 'WITHVALUES')\n" +
            "local selves = redis.call('HMGET', KEYS[1], unpack(ARGV, 2))\n" +
            'return {n, sample, selves}',
        ['h'],
        ['1', '', 'a'],
        (command, args) => {
            calls.push([command, args])
            if (command === 'HLEN') return 3
            if (command === 'HRANDFIELD') return ['a', '{"v":1}']
            return [false, '{"v":1}']
        },
    )
    assertEquals(out, [3, ['a', '{"v":1}'], [false, '{"v":1}']])
    assertEquals(calls.map((c) => c[0]), ['HLEN', 'HRANDFIELD', 'HMGET'])
    assertEquals(calls[1][1], ['h', '1', 'WITHVALUES'])
    assertEquals(calls[2][1], ['h', '', 'a'])
})

Deno.test('lua_eval - a number from a call is usable as an argument', () => {
    const r = recorder()
    evalLua(
        "local n = redis.call('HLEN', KEYS[1])\nredis.call('SET', KEYS[1], n)",
        ['k'],
        [],
        (command, args) => command === 'HLEN' ? 4 : r.call(command, args),
    )
    assertEquals(r.calls, [['SET', ['k', '4']]])
})

Deno.test('lua_eval - a table constructor stops at the first nil, as a Redis reply does', () => {
    const out = evalLua(
        'return {ARGV[1], ARGV[9], ARGV[2]}',
        [],
        ['a', 'b'],
        recorder().call,
    )
    assertEquals(out, ['a'])
})

Deno.test('lua_eval - THROWS on a table constructor outside the modelled form', () => {
    assertThrows(
        () => evalLua("return {x = 'a'}", [], [], recorder().call),
        LuaEvalUnsupportedError,
    )
})

Deno.test('lua_eval - THROWS when false is used where a scalar argument is required', () => {
    assertThrows(
        () =>
            evalLua(
                "local v = redis.call('HMGET', KEYS[1], 'f')[1]\n" +
                    "redis.call('SET', KEYS[1], v)",
                ['k'],
                [],
                () => [false],
            ),
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
