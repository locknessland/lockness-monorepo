/**
 * @fileoverview `deps:analyze` reads `deps.policy.jsonc` with the same parser
 * as `publish:check` (#469).
 *
 * The policy file is read by two tools. They used to carry two parsers: a
 * regex comment stripper here, `@std/jsonc` there. The regex cut any `//` in a
 * string not preceded by `:`, `"`, `'` or `\`, so a `runtimeImports` reason
 * holding one broke `deps:analyze` loudly while `publish:check` read the same
 * file fine.
 *
 * @module scripts/deps_analyzer_test
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import { parse } from '@std/jsonc'
import {
    findCycles,
    findTierViolations,
    optionalPeersOf,
    type PackageInfo,
    parsePolicy,
    type Policy,
    softEdges,
} from './deps_analyzer.ts'

/** A policy whose only unusual content is a `//` inside a string. */
const POLICY_WITH_SLASHES = `{
    // a line comment
    "tiers": { "foundation": 0 },
    /* a block comment */
    "packages": {
        "cli": {
            "tier": "foundation",
            "allow": [],
            "runtimeImports": {
                "mod.ts": {
                    "sites": 1,
                    "reason": "loads a user module path, e.g. app // command"
                }
            }
        }
    }
}
`

test('parsePolicy: a reason containing // survives intact', () => {
    const policy = parsePolicy(POLICY_WITH_SLASHES) as unknown as {
        packages: {
            cli: { runtimeImports: Record<string, { reason: string }> }
        }
    }
    assertEquals(
        policy.packages.cli.runtimeImports['mod.ts'].reason,
        'loads a user module path, e.g. app // command',
    )
})

test('parsePolicy: agrees with the parser publish:check uses', async () => {
    assertEquals<unknown>(
        parsePolicy(POLICY_WITH_SLASHES),
        parse(POLICY_WITH_SLASHES),
    )
    const real = await Deno.readTextFile(
        new URL('../deps.policy.jsonc', import.meta.url),
    )
    assertEquals<unknown>(parsePolicy(real), parse(real))
})

// =============================================================================
// Soft edges: the fact is package.json, the permission is policy.soft (#591)
// =============================================================================

/** A package as `readPackages` builds it, with optional peers. */
function info(name: string, optionalPeers: string[] = []): PackageInfo {
    return { name, version: '0.4.0', entries: [], optionalPeers }
}

test('optionalPeersOf: only optional @lockness/* peers, by short name', () => {
    assertEquals(
        optionalPeersOf({
            peerDependencies: {
                '@lockness/cache': '^0.4.0',
                '@lockness/session': '^0.4.0',
                'react': '^19',
            },
            peerDependenciesMeta: {
                '@lockness/cache': { optional: true },
                'react': { optional: true },
            },
        }),
        ['cache'],
    )
    assertEquals(optionalPeersOf(null), [])
    assertEquals(optionalPeersOf({}), [])
})

test('softEdges: one soft edge per optional peer a package.json declares', () => {
    assertEquals(
        softEdges(new Map([['mail', info('mail', ['markdown', 'queue'])]])),
        [
            { from: 'mail', to: 'markdown', kind: 'soft', at: '' },
            { from: 'mail', to: 'queue', kind: 'soft', at: '' },
        ],
    )
})

test('check C: an optional peer the policy soft list does not permit is a violation', () => {
    // Before #591 the soft edges were READ from policy.soft, so this check
    // compared the list with itself and could never fail.
    const policy: Policy = {
        tiers: { implementation: 1 },
        packages: {
            mail: { tier: 'implementation', allow: [], soft: ['queue'] },
        },
    }
    const edges = softEdges(
        new Map([['mail', info('mail', ['queue', 'drizzle'])]]),
    )
    assertEquals(findTierViolations(edges, policy), [
        { from: 'mail', to: 'drizzle', kind: 'soft', at: '' },
    ])
})

test('check C: a soft edge is permitted by soft only, never by allow', () => {
    const policy: Policy = {
        tiers: { implementation: 1 },
        packages: {
            mail: { tier: 'implementation', allow: ['queue'] },
        },
    }
    assertEquals(
        findTierViolations(
            softEdges(new Map([['mail', info('mail', ['queue'])]])),
            policy,
        ),
        [{ from: 'mail', to: 'queue', kind: 'soft', at: '' }],
    )
})

test('check A: an optional peer closes a cycle like any edge', () => {
    const edges = [
        { from: 'queue', to: 'mail', kind: 'runtime' as const, at: 'x.ts' },
        ...softEdges(new Map([['mail', info('mail', ['queue'])]])),
    ]
    assertEquals(findCycles(edges).length, 1)
})
