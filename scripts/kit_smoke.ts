#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-net
/**
 * @fileoverview Scaffold each starter kit and prove it actually works.
 *
 * A kit is a promise that `deno run -A jsr:@lockness/init my-app --kit=<name>`
 * gives someone a project that boots. Nothing else in the repository checks
 * that promise: the framework's own suite tests the framework, and the stub
 * files are inert text until something scaffolds them.
 *
 * Each kit is taken through the four steps a new user takes, in order —
 * scaffold, type-check, test, boot — and the first failure stops that kit.
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
import { join } from '@std/path'
import { type KitName, KITS } from '@lockness/init'

const ROOT = Deno.cwd()
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
 * Take one kit through scaffold → check → test → boot.
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
    const name = `${kit}-app`
    const dir = join(workdir, name)
    console.log(`\n🎒 ${kit} — ${KITS[kit].summary}`)

    const scaffold = await run(Deno.execPath(), [
        'run',
        '-A',
        join(PACKAGES, 'init', 'mod.ts'),
        name,
        '--kit',
        kit,
    ], workdir)
    if (!scaffold.ok) {
        console.log(`  ❌ scaffold\n${tail(scaffold.output)}`)
        return false
    }
    console.log('  ✅ scaffold')

    const rewritten = await useLocalWorkspace(dir)
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
