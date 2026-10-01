#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-net
/**
 * @fileoverview Scaffold each starter kit and prove it actually works.
 *
 * A kit is a promise that `deno run -A jsr:@lockness/init my-app --kit=<name>`
 * gives someone a project that boots. Nothing else in the repository checks
 * that promise: the framework's own suite tests the framework, and the stub
 * files are inert text until something scaffolds them.
 *
 * Each kit is taken through the steps a new user takes, in order — scaffold,
 * type-check, test, boot — and the first failure stops that kit. A kit that
 * ships migrations also runs its `db:generate` before booting, which must
 * report no schema changes (#444).
 *
 * **The scaffold is re-pointed at this working tree** before anything runs.
 * Left alone it would resolve `jsr:@lockness/core@^0.4.0` and test the *last
 * release*, which is exactly the version that cannot contain the change you
 * are about to push.
 *
 * **That re-pointing is also this mode's blind spot.** It loads the raw source.
 * A user loads what `deno publish` uploaded, which is rewritten (it writes a
 * `@jsxImportSource` pragma into every `.tsx`, among other things) and resolved
 * through `jsr:` up front. `deno task publish:check` does not cover that
 * either: it type-checks and analyses each package's graph, and loads no
 * module at runtime. v0.4.0 passed both, and its api and slim kits could not
 * start (#470).
 *
 * **`--registry` is the mode that covers it.** It `deno publish`es
 * `git archive HEAD` into a localhost JSR registry (`scripts/local_jsr.ts`),
 * scaffolds each kit from `jsr:@lockness/init` without re-pointing it, and
 * boots it with `JSR_URL` set and a fresh `DENO_DIR`. Then it asks for an
 * unknown path and expects core's HTML 404, and fails the kit if the registry
 * was asked for any of the kit's own files — the sign that core resolved an
 * app-local import against its own URL (#474). Then it runs the kit's
 * `router:list`, which must list a route the kit defines, under the same rule:
 * the first step where the cli package, loaded from the registry, imports an
 * app file (#477). Only `HEAD` is tested, never
 * uncommitted edits. It does not type-check or test the kits: the default mode
 * does that.
 *
 * @example
 * ```bash
 * deno task kits:smoke              # all kits, against the working tree
 * deno task kits:smoke --kit slim   # one of them
 * deno task kits:smoke --keep       # leave the scaffolds on disk to poke at
 * deno task kits:smoke --registry   # all kits, from what deno publish ships
 * ```
 *
 * @module
 */

import { parseArgs } from '@std/cli'
import { parse as parseJsonc } from '@std/jsonc'
import { fromFileUrl, join } from '@std/path'
import { type KitName, KITS } from '@lockness/init'
import { MIGRATIONS_DIR, readTree, shipsMigrations } from './kit_migrations.ts'
import {
    assertLoopbackUrl,
    type LocalJsr,
    type LocalJsrStore,
    startLocalJsr,
} from './local_jsr.ts'

// From this file, not the working directory: the live-postgres suite imports
// `scaffoldKit`, and a test runner's cwd is not this script's to assume.
const ROOT = fromFileUrl(new URL('..', import.meta.url))
const PACKAGES = join(ROOT, 'packages')

/** How long a kit's server gets to answer before the boot step fails. */
const BOOT_TIMEOUT_MS = 30_000

/** How long a stopped server's pipes get to reach EOF before being cancelled. */
const DRAIN_GRACE_MS = 2_000

/** What one step produced. */
export interface StepResult {
    readonly ok: boolean
    readonly detail: string
}

/**
 * Every child process a run has started and not yet reaped, so a signal
 * handler can kill them all. A server left running after the script exits
 * holds its port and its temp directory, and has bitten this repo.
 *
 * Once {@link ChildTracker.abort} is called it also refuses to spawn: a
 * signal arrives while the kit loop is still going, and a child spawned
 * after the kill sweep would otherwise outlive the script.
 *
 * @example
 * ```ts
 * const tracker = new ChildTracker()
 * const child = tracker.spawn(new Deno.Command('sleep', { args: ['60'] }))
 * tracker.abort() // kills it; any later spawn returns undefined
 * ```
 */
export class ChildTracker {
    readonly #live = new Set<Deno.ChildProcess>()
    #aborted = false

    /** Whether {@link abort} was called. */
    get aborted(): boolean {
        return this.#aborted
    }

