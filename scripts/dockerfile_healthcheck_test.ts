/**
 * @fileoverview The Docker `HEALTHCHECK` (#424): the root `Dockerfile` and the
 * init stub every kit scaffolds carry the same health-check block, and that
 * block polls the liveness route the framework registers — `/health`, never
 * `/ready` (which probes the database) and never `/` (which renders the home
 * page through the whole application middleware stack).
 *
 * The probed path is checked against the routes the `health` bootstrap step
 * actually registers, so renaming the route without the Dockerfiles fails here
 * instead of in a container that restarts forever.
 *
 * @module
 */

import { assert, assertEquals, assertNotEquals } from '@std/assert'
import { type KitName, KITS } from '@lockness/init'
import { healthStep } from '../packages/core/kernel/bootstrap/steps/health.ts'

const ROOT_DOCKERFILE = new URL('../Dockerfile', import.meta.url)
const STUB_DOCKERFILE = new URL(
    '../packages/init/stubs/init/Dockerfile.stub',
    import.meta.url,
)

/**
 * The health-check block: from its `# Health check` comment through the
 * `HEALTHCHECK` instruction and its continuation line.
 */
function healthBlock(dockerfile: string): string {
    const lines = dockerfile.split('\n')
    const start = lines.findIndex((l) => l.startsWith('# Health check'))
    assert(start >= 0, 'no "# Health check" comment')
    const instruction = lines.findIndex(
        (l, i) => i > start && l.startsWith('HEALTHCHECK '),
    )
    assert(instruction > start, 'no HEALTHCHECK instruction after the comment')
    let end = instruction
    while (lines[end].trimEnd().endsWith('\\')) end++
    return lines.slice(start, end + 1).join('\n')
}

/** The URL path the block's `CMD` fetches. */
function probedPath(block: string): string {
    const match = block.match(/fetch\('http:\/\/localhost:8888([^']*)'\)/)
    assert(match !== null, `no fetch('http://localhost:8888…') in:\n${block}`)
    return match[1]
}

/** The paths the `health` bootstrap step registers on the root layer. */
function registeredHealthPaths(): string[] {
    const paths: string[] = []
    const fakeApp = {
        getRootHono: () => ({ get: (path: string) => paths.push(path) }),
    }
    healthStep.run(
        { app: fakeApp, config: {} } as unknown as Parameters<
            typeof healthStep.run
        >[0],
    )
    return paths
}

Deno.test('the root Dockerfile and the init stub share one health-check block', async () => {
    const root = healthBlock(await Deno.readTextFile(ROOT_DOCKERFILE))
    const stub = healthBlock(await Deno.readTextFile(STUB_DOCKERFILE))
    assertEquals(stub, root)
})

Deno.test('the health check polls /health, a route the framework registers', async () => {
    const path = probedPath(
        healthBlock(await Deno.readTextFile(STUB_DOCKERFILE)),
    )
    assertEquals(path, '/health')
    const registered = registeredHealthPaths()
    assert(
        registered.includes(path),
        `${path} is not registered by the health step: ${registered}`,
    )
    // Readiness probes the database; a container check must not.
    assert(registered.includes('/ready'), 'the step no longer serves /ready')
    assertNotEquals(path, '/ready')
})

Deno.test('every kit scaffolds the Dockerfile stub', () => {
    for (const [kit, spec] of Object.entries(KITS)) {
        assert(
            spec.base.includes('Dockerfile.stub'),
            `kit ${kit as KitName} does not scaffold Dockerfile.stub`,
        )
    }
})
