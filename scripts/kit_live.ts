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
    /** Its stderr alone, for a check that it wrote nothing there (#445). */
    readonly stderr: string
}

/**
 * Run a `deno` command inside the app, the way its user would.
 *
 * `DATABASE_URL`, `APP_ENV` and `DENO_ENV` (whose stray value would trip the
 * #504 boot tripwire) are withheld so the app's own
 * `.env` decides them — that file is what the README tells the user to edit.
 *
 * @param dir - The app.
 * @param args - `deno` arguments.
 * @returns The exit status, the combined output, and stderr alone.
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
    const error = decoder.decode(stderr)
    return {
        ok: success,
        output: decoder.decode(stdout) + error,
        stderr: error,
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

/**
 * The slice of a postgres.js admin client {@link releaseDatabase} uses —
 * structural, so the cleanup is testable without a server.
 */
export interface AdminConnection {
    /** Run a raw statement. */
    unsafe(query: string): Promise<unknown>
    /** Close the connection. */
    end(): Promise<unknown>
}

/** What else {@link releaseDatabase} releases besides the database. */
export interface ReleaseOptions {
    /** The suite's temp directory, removed last. */
    readonly workdir?: string
    /** The suite's own connections to the throwaway database, closed first. */
    readonly connections?: readonly Pick<AdminConnection, 'end'>[]
}

/**
 * Release everything a live suite created: close its connections to the
 * throwaway database, drop it, close the admin connection and remove the temp
 * directory (#450). A leaked database or directory poisons the next run, and
 * the run that most needs cleaning up is the failing one — so every step is
 * attempted whatever an earlier one threw.
 *
 * When several steps fail, the FIRST error is the one thrown: an earlier
 * failure is the likely root cause, and a later one must not hide it. Each
 * later error is logged to stderr, never dropped silently.
 *
 * @param admin - The admin connection that created the database.
 * @param database - The database to drop.
 * @param options - The temp directory and the database's own connections.
 * @throws {unknown} The first error any step threw, once all were attempted.
 *
 * @example
 * ```ts
 * try {
 *     // … the test …
 * } finally {
 *     await releaseDatabase(admin, database, { workdir, connections: [db] })
 * }
 * ```
 */
export async function releaseDatabase(
    admin: AdminConnection,
    database: string,
    options: ReleaseOptions = {},
): Promise<void> {
    const { workdir, connections = [] } = options
    const steps: (() => Promise<unknown>)[] = [
        ...connections.map((connection) => () => connection.end()),
        () =>
            admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`),
        () => admin.end(),
    ]
    if (workdir !== undefined) {
        steps.push(() => Deno.remove(workdir, { recursive: true }))
    }
    const errors: unknown[] = []
    for (const step of steps) {
        try {
            await step()
        } catch (error) {
            errors.push(error)
        }
    }
    if (errors.length === 0) return
    for (const later of errors.slice(1)) {
        console.error(`[#450] a later cleanup step also failed: ${later}`)
    }
    throw errors[0]
}
