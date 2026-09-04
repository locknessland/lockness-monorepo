/**
 * @fileoverview Tests for Mailable + markdown body — SC-004 + make:mail.
 *
 * @module @lockness/mail/tests/mailable
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { configureMail, MemoryMailDriver } from '../mod.ts'
import { Mailable, type MailableContent } from '../mailable.ts'
import { MailPackageMissingError } from '../optional.ts'
import { handleMakeMail } from '../cli_commands.ts'

class Welcome extends Mailable {
    constructor(private readonly to: string) {
        super()
    }
    build(): MailableContent {
        return { to: this.to, subject: 'Welcome', markdown: '# Hi there' }
    }
}

Deno.test('SC-004: a markdown mailable renders markdown → HTML body via soft markdown', async () => {
    configureMail({ driver: 'memory' })
    MemoryMailDriver.clear()
    // Fake @lockness/markdown module (renderMarkdown → JSX-like, stringified).
    const fakeImporter = () =>
        Promise.resolve({
            renderMarkdown: (md: string) =>
                Promise.resolve({ toString: () => `<h1>${md.slice(2)}</h1>` }),
        })
    const result = await new Welcome('a@b.c').send(fakeImporter)
    assertEquals(result.success, true)
    const sent = MemoryMailDriver.getLastEmail()
    assertEquals(sent?.subject, 'Welcome')
    assertEquals(sent?.html, '<h1>Hi there</h1>')
    MemoryMailDriver.clear()
})

Deno.test('SC-004: a missing @lockness/markdown yields the install error, not a stack', async () => {
    configureMail({ driver: 'memory' })
    const missing = () => {
        throw new TypeError(
            'Relative import path "@lockness/markdown" not in import map',
        )
    }
    const err = await assertRejects(
        () => new Welcome('a@b.c').send(missing),
        MailPackageMissingError,
    )
    assert(err.message.includes('@lockness/markdown'))
})

Deno.test('a plain HTML mailable needs no markdown', async () => {
    configureMail({ driver: 'memory' })
    MemoryMailDriver.clear()
    class Plain extends Mailable {
        build(): MailableContent {
            return { to: 'x@y.z', subject: 'S', html: '<p>hi</p>' }
        }
    }
    await new Plain().send()
    assertEquals(MemoryMailDriver.getLastEmail()?.html, '<p>hi</p>')
    MemoryMailDriver.clear()
})

Deno.test('make:mail scaffolds + rejects a traversal name', async () => {
    const dir = await Deno.makeTempDir()
    const prev = Deno.cwd()
    Deno.chdir(dir)
    try {
        const path = await handleMakeMail(['Welcome'])
        assertEquals(path, 'app/mail/welcome_mail.ts')
        assert(await Deno.readTextFile(`${dir}/app/mail/welcome_mail.ts`))
        assertEquals(await handleMakeMail(['../../etc/x']), undefined)
    } finally {
        Deno.chdir(prev)
        await Deno.remove(dir, { recursive: true })
    }
})
