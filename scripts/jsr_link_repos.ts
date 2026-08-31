#!/usr/bin/env -S deno run --allow-net=api.jsr.io --allow-read --allow-env
/**
 * @fileoverview Link every `@lockness/*` package on JSR to this repository.
 *
 * JSR authorises GitHub Actions publishing through **OIDC**: the package's
 * linked GitHub repository must match the repository running the workflow.
 * After the migration none of the 27 packages pointed here — 21 were unlinked
 * and 6 still pointed at the retired per-package repos under the `locknessjs`
 * organisation. Publishing therefore failed with:
 *
 * ```
 * Failed to publish @lockness/hono@0.2.0: The actor that this request was
 * authenticated for is not authorized to access this resource.
 * (actorNotAuthorized)
 * ```
 *
 * Run this once after a migration, and again whenever a new package is created
 * on JSR — a fresh package starts unlinked.
 *
 * **The token never leaves your machine.** It is read from the environment and
 * only ever sent to `api.jsr.io`; network access is restricted to that host by
 * the shebang's permission flags.
 *
 * Create a token at https://jsr.io/account/tokens (scope: manage packages).
 *
 * @example
 * ```bash
 * JSR_TOKEN=jsrt_xxx deno run -A scripts/jsr_link_repos.ts --dry-run
 * JSR_TOKEN=jsrt_xxx deno run -A scripts/jsr_link_repos.ts
 * ```
 *
 * @module
 */

const SCOPE = 'lockness'
const OWNER = 'locknessland'
const REPO = 'lockness-monorepo'
const API = 'https://api.jsr.io'

/**
 * Read the package short names from the workspace.
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
 * The repository a package currently points at.
 *
 * @param name - Package short name.
 * @returns `owner/name`, `null` when unlinked, or `undefined` when the package
 * does not exist on JSR.
 */
async function currentLink(
    name: string,
): Promise<string | null | undefined> {
    const response = await fetch(`${API}/scopes/${SCOPE}/packages/${name}`)
    if (response.status === 404) {
        await response.body?.cancel()
        return undefined
    }
    const body = await response.json()
    const repo = body.githubRepository
    return repo ? `${repo.owner}/${repo.name}` : null
}

/**
 * Point a package at this repository.
 *
 * @param name - Package short name.
 * @param token - A JSR API token.
 * @returns An error message, or `null` on success.
 */
async function link(name: string, token: string): Promise<string | null> {
    const response = await fetch(`${API}/scopes/${SCOPE}/packages/${name}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            githubRepository: { owner: OWNER, name: REPO },
        }),
    })
    if (response.ok) {
        await response.body?.cancel()
        return null
    }
    // Surface the body: if the request shape is wrong, that must be visible
    // immediately rather than reported as a generic failure.
    const detail = await response.text()
    return `HTTP ${response.status} — ${detail.slice(0, 300)}`
}

/**
 * Link every package, reporting each one.
 */
async function main(): Promise<void> {
    const dryRun = Deno.args.includes('--dry-run')
    const token = Deno.env.get('JSR_TOKEN')

    if (!dryRun && (token === undefined || token === '')) {
        console.error('❌ JSR_TOKEN is not set.')
        console.error('   Create one at https://jsr.io/account/tokens, then:')
        console.error(
            '   JSR_TOKEN=jsrt_xxx deno run -A scripts/jsr_link_repos.ts',
        )
        Deno.exit(2)
    }

    const target = `${OWNER}/${REPO}`
    let changed = 0
    let alreadyCorrect = 0
    const failures: string[] = []

    for (const name of await packageNames()) {
        const current = await currentLink(name)

        if (current === undefined) {
            console.log(`  ⚠️  ${name.padEnd(24)} not on JSR — create it first`)
            failures.push(name)
            continue
        }
        if (current === target) {
            alreadyCorrect++
            console.log(`  ✅ ${name.padEnd(24)} already ${target}`)
            continue
        }

        const from = current ?? 'unlinked'
        if (dryRun) {
            console.log(`  → ${name.padEnd(24)} ${from} ⇒ ${target}`)
            changed++
            continue
        }

        const error = await link(name, token as string)
        if (error === null) {
            changed++
            console.log(`  ✅ ${name.padEnd(24)} ${from} ⇒ ${target}`)
        } else {
            failures.push(name)
            console.log(`  ❌ ${name.padEnd(24)} ${error}`)
        }
    }

    console.log(
        `\n${
            dryRun ? 'Would change' : 'Changed'
        }: ${changed} · already correct: ${alreadyCorrect} · failed: ${failures.length}`,
    )
    if (failures.length > 0) Deno.exit(1)
}

if (import.meta.main) {
    await main()
}
