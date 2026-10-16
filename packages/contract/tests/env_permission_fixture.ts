/**
 * @fileoverview Test fixture that stubs Deno's env permission, so a row can
 * run a process in which a variable is *unreadable* (#624) — the state a
 * `deno compile` binary or a run with a narrowed `--allow-env` is in.
 *
 * Deno-only by construction: it stubs `Deno.permissions.querySync` and
 * `Deno.env.get`, so only `*.deno.test.ts` files import it. Shared by the
 * packages whose production guards read `APP_ENV` (drizzle, core, mail) and by
 * devtools' gate, so the stub is written once.
 *
 * @module @lockness/contract/tests/env_permission_fixture
 */

/** What `fn` saw: its result and the `Deno.env.get` calls it made. */
export interface PermissionRun<T> {
    /** What `fn` returned (awaited). */
    result: T
    /** `Deno.env.get` calls made for one of the unreadable variables. */
    unreadableReads: number
}

/**
 * Run `fn` with every variable in `names` unreadable: the env permission query
 * answers `prompt` for them (the state that would show a prompt in a
 * terminal), while every other variable keeps its real answer. Restores both
 * stubs afterwards, even when `fn` throws.
 *
 * @param names - The variables to make unreadable, e.g. `['APP_ENV']`.
 * @param fn - The body to run, sync or async.
 * @returns What `fn` returned, and how often it called `Deno.env.get` for one
 *   of `names` — a call that, outside the stub, could prompt or throw.
 */
export async function withUnreadableEnv<T>(
    names: readonly string[],
    fn: () => T | Promise<T>,
): Promise<PermissionRun<T>> {
    const permissions = Deno.permissions as {
        querySync: (descriptor: Deno.PermissionDescriptor) => unknown
    }
    const env = Deno.env as { get: (name: string) => string | undefined }
    const original = { querySync: permissions.querySync, get: env.get }
    let unreadableReads = 0
    permissions.querySync = (descriptor) => {
        if (
            descriptor.name === 'env' && descriptor.variable !== undefined &&
            names.includes(descriptor.variable)
        ) {
            return { state: 'prompt', partial: false, onchange: null }
        }
        return original.querySync.call(Deno.permissions, descriptor)
    }
    env.get = (name) => {
        if (names.includes(name)) unreadableReads++
        return original.get.call(Deno.env, name)
    }
    try {
        return { result: await fn(), unreadableReads }
    } finally {
        permissions.querySync = original.querySync
        env.get = original.get
    }
}