    /**
     * Spawn and track a child, unless aborted.
     *
     * @param command - The command to spawn.
     * @returns The child, or `undefined` once aborted.
     */
    spawn(command: Deno.Command): Deno.ChildProcess | undefined {
        if (this.#aborted) return undefined
        const child = command.spawn()
        this.#live.add(child)
        child.status.then(
            () => this.#live.delete(child),
            () => this.#live.delete(child),
        )
        return child
    }

    /** SIGKILL every child still running. Safe to call more than once. */
    killAll(): void {
        for (const child of this.#live) {
            try {
                child.kill('SIGKILL')
            } catch {
                // Exited between the check and the kill: nothing to stop.
            }
        }
    }

    /** Refuse every later spawn, then kill every live child. */
    abort(): void {
        this.#aborted = true
        this.killAll()
    }
}

/** The tracker this script's own runs use. */
const children = new ChildTracker()

/**
 * Run a command inside a directory and capture everything it said.
 *
 * @param cmd - Executable.
 * @param args - Arguments.
 * @param cwd - Working directory.
 * @param env - Variables added to (and overriding) the inherited environment.
 * @returns Success, and the combined output for a failure message; a
 * failure without spawning once the run is aborted.
 */
async function run(
    cmd: string,
    args: string[],
    cwd: string,
    env?: Record<string, string>,
): Promise<{ ok: boolean; output: string }> {
    const child = children.spawn(
        new Deno.Command(cmd, {
            args,
            cwd,
            env,
            stdout: 'piped',
            stderr: 'piped',
        }),
    )
    if (child === undefined) {
        return { ok: false, output: `aborted: ${cmd} not started` }
    }
    const { success, stdout, stderr } = await child.output()
    const decode = new TextDecoder()
    return {
        ok: success,
        output: decode.decode(stdout) + decode.decode(stderr),
    }
}

/** The last few lines of output, which is where the actual error is. */
function tail(output: string, lines = 12): string {
    return output.trimEnd().split('\n').slice(-lines).map((l) => `      ${l}`)
        .join('\n')
}

/**
 * Repoint a scaffolded project's `@lockness/*` imports at this working tree.
 *
 * @param dir - The scaffolded project.
 * @returns How many specifiers were rewritten.
 * @throws {Error} If a kit names a package this repository does not have —
 * a typo in a `deno.json.stub` that would otherwise surface as a confusing
 * resolution error much later.
 *
 * @example
 * ```ts
 * await useLocalWorkspace('/tmp/lockness-kits-x/web-app') // 8
 * ```
 */
export async function useLocalWorkspace(dir: string): Promise<number> {
    const path = join(dir, 'deno.json')
    const config = JSON.parse(await Deno.readTextFile(path)) as {
        imports?: Record<string, string>
    }

    let rewritten = 0
    for (const specifier of Object.keys(config.imports ?? {})) {
        if (!specifier.startsWith('@lockness/')) continue
        // `@lockness/auth-provider/drizzle` is a subpath export, and every one
        // of them resolves to `<sub>/mod.ts` inside the package. Mapping only
        // the bare name would leave a kit's subpath imports pointing at JSR
        // while the rest of it points here — half-local, and the mismatch
        // shows up as a type error nobody can place.
        const [name, ...sub] = specifier.slice('@lockness/'.length).split('/')
        const mod = join(PACKAGES, name, ...sub, 'mod.ts')
        try {
            await Deno.stat(mod)
        } catch {
            throw new Error(
                `The kit imports "${specifier}", which is not a package in this workspace (${mod}).`,
            )
        }
        config.imports![specifier] = mod
        rewritten++
    }

    await Deno.writeTextFile(path, `${JSON.stringify(config, null, 4)}\n`)
    return rewritten
}

/** Options for {@link boots}; every field defaults to the working-tree smoke. */
export interface BootOptions {
    /** Variables added to (and overriding) the inherited environment. */
    readonly env?: Record<string, string>
    /** How long the server gets to answer `/`. */
    readonly timeoutMs?: number
    /**
     * A further check run while the server is still up, once `/` answered.
     * Receives the origin (`http://localhost:<port>`).
     */
    readonly probe?: (origin: string) => Promise<StepResult>
    /** Which tracker spawns the server; this script's own by default. */
    readonly tracker?: ChildTracker
}

/**
 * Start the app, ask it for `/`, optionally probe it further, and stop it.
 *
 * Polling rather than sleeping: a fixed wait is either flaky on a cold cache
 * or slow on a warm one, and this has to run in CI. A server that exits before
 * answering fails at once, with the end of what it printed — that is where a
 * module-load error such as #470's "Unsupported scheme" shows up.
 *
 * @param dir - The scaffolded project.
 * @param port - A port nothing else is using.
 * @param options - Environment, timeout and an extra probe.
 * @returns Whether the server answered (and the probe passed).
 *
 * @example
 * ```ts
 * await boots('/tmp/lockness-kits-x/api-app', 8931)
 * // { ok: true, detail: 'HTTP 200 in 912ms' }
 * ```
 */
export async function boots(
    dir: string,
    port: number,
    options: BootOptions = {},
): Promise<StepResult> {
    const timeoutMs = options.timeoutMs ?? BOOT_TIMEOUT_MS
    const child = (options.tracker ?? children).spawn(
        new Deno.Command(Deno.execPath(), {
            args: ['run', '-A', 'main.ts'],
            cwd: dir,
            env: { ...options.env, PORT: String(port) },
            stdout: 'piped',
            stderr: 'piped',
        }),
    )
    if (child === undefined) {
        return { ok: false, detail: 'aborted: the server was not started' }
    }

    // Drained as it arrives: an unread pipe fills up and stalls a chatty
    // server, and the text is the failure message when the server dies.
    let output = ''
    // A grandchild that inherited the pipes keeps them open after the server
    // is killed; this lets the wait for EOF be cut short.
    const stopDrain = new AbortController()
    const drain = async (stream: ReadableStream<Uint8Array<ArrayBuffer>>) => {
        try {
            for await (
                const text of stream.pipeThrough(new TextDecoderStream(), {
                    signal: stopDrain.signal,
                })
            ) {
                output += text
            }
        } catch (error) {
            if (!stopDrain.signal.aborted) throw error
        }
    }
    const drained = Promise.all([drain(child.stdout), drain(child.stderr)])
    let exited: Deno.CommandStatus | undefined
    const status = child.status.then((s) => {
        exited = s
        return s
    })

    const origin = `http://localhost:${port}`
    const started = Date.now()
    let lastError = 'never answered'
    try {
        while (Date.now() - started < timeoutMs) {
            if (exited !== undefined) {
                return {
                    ok: false,
                    detail:
                        `exited with code ${exited.code} before answering\n${
                            tail(output, 20)
                        }`,
                }
            }
            try {
                const response = await fetch(`${origin}/`)
                // Drain it, or the connection keeps the process alive.
                await response.text()
                if (response.ok) {
                    const answered = `HTTP ${response.status} in ${
                        Date.now() - started
                    }ms`
                    if (options.probe === undefined) {
                        return { ok: true, detail: answered }
                    }
                    const probed = await options.probe(origin)
                    return {
                        ok: probed.ok,
                        detail: `${answered}; ${probed.detail}`,
                    }
                }
                lastError = `HTTP ${response.status}`
            } catch (error) {
                lastError = (error as Error).message
            }
            await new Promise((resolve) => setTimeout(resolve, 400))
        }
        return {
            ok: false,
            detail: `${lastError} within ${timeoutMs}ms\n${tail(output)}`,
        }
    } finally {
        if (exited === undefined) {
            try {
                child.kill('SIGKILL')
            } catch {
                // Exited between the check and the kill: nothing to stop.
            }
        }
        // Awaited so the pipes close and the sanitizer stays quiet, but only
        // for DRAIN_GRACE_MS: past that, the pipes are cancelled.
        await status
        let timer: ReturnType<typeof setTimeout> | undefined
        const grace = new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), DRAIN_GRACE_MS)
        })
        const outcome = await Promise.race([
            drained.then(() => 'drained' as const),
            grace,
        ])
        clearTimeout(timer)
        if (outcome === 'timeout') {
            stopDrain.abort()
            await drained
        }
    }
}

