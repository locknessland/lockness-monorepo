/**
 * @fileoverview A test fixture that runs a callback under a chosen
 * `APP_ENV` / `DENO_ENV` combination and restores both afterwards, even when
 * the callback throws.
 *
 * @module @lockness/contract/tests/env_fixture
 */

/** The two variables the environment tests vary. `undefined` means unset. */
export interface EnvCombo {
    APP_ENV?: string
    DENO_ENV?: string
}

/**
 * Run `fn` with `APP_ENV` and `DENO_ENV` set exactly as `combo` says, then put
 * both back as they were.
 *
 * @param combo - The values to set; an absent or `undefined` key is deleted.
 * @param fn - The body to run under that combination.
 * @returns What `fn` returned.
 */
export function withEnv<T>(combo: EnvCombo, fn: () => T): T {
    const previous = {
        APP_ENV: Deno.env.get('APP_ENV'),
        DENO_ENV: Deno.env.get('DENO_ENV'),
    }
    const set = (key: string, value: string | undefined) =>
        value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value)
    set('APP_ENV', combo.APP_ENV)
    set('DENO_ENV', combo.DENO_ENV)
    try {
        return fn()
    } finally {
        set('APP_ENV', previous.APP_ENV)
        set('DENO_ENV', previous.DENO_ENV)
    }
}
