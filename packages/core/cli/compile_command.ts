/**
 * @fileoverview Command to orchestrate binary compilation.
 *
 * This command reads the compile configuration from the @Kernel decorator
 * and performs the following steps:
 * 1. Prepares the distribution directory (_dist)
 * 2. Framework-level orchestration (e.g., routes registry generation)
 * 3. Runs user-defined pre-compile scripts/commands
 * 4. Copies declared assets to _dist
 * 5. Runs 'deno compile' with configured flags and output
 *
 * Every failure throws a {@link CoreCommandFailure}, so `Cli.dispatch()`
 * prints it once and the process exits non-zero — `RUN deno task cli compile`
 * fails a container build (#436). A failed step stops the command: no binary
 * is built from stale routes, without a declared asset, or after a failed
 * script. This file is the home of that rule (plan §5).
 */

import { dirname, join, relative } from '@std/path'
import { copy, ensureDir, exists, walk } from '@std/fs'
import {
    KERNEL_CONFIG,
    type KernelConfig,
} from '../kernel/kernel_decorators.ts'
import type { AssetMapping } from '../types.ts'
import { importAppFile } from '@lockness/contract/app-file/internal'
import { generateRoutesFile } from '../routing/generator.ts'
import { kernelFileNotFoundMessage, resolveKernelFile } from './kernel_file.ts'
import { CoreCommandFailure } from './command_failure.ts'

/**
 * Interface definition copied from @lockness/cli to avoid circular dependency.
 * The CLI will be able to register this class because it matches the expected interface.
 */
export interface CommandContext {
    readonly args: string[]
    arg(index: number): string | undefined
    hasFlag(name: string): boolean
    getFlag(name: string): string | undefined
}

export interface CommandContract {
    handle(ctx: CommandContext): Promise<void>
}

/**
 * Run one child process to completion and report its exit code.
 *
 * The child's stdout and stderr go straight to the terminal as they are
 * written: `compile` never decodes them into a message, so a failure names
 * only the step and the exit code.
 *
 * @param command - The program to run.
 * @param args - Its arguments.
 * @returns The child's exit code.
 * @throws When the program cannot be started at all (e.g. not found).
 */
export type StepRunner = (
    command: string,
    args: readonly string[],
) => Promise<number>

/**
 * The real {@link StepRunner}: spawns the child with inherited stdio and
 * waits for it to exit.
 */
const inheritStdio: StepRunner = async (command, args) => {
    const child = new Deno.Command(command, {
        args: [...args],
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
    }).spawn()
    const { code } = await child.status
    return code
}

/** Where `compile` writes the routes registry it generates. */
const ROUTES_FILE = './app/routes.ts'

/**
 * Load the `@Kernel` config `compile` reads, from the app's kernel file.
 *
 * The file is found by the lookup `ssg:build` shares (`resolveKernelFile`):
 * `app/kernel.ts` — what every scaffold ships — then `app/kernel.tsx`; when
 * both exist, `app/kernel.ts` wins.
 *
 * @param root - The app root. Defaults to the working directory.
 * @returns The kernel's config, or `undefined` when no kernel file exists.
 * @throws When the file fails to load, or declares no `@Kernel` class.
 * @internal Exported for tests.
 *
 * @example
 * ```ts
 * const config = await loadCompileKernel()
 * config?.compile?.output // '_dist/lockness' unless configured
 * ```
 */
export async function loadCompileKernel(
    root: string = Deno.cwd(),
): Promise<KernelConfig | undefined> {
    const kernel = await resolveKernelFile(root)
    if (kernel === undefined) return undefined
    const module = await importAppFile(kernel.path)
    for (const value of Object.values(module)) {
        const config = (value as { [KERNEL_CONFIG]?: KernelConfig } | null)
            ?.[KERNEL_CONFIG]
        if (config !== undefined) return config
    }
    throw new Error(`No @Kernel decorated class found in ${kernel.candidate}`)
}

/**
 * The `compile` command: builds a standalone binary from the `@Kernel`
 * `compile` config.
 *
 * @example
 * ```ts
 * cli.registerCommand(CompileCommand) // the CLI instantiates it with no runner
 * await new CompileCommand(fakeRunner).handle(ctx) // tests inject one
 * ```
 */
export class CompileCommand implements CommandContract {
    // We'll use a property instead of decorator to avoid dependency on CLI package
    static readonly _commandName = 'compile'
    static readonly _commandDescription =
        'Orchestrate binary compilation from @Kernel config'

    /**
     * @param run - Runs each child process (pre-compile scripts and
     *   `deno compile`). Defaults to spawning it with inherited stdio.
     */
    constructor(private readonly run: StepRunner = inheritStdio) {}