/**
 * Run the app's own `db:generate` and require it to find nothing to do (#444).
 *
 * The shipped migrations folder carries drizzle-kit's snapshot of the shipped
 * schema, so a fresh app's first `db:generate` must report no changes. If it
 * writes a migration instead, the user's first migration of their own would
 * re-create `users` and fail. It also proves the command is registered at all:
 * without `lockness.packages`, `db:generate` is an unknown command.
 *
 * @param dir - The scaffolded project.
 * @returns Whether drizzle-kit reported no changes and wrote no file.
 */
async function generatesNothing(dir: string): Promise<StepResult> {
    const folder = join(dir, MIGRATIONS_DIR)
    const before = await readTree(folder)
    const generate = await run(
        Deno.execPath(),
        ['task', 'cli', 'db:generate'],
        dir,
    )
    if (!generate.ok) return { ok: false, detail: `\n${tail(generate.output)}` }
    if (!generate.output.includes('No schema changes')) {
        return {
            ok: false,
            detail: `did not report "No schema changes"\n${
                tail(generate.output)
            }`,
        }
    }
    const after = await readTree(folder)
    const written = [...after.keys()].filter((path) => !before.has(path))
    if (written.length > 0 || after.size !== before.size) {
        return { ok: false, detail: `wrote ${written.join(', ')}` }
    }
    return { ok: true, detail: 'no schema changes' }
}

