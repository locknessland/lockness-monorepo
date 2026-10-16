/**
 * @fileoverview Invocation for runtime R (plan 274 §5, audits A6 and S12):
 * the one place the framework spells the argv that runs a script or an npm
 * bin on Deno, Bun or Node.
 *
 * Core, drizzle, cli, the toolchain table and the generated `./nessy`
 * launcher all ask here; none of them spells `run`, `-A`, `--watch` or the
 * Node transform flag itself. An {@link Invocation} is a command and its
 * arguments, to hand to `spawn` **without a shell**: nothing here is ever
 * joined into a command line, so an argument is never re-parsed.
 *
 * The rules this module owns:
 *
 * - **The executable.** The current runtime runs under `process.execPath`;
 *   another runtime runs under its bare name (`deno`, `bun`, `node`), which
 *   `spawn` looks up on `PATH` without a shell.
 * - **npm bins run as their JS entry** under that executable
 *   ({@link resolveBinEntry} reads it from the package's `bin` field), never
 *   through a `node_modules/.bin` shim or a Windows `.cmd` file.
 * - **Which parent flags a Node child keeps** ({@link carriedExecArgv}): the
 *   transform hook's `--import`, `--conditions` and `--enable-source-maps`.
 *   Everything else is dropped — `--inspect*` above all, so a child never
 *   opens a second debugger port.
 * - **The Node transform hook** ({@link TRANSFORM_HOOK}) is loaded for a
 *   `.ts` / `.tsx` script on Node, and nowhere else.
 * - **Watch** is `--watch` on all three runtimes (never Bun's `--hot`, which
 *   breaks TC39 decorators, oven-sh/bun#44463); **all permissions** is `-A`
 *   on Deno and nothing on Bun and Node, which have no sandbox by default.
 *
 * @module @lockness/runtime/process
 */

import process from 'node:process'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { currentRuntime, type RuntimeId } from './runtime.ts'

/**
 * A command and its arguments, run without a shell.
 *
 * @example
 * ```ts
 * import { spawn } from 'node:child_process'
 *
 * const { command, args } = scriptInvocation('cli.ts', { allowAll: true })
 * spawn(command, args, { stdio: 'inherit' })
 * ```
 */
export interface Invocation {
    /** The executable: an absolute path, or a runtime name looked up on `PATH`. */
    readonly command: string
    /** Its arguments, each passed as one argv entry. */
    readonly args: readonly string[]
}

/**
 * The facts about the running process an invocation depends on. Defaults to
 * the real process; tests pass another.
 */
export interface HostProcess {
    /** The runtime this process runs on. */
    readonly runtime: RuntimeId
    /** The absolute path of its executable (`process.execPath`). */
    readonly execPath: string
    /** The runtime flags it was started with (`process.execArgv`). */
    readonly execArgv: readonly string[]
}

/** What both kinds of invocation accept. */
export interface InvocationOptions {
    /** The runtime to run on. Defaults to the current one. */
    readonly runtime?: RuntimeId
    /** Arguments for the script or bin, after it. */
    readonly args?: readonly string[]
    /** Grant every permission: `-A` on Deno; Bun and Node need nothing. */
    readonly allowAll?: boolean
    /** The running process. Defaults to the real one. */
    readonly host?: HostProcess
}

/** What a script invocation accepts beyond {@link InvocationOptions}. */
export interface ScriptOptions extends InvocationOptions {
    /** Restart on file changes: `--watch` on every runtime. */
    readonly watch?: boolean
}

/** The module Node imports to run TypeScript (`@lockness/transform`). */
export const TRANSFORM_HOOK = '@lockness/transform/register'

/** The `--import` flag that loads {@link TRANSFORM_HOOK}, in its one spelling. */
const HOOK_FLAG = `--import=${TRANSFORM_HOOK}`

/**
 * Raised when an npm bin's JS entry cannot be found, or would leave its
 * package.
 *
 * @example
 * ```ts
 * try {
 *     await resolveBinEntry(root, 'drizzle-kit')
 * } catch (error) {
 *     if (error instanceof BinResolutionError) console.error(error.message)
 * }
 * ```
 */
export class BinResolutionError extends Error {
    /**
     * Build the refusal.
     *
     * @param message - Which package and bin, and what is wrong.
     */
    constructor(message: string) {
        super(message)
        this.name = 'BinResolutionError'
    }
}

/**
 * The real process, read when an invocation is built.
 *
 * @returns Its runtime, executable and flags.
 * @throws {UnsupportedRuntimeError} From the detector, on an unsupported
 *   runtime.
 */
