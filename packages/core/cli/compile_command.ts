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
 */

import { dirname, join, relative } from '@std/path'
import { copy, ensureDir, exists, walk } from '@std/fs'
import { KERNEL_CONFIG } from '../kernel/kernel_decorators.ts'
import { generateRoutesFile } from '../routing/generator.ts'

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

export class CompileCommand implements CommandContract {
    // We'll use a property instead of decorator to avoid dependency on CLI package
    static readonly _commandName = 'compile'
    static readonly _commandDescription =
        'Orchestrate binary compilation from @Kernel config'

    async handle(_ctx: CommandContext): Promise<void> {
        console.log('🚀 Orchestrating binary compilation...')

        // 1. Find and load the Kernel
        const kernelPath = join(Deno.cwd(), 'app', 'kernel.tsx')
        if (!(await exists(kernelPath))) {
            console.error(`❌ Kernel file not found at ${kernelPath}`)
            return
        }

        try {
            const module = await import(`file://${kernelPath}`)
            const KernelClass = Object.values(module).find(
                (m: any) => m && m[KERNEL_CONFIG],
            ) as any

            if (!KernelClass) {
                console.error(
                    '❌ No @Kernel decorated class found in app/kernel.tsx',
                )
                return
            }

            const kernelConfig = KernelClass[KERNEL_CONFIG]
            const config = kernelConfig.compile || {}
            const output = config.output || '_dist/lockness'
            const assets = config.assets || []
            const scripts = config.scripts || []
            const flags = config.flags || ['-A']
            const main = config.main || 'main.ts'

            // 2. Prepare distribution directory
            const absOutput = join(Deno.cwd(), output)
            const distDir = dirname(absOutput)
            console.log(`\n📂 Preparing distribution directory: ${distDir}...`)
            await ensureDir(distDir)

            // 3. Framework Orchestration: Routes Generation
            // This is required for any Lockness app to run in production mode
            console.log('\n🗺️ Generating routes registry...')
            const controllersDir = kernelConfig.controllersDir ||
                './app/controller'

            try {
                const result = await generateRoutesFile(
                    controllersDir,
                    './app/routes.ts',
                )
                console.log(
                    `  ✅ Generated ./app/routes.ts (${result.count} controllers)`,
                )
            } catch (err) {
                console.warn(
                    `  ⚠️ Failed to generate routes: ${(err as Error).message}`,
                )
            }

            // 4. Run user-defined pre-compile scripts/commands
            if (scripts.length > 0) {
                console.log(
                    '\n📜 Running user-defined pre-compile scripts/commands...',
                )
                for (const script of scripts) {
                    console.log(`  - Executing: ${script}...`)
                    let command: Deno.Command
                    if (script.startsWith('deno ')) {
                        const [cmd, ...args] = script.split(' ')
                        command = new Deno.Command(cmd, { args })
                    } else if (
                        script.endsWith('.ts') || script.endsWith('.js')
                    ) {
                        command = new Deno.Command(Deno.execPath(), {
                            args: ['run', '-A', script],
                        })
                    } else {
                        const [cmd, ...args] = script.split(' ')
                        command = new Deno.Command(cmd, { args })
                    }

                    const { success, stderr, stdout } = await command.output()
                    if (!success) {
                        console.error(`❌ Execution failed: ${script}`)
                        console.error(new TextDecoder().decode(stderr))
                        return
                    }
                    if (stdout.length > 0) {
                        await Deno.stdout.write(stdout)
                    }
                }
            }

            // 5. Copy explicit assets
            if (assets.length > 0) {
                console.log('\n📦 Copying explicit assets...')
                for (const asset of assets) {
                    const source = typeof asset === 'string'
                        ? asset
                        : asset.source
                    const target = typeof asset === 'string'
                        ? asset
                        : asset.target
                    const sourcePath = join(Deno.cwd(), source)
                    const targetPath = join(distDir, target)

                    if (await exists(sourcePath)) {
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
                                    const relPath = relative(
                                        sourcePath,
                                        entry.path,
                                    )
                                    const destPath = join(targetPath, relPath)
                                    await ensureDir(dirname(destPath))
                                    await Deno.copyFile(entry.path, destPath)
                                }
                            }
                        } else {
                            await copy(sourcePath, targetPath, {
                                overwrite: true,
                            })
                        }
                    } else {
                        console.warn(`  - ⚠️ Asset not found: ${source}`)
                    }
                }
            }

            // 6. Run deno compile
            console.log('\n🔨 Compiling binary...')
            const compileArgs = [
                'compile',
                `--output=${output}`,
                ...flags,
                main,
            ]
            console.log(`  - Running: deno ${compileArgs.join(' ')}`)
            const compileCommand = new Deno.Command(Deno.execPath(), {
                args: compileArgs,
            })

            const { success, stderr } = await compileCommand.output()
            if (success) {
                console.log(
                    `\n✅ Compilation successful! Binary created at: ${output}`,
                )
            } else {
                console.error('\n❌ Compilation failed:')
                console.error(new TextDecoder().decode(stderr))
            }
        } catch (error) {
            console.error('❌ Failed to orchestrate compilation:', error)
        }
    }
}