/** What {@link scaffoldKit} produced. */
export interface ScaffoldResult {
    /** Whether `init` exited 0. */
    readonly ok: boolean
    /** What `init` printed, for a failure message. */
    readonly output: string
    /** The project directory. */
    readonly dir: string
    /**
     * How many `@lockness/*` imports were repointed; 0 when `ok` is false or
     * when the scaffold was left on the registry (`local: false`).
     */
    readonly rewritten: number
}

/** Options for {@link scaffoldKit}; the defaults are the working-tree smoke. */
export interface ScaffoldOptions {
    /**
     * The `init` module to run — this working tree's `packages/init/mod.ts`
     * by default, or a `jsr:` specifier to scaffold the way a user does.
     */
    readonly entry?: string
    /** Variables added to (and overriding) the inherited environment. */
    readonly env?: Record<string, string>
    /**
     * Repoint the project's `@lockness/*` imports at this working tree
     * (default `true`). `false` leaves them on the registry, which is the
     * whole point of `kits:smoke --registry`.
     */
    readonly local?: boolean
}

/**
 * Scaffold a kit the way a user does — `init`'s own entry point, in a
 * subprocess — and, by default, repoint it at this working tree.
 *
 * @param kit - The kit.
 * @param workdir - The directory to scaffold into.
 * @param options - Which `init` to run, its environment, and whether to
 * repoint the result at the working tree.
 * @returns The outcome; the project is at `<workdir>/<kit>-app`.
 * @throws {Error} When the kit imports a package this workspace lacks.
 *
 * @example
 * ```ts
 * const { ok, dir } = await scaffoldKit('api', await Deno.makeTempDir())
 * ```
 */
export async function scaffoldKit(
    kit: KitName,
    workdir: string,
    options: ScaffoldOptions = {},
): Promise<ScaffoldResult> {
    const name = `${kit}-app`
    const dir = join(workdir, name)
    const scaffold = await run(
        Deno.execPath(),
        [
            'run',
            '-A',
            options.entry ?? join(PACKAGES, 'init', 'mod.ts'),
            name,
            '--kit',
            kit,
        ],
        workdir,
        options.env,
    )
    if (!scaffold.ok) {
        return { ok: false, output: scaffold.output, dir, rewritten: 0 }
    }
    const rewritten = options.local === false ? 0 : await useLocalWorkspace(dir)
    return { ok: true, output: scaffold.output, dir, rewritten }
}

/**
 * Take one kit through scaffold → check → test → db:generate → boot.
 *
 * @param kit - The kit to exercise.
 * @param workdir - Where to scaffold it.
 * @param port - The port its boot probe may use.
 * @returns Whether every step passed.
 */
async function smoke(
    kit: KitName,
    workdir: string,
    port: number,
): Promise<boolean> {
    console.log(`\n🎒 ${kit} — ${KITS[kit].summary}`)

    const { ok, output, dir, rewritten } = await scaffoldKit(kit, workdir)
    if (!ok) {
        console.log(`  ❌ scaffold\n${tail(output)}`)
        return false
    }
    console.log('  ✅ scaffold')
    console.log(
        `  ✅ repointed ${rewritten} @lockness/* import(s) at ./packages`,
    )

    const check = await run(Deno.execPath(), ['check', '.'], dir)
    if (!check.ok) {
        console.log(`  ❌ deno check\n${tail(check.output)}`)
        return false
    }
    console.log('  ✅ deno check')

    const test = await run(Deno.execPath(), ['task', 'test'], dir)
    if (!test.ok) {
        console.log(`  ❌ deno task test\n${tail(test.output)}`)
        return false
    }
    console.log(
        `  ✅ deno task test — ${
            test.output.trimEnd().split('\n').filter((l) =>
                l.includes('passed')
            )
                .pop()?.trim() ?? 'passed'
        }`,
    )

    if (shipsMigrations(kit)) {
        const generated = await generatesNothing(dir)
        console.log(
            `  ${generated.ok ? '✅' : '❌'} db:generate — ${generated.detail}`,
        )
        if (!generated.ok) return false
    }

    const booted = await boots(dir, port)
    console.log(
        `  ${booted.ok ? '✅' : '❌'} boots — ${booted.detail}`,
    )
    return booted.ok
}

