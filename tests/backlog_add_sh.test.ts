/**
 * @fileoverview #289 — `add.sh` must place an item even when the board's own
 * auto-add workflow wins the race to attach it.
 *
 * **Every `gh` call is stubbed, and that is the point.** The acceptance
 * criterion asks for a check that is meaningful on a board WITHOUT the
 * `Item added to project` workflow — and that workflow is a per-project
 * setting on the real board, which these tests must not depend on and cannot
 * turn off. A stub reproduces the collision on demand, asserts the placement
 * that follows it, and touches no network and no backlog.
 *
 * @module tests/backlog_add_sh
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'

const SCRIPT = new URL(
    '../.specnaut/scripts/backlog/add.sh',
    import.meta.url,
).pathname

/** The item id the recovery query is expected to find. */
const EXISTING_ITEM_ID = 'PVTI_existing_item'

/**
 * Write a fake `gh` whose `project item-add` behaves as `mode` dictates, and
 * which answers every other subcommand the script reaches.
 *
 * Each invocation appends its argv to `$GH_LOG`, so a test can assert what the
 * script actually did rather than only what it printed.
 */
async function fakeGh(
    dir: string,
    mode: 'collide' | 'ok' | 'other-error',
): Promise<void> {
    const addArm = {
        collide:
            `echo 'failed to run git: GraphQL: Content already exists in this project (addProjectV2ItemById)' >&2; exit 1`,
        ok: `echo 'PVTI_fresh_item'; exit 0`,
        'other-error':
            `echo 'HTTP 403: Resource not accessible by integration' >&2; exit 1`,
    }[mode]

    await Deno.writeTextFile(
        `${dir}/gh`,
        `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GH_LOG"
case "$1 $2" in
  'issue create')
    echo 'https://github.com/acme/widgets/issues/4242'; exit 0 ;;
  'project item-add')
    ${addArm} ;;
  'project item-edit')
    exit 0 ;;
  'project field-list')
    echo '{"fields":[{"id":"F_status","name":"Status","type":"ProjectV2SingleSelectField","options":[{"id":"OPT_backlog","name":"Backlog"},{"id":"OPT_done","name":"Done"}]}]}'
    exit 0 ;;
  'project view')
    echo '{"id":"PVT_board"}'; exit 0 ;;
  'api graphql')
    echo '{"data":{"repository":{"issue":{"projectItems":{"nodes":[
      {"id":"PVTI_other_board","project":{"number":99}},
      {"id":"${EXISTING_ITEM_ID}","project":{"number":2}}
    ]}}}}}'
    exit 0 ;;
esac
exit 0
`,
    )
    await Deno.chmod(`${dir}/gh`, 0o755)
}

/** Run `add.sh` with the fake `gh` first on PATH. */
async function runAdd(
    mode: 'collide' | 'ok' | 'other-error',
): Promise<{ code: number; stdout: string; stderr: string; log: string }> {
    const dir = await Deno.makeTempDir()
    try {
        await fakeGh(dir, mode)
        const log = `${dir}/gh.log`
        await Deno.writeTextFile(log, '')
        const run = await new Deno.Command('bash', {
            args: [SCRIPT, 'a title'],
            env: {
                PATH: `${dir}:${Deno.env.get('PATH') ?? ''}`,
                GH_LOG: log,
                HOME: Deno.env.get('HOME') ?? '',
            },
            stdout: 'piped',
            stderr: 'piped',
        }).output()
        return {
            code: run.code,
            stdout: new TextDecoder().decode(run.stdout),
            stderr: new TextDecoder().decode(run.stderr),
            log: await Deno.readTextFile(log),
        }
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

Deno.test("#289: a collision with the board's auto-add still places the item", async () => {
    const { code, stdout, log } = await runAdd('collide')

    // The collision is SUCCESS. Before the fix `set -e` killed the script on
    // the item-add line, which sits above every failure-tolerant line — so the
    // one step whose absence the script's own comment warns about was the one
    // step skipped.
    assertEquals(code, 0, `add.sh aborted on the collision:\n${stdout}`)

    // And placement is what actually matters: an item with a null Status
    // matches no column filter, so it is invisible to every board view and to
    // any grooming sweep that enumerates the columns.
    assertStringIncludes(stdout, '✓ placed in Backlog')

    // ATTRIBUTION, not just an exit code: the edit must carry the id the
    // RECOVERY query found. Ignoring the error without recovering the id would
    // leave `item-edit` with nothing to edit and the null Status standing —
    // and the script would still exit 0 and still print a URL.
    const edit = log.split('\n').find((l) => l.startsWith('project item-edit'))
    assert(edit, `no item-edit was issued:\n${log}`)
    assertStringIncludes(edit, EXISTING_ITEM_ID)
    // The right board, too. The recovery query filters by project NUMBER, and
    // an issue can sit on several projects at once.
    assert(
        !edit.includes('PVTI_other_board'),
        'the item id was taken from the wrong project',
    )
})

Deno.test('#289: the ordinary attach path is unchanged', async () => {
    const { code, stdout, log } = await runAdd('ok')
    assertEquals(code, 0)
    assertStringIncludes(stdout, '✓ attached to Project #2')
    assertStringIncludes(stdout, '✓ placed in Backlog')
    // No recovery query on the happy path — it costs an API call, and the
    // id came back from `item-add` itself.
    assert(
        !log.includes('api graphql'),
        'the recovery query ran when nothing had collided',
    )
    const edit = log.split('\n').find((l) => l.startsWith('project item-edit'))
    assert(edit && edit.includes('PVTI_fresh_item'), `wrong id edited: ${edit}`)
})

Deno.test('#289: any OTHER attach failure still reaches the caller', async () => {
    const { code, stderr } = await runAdd('other-error')
    // Swallowing every failure would trade this defect for a worse one — an
    // item that is not on the board at all, reported only in a warning.
    assert(code !== 0, 'a 403 on attach was swallowed')
    assertStringIncludes(stderr, 'Resource not accessible')
})
