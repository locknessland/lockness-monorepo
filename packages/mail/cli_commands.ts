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

/**
 * A failed mail command. `@lockness/cli` recognises a failure by its shape — an
 * integer `exitCode` — so mail raises one without importing the CLI: the
 * dispatcher prints the message once and exits with this status. Deliberately
 * not exported (#436, D1).
 */
class MailCommandError extends Error {
    /** The process exit status the dispatcher maps this failure to. */
    readonly exitCode = 1
    override readonly name = 'MailCommandError'
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
 * Internal: reached through `registerMailCommands`, not the package barrel.
 *
 * @param args - CLI args; first non-flag token is the mailable name.
 * @returns The path written.
 * @throws {MailCommandError} When the name is missing or malformed, or its
 *   path would leave {@link MAIL_DIR}.
 */
export async function handleMakeMail(args: string[]): Promise<string> {
    const name = args.find((a) => !a.startsWith('-'))
    if (!name || !NAME_RE.test(name)) {
        throw new MailCommandError(
            `Invalid mailable name${
                name ? ` "${name}"` : ''
            } — letters and digits only`,
        )
    }
    const fileName = `${name.toLowerCase()}_mail.ts`
    const filePath = join(MAIL_DIR, fileName)
    if (!isContained(MAIL_DIR, filePath)) {
        throw new MailCommandError(`Refusing to write outside ${MAIL_DIR}`)
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