// ---------------------------------------------------------------------------
// `--registry`: boot each kit against what `deno publish` would ship (#470)
// ---------------------------------------------------------------------------

/**
 * How long a kit gets to answer in `--registry` mode. Longer than the
 * working-tree boot: its `DENO_DIR` is empty, so the first boot downloads
 * every dependency the kit has before it can listen.
 */
const REGISTRY_BOOT_TIMEOUT_MS = 180_000

/** The path the 404 probe asks for; no kit routes it. */
export const MISSING_PATH = '/__lockness_kit_gate_missing__'

/** A workspace member that `deno publish` uploads. */
export interface PublishableMember {
    /** `@lockness/<name>`. */
    readonly name: string
    /** Its version. */
    readonly version: string
}

/** Whether a value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read the first of `deno.json` / `deno.jsonc` in a directory. */
async function readDenoConfig(dir: string): Promise<unknown> {
    for (const file of ['deno.json', 'deno.jsonc']) {
        try {
            return parseJsonc(await Deno.readTextFile(join(dir, file)))
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) throw error
        }
    }
    throw new Error(`no deno.json or deno.jsonc in ${dir}`)
}

/**
 * Every workspace member `deno publish` uploads: those with a `@lockness/`
 * name, a version and `exports`. The demo app under `packages/vite/demo` has
 * no `exports`, so it is not one.
 *
 * @param root - The workspace root.
 * @returns The members, in workspace order.
 * @throws {Error} When the root or a member has no readable config.
 *
 * @example
 * ```ts
 * (await publishableMembers(ROOT)).find((m) => m.name === '@lockness/core')
 * // { name: '@lockness/core', version: '0.4.0' }
 * ```
 */
export async function publishableMembers(
    root: string,
): Promise<PublishableMember[]> {
    const config = await readDenoConfig(root)
    const workspace = isRecord(config) && Array.isArray(config.workspace)
        ? config.workspace.filter((m): m is string => typeof m === 'string')
        : []
    const members: PublishableMember[] = []
    for (const member of workspace) {
        const pkg = await readDenoConfig(join(root, member))
        if (
            isRecord(pkg) && typeof pkg.name === 'string' &&
            pkg.name.startsWith('@lockness/') &&
            typeof pkg.version === 'string' && pkg.exports !== undefined
        ) {
            members.push({ name: pkg.name, version: pkg.version })
        }
    }
    return members
}

/**
 * The members the registry did not receive. `deno publish` can exit 0 while
 * skipping a package, and a kit importing a missing one would then fail with
 * a 404 that reads like a resolution bug.
 *
 * @param expected - What should have been published.
 * @param store - What the registry holds.
 * @returns `name@version` of every member missing from the store.
 *
 * @example
 * ```ts
 * missingFromRegistry([{ name: '@lockness/core', version: '0.4.0' }], store)
 * // ['@lockness/core@0.4.0'] when it never arrived
 * ```
 */
export function missingFromRegistry(
    expected: readonly PublishableMember[],
    store: LocalJsrStore,
): string[] {
    return expected
        .filter((m) =>
            store.get(m.name.slice('@lockness/'.length), m.version) ===
                undefined
        )
        .map((m) => `${m.name}@${m.version}`)
}

/**
 * Judge the answer to {@link MISSING_PATH}: the framework's HTML 404 page.
 *
 * Asking for it renders core's default error view at runtime — the module
 * #470 broke — which `/` alone never reaches in a kit with its own home page.
 *
 * @param status - The HTTP status.
 * @param contentType - The `content-type` header, if any.
 * @param body - The body, for a failure message.
 * @returns Pass only for a 404 served as `text/html`.
 *
 * @example
 * ```ts
 * judgeNotFound(404, 'text/html; charset=UTF-8', '<html>…').ok // true
 * judgeNotFound(500, 'text/plain', 'Internal Server Error').ok   // false
 * ```
 */
export function judgeNotFound(
    status: number,
    contentType: string | null,
    body: string,
): StepResult {
    const type = contentType ?? 'no content-type'
    if (status === 404 && type.toLowerCase().includes('text/html')) {
        return { ok: true, detail: `${MISSING_PATH} → HTML 404` }
    }
    return {
        ok: false,
        detail: `${MISSING_PATH} → HTTP ${status} (${type}), expected an ` +
            `HTML 404\n${tail(body, 8)}`,
    }
}

