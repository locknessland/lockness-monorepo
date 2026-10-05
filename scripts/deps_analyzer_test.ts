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

import { assertEquals } from '@std/assert'
import { parse } from '@std/jsonc'
import { parsePolicy } from './deps_analyzer.ts'

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

Deno.test('parsePolicy: a reason containing // survives intact', () => {
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

Deno.test('parsePolicy: agrees with the parser publish:check uses', async () => {
    assertEquals<unknown>(
        parsePolicy(POLICY_WITH_SLASHES),
        parse(POLICY_WITH_SLASHES),
    )
    const real = await Deno.readTextFile(
        new URL('../deps.policy.jsonc', import.meta.url),
    )
    assertEquals<unknown>(parsePolicy(real), parse(real))
})
