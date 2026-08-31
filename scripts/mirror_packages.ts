#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
/**
 * @fileoverview Publish each package to its own read-only GitHub mirror.
 *
 * The monorepo stays the source of truth: all development, all issues, all
 * pull requests. Each `locknessland/<package>` repository is a **generated
 * shop window** — it exists so that someone searching GitHub for "scheduler"
 * lands on something readable, which a monorepo alone does not give.
 *
 * This is the Laravel / Symfony shape (`illuminate/database` is literally
 * described as `[READ ONLY] Subtree split ...`), with one difference: their
 * splits exist because Composer resolves from git. JSR publishes files, so
 * here the mirrors serve discovery only and never publishing. Publishing stays
 * atomic from the monorepo, with OIDC provenance.
 *
 * **One commit per release, not a history replay.** `git subtree split` would
 * carry every monorepo commit that ever touched the directory. Instead each
 * sync creates a single commit whose *tree is the package directory*, via
 * `git commit-tree`, parented on the mirror's previous commit. Flat history,
 * one entry per version.
 *
 * @example
 * ```bash
 * deno task mirror --dry-run     # report, touch nothing
 * deno task mirror --create      # create any missing mirror repositories
 * deno task mirror               # sync every package at the current version
 * deno task mirror --flatten     # initial import: one commit, no parent
 * ```
 *
 * @module
 */

import { parse as parseJsonc } from '@std/jsonc'

const OWNER = 'locknessland'
const SOURCE_REPO = `${OWNER}/lockness-monorepo`
const ROOT = Deno.cwd()

/** What one package's mirror needs. */
interface Mirror {
    /** Short package name, which is also the repository name. */
    name: string
    /** The tree object for `packages/<name>` at HEAD. */
    tree: string
    /** Existing mirror head, or `null` when the repository is empty. */
    head: string | null
    /** `false` when the repository does not exist yet. */
    exists: boolean
}

/**
 * Run a command and return its trimmed stdout.
 *
 * @param cmd - Executable.
 * @param args - Arguments.
 * @returns stdout on success, or `null` when the command failed.
 */
async function run(cmd: string, args: string[]): Promise<string | null> {
    const { success, stdout } = await new Deno.Command(cmd, {
        args,
        cwd: ROOT,
        stdout: 'piped',
        stderr: 'null',
    }).output()
    if (!success) return null
    return new TextDecoder().decode(stdout).trim()
}

/**
 * Run a command, returning both its success and its stderr.
 *
 * @param cmd - Executable.
 * @param args - Arguments.
 * @returns Whether it succeeded, and the combined error output.
 */
async function attempt(
    cmd: string,
    args: string[],
): Promise<{ ok: boolean; error: string }> {
    const { success, stderr } = await new Deno.Command(cmd, {
        args,
        cwd: ROOT,
        stdout: 'null',
        stderr: 'piped',
    }).output()
    return { ok: success, error: new TextDecoder().decode(stderr).trim() }
}

/**
 * The workspace version, which every mirror is tagged with.
 *
 * @returns The version string from the root `deno.jsonc`.
 * @throws {Error} If it cannot be read.
 */
async function workspaceVersion(): Promise<string> {
    const config = parseJsonc(await Deno.readTextFile('deno.jsonc')) as {
        version?: string
    }
    if (typeof config.version !== 'string') {
        throw new Error('no "version" in deno.jsonc')
    }
    return config.version
}

/**
 * Every package directory in the workspace.
 *
 * @returns Sorted package names.
 */
async function packageNames(): Promise<string[]> {
    const names: string[] = []
    for await (const entry of Deno.readDir('packages')) {
        if (entry.isDirectory && !entry.name.startsWith('.')) {
            names.push(entry.name)
        }
    }
    return names.sort()
}

/**
 * Collect the state of one package's mirror.
 *
 * @param name - Package name.
 * @returns The mirror's current state.
 */
async function inspect(name: string): Promise<Mirror> {
    const tree = await run('git', ['rev-parse', `HEAD:packages/${name}`])
    if (tree === null) throw new Error(`no tree for packages/${name}`)

    const exists = await run('gh', [
        'repo',
        'view',
        `${OWNER}/${name}`,
        '--json',
        'name',
    ]) !== null

    let head: string | null = null
    if (exists) {
        // An empty repository has no refs; `ls-remote` prints nothing.
        const refs = await run('git', [
            'ls-remote',
            `https://github.com/${OWNER}/${name}.git`,
            'HEAD',
        ])
        if (refs !== null && refs.length > 0) head = refs.split(/\s+/)[0]
    }

    return { name, tree, head, exists }
}

/**
 * Create a mirror repository, described so nobody mistakes it for the source.
 *
 * @param name - Package name.
 * @returns Whether creation succeeded.
 */
async function createMirror(name: string): Promise<boolean> {
    const description =
        `[READ ONLY] @lockness/${name} — subtree mirror. Source, issues and ` +
        `pull requests: ${SOURCE_REPO}`
    const { ok, error } = await attempt('gh', [
        'repo',
        'create',
        `${OWNER}/${name}`,
        '--public',
        '--description',
        description,
    ])
    if (!ok) console.error(`     ${error.split('\n')[0]}`)
    return ok
}