/**
 * The registry log lines that name a path inside the app (#474).
 *
 * The registry serves packages and nothing else, so a request for one of the
 * app's own files means core resolved an app-local import against its own URL
 * instead of the app root. The import fails quietly enough that the kit still
 * boots, which is how the #470 slim run logged
 * `404 GET //<tmp>/slim-app/app/middleware/example_middleware.ts` and passed.
 *
 * @param lines - What the registry logged while the kit ran.
 * @param appDirs - The kit's directory, in every spelling its process may use
 * (the path as created and its realpath, which differ under macOS `/var`).
 * @returns The offending lines, in order; empty when none.
 *
 * @example
 * ```ts
 * appPathRequests(['404 GET //tmp/a/app/x.ts (not served)'], ['/tmp/a'])
 * // ['404 GET //tmp/a/app/x.ts (not served)']
 * ```
 */
export function appPathRequests(
    lines: readonly string[],
    appDirs: readonly string[],
): string[] {
    return lines.filter((line) =>
        appDirs.some((dir) => line.includes(`${dir}/`))
    )
}

/**
 * A route each kit's own controller stubs define, by name, that `router:list`
 * must print once the kit runs from the registry (#477).
 *
 * Booting proves core loads app files from a published package; `router:list`
 * is the first step where the cli package itself, loaded from the registry,
 * imports one.
 */
export const ROUTER_LIST_ROUTE: Readonly<Record<KitName, string>> = {
    web: 'auth.login',
    api: 'health',
    slim: 'hello',
}

/**
 * Judge a kit's `router:list` run: it must exit 0 and list `route`.
 *
 * The name column is padded with spaces, so ` <route> ` matches that name
 * and not a longer one it prefixes (`auth.login` vs `auth.login.submit`).
 *
 * @param ok - Whether the command exited 0.
 * @param output - Everything it printed.
 * @param route - The route name the kit's stubs define.
 * @returns The verdict, with the output's tail on failure.
 *
 * @example
 * ```ts
 * judgeRouterList(true, '┃ GET ┃ /hello ┃ hello ┃ …', 'hello').ok // true
 * judgeRouterList(true, '⚠️  No controllers found', 'hello').ok   // false
 * ```
 */
export function judgeRouterList(
    ok: boolean,
    output: string,
    route: string,
): StepResult {
    if (!ok) {
        return {
            ok: false,
            detail: `router:list exited non-zero\n${tail(output)}`,
        }
    }
    if (!output.includes(` ${route} `)) {
        return {
            ok: false,
            detail: `router:list did not list the route "${route}"\n${
                tail(output)
            }`,
        }
    }
    return { ok: true, detail: `router:list lists "${route}"` }
}

/**
 * Print whether a step's share of the registry log requested an app file.
 *
 * @param lines - The registry log lines logged during the step.
 * @param appDirs - The kit's directory, in every spelling (see
 * {@link appPathRequests}).
 * @returns `true` when no app file was requested.
 */
function reportLeaks(
    lines: readonly string[],
    appDirs: readonly string[],
): boolean {
    const leaked = appPathRequests(lines, appDirs)
    if (leaked.length === 0) {
        console.log('  ✅ no app file requested from the registry')
        return true
    }
    console.log(
        `  ❌ app files requested from the registry\n${
            leaked.map((line) => `     ${line}`).join('\n')
        }`,
    )
    return false
}

/** Ask a running kit for {@link MISSING_PATH}. */
async function notFoundIsHtml(origin: string): Promise<StepResult> {
    const response = await fetch(`${origin}${MISSING_PATH}`)
    return judgeNotFound(
        response.status,
        response.headers.get('content-type'),
        await response.text(),
    )
}

/** A port the OS says is free right now, on loopback. */
function freePort(): number {
    const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 })
    const { port } = listener.addr as Deno.NetAddr
    listener.close()
    return port
}

/**
 * Extract `git archive HEAD` into a directory: the committed tree, exactly,
 * with no untracked file and no local edit.
 *
 * @param dest - An empty directory.
 * @returns The short commit id, or the failure output.
 */
async function archiveHead(
    dest: string,
): Promise<{ ok: boolean; output: string }> {
    const tarball = `${dest}.tar`
    const archive = await run(
        'git',
        ['archive', '--format=tar', `--output=${tarball}`, 'HEAD'],
        ROOT,
    )
    if (!archive.ok) return archive
    await Deno.mkdir(dest)
    const extract = await run('tar', ['-xf', tarball, '-C', dest], ROOT)
    await Deno.remove(tarball)
    if (!extract.ok) return extract
    return await run('git', ['rev-parse', '--short', 'HEAD'], ROOT)
}

