/**
 * @fileoverview `make:searchable` — scaffold a Searchable repository pattern.
 *
 * Package-command pattern (structural `Cli`, local stub reader). The model name
 * is shape-validated AND its output path verified contained (two layers, S9).
 *
 * @module @lockness/search/cli_commands
 */

import { dirname, fromFileUrl, isAbsolute, join, relative } from '@std/path'

/** A CLI command handler. */
type CommandHandler = (args: string[]) => void | Promise<void>

/** Minimal structural CLI surface. */
export interface Cli {
    /** Register a named command. */
    register(name: string, handler: CommandHandler, description?: string): void
}

/** Where searchable modules are scaffolded. */
export const SEARCHABLE_DIR = './app/search'
/** Model-name shape allowlist (PascalCase-ish). */
const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/

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
 * `make:searchable <Model>` — scaffold a Searchable module for a model.
 *
 * @param args - CLI args; first non-flag token is the model name.
 * @returns The path written, or `undefined` when rejected.
 */
export async function handleMakeSearchable(
    args: string[],
): Promise<string | undefined> {
    const name = args.find((a) => !a.startsWith('-'))
    if (!name || !NAME_RE.test(name)) {
        console.error(
            `❌ Invalid model name${
                name ? ` "${name}"` : ''
            } — letters and digits only`,
        )
        return undefined
    }
    const fileName = `${name.toLowerCase()}_searchable.ts`
    const filePath = join(SEARCHABLE_DIR, fileName)
    if (!isContained(SEARCHABLE_DIR, filePath)) {
        console.error(`❌ Refusing to write outside ${SEARCHABLE_DIR}`)
        return undefined
    }
    const content = await processStub('searchable', {
        Model: name,
        index: `${name.toLowerCase()}s`,
    })
    await Deno.mkdir(dirname(filePath), { recursive: true })
    await Deno.writeTextFile(filePath, content)
    console.log(`✅ Searchable created at ${filePath}`)
    return filePath
}

/**
 * Register the search CLI commands.
 *
 * @param cli - The CLI instance.
 */
export function registerSearchCommands(cli: Cli): void {
    cli.register(
        'make:searchable',
        async (args) => {
            await handleMakeSearchable(args)
        },
        'Scaffold a Searchable projection for a model',
    )
}
