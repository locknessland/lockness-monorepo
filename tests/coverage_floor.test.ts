/**
 * Tests for the per-package coverage-floor tool (#175).
 *
 * @module tests/coverage_floor_test
 */

import { assertEquals } from '@std/assert'
import { aggregateByPackage, parseLcov } from '../scripts/coverage_floor.ts'

const FIXTURE = `SF:/repo/packages/foo/mod.ts
LF:10
LH:4
end_of_record
SF:/repo/packages/foo/mod.ts
LF:10
LH:7
end_of_record
SF:/repo/packages/foo/tests/foo.test.ts
LF:20
LH:20
end_of_record
SF:/repo/packages/bar/a.ts
LF:5
LH:5
end_of_record
SF:/repo/scripts/x.ts
LF:100
LH:0
end_of_record
`

Deno.test('parseLcov - de-duplicates a file to its best (max LH) record', () => {
    const files = parseLcov(FIXTURE)
    assertEquals(files.size, 4)
    // Two records for foo/mod.ts — the one with the most lines hit wins.
    assertEquals(files.get('/repo/packages/foo/mod.ts'), { lf: 10, lh: 7 })
})

Deno.test('aggregateByPackage - excludes test files and non-package paths', () => {
    const pct = aggregateByPackage(parseLcov(FIXTURE))
    // foo: only mod.ts counts (the test file is excluded) -> 7/10 = 70.0
    assertEquals(pct.get('foo'), 70)
    // bar: 5/5 = 100
    assertEquals(pct.get('bar'), 100)
    // scripts/x.ts is not under packages/ -> not aggregated
    assertEquals(pct.has('scripts'), false)
})