/**
 * `deno publish` a workspace into the localhost registry.
 *
 * Refuses before spawning anything unless `registry` is a loopback literal:
 * this command must never be able to reach a real registry with any token.
 * The token is the registry's per-run one ({@link LocalJsr.token}); it is
 * redacted from the returned output, so a failure message never prints it.
 *
 * @param src - The workspace to publish (a `git archive` copy).
 * @param registry - The registry origin, given to `JSR_URL`.
 * @param denoDir - The `DENO_DIR` to use.
 * @param token - The registry's per-run publish token.
 * @returns Success and the combined output, token redacted.
 * @throws {Error} When `registry` is not loopback.
 *
 * @example
 * ```ts
 * await publishToRegistry(src, jsr.url, denoDir, jsr.token)
 * ```
 */
export async function publishToRegistry(
    src: string,
    registry: string,
    denoDir: string,
    token: string,
): Promise<{ ok: boolean; output: string }> {
    const url = assertLoopbackUrl(registry)
    const result = await run(
        Deno.execPath(),
        [
            'publish',
            '--token',
            token,
            '--no-provenance',
            '--no-check',
            '--allow-dirty',
        ],
        src,
        { JSR_URL: url.origin, DENO_DIR: denoDir },
    )
    return {
        ok: result.ok,
        output: result.output.replaceAll(token, '<publish-token>'),
    }
}

/**
 * Publish HEAD into a localhost registry, then scaffold and boot every
 * selected kit from it.
 *
 * @param selected - The kits.
 * @param keep - Leave the temp directory on disk.
 * @returns Whether every kit booted and served the HTML 404.
 */
async function smokeAgainstRegistry(
    selected: readonly KitName[],
    keep: boolean,
): Promise<boolean> {
    const workdir = await Deno.makeTempDir({
        prefix: 'lockness-kits-registry-',
    })
    let jsr: LocalJsr | undefined
    // Every line the registry logged, so each kit's share can be checked
    // for requests that name the app's own files.
    const registryLog: string[] = []
    let cleaning: Promise<void> | undefined
    // Children first, then the registry they talk to, then the files they
    // hold open. Reached from `finally` and from a signal, whichever is first.
    const cleanup = () =>
        cleaning ??= (async () => {
            // abort, not just kill: the kit loop may still be running, and
            // must not spawn the next child after this sweep.
            children.abort()
            await jsr?.shutdown()
            if (keep) {
                console.log(`\n📂 Kept: ${workdir}`)
            } else {
                await Deno.remove(workdir, { recursive: true })
            }
        })()
    const signals: Deno.Signal[] = Deno.build.os === 'windows'
        ? ['SIGINT']
        : ['SIGINT', 'SIGTERM']
    const handlers = signals.map((signal) => {
        const handler = () => {
            console.error(`\n${signal}: stopping servers, removing ${workdir}`)
            children.abort()
            cleanup().finally(() => {
                // Again, just before exit: anything that slipped in between
                // the first sweep and now dies with the script.
                children.killAll()
                Deno.exit(signal === 'SIGINT' ? 130 : 143)
            })
        }
        Deno.addSignalListener(signal, handler)
        return [signal, handler] as const
    })

    try {
        jsr = startLocalJsr({
            log: (line) => {
                registryLog.push(line)
                if (!line.startsWith('published ')) {
                    console.log(`  · registry: ${line}`)
                }
            },
        })
        const registry = assertLoopbackUrl(jsr.url).origin
        console.log(`🌊 Registry gate: ${selected.length} kit(s) in ${workdir}`)
        console.log(`  ✅ local JSR on ${registry}`)

        const src = join(workdir, 'src')
        const head = await archiveHead(src)
        if (!head.ok) {
            console.log(`  ❌ git archive HEAD\n${tail(head.output)}`)
            return false
        }
        const dirty = await run('git', ['status', '--porcelain'], ROOT)
        console.log(`  ✅ git archive HEAD (${head.output.trim()})`)
        if (dirty.output.trim() !== '') {
            console.log(
                '  ⚠️  uncommitted changes are NOT in this run: it tests HEAD',
            )
        }

        // One fresh cache for the whole run, never the user's: a warm cache
        // served an old meta.json and resolved the previous release of core
        // (measured), which is a pass against the wrong code.
        const denoDir = join(workdir, 'deno-dir')
        const env = { JSR_URL: registry, DENO_DIR: denoDir }

        const started = Date.now()
        const published = await publishToRegistry(
            src,
            registry,
            denoDir,
            jsr.token,
        )
        if (!published.ok) {
            console.log(`  ❌ deno publish\n${tail(published.output, 30)}`)
            return false
        }
        const expected = await publishableMembers(src)
        const missing = missingFromRegistry(expected, jsr.store)
        if (missing.length > 0) {
            console.log(`  ❌ deno publish skipped ${missing.join(', ')}`)
            return false
        }
        console.log(
            `  ✅ deno publish — ${expected.length} package(s) in ${
                Math.round((Date.now() - started) / 1000)
            }s`,
        )

        const init = expected.find((m) => m.name === '@lockness/init')
        if (init === undefined) {
            console.log('  ❌ @lockness/init is not a publishable member')
            return false
        }

        const failed: KitName[] = []
        for (const kit of selected) {
            if (children.aborted) {
                failed.push(kit)
                continue
            }
            console.log(`\n🎒 ${kit} — ${KITS[kit].summary}`)
            const scaffold = await scaffoldKit(kit, workdir, {
                entry: `jsr:@lockness/init@${init.version}`,
                env,
                local: false,
            })
            if (!scaffold.ok) {
                console.log(`  ❌ scaffold\n${tail(scaffold.output)}`)
                failed.push(kit)
                continue
            }
            console.log(
                `  ✅ scaffold from jsr:@lockness/init@${init.version}`,
            )
            const logStart = registryLog.length
            const booted = await boots(scaffold.dir, freePort(), {
                env,
                timeoutMs: REGISTRY_BOOT_TIMEOUT_MS,
                probe: notFoundIsHtml,
            })
            console.log(`  ${booted.ok ? '✅' : '❌'} boots — ${booted.detail}`)
            let kitOk = booted.ok
            const appDirs = [scaffold.dir, await Deno.realPath(scaffold.dir)]
            // Booting is not enough: a kit whose app file was resolved
            // against the registry still boots, without that file (#474).
            kitOk = reportLeaks(registryLog.slice(logStart), appDirs) && kitOk

            // The cli, loaded from the registry, importing the kit's
            // controllers (#477).
            const listStart = registryLog.length
            const listed = await run(
                'deno',
                ['task', 'cli', 'router:list'],
                scaffold.dir,
                env,
            )
            const listing = judgeRouterList(
                listed.ok,
                listed.output,
                ROUTER_LIST_ROUTE[kit],
            )
            console.log(`  ${listing.ok ? '✅' : '❌'} ${listing.detail}`)
            kitOk = listing.ok && kitOk
            kitOk = reportLeaks(registryLog.slice(listStart), appDirs) && kitOk

            if (!kitOk) failed.push(kit)
        }

        console.log(
            `\n${failed.length === 0 ? '✅' : '❌'} ${
                selected.length - failed.length
            }/${selected.length} kit(s) booted from the registry${
                failed.length > 0 ? ` — failed: ${failed.join(', ')}` : ''
            }`,
        )
        return failed.length === 0
    } finally {
        for (const [signal, handler] of handlers) {
            Deno.removeSignalListener(signal, handler)
        }
        await cleanup()
    }
}