function realHost(): HostProcess {
    return {
        runtime: currentRuntime(),
        execPath: process.execPath,
        execArgv: process.execArgv,
    }
}

/**
 * The parent's Node flags a child keeps: the allowlist.
 *
 * Kept, normalised to their `--flag=value` form: `--enable-source-maps`,
 * `--conditions` (also `-C`), and `--import` of {@link TRANSFORM_HOOK} only.
 * Everything else is dropped with its value — `--inspect*`, `--require`,
 * `--loader`, an `--import` of any other module, memory limits.
 *
 * @param execArgv - The parent's `process.execArgv`.
 * @returns The flags to pass on, in their original order.
 *
 * @example
 * ```ts
 * carriedExecArgv(['--inspect-brk', '-C', 'dev', '--enable-source-maps'])
 * // ['--conditions=dev', '--enable-source-maps']
 * ```
 */
export function carriedExecArgv(execArgv: readonly string[]): string[] {
    const kept: string[] = []
    for (let i = 0; i < execArgv.length; i++) {
        const flag = execArgv[i]
        if (flag === '--enable-source-maps') {
            kept.push(flag)
            continue
        }
        const eq = flag.indexOf('=')
        const name = eq === -1 ? flag : flag.slice(0, eq)
        if (!['--conditions', '-C', '--import'].includes(name)) continue
        let value: string | undefined
        if (eq !== -1) {
            value = flag.slice(eq + 1)
        } else {
            value = execArgv[i + 1]
            i++
        }
        if (value === undefined) continue
        if (name === '--import') {
            if (value === TRANSFORM_HOOK) kept.push(HOOK_FLAG)
        } else {
            kept.push(`--conditions=${value}`)
        }
    }
    return kept
}

/**
 * Refuse a script or entry that the runtime would read as a flag.
 *
 * @param target - The script or entry path.
 * @param what - `script` or `bin entry`, for the message.
 * @throws {TypeError} When it is empty or starts with `-`.
 */
function assertNotFlag(target: string, what: string): void {
    if (target === '' || target.startsWith('-')) {
        throw new TypeError(
            `A ${what} must be a path, not empty or a flag: '${target}'. ` +
                "Prefix a relative path that starts with '-' with './'.",
        )
    }
}

/**
 * The executable and the leading arguments shared by both invocations.
 *
 * @param options - The invocation's options.
 * @returns The command, the runtime it runs, and the flags before the target.
 */
function prelude(
    options: InvocationOptions,
): { command: string; runtime: RuntimeId; flags: string[] } {
    const host = options.host ?? realHost()
    const runtime = options.runtime ?? host.runtime
    const same = runtime === host.runtime
    const command = same ? host.execPath : runtime
    if (runtime === 'deno') {
        return {
            command,
            runtime,
            flags: options.allowAll === true ? ['run', '-A'] : ['run'],
        }
    }
    // Only Node reports, in execArgv, flags a child must keep.
    const flags = runtime === 'node' && same
        ? carriedExecArgv(host.execArgv)
        : []
    return { command, runtime, flags }
}

/**
 * The invocation that runs a script on a runtime.
 *
 * A `.ts` / `.tsx` script on Node also loads {@link TRANSFORM_HOOK} (once,
 * even when the parent carried it already); a JavaScript script never does,
 * so built output runs without it.
 *
 * @param script - The script's path. Give a path, not a bare name: Bun reads
 *   a bare name as a `package.json` script.
 * @param options - Runtime, arguments, watch and permissions.
 * @returns The command and arguments, for `spawn` without a shell.
 * @throws {TypeError} When `script` is empty or starts with `-`.
 * @throws {UnsupportedRuntimeError} When no `host` is given and the current
 *   runtime is not supported.
 *
 * @example
 * ```ts
 * scriptInvocation('main.ts', { watch: true, allowAll: true })
 * // on Deno: { command: '/…/deno', args: ['run', '-A', '--watch', 'main.ts'] }
 * // on Node: { command: '/…/node', args: ['--import=@lockness/transform/register', '--watch', 'main.ts'] }
 * ```
 */
export function scriptInvocation(
    script: string,
    options: ScriptOptions = {},
): Invocation {
    assertNotFlag(script, 'script')
    const { command, runtime, flags } = prelude(options)
    const args = [...flags]
    if (
        runtime === 'node' && /\.tsx?$/.test(script) &&
        !args.includes(HOOK_FLAG)
    ) {
        args.push(HOOK_FLAG)
    }
    if (options.watch === true) args.push('--watch')
    args.push(script, ...(options.args ?? []))
    return { command, args }
}