/**
 * Point an existing mirror's description at the source repository.
 *
 * @param name - Package name.
 */
async function describeMirror(name: string): Promise<void> {
    await attempt('gh', [
        'repo',
        'edit',
        `${OWNER}/${name}`,
        '--description',
        `[READ ONLY] @lockness/${name} — subtree mirror. Source, issues and ` +
        `pull requests: ${SOURCE_REPO}`,
    ])
}

/**
 * Push one package as a single commit on top of its mirror's history.
 *
 * The commit's tree **is** the package directory, so the mirror's root is
 * `mod.ts`, `deno.json`, `README.md` — not `packages/<name>/…`.
 *
 * @param mirror - The package's mirror state.
 * @param version - Version to tag.
 * @param subject - Commit subject.
 * @returns An error message, or `null` on success.
 */
async function syncMirror(
    mirror: Mirror,
    version: string,
    subject: string,
    flatten: boolean,
): Promise<string | null> {
    const body = `${subject}\n\n` +
        `Generated from ${SOURCE_REPO} at v${version}.\n` +
        `This repository is READ ONLY — it is overwritten on every release.\n` +
        `Open issues and pull requests against ${SOURCE_REPO}.\n`

    const args = ['commit-tree', mirror.tree]
    // `flatten` drops the parent, producing a single-commit history. It is for
    // the initial import only — in normal use each release appends one commit.
    if (mirror.head !== null && !flatten) args.push('-p', mirror.head)
    args.push('-m', body)

    const commit = await run('git', args)
    if (commit === null) return 'commit-tree failed'

    const url = `https://github.com/${OWNER}/${mirror.name}.git`
    // `--force`: a mirror is generated, and the header of every commit says it
    // is overwritten on each release. Nothing branches from it, so there is no
    // shared history to protect. The monorepo is where history is sacred.
    const push = await attempt('git', [
        'push',
        '--force',
        url,
        `${commit}:refs/heads/main`,
    ])
    if (!push.ok) {
        return push.error.split('\n').filter((l) => l).pop() ?? 'push failed'
    }

    // The tag makes each mirror's history line up with the monorepo's releases.
    const tag = await attempt('git', [
        'push',
        '--force',
        url,
        `${commit}:refs/tags/v${version}`,
    ])
    if (!tag.ok) return `pushed, but tag v${version} failed`

    return null
}

/**
 * Mirror every package.
 */
async function main(): Promise<void> {
    const dryRun = Deno.args.includes('--dry-run')
    const create = Deno.args.includes('--create')
    const flatten = Deno.args.includes('--flatten')

    const version = await workspaceVersion()
    const names = await packageNames()
    // NOT the monorepo's last commit subject: on a `scheduler` mirror,
    // "chore(specnaut): upgrade templates" is noise. The mirror's history is a
    // list of releases, so that is what each entry says.
    const subject = `Release v${version}`

    console.log(
        `🪞 ${names.length} packages · v${version} · source ${SOURCE_REPO}\n`,
    )

    const mirrors: Mirror[] = []
    for (const name of names) mirrors.push(await inspect(name))

    const missing = mirrors.filter((m) => !m.exists)
    if (missing.length > 0) {
        console.log(`${missing.length} mirror(s) do not exist yet:`)
        for (const m of missing) console.log(`  • ${OWNER}/${m.name}`)
        if (!create) {
            console.log('\n  Pass --create to create them.\n')
        } else if (!dryRun) {
            console.log('\nCreating:')
            for (const m of missing) {
                const ok = await createMirror(m.name)
                console.log(`  ${ok ? '✅' : '❌'} ${OWNER}/${m.name}`)
                if (ok) m.exists = true
            }
        }
        console.log()
    }

    let synced = 0
    const failed: string[] = []
    for (const mirror of mirrors) {
        if (!mirror.exists) {
            console.log(`  ⏭  ${mirror.name.padEnd(24)} no repository`)
            continue
        }
        if (dryRun) {
            const state = mirror.head === null
                ? 'empty'
                : mirror.head.slice(0, 7)
            console.log(
                `  → ${
                    mirror.name.padEnd(24)
                } ${state} ⇒ new commit, tag v${version}`,
            )
            synced++
            continue
        }
        const error = await syncMirror(mirror, version, subject, flatten)
        if (error === null) {
            await describeMirror(mirror.name)
            synced++
            console.log(`  ✅ ${mirror.name.padEnd(24)} v${version}`)
        } else {
            failed.push(mirror.name)
            console.log(`  ❌ ${mirror.name.padEnd(24)} ${error}`)
        }
    }

    console.log(
        `\n${
            dryRun ? 'Would sync' : 'Synced'
        }: ${synced} · failed: ${failed.length}`,
    )
    if (failed.length > 0) Deno.exit(1)
}

if (import.meta.main) {
    await main()
}
