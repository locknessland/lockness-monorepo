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
 * Left alone it would resolve `jsr:@lockness/core@^0.2.0` and test the *last
 * release*, which is exactly the version that cannot contain the change you
 * are about to push. `deno task publish:check` is what covers resolution from
 * the registry; this covers the kits against the code in front of you.
 *
 * @example
 * ```bash
 * deno task kits:smoke              # all kits
 * deno task kits:smoke --kit slim   # one of them
 * deno task kits:smoke --keep       # leave the scaffolds on disk to poke at
 * ```
 *
 * @module
 */

import { parseArgs } from '@std/cli'
import { fromFileUrl, join } from '@std/path'
import { type KitName, KITS } from '@lockness/init'
import { MIGRATIONS_DIR, readTree, shipsMigrations } from './kit_migrations.ts'

// From this file, not the working directory: the live-postgres suite imports
// `scaffoldKit`, and a test runner's cwd is not this script's to assume.
const ROOT = fromFileUrl(new URL('..', import.meta.url))
const PACKAGES = join(ROOT, 'packages')

/** How long a kit's server gets to answer before the boot step fails. */
const BOOT_TIMEOUT_MS = 30_000

/** What one step produced. */
interface StepResult {
    readonly ok: boolean
    readonly detail: string
}

/**
 * Run a command inside a directory and capture everything it said.
 *
 * @param cmd - Executable.
 * @param args - Arguments.
 * @param cwd - Working directory.
 * @returns Success, and the combined output for a failure message.
 */
async function run(
    cmd: string,
    args: string[],
    cwd: string,
): Promise<{ ok: boolean; output: string }> {
    const { success, stdout, stderr } = await new Deno.Command(cmd, {
        args,
        cwd,
        stdout: 'piped',
        stderr: 'piped',
    }).output()
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

/**
 * Start the app, ask it for `/`, and stop it.
 *
 * Polling rather than sleeping: a fixed wait is either flaky on a cold cache
 * or slow on a warm one, and this has to run in CI.
 *
 * @param dir - The scaffolded project.
 * @param port - A port nothing else is using.
 * @returns Whether the server answered.
 */
async function boots(dir: string, port: number): Promise<StepResult> {
    const child = new Deno.Command(Deno.execPath(), {
        args: ['run', '-A', 'main.ts'],
        cwd: dir,
        env: { ...Deno.env.toObject(), PORT: String(port) },
        stdout: 'piped',
        stderr: 'piped',
    }).spawn()

    const started = Date.now()
    let lastError = 'never answered'
    try {
        while (Date.now() - started < BOOT_TIMEOUT_MS) {
            try {
                const response = await fetch(`http://localhost:${port}/`)
                // Drain it, or the connection keeps the process alive.
                await response.text()
                if (response.ok) {
                    return {
                        ok: true,
                        detail: `HTTP ${response.status} in ${
                            Date.now() - started
                        }ms`,
                    }
                }
                lastError = `HTTP ${response.status}`
            } catch (error) {
                lastError = (error as Error).message
            }
            await new Promise((resolve) => setTimeout(resolve, 400))
        }
        return { ok: false, detail: `${lastError} within ${BOOT_TIMEOUT_MS}ms` }
    } finally {
        try {
            child.kill('SIGKILL')
        } catch {
            // Already gone.
        }
        // Awaited so the pipes close and the sanitizer stays quiet.
        await child.status
        await child.stdout.cancel()
        await child.stderr.cancel()
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
    /** How many `@lockness/*` imports were repointed; 0 when `ok` is false. */
    readonly rewritten: number
}

/**
 * Scaffold a kit the way a user does — `init`'s own entry point, in a
 * subprocess — and repoint it at this working tree.
 *
 * @param kit - The kit.
 * @param workdir - The directory to scaffold into.
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
): Promise<ScaffoldResult> {
    const name = `${kit}-app`
    const dir = join(workdir, name)
    const scaffold = await run(Deno.execPath(), [
        'run',
        '-A',
        join(PACKAGES, 'init', 'mod.ts'),
        name,
        '--kit',
        kit,
    ], workdir)
    if (!scaffold.ok) {
        return { ok: false, output: scaffold.output, dir, rewritten: 0 }
    }
    const rewritten = await useLocalWorkspace(dir)
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

/** Smoke every kit, or the one that was named. */
async function main(): Promise<void> {
    const args = parseArgs(Deno.args, {
        string: ['kit'],
        boolean: ['keep'],
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
