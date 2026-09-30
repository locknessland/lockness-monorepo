/**
 * @fileoverview Tests for `scripts/git_env.ts`: the environment every
 * release/CI script hands to a `git` subprocess.
 *
 * @module
 */

import { assertEquals } from '@std/assert'
import { GIT_ENV_LEAK_KEYS, sanitizedGitEnv } from './git_env.ts'

Deno.test('sanitizedGitEnv strips every leak key and keeps everything else', () => {
    const base: Record<string, string> = {
        HOME: '/home/fixture',
        PATH: '/usr/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'fixture',
    }
    for (const key of GIT_ENV_LEAK_KEYS) base[key] = `/decoy/${key}`

    const env = sanitizedGitEnv(base)
    for (const key of GIT_ENV_LEAK_KEYS) {
        assertEquals(env[key], undefined, `${key} was kept`)
    }
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
    sanitizedGitEnv(base)
    assertEquals(base, { GIT_DIR: '/decoy/.git', HOME: '/h' })
})