    /**
     * Compile the app, stopping at the first failed step.
     *
     * @param _ctx - Unused: `compile` takes no arguments.
     * @throws {CoreCommandFailure} When there is no kernel file, route
     *   generation fails, a pre-compile script or `deno compile` exits
     *   non-zero, or a declared asset is missing.
     * @throws Anything else (a kernel that fails to load, a copy that fails)
     *   as it was thrown, for the dispatcher to print with its frames.
     */
    async handle(_ctx: CommandContext): Promise<void> {
        console.log('🚀 Orchestrating binary compilation...')

        // 1. Find and load the Kernel
        const kernelConfig = await loadCompileKernel()
        if (kernelConfig === undefined) {
            throw new CoreCommandFailure(kernelFileNotFoundMessage())
        }
        const config = kernelConfig.compile || {}
        const output = config.output || '_dist/lockness'
        const flags = config.flags || ['-A']
        const main = config.main || 'main.ts'

        // 2. Prepare distribution directory
        const distDir = dirname(join(Deno.cwd(), output))
        console.log(`\n📂 Preparing distribution directory: ${distDir}...`)
        await ensureDir(distDir)

        // 3. Framework Orchestration: Routes Generation
        // A binary built from a stale registry would serve the wrong routes.
        await this.generateRoutes(
            kernelConfig.controllersDir || './app/controller',
        )

        // 4. Run user-defined pre-compile scripts/commands
        await this.runScripts(config.scripts || [])

        // 5. Copy explicit assets
        await this.copyAssets(config.assets || [], distDir)

        // 6. Run deno compile
        console.log('\n🔨 Compiling binary...')
        const compileArgs = ['compile', `--output=${output}`, ...flags, main]
        console.log(`  - Running: deno ${compileArgs.join(' ')}`)
        await this.runStep(
            'Compilation',
            'deno compile',
            Deno.execPath(),
            compileArgs,
        )
        console.log(`\n✅ Compilation successful! Binary created at: ${output}`)
    }

    /** Generate the routes registry, or fail with the error as `cause`. */
    private async generateRoutes(controllersDir: string): Promise<void> {
        console.log('\n🗺️ Generating routes registry...')
        try {
            const result = await generateRoutesFile(controllersDir, ROUTES_FILE)
            console.log(
                `  ✅ Generated ${ROUTES_FILE} (${result.count} controllers)`,
            )
        } catch (error) {
            throw new CoreCommandFailure(
                `Failed to generate ${ROUTES_FILE} from ${controllersDir}`,
                { cause: error },
            )
        }
    }

    /** Run each pre-compile script in order, stopping at the first failure. */
    private async runScripts(scripts: readonly string[]): Promise<void> {
        if (scripts.length === 0) return
        console.log('\n📜 Running user-defined pre-compile scripts/commands...')
        for (const script of scripts) {
            console.log(`  - Executing: ${script}...`)
            const step = `Pre-compile script "${script}"`
            if (script.endsWith('.ts') || script.endsWith('.js')) {
                await this.runStep(step, 'deno', Deno.execPath(), [
                    'run',
                    '-A',
                    script,
                ])
            } else {
                const [command, ...args] = script.split(' ')
                await this.runStep(step, command, command, args)
            }
        }
    }

    /**
     * Run one child process through the injected runner.
     *
     * @param step - What the step is, for the message (`Compilation`).
     * @param program - The program as the user knows it (`deno compile`).
     * @param command - The executable actually spawned.
     * @param args - Its arguments.
     * @throws {CoreCommandFailure} `<step> failed (<program> exited <code>)`
     *   when the child exits non-zero; its output has already been shown.
     */
    private async runStep(
        step: string,
        program: string,
        command: string,
        args: readonly string[],
    ): Promise<void> {
        const code = await this.run(command, args)
        if (code !== 0) {
            throw new CoreCommandFailure(
                `${step} failed (${program} exited ${code})`,
            )
        }
    }

    /** Copy every declared asset into `distDir`; a missing one fails. */
    private async copyAssets(
        assets: readonly (string | AssetMapping)[],
        distDir: string,
    ): Promise<void> {
        if (assets.length === 0) return
        console.log('\n📦 Copying explicit assets...')
        for (const asset of assets) {
            const source = typeof asset === 'string' ? asset : asset.source
            const target = typeof asset === 'string' ? asset : asset.target
            const sourcePath = join(Deno.cwd(), source)
            const targetPath = join(distDir, target)

            if (!(await exists(sourcePath))) {
                throw new CoreCommandFailure(
                    `Declared asset not found: ${source}`,
                )
            }
            console.log(`  - Copying ${source} to ${target}...`)
            await ensureDir(dirname(targetPath))

            if (typeof asset !== 'string' && asset.include) {
                const include = asset.include
                const regex = typeof include === 'string'
                    ? new RegExp(include)
                    : include

                for await (const entry of walk(sourcePath)) {
                    if (entry.isDirectory) continue
                    if (regex.test(entry.path)) {
                        const destPath = join(
                            targetPath,
                            relative(sourcePath, entry.path),
                        )
                        await ensureDir(dirname(destPath))
                        await Deno.copyFile(entry.path, destPath)
                    }
                }
            } else {
                await copy(sourcePath, targetPath, { overwrite: true })
            }
        }
    }
}
