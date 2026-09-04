/**
 * @fileoverview `make:flag` — scaffold a feature-flag definition module.
 *
 * Package-command pattern (structural `Cli`, local stub reader). The name is
 * validated against a shape allowlist AND its output path verified contained
 * within the target dir (two layers, security S9).
 *
 * @module @lockness/features/cli_commands
 */

import { dirname, fromFileUrl, isAbsolute, join, relative } from '@std/path'

/** A CLI command handler. */
type CommandHandler = (args: string[]) => void | Promise<void>

/** Minimal structural CLI surface — no `@lockness/cli` import. */
export interface Cli {
    /** Register a named command. */
    register(name: string, handler: CommandHandler, description?: string): void
}

/** Where flag modules are scaffolded. */
export const FLAGS_DIR = './app/features'
/** Flag-name shape allowlist (letters, digits, `-`/`_`). */
const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/

const STUBS_PATH: string = import.meta.url.startsWith('file://')
    ? join(dirname(fromFileUrl(import.meta.url)), 'stubs')
    : new URL('./stubs', import.meta.url).href

/** Whether `target` resolves inside `root`. */
export function isContained(root: string, target: string): boolean {
    const rel = relative(root, target)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

async function processStub(
    stubName: string,
    replacements: Record<string, string>,
): Promise<string> {
    let content = await Deno.readTextFile(join(STUBS_PATH, `${stubName}.stub`))
    for (const [k, v] of Object.entries(replacements)) {
        content = content.replaceAll(`{{${k}}}`, v)
    }
    return content
}

/**
 * `make:flag <name>` — scaffold a flag definition module.
 *
 * @param args - CLI args; first non-flag token is the flag name.
 * @returns The path written, or `undefined` when rejected.
 */
export async function handleMakeFlag(
    args: string[],
): Promise<string | undefined> {
    const name = args.find((a) => !a.startsWith('-'))
    if (!name || !NAME_RE.test(name)) {
        console.error(
            `❌ Invalid flag name${
                name ? ` "${name}"` : ''
            } — letters, digits, - and _ only`,
        )
        return undefined
    }
    const fileName = `${name.replaceAll('-', '_')}_flag.ts`
    const filePath = join(FLAGS_DIR, fileName)
    if (!isContained(FLAGS_DIR, filePath)) {
        console.error(`❌ Refusing to write outside ${FLAGS_DIR}`)
        return undefined
    }
    const content = await processStub('flag', { name })
    await Deno.mkdir(dirname(filePath), { recursive: true })
    await Deno.writeTextFile(filePath, content)
    console.log(`✅ Flag created at ${filePath}`)
    return filePath
}

/**
 * Register the feature-flag CLI commands.
 *
 * @param cli - The CLI instance.
 */
export function registerFeaturesCommands(cli: Cli): void {
    cli.register(
        'make:flag',
        async (args) => {
            await handleMakeFlag(args)
        },
        'Scaffold a feature-flag definition',
    )
}
