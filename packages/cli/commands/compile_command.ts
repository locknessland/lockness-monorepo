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

import { Command, type CommandContext, type ICommand } from '../mod.ts';
import { join, dirname } from '@std/path';
import { ensureDir, exists, copy } from '@std/fs';
import { KERNEL_CONFIG } from '../../core/kernel/kernel_decorators.ts';
import { generateRoutesFile } from '../routes_generator.ts';

@Command('compile', 'Orchestrate binary compilation from @Kernel config')
export class CompileCommand implements ICommand {
    async handle(_ctx: CommandContext): Promise<void> {
        console.log('🚀 Orchestrating binary compilation...');

        // 1. Find and load the Kernel
        const kernelPath = join(Deno.cwd(), 'app', 'kernel.tsx');
        if (!(await exists(kernelPath))) {
            console.error(`❌ Kernel file not found at ${kernelPath}`);
            return;
        }

        try {
            const module = await import(`file://${kernelPath}`);
            const KernelClass = Object.values(module).find(
                (m: any) => m && m[KERNEL_CONFIG]
            ) as any;

            if (!KernelClass) {
                console.error('❌ No @Kernel decorated class found in app/kernel.tsx');
                return;
            }

            const kernelConfig = KernelClass[KERNEL_CONFIG];
            const config = kernelConfig.compile || {};
            const output = config.output || '_dist/lockness';
            const assets = config.assets || [];
            const scripts = config.scripts || [];
            const flags = config.flags || ['-A'];
            const main = config.main || 'main.ts';

            // 2. Prepare distribution directory
            const absOutput = join(Deno.cwd(), output);
            const distDir = dirname(absOutput);
            console.log(`\n📂 Preparing distribution directory: ${distDir}...`);
            await ensureDir(distDir);

            // 3. Framework Orchestration: Routes Generation
            // This is required for any Lockness app to run in production mode
            console.log('\n🗺️ Generating routes registry...');
            const controllersDir = kernelConfig.controllersDir || './app/controller';
            try {
                const result = await generateRoutesFile(controllersDir, './app/routes.ts');
                console.log(`  ✅ Generated ./app/routes.ts (${result.count} controllers)`);
            } catch (err) {
                console.warn(`  ⚠️ Failed to generate routes: ${(err as Error).message}`);
            }

            // 4. Run user-defined pre-compile scripts/commands
            // This allows the app to handle its own specific logic (like UI registry or docs syncing)
            if (scripts.length > 0) {
                console.log('\n📜 Running user-defined pre-compile scripts/commands...');
                for (const script of scripts) {
                    console.log(`  - Executing: ${script}...`);

                    let command: Deno.Command;
                    if (script.startsWith('deno ')) {
                        // Handle 'deno run' or 'deno task'
                        const [cmd, ...args] = script.split(' ');
                        command = new Deno.Command(cmd, {
                            args: args,
                        });
                    } else if (script.endsWith('.ts') || script.endsWith('.js')) {
                        // Direct script execution
                        command = new Deno.Command(Deno.execPath(), {
                            args: ['run', '-A', script],
                        });
                    } else {
                        // Generic shell command
                        const [cmd, ...args] = script.split(' ');
                        command = new Deno.Command(cmd, {
                            args: args,
                        });
                    }

                    const { success, stderr, stdout } = await command.output();
                    if (!success) {
                        console.error(`❌ Execution failed: ${script}`);
                        console.error(new TextDecoder().decode(stderr));
                        return;
                    }
                    if (stdout.length > 0) {
                        await Deno.stdout.write(stdout);
                    }
                }
            }

            // 5. Copy explicit assets
            // The user should declare their specific folders (like packages/core/docs) here
            if (assets.length > 0) {
                console.log('\n📦 Copying explicit assets...');
                for (const asset of assets) {
                    const source = typeof asset === 'string' ? asset : asset.source;
                    const target = typeof asset === 'string' ? asset : asset.target;

                    const sourcePath = join(Deno.cwd(), source);
                    const targetPath = join(distDir, target);

                    if (await exists(sourcePath)) {
                        console.log(`  - Copying ${source} to ${target}...`);
                        await ensureDir(dirname(targetPath));
                        await copy(sourcePath, targetPath, { overwrite: true });
                    } else {
                        console.warn(`  - ⚠️ Asset not found: ${source}`);
                    }
                }
            }

            // 6. Run deno compile
            console.log('\n🔨 Compiling binary...');
            const compileArgs = [
                'compile',
                `--output=${output}`,
                ...flags,
                main
            ];

            console.log(`  - Running: deno ${compileArgs.join(' ')}`);
            const compileCommand = new Deno.Command(Deno.execPath(), {
                args: compileArgs,
            });

            const { success, stderr } = await compileCommand.output();
            if (success) {
                console.log(`\n✅ Compilation successful! Binary created at: ${output}`);
            } else {
                console.error('\n❌ Compilation failed:');
                console.error(new TextDecoder().decode(stderr));
            }

        } catch (error) {
            console.error('❌ Failed to orchestrate compilation:', error);
        }
    }
}