/**
 * The invocation that runs an npm bin, as its JS entry under the runtime's
 * executable.
 *
 * Never adds the transform hook: a published bin is JavaScript. On Node the
 * allowlisted parent flags are kept, so a parent running with the hook passes
 * it on.
 *
 * @param entry - The bin's JS entry, from {@link resolveBinEntry}.
 * @param options - Runtime, arguments and permissions.
 * @returns The command and arguments, for `spawn` without a shell.
 * @throws {TypeError} When `entry` is empty or starts with `-`.
 * @throws {UnsupportedRuntimeError} When no `host` is given and the current
 *   runtime is not supported.
 *
 * @example
 * ```ts
 * const entry = await resolveBinEntry(appRoot, 'drizzle-kit')
 * binInvocation(entry, { allowAll: true, args: ['migrate'] })
 * ```
 */
export function binInvocation(
    entry: string,
    options: InvocationOptions = {},
): Invocation {
    assertNotFlag(entry, 'bin entry')
    const { command, flags } = prelude(options)
    return { command, args: [...flags, entry, ...(options.args ?? [])] }
}

/** An npm package name, scoped or not: no `..`, no extra `/`, no leading `.`. */
const NPM_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/

/**
 * Pick the entry for `bin` out of a manifest's `bin` field.
 *
 * @param field - The manifest's `bin` value.
 * @param packageName - The package, for the default bin name and messages.
 * @param bin - The bin asked for, if any.
 * @returns The entry, relative to the package directory.
 * @throws {BinResolutionError} When there is no such bin, or none was named
 *   among several.
 */
function pickEntry(
    field: unknown,
    packageName: string,
    bin: string | undefined,
): string {
    const unscoped = packageName.slice(packageName.indexOf('/') + 1)
    if (typeof field === 'string') {
        if (bin !== undefined && bin !== unscoped) {
            throw new BinResolutionError(
                `${packageName} has one bin, '${unscoped}', not '${bin}'.`,
            )
        }
        return field
    }
    if (typeof field !== 'object' || field === null || Array.isArray(field)) {
        throw new BinResolutionError(`${packageName} declares no bin.`)
    }
    const map = field as Record<string, unknown>
    const names = Object.keys(map)
    const name = bin ?? (names.length === 1 ? names[0] : undefined)
    if (name === undefined) {
        throw new BinResolutionError(
            `${packageName} has several bins (${names.join(', ')}): name one.`,
        )
    }
    const entry = map[name]
    if (typeof entry !== 'string') {
        throw new BinResolutionError(
            `${packageName} has no bin '${name}' (it has: ${
                names.join(', ')
            }).`,
        )
    }
    return entry
}

/**
 * Find an installed npm package's bin entry, from its `package.json`.
 *
 * Reads `<root>/node_modules/<packageName>/package.json`. A string `bin` is
 * the package's one bin, named after the package without its scope; an
 * object maps names to entries, and needs `bin` unless it has one entry.
 *
 * @param root - The project root holding `node_modules`.
 * @param packageName - The npm package, e.g. `drizzle-kit` or `@scope/tool`.
 * @param bin - Which bin, when the package has several.
 * @returns The entry's absolute path, inside the package directory.
 * @throws {BinResolutionError} When the name is not an npm package name, the
 *   package or its manifest is missing or unreadable, it has no such bin, or
 *   the entry points outside the package.
 *
 * @example
 * ```ts
 * await resolveBinEntry('/srv/app', 'drizzle-kit')
 * // '/srv/app/node_modules/drizzle-kit/bin.cjs'
 * ```
 */
export async function resolveBinEntry(
    root: string,
    packageName: string,
    bin?: string,
): Promise<string> {
    if (!NPM_NAME.test(packageName)) {
        throw new BinResolutionError(
            `'${packageName}' is not an npm package name.`,
        )
    }
    const packageDir = resolve(root, 'node_modules', packageName)
    const manifestPath = join(packageDir, 'package.json')
    let manifest: unknown
    try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (error) {
        throw new BinResolutionError(
            `Cannot read ${packageName}'s package.json at ${manifestPath}: ${
                error instanceof Error ? error.message : String(error)
            }. Is ${packageName} installed?`,
        )
    }
    const field = typeof manifest === 'object' && manifest !== null
        ? (manifest as { bin?: unknown }).bin
        : undefined
    const entry = pickEntry(field, packageName, bin)
    const path = resolve(packageDir, entry)
    const inside = relative(packageDir, path)
    if (
        entry === '' || inside === '' || inside === '..' ||
        inside.startsWith(`..${sep}`) ||
        isAbsolute(inside)
    ) {
        throw new BinResolutionError(
            `${packageName}'s bin entry '${entry}' points outside the package.`,
        )
    }
    return path
}
