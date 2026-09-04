/**
 * @fileoverview `Mailable` — a class that builds a mail's envelope + body,
 * with an optional **markdown** body rendered through soft-loaded
 * `@lockness/markdown`.
 *
 * The markdown render goes through mail's OWN `tryImport` (a variable
 * specifier); the render result is treated as `unknown` and stringified — no
 * value/`import type` of `@lockness/markdown` (H1).
 *
 * @module @lockness/mail/mailable
 */

import { mail } from './mail.ts'
import type { MailResult } from './types.ts'
import { type ModuleImporter, tryImport } from './optional.ts'

/** The envelope + body a mailable produces. */
export interface MailableContent {
    /** The recipient(s). */
    to: string | string[]
    /** The subject line. */
    subject: string
    /** A markdown body — rendered to HTML through `@lockness/markdown`. */
    markdown?: string
    /** A raw HTML body (used when no markdown). */
    html?: string
    /** A plain-text body. */
    text?: string
}

/** The soft-loaded `@lockness/markdown` shape used here. */
interface MarkdownModule {
    renderMarkdown(content: string): Promise<unknown>
}

/**
 * A reusable, templated mail. Subclass and implement {@link build}.
 *
 * @example
 * ```ts
 * class WelcomeMail extends Mailable {
 *     constructor(private readonly user: { email: string; name: string }) { super() }
 *     build() {
 *         return { to: this.user.email, subject: 'Welcome', markdown: `# Hi ${this.user.name}` }
 *     }
 * }
 * await new WelcomeMail(user).send()
 * ```
 */
export abstract class Mailable {
    /**
     * Build this mailable's envelope + body.
     *
     * @returns The mailable content.
     */
    abstract build(): MailableContent | Promise<MailableContent>

    /**
     * The registry key used to rehydrate this mailable in a queued job.
     * Defaults to the constructor name.
     *
     * @returns The registry key.
     */
    mailableName(): string {
        return this.constructor.name
    }

    /**
     * The constructor payload persisted in a queued job — **identifiers only**,
     * never a rendered body. Defaults to `undefined`; override to return the
     * data needed to reconstruct this mailable in the worker.
     *
     * @returns The JSON-serialisable constructor payload.
     */
    toQueue(): unknown {
        return undefined
    }

    /**
     * Render + send this mailable now (inline).
     *
     * @param importer - Test seam for the markdown soft-load.
     * @returns The send result.
     */
    async send(importer?: ModuleImporter): Promise<MailResult> {
        const content = await this.build()
        const message = mail().to(content.to).subject(content.subject)
        if (content.markdown !== undefined) {
            const md = await tryImport<MarkdownModule>(
                '@lockness/markdown',
                'markdown mailables',
                importer,
            )
            // renderMarkdown returns JSX (unknown); stringify to an HTML body.
            message.html(String(await md.renderMarkdown(content.markdown)))
        } else if (content.html !== undefined) {
            message.html(content.html)
        } else if (content.text !== undefined) {
            message.text(content.text)
        }
        return message.send()
    }
}
