/**
 * @fileoverview Tests for `scripts/git_env.ts`: the environment every
 * release/CI script hands to a `git` subprocess.
 *
 * @module
 */

import { assert, assertEquals } from '@std/assert'
import { GIT_ENV_LEAK_KEYS, sanitizedGitEnv } from './git_env.ts'

Deno.test('sanitizedGitEnv strips every leak key and keeps everything else', () => {
    const base: Record<string, string> = {
        HOME: '/home/fixture',
        PATH: '/usr/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'fixture',
        GIT_CONFIG_KEY_0: 'core.hooksPath',
        GIT_CONFIG_VALUE_0: '/decoy/hooks',
    }
    for (const key of GIT_ENV_LEAK_KEYS) base[key] = `/decoy/${key}`

    const env = sanitizedGitEnv(base)
    for (const key of GIT_ENV_LEAK_KEYS) {
        if (key === 'GIT_NO_REPLACE_OBJECTS') continue
        assertEquals(env[key], undefined, `${key} was kept`)
    }
    assertEquals(env.GIT_CONFIG_KEY_0, undefined)
    assertEquals(env.GIT_CONFIG_VALUE_0, undefined)
    assertEquals(env.HOME, '/home/fixture')
    assertEquals(env.PATH, '/usr/bin')
    assertEquals(env.GIT_CONFIG_GLOBAL, '/dev/null')
    assertEquals(env.GIT_AUTHOR_NAME, 'fixture')
})

Deno.test('sanitizedGitEnv strips GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE', () => {
    const env = sanitizedGitEnv({
        GIT_DIR: '/decoy/.git',
        GIT_WORK_TREE: '/decoy',
        GIT_INDEX_FILE: '/decoy/.git/index',
    })
    assertEquals(env.GIT_DIR, undefined)
    assertEquals(env.GIT_WORK_TREE, undefined)
    assertEquals(env.GIT_INDEX_FILE, undefined)
})

Deno.test('sanitizedGitEnv never mutates the environment it was given', () => {
    const base = { GIT_DIR: '/decoy/.git', HOME: '/h' }
    const env = sanitizedGitEnv(base)
    assertEquals(base, { GIT_DIR: '/decoy/.git', HOME: '/h' })
    assertEquals(env, { HOME: '/h', GIT_NO_REPLACE_OBJECTS: '1' })
})

Deno.test('GIT_ENV_LEAK_KEYS is exactly what git rev-parse --local-env-vars prints', async () => {
    // Outside any repository, so nothing is read from one.
    const cwd = await Deno.makeTempDir({ prefix: 'git-env-' })
    const run = await new Deno.Command('git', {
        args: ['rev-parse', '--local-env-vars'],
        cwd,
        clearEnv: true,
        env: { PATH: Deno.env.get('PATH') ?? '/usr/bin:/bin' },
        stdout: 'piped',
        stderr: 'piped',
    }).output().finally(() => Deno.remove(cwd, { recursive: true }))
    assertEquals(run.success, true, new TextDecoder().decode(run.stderr))
    const printed = new TextDecoder().decode(run.stdout).split('\n')
        .map((l) => l.trim()).filter((l) => l.length > 0)
    assert(printed.length > 0, 'git printed no variables')
    assertEquals([...GIT_ENV_LEAK_KEYS].sort(), printed.sort())
})

Deno.test('sanitizedGitEnv disables replace refs, even over an inherited value', () => {
    assertEquals(sanitizedGitEnv({}).GIT_NO_REPLACE_OBJECTS, '1')
    assertEquals(
        sanitizedGitEnv({ GIT_NO_REPLACE_OBJECTS: '0' }).GIT_NO_REPLACE_OBJECTS,
        '1',
    )
})
