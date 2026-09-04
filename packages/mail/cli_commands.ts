/**
 * @fileoverview `make:mail` — scaffold a `Mailable` subclass.
 *
 * Package-command pattern (structural `Cli`, local stub reader). The name is
 * shape-validated AND its output path verified contained (two layers, S9).
 *
 * @module @lockness/mail/cli_commands
 */

import { dirname, fromFileUrl, isAbsolute, join, relative } from '@std/path'

/** A CLI command handler. */
type CommandHandler = (args: string[]) => void | Promise<void>

/** Minimal structural CLI surface. */
export interface Cli {
    /** Register a named command. */
    register(name: string, handler: CommandHandler, description?: string): void
}

/** Where mailables are scaffolded. */
export const MAIL_DIR = './app/mail'
/** Mailable-name shape allowlist (PascalCase-ish). */
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
 * `make:mail <Name>` — scaffold a `Mailable` subclass.
 *
 * @param args - CLI args; first non-flag token is the mailable name.
 * @returns The path written, or `undefined` when rejected.
 */
export async function handleMakeMail(
    args: string[],
): Promise<string | undefined> {
    const name = args.find((a) => !a.startsWith('-'))
    if (!name || !NAME_RE.test(name)) {
        console.error(
            `❌ Invalid mailable name${
                name ? ` "${name}"` : ''
            } — letters and digits only`,
        )
        return undefined
    }
    const fileName = `${name.toLowerCase()}_mail.ts`
    const filePath = join(MAIL_DIR, fileName)
    if (!isContained(MAIL_DIR, filePath)) {
        console.error(`❌ Refusing to write outside ${MAIL_DIR}`)
        return undefined
    }
    const content = await processStub('mailable', { Model: name })
    await Deno.mkdir(dirname(filePath), { recursive: true })
    await Deno.writeTextFile(filePath, content)
    console.log(`✅ Mailable created at ${filePath}`)
    return filePath
}

/**
 * Register the mail CLI commands.
 *
 * @param cli - The CLI instance.
 */
export function registerMailCommands(cli: Cli): void {
    cli.register(
        'make:mail',
        async (args) => {
            await handleMakeMail(args)
        },
        'Scaffold a Mailable',
    )
}