/** Smoke every kit, or the one that was named. */
async function main(): Promise<void> {
    const args = parseArgs(Deno.args, {
        string: ['kit'],
        boolean: ['keep', 'registry'],
    })

    const names = Object.keys(KITS) as KitName[]
    const selected = args.kit ? [args.kit as KitName] : names
    for (const kit of selected) {
        if (!names.includes(kit)) {
            console.error(
                `Unknown kit "${kit}". Available: ${names.join(', ')}.`,
            )
            Deno.exit(1)
        }
    }

    if (args.registry) {
        if (!await smokeAgainstRegistry(selected, args.keep)) Deno.exit(1)
        return
    }

    const workdir = await Deno.makeTempDir({ prefix: 'lockness-kits-' })
    console.log(`🌊 Smoke-testing ${selected.length} kit(s) in ${workdir}`)

    const failed: KitName[] = []
    // A distinct port per kit, so a server that outlives its kill cannot make
    // the next kit's probe pass against the wrong app.
    let port = 8931
    for (const kit of selected) {
        if (!await smoke(kit, workdir, port++)) failed.push(kit)
    }

    if (args.keep) {
        console.log(`\n📂 Kept: ${workdir}`)
    } else {
        await Deno.remove(workdir, { recursive: true })
    }

    console.log(
        `\n${failed.length === 0 ? '✅' : '❌'} ${
            selected.length - failed.length
        }/${selected.length} kit(s) passed${
            failed.length > 0 ? ` — failed: ${failed.join(', ')}` : ''
        }`,
    )
    if (failed.length > 0) Deno.exit(1)
}

if (import.meta.main) {
    await main()
}
