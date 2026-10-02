/**
 * @fileoverview The Dockerfile every kit scaffolds (#424, #503).
 *
 * - **(a)** Every tracked `Dockerfile*` carries the init stub's health-check
 *   block, byte for byte. The monorepo root has no Dockerfile of its own; a
 *   new one must share the block or fail here.
 * - **(b)** The block polls the liveness route the framework registers —
 *   `/health`, never `/ready` (which probes the database) and never `/`
 *   (which renders the home page through the whole middleware stack) — on the
 *   port the container was given, not a hard-coded one. The probed path is
 *   checked against the routes the `health` bootstrap step actually
 *   registers, so renaming the route without the stub fails here instead of in
 *   a container that never turns healthy.
 * - **(c)** Every kit scaffolds the one shared stub, and no kit can override
 *   it: three copies would mean three health blocks and three ways to drift.
 * - **(d)** The stub can build every kit: everything it `COPY`s by name is a
 *   file the kit scaffolds, every kit defines the `build` task it runs, the
 *   `CMD` entrypoint is in the shared base, and its default Deno version is
 *   the floor CI pins. `kits:smoke --registry --docker` proves the same by
 *   building and running each image; this catches the same class of mistake
 *   in milliseconds, on every machine, Docker or not.
 *
 * @module
 */

import { assert, assertEquals } from '@std/assert'
import { parse as parseJsonc } from '@std/jsonc'
import { fromFileUrl } from '@std/path'
import { type KitName, KITS } from '@lockness/init'
import { healthStep } from '../packages/core/kernel/bootstrap/steps/health.ts'

const ROOT = fromFileUrl(new URL('..', import.meta.url))
const STUB_PATH = 'packages/init/stubs/init/Dockerfile.stub'
const STUB_DOCKERFILE = new URL(`../${STUB_PATH}`, import.meta.url)
const KITS_STUBS = new URL('../packages/init/stubs/kits/', import.meta.url)
const TEST_WORKFLOW = new URL('../.github/workflows/test.yml', import.meta.url)
const KIT_NAMES = Object.keys(KITS) as KitName[]

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

/** The URL path the block's `CMD` fetches, on the container's own port. */
function probedPath(block: string): string {
    const match = block.match(
        /fetch\('http:\/\/localhost:\$\{PORT:-8888\}([^']*)'\)/,
    )
    assert(
        match !== null,
        `no fetch('http://localhost:\${PORT:-8888}…') in:\n${block}`,
    )
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

