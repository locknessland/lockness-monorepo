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

Deno.test("lua_eval - redis.call(...)['ok'] reads a status reply's flattened text (#405)", () => {
    const r = recorder({ TYPE: 'string' })
    const out = evalLua(
        "return redis.call('TYPE', KEYS[1])['ok']",
        ['k'],
        [],
        r.call,
    )
    assertEquals(out, 'string')
})

Deno.test("lua_eval - redis.call(...)['ok'] THROWS when the result is not a string", () => {
    const r = recorder({ TIME: ['1000', '0'] })
    assertThrows(
        () => evalLua("return redis.call('TIME')['ok']", [], [], r.call),
        LuaEvalUnsupportedError,
    )
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

// --- #344 / #345: `==`, `if … end`, `false`, a local's `[n]` -----------------

/** Plan 260 §6 HOLD, verbatim. */
const HOLD_SCRIPT = [
    "local added = redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])",
    "redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])",
    "redis.call('SADD', KEYS[3], ARGV[4])",
    "redis.call('SADD', KEYS[4], ARGV[2])",
    "local n = redis.call('HLEN', KEYS[2])",
    'if added == 1 then',
    '  if n == 1 then',
    '    return 1',
    '  end',
    'end',
    'return 0',
].join('\n')

/** Plan 260 §6 RELEASE, verbatim. */
const RELEASE_SCRIPT = [
    "local mine = redis.call('HGET', KEYS[2], ARGV[2])",
    "local shown = redis.call('HGET', KEYS[1], ARGV[1])",
    "redis.call('HDEL', KEYS[2], ARGV[2])",
    "redis.call('SREM', KEYS[3], ARGV[3])",
    "local n = redis.call('HLEN', KEYS[2])",
    'if n == 0 then',
    "  redis.call('HDEL', KEYS[1], ARGV[1])",
    '  if mine == false then',
    '    return 0',
    '  end',
    '  return 1',
    'end',
    'if shown == mine then',
    "  local promoted = redis.call('HRANDFIELD', KEYS[2], 1, 'WITHVALUES')",
    "  redis.call('HSET', KEYS[1], ARGV[1], promoted[2])",
    'end',
    'return 0',
].join('\n')

/**
 * The few hash/set commands the two scripts issue, over plain maps — with a
 * nil reply handed to Lua as `false`, the callback's contract.
 */
function slotStore() {
    const hashes = new Map<string, Map<string, string>>()
    const sets = new Map<string, Set<string>>()
    const calls: Array<[string, string[]]> = []
    const hash = (key: string) => {
        let h = hashes.get(key)
        if (!h) hashes.set(key, h = new Map())
        return h
    }
    const call = (command: string, args: string[]) => {
        calls.push([command, args])
        const [key, a, b] = args
        switch (command) {
            case 'HSET': {
                const added = hash(key).has(a) ? 0 : 1
                hash(key).set(a, b)
                return added
            }
            case 'HGET':
                return hashes.get(key)?.get(a) ?? false
            case 'HDEL':
                return hashes.get(key)?.delete(a) ? 1 : 0
            case 'HLEN':
                return hashes.get(key)?.size ?? 0
            case 'HRANDFIELD': {
                const first = [...(hashes.get(key) ?? [])][0]
                return first ? [first[0], first[1]] : []
            }
            case 'SADD': {
                let s = sets.get(key)
                if (!s) sets.set(key, s = new Set())
                const added = s.has(a) ? 0 : 1
                s.add(a)
                return added
            }
            case 'SREM':
                return sets.get(key)?.delete(a) ? 1 : 0
            default:
                throw new Error(`slotStore: unmodelled ${command}`)
        }
    }
    return { hashes, sets, calls, call }
}

const HOLD_KEYS = ['presence', 'holders', 'owned:A', 'instances']
const holdArgv = (instance: string, entry: string) => [
    '7',
    instance,
    entry,
    `ch 7`,
]
const RELEASE_KEYS = ['presence', 'holders', 'owned:A']

Deno.test('lua_eval - HOLD script: the first holder reports 1 (arrived)', () => {
    const s = slotStore()
    const out = evalLua(HOLD_SCRIPT, HOLD_KEYS, holdArgv('A', 'e-A'), s.call)
    assertEquals(out, 1)
    assertEquals(s.hashes.get('holders'), new Map([['A', 'e-A']]))
    assertEquals(s.hashes.get('presence'), new Map([['7', 'e-A']]))
    assertEquals(s.sets.get('instances'), new Set(['A']))
})

Deno.test('lua_eval - HOLD script: a second instance adds a holder and reports 0', () => {
    const s = slotStore()
    evalLua(HOLD_SCRIPT, HOLD_KEYS, holdArgv('A', 'e-A'), s.call)
    const out = evalLua(HOLD_SCRIPT, HOLD_KEYS, holdArgv('B', 'e-B'), s.call)
    // added == 1 but n == 2: the inner `if` is not taken, the outer block ends
    // without a return, and the final `return 0` runs.
    assertEquals(out, 0)
    assertEquals(s.hashes.get('holders')?.size, 2)
})

Deno.test('lua_eval - HOLD script: a re-hold by the same instance reports 0', () => {
    const s = slotStore()
    evalLua(HOLD_SCRIPT, HOLD_KEYS, holdArgv('A', 'e-A'), s.call)
    const out = evalLua(HOLD_SCRIPT, HOLD_KEYS, holdArgv('A', 'e-A2'), s.call)
    assertEquals(out, 0, 'added == 0: the outer `if` is not taken')
    assertEquals(s.hashes.get('presence')?.get('7'), 'e-A2')
})

Deno.test('lua_eval - RELEASE script: the last holder deletes the field and reports 1', () => {
    const s = slotStore()
    evalLua(HOLD_SCRIPT, HOLD_KEYS, holdArgv('A', 'e-A'), s.call)
    const out = evalLua(
        RELEASE_SCRIPT,
        RELEASE_KEYS,
        ['7', 'A', 'ch 7'],
        s.call,
    )
    assertEquals(out, 1)
    assertEquals(s.hashes.get('presence')?.has('7'), false)
    assertEquals(s.sets.get('owned:A')?.has('ch 7'), false)
})

Deno.test('lua_eval - RELEASE script: a non-holder on an empty slot reports 0 (mine == false)', () => {
    const s = slotStore()
    const out = evalLua(
        RELEASE_SCRIPT,
        RELEASE_KEYS,
        ['7', 'A', 'ch 7'],
        s.call,
    )
    assertEquals(out, 0)
    assertEquals(
        s.calls.map((c) => c[0]),
        ['HGET', 'HGET', 'HDEL', 'SREM', 'HLEN', 'HDEL'],
    )
})

Deno.test('lua_eval - RELEASE script: releasing the SHOWN holder copies a remaining one in', () => {
    const s = slotStore()
    evalLua(HOLD_SCRIPT, HOLD_KEYS, holdArgv('A', 'e-A'), s.call)
    evalLua(HOLD_SCRIPT, HOLD_KEYS, holdArgv('B', 'e-B'), s.call)
    // B wrote last, so the shown entry is B's; B releases.
    const out = evalLua(
        RELEASE_SCRIPT,
        RELEASE_KEYS,
        ['7', 'B', 'ch 7'],
        s.call,
    )
    assertEquals(out, 0)
    assertEquals(s.hashes.get('presence')?.get('7'), 'e-A', 'promoted[2]')
    const random = s.calls.find((c) => c[0] === 'HRANDFIELD')
    assertEquals(random?.[1], ['holders', '1', 'WITHVALUES'])
})

Deno.test('lua_eval - RELEASE script: releasing a holder that is NOT shown copies nothing', () => {
    const s = slotStore()
    evalLua(HOLD_SCRIPT, HOLD_KEYS, holdArgv('A', 'e-A'), s.call)
    evalLua(HOLD_SCRIPT, HOLD_KEYS, holdArgv('B', 'e-B'), s.call)
    const out = evalLua(
        RELEASE_SCRIPT,
        RELEASE_KEYS,
        ['7', 'A', 'ch 7'],
        s.call,
    )
    assertEquals(out, 0)
    assertEquals(s.hashes.get('presence')?.get('7'), 'e-B')
    assertEquals(s.calls.some((c) => c[0] === 'HRANDFIELD'), false)
})

Deno.test("lua_eval - == is type-strict: '1' == 1 is false", () => {
    const script = "if ARGV[1] == 1 then\nreturn 'equal'\nend\nreturn 'differ'"
    assertEquals(evalLua(script, [], ['1'], recorder().call), 'differ')
    const byNumber = "local n = redis.call('HLEN', KEYS[1])\n" +
        "if n == 1 then\nreturn 'equal'\nend\nreturn 'differ'"
    assertEquals(evalLua(byNumber, ['h'], [], () => 1), 'equal')
    assertEquals(evalLua(byNumber, ['h'], [], () => '1'), 'differ')
})

Deno.test('lua_eval - a numeric literal is a number, returned as one', () => {
    assertEquals(evalLua('return 1', [], [], recorder().call), 1)
})

Deno.test('lua_eval - false is a literal, equal only to false', () => {
    const script = "local v = redis.call('HGET', KEYS[1], 'f')\n" +
        "if v == false then\nreturn 'absent'\nend\nreturn 'present'"
    assertEquals(evalLua(script, ['h'], [], () => false), 'absent')
    assertEquals(evalLua(script, ['h'], [], () => ''), 'present')
    assertEquals(evalLua(script, ['h'], [], () => 0), 'present')
})

Deno.test('lua_eval - a return nested two blocks deep ends the script', () => {
    const r = recorder()
    const out = evalLua(
        "if 1 == 1 then\nif 'a' == 'a' then\nreturn 'inner'\nend\n" +
            "redis.call('SET', 'x', 'y')\nend\nreturn 'outer'",
        [],
        [],
        r.call,
    )
    assertEquals(out, 'inner')
    assertEquals(r.calls.length, 0, 'nothing after the return ran')
})

Deno.test('lua_eval - indexes a bound local, 1-based', () => {
    const out = evalLua(
        "local pair = redis.call('HRANDFIELD', KEYS[1], 1, 'WITHVALUES')\n" +
            'return pair[2]',
        ['h'],
        [],
        () => ['field', 'value'],
    )
    assertEquals(out, 'value')
})

Deno.test('lua_eval - THROWS when indexing a local that is not a table', () => {
    assertThrows(
        () =>
            evalLua(
                "local n = redis.call('HLEN', KEYS[1])\nreturn n[1]",
                ['h'],
                [],
                () => 3,
            ),
        LuaEvalUnsupportedError,
    )
})

Deno.test('lua_eval - THROWS on a return that is not the last statement of its block', () => {
    const r = recorder()
    assertThrows(
        () =>
            evalLua(
                "redis.call('SET', 'a', 'b')\nreturn 1\nredis.call('SET', 'c', 'd')",
                [],
                [],
                r.call,
            ),
        LuaEvalUnsupportedError,
    )
    assertEquals(r.calls.length, 0, 'refused at parse, nothing ran')
})

Deno.test('lua_eval - THROWS on every operator but ==', () => {
    for (
        const condition of [
            'ARGV[1] ~= 1',
            'ARGV[1] > 1',
            'ARGV[1] < 1',
            'ARGV[1] == 1 and ARGV[1] == 2',
            'ARGV[1] == 1 or ARGV[1] == 2',
            'not ARGV[1] == 1',
            'ARGV[1]',
        ]
    ) {
        assertThrows(
            () =>
                evalLua(
                    `if ${condition} then\nreturn 1\nend\nreturn 0`,
                    [],
                    ['1'],
                    recorder().call,
                ),
            LuaEvalUnsupportedError,
            undefined,
            condition,
        )
    }
})

Deno.test('lua_eval - THROWS on else, a missing end, a stray end and a loop', () => {
    for (
        const script of [
            'if 1 == 1 then\nreturn 1\nelse\nreturn 0\nend',
            'if 1 == 1 then\nreturn 1\nelseif 2 == 2 then\nreturn 2\nend',
            "if 1 == 1 then\nredis.call('SET', 'a', 'b')",
            "redis.call('SET', 'a', 'b')\nend",
            'if 1 == 1 then return 1 end',
            'while 1 == 1 do\nend',
        ]
    ) {
        const r = recorder()
        assertThrows(
            () => evalLua(script, [], [], r.call),
            LuaEvalUnsupportedError,
            undefined,
            script,
        )
        assertEquals(r.calls.length, 0, `nothing ran: ${script}`)
    }
})

Deno.test('lua_eval - THROWS on an unmodelled statement even in a branch not taken', () => {
    assertThrows(
        () =>
            evalLua(
                "if 1 == 2 then\nredis.pcall('DEL', 'x')\nend\nreturn 0",
                [],
                [],
                recorder().call,
            ),
        LuaEvalUnsupportedError,
    )
})

// A real broker compiles the whole script before running a line of it, so each
// of these is rejected however the branch would have gone. A check of statement
// SHAPE alone let all three through. One row each, so each is proven on its own.
for (
    const statement of [
        'local x = ARGV[1] or ARGV[2]',
        "redis.call('HSET', KEYS[1]",
        'if ARGV[1] == ARGV[2] or ARGV[3] then\nreturn 1\nend',
    ]
) {
    Deno.test(`lua_eval - THROWS at parse on \`${statement}\` in a branch not taken`, () => {
        const r = recorder()
        assertThrows(
            () =>
                evalLua(
                    `if 1 == 2 then\n${statement}\nend\nreturn 0`,
                    ['k'],
                    ['a', 'b', 'c'],
                    r.call,
                ),
            LuaEvalUnsupportedError,
            undefined,
            statement,
        )
        assertEquals(r.calls.length, 0, `nothing ran: ${statement}`)
    })
}

Deno.test('lua_eval - arithmetic yields a NUMBER, comparable to a numeric literal', () => {
    const script = "local n = redis.call('HLEN', KEYS[1]) - 1\n" +
        "if n == 0 then\nreturn 'empty'\nend\nreturn 'held'"
    assertEquals(evalLua(script, ['h'], [], () => 1), 'empty')
    assertEquals(evalLua(script, ['h'], [], () => 2), 'held')
})

Deno.test('lua_eval - a returned sum is an integer reply, not a bulk string', () => {
    const out = evalLua(
        "local n = redis.call('HLEN', KEYS[1])\nreturn n + 1",
        ['h'],
        [],
        () => 4,
    )
    assertEquals(out, 5)
})

Deno.test('lua_eval - + and - associate to the left, as Lua does', () => {
    assertEquals(evalLua('return 10 - 3 + 2', [], [], recorder().call), 9)
})

Deno.test('lua_eval - THROWS on a table or a call as a comparison operand', () => {
    assertThrows(
        () =>
            evalLua(
                "local t = redis.call('HRANDFIELD', KEYS[1], 1, 'WITHVALUES')\n" +
                    'if t == t then\nreturn 1\nend\nreturn 0',
                ['h'],
                [],
                () => ['f', 'v'],
            ),
        LuaEvalUnsupportedError,
    )
    assertThrows(
        () =>
            evalLua(
                "if redis.call('HLEN', KEYS[1]) == 0 then\nreturn 1\nend\nreturn 0",
                ['h'],
                [],
                () => 0,
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
