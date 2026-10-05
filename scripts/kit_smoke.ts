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
 * type-check, test, build, boot — and the first failure stops that kit. The
 * build is the kit's own `deno task build`, the one its Dockerfile runs (#503);
 * a kit with a `css:build` task must have written Tailwind's output, not a
 * copy of its entry file (#506, {@link judgeStylesheet}). A kit that ships
 * migrations also runs its `db:generate` before booting, which must report no
 * schema changes (#444).
 *
 * **Booting is judged by what it printed, too (#505).** {@link judgeBootLog}
 * fails a kit whose boot log carries an optional-package line — the old
 * "not found - skipping" probe, or a `MissingOptionalPackageError` refusal —
 * in every mode, Docker included. A kit whose kernel sets `cache` then runs
 * {@link cacheRoundTrip} twice: on the memory driver, and on deno-kv under
 * `APP_ENV=production` — the driver a deployed kit actually uses.
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
 * **`--registry --docker`** then builds each kit's image from a fresh
 * scaffold, the `Dockerfile` it ships with `JSR_URL` pointed at the same
 * registry, and runs it with `--network none` until Docker reports it
 * `healthy` (#503). That is the only place a kit boots with
 * `APP_ENV=production`, as the non-root `deno` user, from the module cache
 * alone. Every container and image is removed afterwards, on failure and on a
 * signal too. Linux only: the build reaches the loopback registry through the
 * host network, which Docker Desktop does not share with the host.
 *
 * @example
 * ```bash
 * deno task kits:smoke              # all kits, against the working tree
 * deno task kits:smoke --kit slim   # one of them
 * deno task kits:smoke --keep       # leave the scaffolds on disk to poke at
 * deno task kits:smoke --registry   # all kits, from what deno publish ships
 * deno task kits:smoke --registry --docker   # …and each kit's image, run to healthy
 * ```
 *
 * @module
 */

import { parseArgs } from '@std/cli'
import { parse as parseJsonc } from '@std/jsonc'
import { fromFileUrl, join } from '@std/path'
import { generateAppKey, type KitName, KITS } from '@lockness/init'
import {
    diffTree,
    MIGRATIONS_DIR,
    readTree,
    shipsMigrations,
} from './kit_migrations.ts'
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
async function runCommand(
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
async function useLocalWorkspace(dir: string): Promise<number> {
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

/** What {@link boots} produced: the verdict, and everything the server printed. */
export interface BootResult extends StepResult {
    /**
     * The server's combined stdout and stderr, drained to EOF (or to the
     * drain grace) after it was stopped — so a line printed during boot is
     * here even when `/` answered. {@link judgeBootLog} reads it.
     */
    readonly output: string
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
 * @returns Whether the server answered (and the probe passed), and what it
 * printed.
 *
 * @example
 * ```ts
 * await boots('/tmp/lockness-kits-x/api-app', 8931)
 * // { ok: true, detail: 'HTTP 200 in 912ms', output: '✓ Scheduler started…' }
 * ```
 */
export async function boots(
    dir: string,
    port: number,
    options: BootOptions = {},
): Promise<BootResult> {
    // The verdict is decided inside the try; the output is complete only
    // after its finally has drained the pipes. Holding it here, outside,
    // is what lets a successful boot return what it printed.
    const log = { text: '' }
    const result = await bootAndStop(dir, port, options, log)
    return { ...result, output: log.text }
}

/** The body of {@link boots}; appends what the server prints to `log.text`. */
async function bootAndStop(
    dir: string,
    port: number,
    options: BootOptions,
    log: { text: string },
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
                log.text += text
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
                            tail(log.text, 20)
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
            detail: `${lastError} within ${timeoutMs}ms\n${tail(log.text)}`,
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
 * The boot-log lines that fail a kit, each with the reason (#505).
 *
 * Core imports an optional package only when the kernel names it, and refuses
 * the boot when that package does not resolve. Either line below means a kit
 * broke that rule: the first is the probe #505 removed coming back, the second
 * a kernel key whose package the kit does not declare.
 */
export const BOOT_LOG_FAILURES: ReadonlyArray<
    { readonly pattern: RegExp; readonly reason: string }
> = [
    {
        pattern: /not found - skipping/,
        reason: 'core probed for an optional package the kernel did not name',
    },
    {
        pattern: /MissingOptionalPackageError/,
        reason: 'the kernel configures a package the kit does not declare',
    },
]

/**
 * Judge a boot log: a kit fails when it printed an optional-package line.
 *
 * Only the loader's lines are judged — any other warning is the app's
 * business, and a judge that failed on every `⚠️` would be switched off.
 *
 * @param output - What the server (or container) printed.
 * @returns `ok` when no line matched; otherwise the offending lines.
 *
 * @example
 * ```ts
 * judgeBootLog('⚠️  @lockness/cache not found - skipping cache setup').ok // false
 * judgeBootLog('✓ Scheduler started: 0 task(s) armed of 0 registered').ok // true
 * ```
 */
export function judgeBootLog(output: string): StepResult {
    const hits = output.split('\n').filter((line) =>
        BOOT_LOG_FAILURES.some(({ pattern }) => pattern.test(line))
    )
    if (hits.length === 0) {
        return { ok: true, detail: 'boot log — no optional-package line' }
    }
    const reasons = BOOT_LOG_FAILURES
        .filter(({ pattern }) => hits.some((line) => pattern.test(line)))
        .map(({ reason }) => reason)
    return {
        ok: false,
        detail: `boot log — ${reasons.join('; ')}\n${tail(hits.join('\n'))}`,
    }
}

/** Where a kit's `css:build` writes the stylesheet its layout links (#506). */
export const BUILT_STYLESHEET = 'public/css/app.css'

/**
 * Utility classes the web kit's own views use, each of which a compiled
 * stylesheet must carry a rule for (#506).
 *
 * One per kind of output Tailwind generates: layout (`flex`, `mx-auto`), a
 * sizing keyword (`min-h-screen`), a container size (`max-w-sm`), type
 * (`text-2xl`, `font-semibold`), and a colour that only exists because the
 * entry file's `@theme` defines it (`bg-primary`, in `components/ui.tsx`).
 * `scripts/kit_stylesheet_test.ts` fails if a view stops using one.
 */
export const STYLESHEET_PROBES: readonly string[] = [
    'flex',
    'mx-auto',
    'min-h-screen',
    'max-w-sm',
    'text-2xl',
    'font-semibold',
    'bg-primary',
]

/**
 * Judge a built stylesheet: Tailwind ran when it inlined its own import and
 * emitted a rule for every {@link STYLESHEET_PROBES} class.
 *
 * Before #506 the kit's `css:build` copied the entry file unchanged; the
 * copy has neither property, so this fails it.
 *
 * @param css - The contents of {@link BUILT_STYLESHEET}.
 * @returns `ok` when Tailwind's output is there; otherwise what is missing.
 *
 * @example
 * ```ts
 * judgeStylesheet("@import 'tailwindcss';\n").ok // false
 * ```
 */
export function judgeStylesheet(css: string): StepResult {
    const problems: string[] = []
    if (/^\s*@import\s+['"]tailwindcss['"]/m.test(css)) {
        problems.push('@import "tailwindcss" left unresolved (file copied?)')
    }
    const missing = STYLESHEET_PROBES.filter((cls) =>
        !new RegExp(`\\.${cls}\\s*[{,]`).test(css)
    )
    if (missing.length > 0) {
        problems.push(`no rule for ${missing.map((c) => `.${c}`).join(', ')}`)
    }
    if (problems.length > 0) {
        return { ok: false, detail: `stylesheet — ${problems.join('; ')}` }
    }
    return {
        ok: true,
        detail:
            `stylesheet — Tailwind output, ${STYLESHEET_PROBES.length} probed utilities present`,
    }
}

/**
 * The top-level keys of the `@Kernel({ … })` object in a kernel source.
 *
 * Comments are stripped first, so a key shown in a JSDoc example or left
 * commented out does not count as configured.
 *
 * @param source - The kernel file's text.
 * @returns The keys, in order.
 * @throws {Error} When the source holds no `@Kernel({`.
 *
 * @example
 * ```ts
 * kernelKeys('@Kernel({\n    cache: config.cache,\n})') // ['cache']
 * ```
 */
export function kernelKeys(source: string): string[] {
    const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
    const start = code.indexOf('@Kernel({')
    if (start < 0) throw new Error('no @Kernel({ … }) in the kernel source')
    const end = code.indexOf('\n})', start)
    return [...code.slice(start, end).matchAll(/^ {4}(\w+)\s*:/gm)].map((m) =>
        m[1]
    )
}

/** The file {@link cacheRoundTrip} writes into a scaffold, and removes. */
export const CACHE_PROBE_FILE = '__lockness_kit_smoke_cache_probe.ts'

/**
 * What the cache probe runs: boot the kit's own kernel, then set, get, forget
 * and get again through `@lockness/cache`, and print which driver answered.
 */
export const CACHE_PROBE_SOURCE = `import { createApp } from '@lockness/core'
import { cache, getCacheConfig } from '@lockness/cache'
import { AppKernel } from './app/kernel.ts'

await createApp(AppKernel)
const key = 'lockness-kit-smoke'
await cache().set(key, 'round-trip')
const read = await cache().get(key)
await cache().forget(key)
const gone = await cache().get(key)
const driver = getCacheConfig().driver
if (read !== 'round-trip' || gone !== null) {
    console.error(\`CACHE_ROUND_TRIP_FAILED driver=\${driver} read=\${String(read)} gone=\${String(gone)}\`)
    Deno.exit(1)
}
console.log(\`CACHE_ROUND_TRIP_OK driver=\${driver}\`)
Deno.exit(0)
`

/**
 * One environment {@link cacheRoundTrip} runs under, and the driver the kit's
 * `config/cache.ts` must pick there.
 */
export interface CacheRun {
    readonly driver: 'memory' | 'deno-kv'
    readonly env: Record<string, string>
}

/**
 * The two runs: the default environment, which picks the memory driver, and
 * production, which picks deno-kv — on an in-memory database, so the run
 * leaves nothing on disk. Production needs a key: the web kit's session
 * refuses to boot without one, which is the point of that refusal.
 *
 * @returns The runs, with a fresh `APP_KEY` for the production one.
 */
export function cacheRuns(): CacheRun[] {
    return [
        { driver: 'memory', env: { APP_ENV: 'development' } },
        {
            driver: 'deno-kv',
            env: {
                APP_ENV: 'production',
                DATABASE_KV_PATH: ':memory:',
                APP_KEY: generateAppKey(),
            },
        },
    ]
}

/**
 * Prove a kit's configured cache works end to end: boot its kernel, round-trip
 * a value, and check which driver answered (#505).
 *
 * The api kit's deno-kv cache used to throw on first use in production — no
 * `"unstable": ["kv"]` — while every boot looked healthy, because nothing ever
 * touched the cache. Booting is not using.
 *
 * @param dir - The scaffolded project.
 * @param run - The environment and the driver it must select.
 * @param env - Extra variables (the registry mode's `JSR_URL`, `DENO_DIR`).
 * @returns Whether the round trip passed on the expected driver.
 *
 * @example
 * ```ts
 * await cacheRoundTrip(dir, cacheRuns()[1])
 * // { ok: true, detail: 'cache round trip on deno-kv' }
 * ```
 */
export async function cacheRoundTrip(
    dir: string,
    run: CacheRun,
    env: Record<string, string> = {},
): Promise<StepResult> {
    const probe = join(dir, CACHE_PROBE_FILE)
    await Deno.writeTextFile(probe, CACHE_PROBE_SOURCE)
    try {
        const ran = await runCommand(
            Deno.execPath(),
            ['run', '-A', CACHE_PROBE_FILE],
            dir,
            { ...env, ...run.env },
        )
        const expected = `CACHE_ROUND_TRIP_OK driver=${run.driver}`
        if (ran.ok && ran.output.includes(expected)) {
            return { ok: true, detail: `cache round trip on ${run.driver}` }
        }
        return {
            ok: false,
            detail: `cache round trip on ${run.driver}\n${tail(ran.output)}`,
        }
    } finally {
        await Deno.remove(probe)
    }
}

/**
 * Whether a kit's kernel stub sets `cache` — read from the stub tree, so a kit
 * that drops or gains the key is followed without editing this script.
 *
 * @param kit - The kit.
 * @returns `true` when its `app/kernel.ts.stub` configures `cache`.
 */
async function kitConfiguresCache(kit: KitName): Promise<boolean> {
    const stubs = join(PACKAGES, 'init', 'stubs')
    let source: string
    try {
        source = await Deno.readTextFile(
            join(stubs, 'kits', kit, 'app', 'kernel.ts.stub'),
        )
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error
        source = await Deno.readTextFile(
            join(stubs, 'init', 'app', 'kernel.ts.stub'),
        )
    }
    return kernelKeys(source).includes('cache')
}

/**
 * Judge a boot's log and, for a kit that configures `cache`, round-trip it on
 * both drivers. Prints one line per check.
 *
 * @param kit - The kit.
 * @param dir - Its scaffold.
 * @param booted - What {@link boots} returned.
 * @param env - Extra variables for the cache runs.
 * @returns Whether every check passed.
 */
async function bootLogAndCache(
    kit: KitName,
    dir: string,
    booted: BootResult,
    env: Record<string, string> = {},
): Promise<boolean> {
    const log = judgeBootLog(booted.output)
    console.log(`  ${log.ok ? '✅' : '❌'} ${log.detail}`)
    if (!booted.ok || !log.ok) return false
    if (!await kitConfiguresCache(kit)) return true
    for (const run of cacheRuns()) {
        const result = await cacheRoundTrip(dir, run, env)
        console.log(`  ${result.ok ? '✅' : '❌'} ${result.detail}`)
        if (!result.ok) return false
    }
    return true
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
 * @returns Whether drizzle-kit reported no changes and left the folder
 * byte-for-byte unchanged; otherwise every added, removed or changed path.
 */
async function generatesNothing(dir: string): Promise<StepResult> {
    const folder = join(dir, MIGRATIONS_DIR)
    const before = await readTree(folder)
    const generate = await runCommand(
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
    const written = diffTree(before, await readTree(folder))
    if (written.length > 0) {
        return { ok: false, detail: `wrote ${written.join(', ')}` }
    }
    return { ok: true, detail: 'no schema changes' }
}

/**
 * Run the app's `deno task build` — what its Dockerfile runs (#503) — and, for
 * a kit that has a `css:build` task, judge the stylesheet it wrote (#506).
 *
 * @param dir - The scaffolded project.
 * @returns Whether the build exited 0 and, where there is one, the stylesheet
 * is Tailwind's output rather than a copy of the entry file.
 */
async function buildsAndStyles(dir: string): Promise<StepResult> {
    const build = await runCommand(Deno.execPath(), ['task', 'build'], dir)
    if (!build.ok) {
        return { ok: false, detail: `deno task build\n${tail(build.output)}` }
    }
    const config = JSON.parse(
        await Deno.readTextFile(join(dir, 'deno.json')),
    ) as { tasks?: Record<string, string> }
    if (config.tasks?.['css:build'] === undefined) {
        return { ok: true, detail: 'deno task build — no stylesheet to judge' }
    }
    let css: string
    try {
        css = await Deno.readTextFile(join(dir, BUILT_STYLESHEET))
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error
        return {
            ok: false,
            detail: `deno task build wrote no ${BUILT_STYLESHEET}`,
        }
    }
    const verdict = judgeStylesheet(css)
    return { ok: verdict.ok, detail: `deno task build — ${verdict.detail}` }
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
    const scaffold = await runCommand(
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
 * Take one kit through scaffold → check → test → build → db:generate → boot.
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

    const check = await runCommand(Deno.execPath(), ['check', '.'], dir)
    if (!check.ok) {
        console.log(`  ❌ deno check\n${tail(check.output)}`)
        return false
    }
    console.log('  ✅ deno check')

    const test = await runCommand(Deno.execPath(), ['task', 'test'], dir)
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

    const built = await buildsAndStyles(dir)
    console.log(`  ${built.ok ? '✅' : '❌'} ${built.detail}`)
    if (!built.ok) return false

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
    if (!await bootLogAndCache(kit, dir, booted)) return false
    if (NOT_FOUND_ANSWER[kit] !== 'app-handler') return true

    // The kit's own error handler gates the error message behind an explicit
    // development signal. A deployed app runs under APP_ENV=production, and
    // its error bodies must carry no message there (#479).
    const production = await boots(dir, freePort(), {
        env: { APP_ENV: 'production', APP_KEY: generateAppKey() },
        probe: notFoundProbe(kit, { production: true }),
    })
    console.log(
        `  ${
            production.ok ? '✅' : '❌'
        } boots under APP_ENV=production — ${production.detail}`,
    )
    return production.ok
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
 * What the registry holds beyond the expected members at their versions.
 *
 * After the publish the store must hold exactly the workspace members at the
 * release version: the kits boot against it, and anything extra means
 * something other than this run's `deno publish` published into it (#475).
 *
 * @param expected - What should have been published.
 * @param store - What the registry holds.
 * @returns `@lockness/<name>@<version>` of every stored version not expected,
 *   sorted by name.
 *
 * @example
 * ```ts
 * unexpectedInRegistry([{ name: '@lockness/core', version: '0.4.0' }], store)
 * // ['@lockness/core@9.9.9'] when a second version slipped in
 * ```
 */
export function unexpectedInRegistry(
    expected: readonly PublishableMember[],
    store: LocalJsrStore,
): string[] {
    const wanted = new Set(expected.map((m) => `${m.name}@${m.version}`))
    return store.names().flatMap((name) =>
        store.versions(name)
            .map((version) => `@lockness/${name}@${version}`)
            .filter((id) => !wanted.has(id))
    )
}

/**
 * Who answers {@link MISSING_PATH} in each kit.
 *
 * - `default-view`: core's HTML 404 page, rendered at runtime — the module
 *   #470 broke — which `/` alone never reaches in a kit with its own home page.
 * - `app-handler`: the kit's own `app/view/pages/errors/error_handler.tsx`,
 *   which answers `{ error: 'Not Found' }` as JSON. Only a published core can
 *   fail to load it, by resolving the path against its own URL (#474), so
 *   registry mode is where that is proven (#479). A handler that did not load
 *   falls back to the HTML page, which this verdict rejects.
 */
export const NOT_FOUND_ANSWER: Readonly<
    Record<KitName, 'default-view' | 'app-handler'>
> = {
    web: 'default-view',
    api: 'default-view',
    slim: 'app-handler',
}

/**
 * Judge the answer to {@link MISSING_PATH} against who should give it.
 *
 * @param status - The HTTP status.
 * @param contentType - The `content-type` header, if any.
 * @param body - The body.
 * @param expected - Who should answer (see {@link NOT_FOUND_ANSWER}).
 * @param options - `production`: the app ran under `APP_ENV=production`, so
 * the app handler's body must carry no `message` key.
 * @returns Pass only for a 404 served as `text/html` from the default view,
 * or as JSON naming `Not Found` from the app's handler (with no `message`
 * under production).
 *
 * @example
 * ```ts
 * judgeNotFound(404, 'text/html; charset=UTF-8', '<html>…', 'default-view').ok // true
 * judgeNotFound(404, 'application/json', '{"error":"Not Found"}', 'app-handler').ok // true
 * judgeNotFound(404, 'text/html', '<html>…', 'app-handler').ok // false
 * ```
 */
export function judgeNotFound(
    status: number,
    contentType: string | null,
    body: string,
    expected: 'default-view' | 'app-handler',
    options: { readonly production?: boolean } = {},
): StepResult {
    const type = contentType ?? 'no content-type'
    const want = expected === 'default-view'
        ? 'an HTML 404'
        : options.production
        ? "the app handler's JSON 404, with no message under production"
        : "the app handler's JSON 404"
    if (status === 404 && expected === 'default-view') {
        if (type.toLowerCase().includes('text/html')) {
            return { ok: true, detail: `${MISSING_PATH} → HTML 404` }
        }
    }
    if (status === 404 && expected === 'app-handler') {
        const parsed = jsonObject(body)
        if (
            type.toLowerCase().includes('application/json') &&
            parsed?.error === 'Not Found' &&
            !(options.production && 'message' in parsed)
        ) {
            const note = options.production ? ', no message' : ''
            return {
                ok: true,
                detail:
                    `${MISSING_PATH} → JSON 404 from the app's error handler${note}`,
            }
        }
    }
    return {
        ok: false,
        detail: `${MISSING_PATH} → HTTP ${status} (${type}), expected ` +
            `${want}\n${tail(body, 8)}`,
    }
}

/** A body parsed as a JSON object, or `undefined` when it is not one. */
function jsonObject(body: string): Record<string, unknown> | undefined {
    try {
        const parsed: unknown = JSON.parse(body)
        return typeof parsed === 'object' && parsed !== null &&
                !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : undefined
    } catch (error) {
        // Not JSON is a verdict, not a fault: the caller reports the body.
        if (error instanceof SyntaxError) return undefined
        throw error
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
 * Each is matched raw and percent-encoded.
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
    const spellings = [...new Set(appDirs.flatMap(dirSpellings))]
    return lines.filter((line) =>
        spellings.some((dir) => line.includes(`${dir}/`))
    )
}

/**
 * A directory as written, and as the registry logs it (#479).
 *
 * The registry logs `url.pathname`, which percent-encodes what a URL path
 * cannot carry raw: a space arrives as `%20`. Matching only the raw spelling
 * would miss a request for a directory holding one. The pathname setter
 * applies the same encoding the registry's URL parser did.
 *
 * @param dir - An absolute directory path.
 * @returns The raw spelling, then the encoded one when it differs.
 */
function dirSpellings(dir: string): string[] {
    const url = new URL('http://registry.invalid/')
    url.pathname = dir
    return url.pathname === dir ? [dir] : [dir, url.pathname]
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

/**
 * A probe asking a running kit for {@link MISSING_PATH}, judged against who
 * should answer it in that kit.
 *
 * @param kit - The kit being probed.
 * @param options - Passed to {@link judgeNotFound}.
 * @returns The probe {@link boots} runs once the kit answers `/`.
 */
function notFoundProbe(
    kit: KitName,
    options: { readonly production?: boolean } = {},
): (origin: string) => Promise<StepResult> {
    return async (origin) => {
        const response = await fetch(`${origin}${MISSING_PATH}`)
        return judgeNotFound(
            response.status,
            response.headers.get('content-type'),
            await response.text(),
            NOT_FOUND_ANSWER[kit],
            options,
        )
    }
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
    const archive = await runCommand(
        'git',
        ['archive', '--format=tar', `--output=${tarball}`, 'HEAD'],
        ROOT,
    )
    if (!archive.ok) return archive
    await Deno.mkdir(dest)
    const extract = await runCommand('tar', ['-xf', tarball, '-C', dest], ROOT)
    await Deno.remove(tarball)
    if (!extract.ok) return extract
    return await runCommand('git', ['rev-parse', '--short', 'HEAD'], ROOT)
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
    const result = await runCommand(
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
 * selected kit from it — and, with `docker`, build each kit's image from a
 * fresh scaffold and run it to `healthy`.
 *
 * @param selected - The kits.
 * @param keep - Leave the temp directory on disk.
 * @param docker - Also prove each kit's Docker image (#503).
 * @returns Whether every kit booted and served the HTML 404 (and, with
 * `docker`, whether every image built and became healthy).
 */
async function smokeAgainstRegistry(
    selected: readonly KitName[],
    keep: boolean,
    docker = false,
): Promise<boolean> {
    const workdir = await Deno.makeTempDir({
        prefix: 'lockness-kits-registry-',
    })
    let jsr: LocalJsr | undefined
    // Every line the registry logged, so each kit's share can be checked
    // for requests that name the app's own files.
    const registryLog: string[] = []
    let cleaning: Promise<void> | undefined
    // Containers and images a `--docker` proof has not removed yet.
    const leftovers = new DockerLeftovers()
    // Children first, then the containers, then the registry they talk to,
    // then the files they hold open. Reached from `finally` and from a
    // signal, whichever is first.
    const cleanup = () =>
        cleaning ??= (async () => {
            // abort, not just kill: the kit loop may still be running, and
            // must not spawn the next child after this sweep.
            children.abort()
            await leftovers.removeAll()
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
        const dirty = await runCommand('git', ['status', '--porcelain'], ROOT)
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
        // The token was in deno publish's argv; from here it opens nothing.
        jsr.closePublishing()
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
        const unexpected = unexpectedInRegistry(expected, jsr.store)
        if (unexpected.length > 0) {
            console.log(
                `  ❌ the registry holds more than this run published: ${
                    unexpected.join(', ')
                }`,
            )
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
                probe: notFoundProbe(kit),
            })
            console.log(`  ${booted.ok ? '✅' : '❌'} boots — ${booted.detail}`)
            let kitOk = await bootLogAndCache(kit, scaffold.dir, booted, env)
            const appDirs = [scaffold.dir, await Deno.realPath(scaffold.dir)]
            // Booting is not enough: a kit whose app file was resolved
            // against the registry still boots, without that file (#474).
            kitOk = reportLeaks(registryLog.slice(logStart), appDirs) && kitOk

            // The cli, loaded from the registry, importing the kit's
            // controllers (#477). This guards against a regression to a bare
            // or registry-relative path, NOT against `#` truncation: the kit
            // directory holds no `#` or space, so a hand-built `file://`
            // string would still pass here. The unit tests own that half.
            const listStart = registryLog.length
            const listed = await runCommand(
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

        if (docker && !children.aborted) {
            const dockerFailed = await dockerProofs(
                selected,
                workdir,
                registry,
                env,
                init.version,
                leftovers,
            )
            for (const kit of dockerFailed) {
                if (!failed.includes(kit)) failed.push(kit)
            }
        }

        console.log(
            `\n${failed.length === 0 ? '✅' : '❌'} ${
                selected.length - failed.length
            }/${selected.length} kit(s) booted from the registry${
                docker ? ' and ran healthy in Docker' : ''
            }${failed.length > 0 ? ` — failed: ${failed.join(', ')}` : ''}`,
        )
        return failed.length === 0
    } finally {
        for (const [signal, handler] of handlers) {
            Deno.removeSignalListener(signal, handler)
        }
        await cleanup()
    }
}

// ---------------------------------------------------------------------------
// `--registry --docker`: build each kit's image and run it to healthy (#503)
// ---------------------------------------------------------------------------

/**
 * How long a kit's container gets to report `healthy`. The stub's health
 * check runs every 30s, so the first verdict lands about 30s after start.
 */
export const DOCKER_HEALTHY_TIMEOUT_MS = 90_000

/**
 * The label on every image and container a `--docker` run creates, beside the
 * `lockness-kit-smoke-` image name prefix: what this script made can be told
 * apart from anything else on the machine.
 */
export const DOCKER_LABEL = 'land.lockness.kit-smoke=1'

/** How often the container's health status is read while it starts. */
const DOCKER_POLL_INTERVAL_MS = 1_000

/**
 * The `docker inspect` template {@link parseContainerState} reads: the
 * container's state, its health status (`none` without a `HEALTHCHECK`), and
 * its exit code.
 */
export const INSPECT_FORMAT =
    '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.ExitCode}}'

/** What `docker inspect` says about a container, as far as the verdict needs. */
export interface ContainerState {
    /** `created`, `running`, `exited`, `dead`, … */
    readonly status: string
    /** `starting`, `healthy` or `unhealthy`; `null` when the image has no `HEALTHCHECK`. */
    readonly health: string | null
    /** The exit code, meaningful once the container stopped. */
    readonly exitCode: number
}

/**
 * Parse one line printed by `docker inspect -f INSPECT_FORMAT`.
 *
 * @param line - The line.
 * @returns The state, or `undefined` when the line is not in that shape.
 *
 * @example
 * ```ts
 * parseContainerState('running starting 0')
 * // { status: 'running', health: 'starting', exitCode: 0 }
 * ```
 */
export function parseContainerState(line: string): ContainerState | undefined {
    const match = line.trim().match(/^([a-z]+) ([a-z]+) (-?\d+)$/)
    if (match === null) return undefined
    return {
        status: match[1],
        health: match[2] === 'none' ? null : match[2],
        exitCode: Number(match[3]),
    }
}

/** A finished verdict, or a request to look again. */
export type HealthVerdict =
    | { readonly done: false }
    | { readonly done: true; readonly result: StepResult }

/**
 * Judge one reading of a container's state.
 *
 * Only `healthy` passes. A container that stopped, an `unhealthy` one, and an
 * image without a `HEALTHCHECK` fail at once: none of them can still become
 * healthy, and waiting out the timeout would only hide which one it was.
 *
 * @param state - The reading.
 * @returns Done with a verdict, or not done (still starting).
 *
 * @example
 * ```ts
 * judgeContainerHealth({ status: 'running', health: 'healthy', exitCode: 0 })
 * // { done: true, result: { ok: true, detail: 'container healthy' } }
 * ```
 */
export function judgeContainerHealth(state: ContainerState): HealthVerdict {
    if (state.status === 'exited' || state.status === 'dead') {
        return {
            done: true,
            result: {
                ok: false,
                detail:
                    `container ${state.status} with code ${state.exitCode} before it was healthy`,
            },
        }
    }
    if (state.health === null) {
        return {
            done: true,
            result: { ok: false, detail: 'image has no HEALTHCHECK' },
        }
    }
    if (state.health === 'healthy') {
        return {
            done: true,
            result: { ok: true, detail: 'container healthy' },
        }
    }
    if (state.health === 'unhealthy') {
        return {
            done: true,
            result: { ok: false, detail: 'container unhealthy' },
        }
    }
    return { done: false }
}

/** Options for {@link pollHealthy}; the clock and the sleep are for tests. */
export interface PollHealthyOptions {
    /** Give up after this long (default {@link DOCKER_HEALTHY_TIMEOUT_MS}). */
    readonly timeoutMs?: number
    /** Wait this long between readings (default 1s). */
    readonly intervalMs?: number
    /** The clock, in milliseconds. */
    readonly now?: () => number
    /** How to wait between readings. */
    readonly sleep?: (ms: number) => Promise<void>
}

/**
 * Read a container's state until {@link judgeContainerHealth} is done, or the
 * timeout passes.
 *
 * @param inspect - Reads the state; throws when it cannot (the failure is the
 * verdict, with its message).
 * @param options - Timeout, interval, clock and sleep.
 * @returns The verdict, with how long it took; on timeout, the last health
 * status seen.
 *
 * @example
 * ```ts
 * await pollHealthy(() => inspectContainer(id))
 * // { ok: true, detail: 'container healthy in 31s' }
 * ```
 */
export async function pollHealthy(
    inspect: () => Promise<ContainerState>,
    options: PollHealthyOptions = {},
): Promise<StepResult> {
    const timeoutMs = options.timeoutMs ?? DOCKER_HEALTHY_TIMEOUT_MS
    const intervalMs = options.intervalMs ?? DOCKER_POLL_INTERVAL_MS
    const now = options.now ?? Date.now
    const sleep = options.sleep ??
        ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
    const started = now()
    const seconds = () => `${Math.round((now() - started) / 1000)}s`
    let last = 'never read'
    while (true) {
        let state: ContainerState
        try {
            state = await inspect()
        } catch (error) {
            return {
                ok: false,
                detail: `docker inspect failed: ${(error as Error).message}`,
            }
        }
        const verdict = judgeContainerHealth(state)
        if (verdict.done) {
            return {
                ok: verdict.result.ok,
                detail: `${verdict.result.detail} in ${seconds()}`,
            }
        }
        last = `${state.status}/${state.health}`
        if (now() - started >= timeoutMs) {
            return {
                ok: false,
                detail: `container still ${last} after ${timeoutMs / 1000}s`,
            }
        }
        await sleep(intervalMs)
    }
}

/** Runs one `docker` command and reports how it ended. */
export type DockerRunner = (
    args: string[],
) => Promise<{ success: boolean; stderr: string }>

/**
 * Run `docker` with no tracker, so it still runs once the tracker has been
 * aborted — the cleanup after a signal is exactly when it must.
 */
const runDockerUntracked: DockerRunner = async (args) => {
    const { success, stderr } = await new Deno.Command('docker', {
        args,
        stdout: 'null',
        stderr: 'piped',
    }).output()
    return { success, stderr: new TextDecoder().decode(stderr) }
}

/**
 * Remove one container or image this script created (`docker rm -f <name>`
 * or `docker image rm -f <tag>`), and say so when that fails.
 *
 * "No such container / image" counts as removed: the object was never
 * created (a build or a run that failed), so nothing is left over. Any other
 * failure prints a warning naming the object and {@link DOCKER_LABEL}, so the
 * leftover can be found and removed by hand. A missing `docker` binary
 * (`NotFound`) means nothing was created either; every other error is thrown.
 *
 * @param args - The `docker` arguments; the last one is the name or tag.
 * @param runner - Runs the command (the real `docker` by default).
 * @param warn - Where the warning goes.
 * @returns Whether the object is gone.
 * @throws {Error} Anything the runner throws other than `Deno.errors.NotFound`.
 *
 * @example
 * ```ts
 * await removeDockerObject(['rm', '-f', 'lockness-kit-smoke-slim-1a2b3c4d'])
 * ```
 */
export async function removeDockerObject(
    args: string[],
    runner: DockerRunner = runDockerUntracked,
    warn: (message: string) => void = console.warn,
): Promise<boolean> {
    let result: { success: boolean; stderr: string }
    try {
        result = await runner(args)
    } catch (error) {
        // No docker binary: this script cannot have created anything.
        if (error instanceof Deno.errors.NotFound) return true
        throw error
    }
    if (result.success || /No such (container|image)/i.test(result.stderr)) {
        return true
    }
    const target = args[args.length - 1]
    warn(
        `⚠️  docker ${
            args.join(' ')
        } failed: ${target} may be left over. Find leftovers with ` +
            `docker ps -a --filter label=${DOCKER_LABEL} and ` +
            `docker image ls --filter label=${DOCKER_LABEL}.\n${result.stderr.trim()}`,
    )
    return false
}

/**
 * The containers and images a `--docker` run has created and not yet removed.
 * Each proof removes its own in `finally`; the signal path sweeps what is
 * left, because a container started with `docker run -d` is not a child of
 * this script and would outlive it.
 */
export class DockerLeftovers {
    readonly containers = new Set<string>()
    readonly images = new Set<string>()

    /** `docker rm -f` every container, then `docker image rm -f` every image. */
    async removeAll(): Promise<void> {
        for (const name of [...this.containers]) {
            await removeDockerObject(['rm', '-f', name])
            this.containers.delete(name)
        }
        for (const tag of [...this.images]) {
            await removeDockerObject(['image', 'rm', '-f', tag])
            this.images.delete(tag)
        }
    }
}

/**
 * Build a scaffolded kit's image and run it until it reports `healthy`.
 *
 * The build reaches the localhost registry through the host network and
 * receives it as the `JSR_URL` build argument. The container runs with
 * `--network none` and no `JSR_URL` of its own, so it proves two things: the
 * image needs nothing from the network at runtime, and it carries the registry
 * origin its module cache is keyed by (without it, `--cached-only` looks under
 * `jsr.io` and the server exits at its first import). Its `APP_KEY` is
 * generated for this run and passed through the environment, never on the
 * command line.
 *
 * The container and the image are removed in `finally`, whatever happened.
 *
 * @param kit - The kit.
 * @param dir - A fresh scaffold of it, untouched by any other step.
 * @param registry - The loopback registry origin.
 * @param leftovers - Where the container and image are recorded until removed.
 * @returns The lines to print, and whether the image built and became healthy.
 */
async function dockerProof(
    kit: KitName,
    dir: string,
    registry: string,
    leftovers: DockerLeftovers,
): Promise<{ ok: boolean; lines: string[] }> {
    const lines: string[] = []
    const runId = crypto.randomUUID().slice(0, 8)
    const tag = `lockness-kit-smoke-${kit}:${runId}`
    // Named, and recorded before `docker run` starts: a signal that lands
    // while it runs still finds the container by this name.
    const container = `lockness-kit-smoke-${kit}-${runId}`
    let started = false
    try {
        const buildStarted = Date.now()
        leftovers.images.add(tag)
        const build = await runCommand('docker', [
            'build',
            '--network=host',
            '--label',
            DOCKER_LABEL,
            '--build-arg',
            `JSR_URL=${registry}`,
            '-t',
            tag,
            '.',
        ], dir)
        if (!build.ok) {
            lines.push(`  ❌ docker build\n${tail(build.output, 30)}`)
            return { ok: false, lines }
        }
        lines.push(
            `  ✅ docker build — ${
                Math.round((Date.now() - buildStarted) / 1000)
            }s`,
        )

        leftovers.containers.add(container)
        started = true
        const ran = await runCommand(
            'docker',
            [
                'run',
                '-d',
                '--name',
                container,
                '--label',
                DOCKER_LABEL,
                '--network',
                'none',
                '-e',
                'APP_KEY',
                tag,
            ],
            dir,
            { APP_KEY: generateAppKey() },
        )
        if (!ran.ok) {
            lines.push(`  ❌ docker run\n${tail(ran.output)}`)
            return { ok: false, lines }
        }

        const id = container
        const healthy = await pollHealthy(async () => {
            const inspected = await runCommand(
                'docker',
                ['inspect', '-f', INSPECT_FORMAT, id],
                dir,
            )
            const state = inspected.ok
                ? parseContainerState(inspected.output)
                : undefined
            if (state === undefined) {
                throw new Error(inspected.output.trim() || 'no output')
            }
            return state
        })
        if (healthy.ok) {
            lines.push(`  ✅ ${healthy.detail} (--network none)`)
            const logs = await runCommand('docker', ['logs', id], dir)
            const judged = judgeBootLog(logs.output)
            lines.push(`  ${judged.ok ? '✅' : '❌'} ${judged.detail}`)
            return { ok: judged.ok, lines }
        }
        const logs = await runCommand(
            'docker',
            ['logs', '--tail', '30', id],
            dir,
        )
        const probe = await runCommand('docker', [
            'inspect',
            '-f',
            '{{if .State.Health}}{{range .State.Health.Log}}{{.Output}}{{end}}{{end}}',
            id,
        ], dir)
        lines.push(
            `  ❌ ${healthy.detail}\n${tail(logs.output, 30)}${
                probe.output.trim() === ''
                    ? ''
                    : `\n      health-check output:\n${tail(probe.output, 8)}`
            }`,
        )
        return { ok: false, lines }
    } finally {
        if (started) {
            await removeDockerObject(['rm', '-f', container])
            leftovers.containers.delete(container)
        }
        await removeDockerObject(['image', 'rm', '-f', tag])
        leftovers.images.delete(tag)
    }
}

/**
 * Prove every selected kit's Docker image, in parallel.
 *
 * Each kit is scaffolded again, into a directory of its own: the boot step
 * ran the kit on the host, which writes a `deno.lock` and `node_modules/` into
 * its scaffold, and the image must be built from what `init` produces and
 * nothing else. Output is buffered per kit and printed in kit order.
 *
 * @param selected - The kits.
 * @param workdir - The run's temp directory.
 * @param registry - The loopback registry origin.
 * @param env - The registry environment `init` runs with.
 * @param initVersion - The `@lockness/init` version in the registry.
 * @param leftovers - Where containers and images are recorded until removed.
 * @returns The kits whose image did not build or never became healthy.
 */
async function dockerProofs(
    selected: readonly KitName[],
    workdir: string,
    registry: string,
    env: Record<string, string>,
    initVersion: string,
    leftovers: DockerLeftovers,
): Promise<KitName[]> {
    console.log('\n🐳 Docker: build each kit from a fresh scaffold, run it')
    const version = await runCommand('docker', [
        'version',
        '--format',
        '{{.Server.Version}}',
    ], workdir)
    if (!version.ok) {
        console.log(`  ❌ no usable Docker daemon\n${tail(version.output)}`)
        return [...selected]
    }
    console.log(`  ✅ Docker ${version.output.trim()}`)

    const root = join(workdir, 'docker')
    await Deno.mkdir(root)
    const proofs = selected.map(async (kit) => {
        const scaffold = await scaffoldKit(kit, root, {
            entry: `jsr:@lockness/init@${initVersion}`,
            env,
            local: false,
        })
        if (!scaffold.ok) {
            return {
                kit,
                ok: false,
                lines: [`  ❌ scaffold\n${tail(scaffold.output)}`],
            }
        }
        return {
            kit,
            ...await dockerProof(kit, scaffold.dir, registry, leftovers),
        }
    })
    const failed: KitName[] = []
    for (const { kit, ok, lines } of await Promise.all(proofs)) {
        console.log(`\n🐳 ${kit}`)
        for (const line of lines) console.log(line)
        if (!ok) failed.push(kit)
    }
    return failed
}

/** Smoke every kit, or the one that was named. */
async function main(): Promise<void> {
    const args = parseArgs(Deno.args, {
        string: ['kit'],
        boolean: ['keep', 'registry', 'docker'],
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

    if (args.docker && !args.registry) {
        // The image resolves the framework from a registry; only the
        // localhost one holds the code under test.
        console.error('--docker needs --registry.')
        Deno.exit(1)
    }

    if (args.registry) {
        if (!await smokeAgainstRegistry(selected, args.keep, args.docker)) {
            Deno.exit(1)
        }
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