/** Every tracked file whose name starts with `Dockerfile`, repo-relative. */
async function trackedDockerfiles(): Promise<string[]> {
    const { success, stdout, stderr } = await new Deno.Command('git', {
        args: ['ls-files', '--', 'Dockerfile*', '**/Dockerfile*'],
        cwd: ROOT,
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    assert(
        success,
        `git ls-files failed: ${new TextDecoder().decode(stderr).trim()}`,
    )
    return new TextDecoder().decode(stdout).split('\n').filter((l) => l !== '')
}

/** Every file a kit scaffolds, by its scaffolded name. */
function scaffoldedFiles(kit: KitName): Set<string> {
    const { base, overlay, binaries } = KITS[kit]
    return new Set(
        [...base, ...overlay, ...binaries].map((f) => f.replace(/\.stub$/, '')),
    )
}

/** The source operands of every `COPY` in a Dockerfile (no `--from`). */
function copySources(dockerfile: string): string[] {
    const sources: string[] = []
    for (const line of dockerfile.split('\n')) {
        const match = line.match(/^COPY\s+(.+)$/)
        if (match === null) continue
        const operands = match[1].split(/\s+/).filter((o) =>
            !o.startsWith('--')
        )
        sources.push(...operands.slice(0, -1))
    }
    return sources
}

// (a) -----------------------------------------------------------------------

Deno.test('(a) every tracked Dockerfile carries the init stub health-check block', async () => {
    const files = await trackedDockerfiles()
    // Without this, an empty listing (git missing, wrong cwd) passes.
    assert(files.includes(STUB_PATH), `the stub is not tracked: ${files}`)
    const expected = healthBlock(await Deno.readTextFile(STUB_DOCKERFILE))
    for (const file of files) {
        assertEquals(
            healthBlock(await Deno.readTextFile(`${ROOT}${file}`)),
            expected,
            `${file} does not carry the stub's health-check block`,
        )
    }
})

// (b) -----------------------------------------------------------------------

Deno.test('(b) the health check polls /health on $PORT, a route the framework registers', async () => {
    const block = healthBlock(await Deno.readTextFile(STUB_DOCKERFILE))
    const path = probedPath(block)
    assertEquals(path, '/health')
    const registered = registeredHealthPaths()
    assert(
        registered.includes(path),
        `${path} is not registered by the health step: ${registered}`,
    )
    // Shell form, so `sh` expands ${PORT:-8888}; the exec form would fetch
    // that text literally.
    assert(
        /^HEALTHCHECK .*\\\n\s+CMD deno eval "/m.test(block),
        `the HEALTHCHECK CMD is not in shell form:\n${block}`,
    )
})

// (c) -----------------------------------------------------------------------

Deno.test('(c) every kit scaffolds the one shared Dockerfile stub, and none overrides it', async () => {
    for (const kit of KIT_NAMES) {
        assert(
            KITS[kit].base.includes('Dockerfile.stub'),
            `kit ${kit} does not scaffold Dockerfile.stub`,
        )
        assert(
            !KITS[kit].overlay.includes('Dockerfile.stub'),
            `kit ${kit} overrides Dockerfile.stub in its overlay`,
        )
        // Not listed is not enough: an unlisted overlay file is one edit
        // away from being scaffolded over the shared stub.
        let exists = true
        try {
            await Deno.stat(new URL(`${kit}/Dockerfile.stub`, KITS_STUBS))
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) throw error
            exists = false
        }
        assert(!exists, `stubs/kits/${kit}/Dockerfile.stub exists`)
    }
})

// (d) -----------------------------------------------------------------------

Deno.test('(d) every file the stub COPYs by name is one every kit scaffolds', async () => {
    const sources = copySources(await Deno.readTextFile(STUB_DOCKERFILE))
    assert(sources.includes('deno.json'), `no COPY of deno.json: ${sources}`)
    for (const kit of KIT_NAMES) {
        const files = scaffoldedFiles(kit)
        for (const source of sources) {
            // `.` is the whole context; a glob (`deno.lock*`) may match
            // nothing, which is how a lock that is not there yet is optional.
            if (source === '.' || source.includes('*')) continue
            assert(
                files.has(source.replace(/\/$/, '')),
                `${kit} does not scaffold "${source}", which the stub COPYs`,
            )
        }
    }
})

Deno.test('(d) every kit defines the build task the stub runs', async () => {
    const stub = await Deno.readTextFile(STUB_DOCKERFILE)
    assert(
        /^RUN deno task build\b/m.test(stub),
        'the stub no longer runs `deno task build`',
    )
    for (const kit of KIT_NAMES) {
        const config = parseJsonc(
            await Deno.readTextFile(
                new URL(`${kit}/deno.json.stub`, KITS_STUBS),
            ),
        ) as { tasks?: Record<string, string> }
        assert(
            typeof config.tasks?.build === 'string' &&
                config.tasks.build.length > 0,
            `${kit}'s deno.json has no build task`,
        )
    }
})

Deno.test('(d) the CMD entrypoint is a file every kit takes from the shared base', async () => {
    const stub = await Deno.readTextFile(STUB_DOCKERFILE)
    const cmd = stub.match(/^CMD (\[.*\])$/m)
    assert(cmd !== null, 'no exec-form CMD in the stub')
    const args = JSON.parse(cmd[1]) as string[]
    const entry = args[args.length - 1]
    assertEquals(entry, 'main.ts')
    for (const kit of KIT_NAMES) {
        assert(
            KITS[kit].base.includes(`${entry}.stub`),
            `${kit} does not take ${entry} from the shared base`,
        )
    }
})

Deno.test('(d) the build context leaves out every env file but the example, and key files', async () => {
    // `COPY . .` copies the whole project: anything not ignored here lands in
    // an image layer, readable by whoever can pull the image.
    const ignored = (await Deno.readTextFile(
        new URL(
            '../packages/init/stubs/init/.dockerignore.stub',
            import.meta.url,
        ),
    )).split('\n').map((l) => l.trim())
    for (
        const pattern of ['.env*', '!.env.exemple', '*.pem', '*.key', '*.p8']
    ) {
        assert(ignored.includes(pattern), `.dockerignore lacks "${pattern}"`)
    }
    // The negation must come after the pattern it re-includes from.
    assert(
        ignored.indexOf('!.env.exemple') > ignored.indexOf('.env*'),
        '!.env.exemple must follow .env*',
    )
})

Deno.test('(d) the default DENO_VERSION is the floor CI pins', async () => {
    const stub = await Deno.readTextFile(STUB_DOCKERFILE)
    const arg = stub.match(/^ARG DENO_VERSION=(\S+)$/m)
    assert(arg !== null, 'no ARG DENO_VERSION default in the stub')
    const workflow = await Deno.readTextFile(TEST_WORKFLOW)
    const matrix = workflow.match(/deno-version:\s*\[([^\]]*)\]/)
    assert(matrix !== null, 'no deno-version matrix in test.yml')
    const pinned = matrix[1].match(/\d+\.\d+\.\d+/)
    assert(pinned !== null, `no pinned version in ${matrix[1]}`)
    assertEquals(arg[1], pinned[0])
})
