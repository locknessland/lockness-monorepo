/**
 * @fileoverview Helpers the live-postgres kit suites share (#444, #452).
 *
 * Each live kit suite scaffolds an app, points it at a throwaway database and
 * runs the app's own commands. How a command is run inside the app, and how a
 * database url is derived from the admin one, live here once — the same rule
 * as `packages/drizzle/tests/live_postgres.ts`: no copies that drift.
 *
 * Not a `_test.ts` file, so `deno test` does not collect it.
 *
 * @module
 */

/** How long one app command may take — the first one installs its npm deps. */
export const COMMAND_TIMEOUT_MS = 300_000

/** What one command run inside the app produced. */
export interface AppCommandResult {
    /** Whether the command exited 0. */
    readonly ok: boolean
    /** Its stdout and stderr, concatenated, for a failure message. */
    readonly output: string
}

/**
 * Run a `deno` command inside the app, the way its user would.
 *
 * `DATABASE_URL`, `APP_ENV` and `DENO_ENV` are withheld so the app's own
 * `.env` decides them — that file is what the README tells the user to edit.
 *
 * @param dir - The app.
 * @param args - `deno` arguments.
 * @returns The exit status and combined output.
 *
 * @example
 * ```ts
 * const { ok, output } = await inApp(dir, ['task', 'db:migrate'])
 * ```
 */
export async function inApp(
    dir: string,
    args: string[],
): Promise<AppCommandResult> {
    const env = Deno.env.toObject()
    delete env.DATABASE_URL
    delete env.APP_ENV
    delete env.DENO_ENV
    const { success, stdout, stderr } = await new Deno.Command(
        Deno.execPath(),
        {
            args,
            cwd: dir,
            clearEnv: true,
            env,
            stdout: 'piped',
            stderr: 'piped',
            signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
        },
    ).output()
    const decoder = new TextDecoder()
    return {
        ok: success,
        output: decoder.decode(stdout) + decoder.decode(stderr),
    }
}

/**
 * `url` pointed at another database on the same server.
 *
 * @param url - The admin url.
 * @param database - The database name.
 * @returns The new url.
 *
 * @example
 * ```ts
 * withDatabase('postgres://u@127.0.0.1:5432/postgres', 'app') // …/app
 * ```
 */
export function withDatabase(url: string, database: string): string {
    const parsed = new URL(url)
    parsed.pathname = `/${database}`
    return parsed.href
}
