/**
 * @fileoverview #444 — what a fresh web or api app TELLS its user to run is
 * what it can run, and its database commands are safe before a database is
 * configured.
 *
 * `kit_migrations_test.ts` proves the shipped migrations folder; the
 * live-postgres suite proves `db:migrate` and `db:fresh` against a server.
 * Neither reads the app's own text. For each kit that ships migrations, an
 * app is scaffolded the way `kits:smoke` does it (`init` in a subprocess,
 * repointed at this working tree), and then:
 *
 * 1. every DATABASE instruction written anywhere in the app — README, `.env`,
 *    doc comments — runs: `deno task db:<x>` names a task in its `deno.json`,
 *    `deno task cli db:<x>` names a command its CLI registers, and every task
 *    that runs `cli.ts <command>` names one too. #444 was a README that said
 *    `deno task db:migrate` to an app answering "Unknown command". The check
 *    is held to the database instructions on purpose — #444's scope; other
 *    instructions are not this issue's to gate;
 * 2. with `DATABASE_URL` unset — the state the scaffold ships in — the
 *    drizzle config holds no credentials at all, `db:migrate` fails saying a
 *    url is required, and `db:fresh` refuses before connecting. A fallback
 *    url of ANY spelling would point a destructive command at a database
 *    nobody chose; `kits.test.ts` only catches the `?? ''` spelling.
 *
 * Step 2 is ordered so this test cannot itself be destructive: the config is
 * proven credential-free before `db:fresh` runs, `.env` is proven to set no
 * `DATABASE_URL`, and `PG*` points at a closed loopback port.
 *
 * The app's commands resolve npm packages; on a cold offline machine the test
 * skips with a printed reason — only on a recognised network error, the #157
 * pattern of `packages/vite/tests/e2e_smoke.test.ts`.
 *
 * @module
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { migratingKits } from './kit_migrations.ts'
import { scaffoldKit } from './kit_smoke.ts'

/** A network failure fetching a package — the only reason to skip. */
const OFFLINE =
    /error sending request|failed to fetch|dns error|tcp connect error|network is unreachable|os error (50|51|65)|error trying to connect/i

/** How long one app command may take — the first one installs npm deps. */
const COMMAND_TIMEOUT_MS = 300_000

/** `deno task <task> [<command>]`, as a user would copy it. */
const INSTRUCTION =
    /deno task ([a-z][\w:-]*)(?:[ \t]+([a-z][\w-]*:[\w:-]+|[a-z][\w-]*))?/g

/** A task that runs the app's CLI: `… cli.ts <command>`. */
const CLI_TASK = /\bcli\.ts[ \t]+([a-z][\w:-]*)/

/** Directories the app does not author, or that hold no instructions. */
const SKIPPED_DIRS: ReadonlySet<string> = new Set([
    'node_modules',
    'public',
    '.git',
])

/** Files that carry text a user reads. */
const TEXT_FILE = /(\.(md|ts|tsx|json|css|sh)|^\.env.*)$/

/**
 * Run `deno` inside the app with no database configured.
 *
 * `DATABASE_URL`, `APP_ENV` and `DENO_ENV` are withheld so the app's own
 * `.env` decides them, and libpq's `PG*` defaults name a closed loopback port
 * and a database nobody has — so a driver that fell back to its defaults
 * would fail to connect rather than reach a real server.
 *
 * @param dir - The app.
 * @param args - `deno` arguments.
 * @returns The exit status and combined output.
 */
async function inApp(
    dir: string,
    args: string[],
): Promise<{ ok: boolean; output: string }> {
    const env = Deno.env.toObject()
    for (const name of Object.keys(env)) {
        if (name.startsWith('PG')) delete env[name]
    }
    delete env.DATABASE_URL
    delete env.APP_ENV
    delete env.DENO_ENV
    const { success, stdout, stderr } = await new Deno.Command(
        Deno.execPath(),
        {
            args,
            cwd: dir,
            clearEnv: true,
            env: {
                ...env,
                PGHOST: '127.0.0.1',
                PGPORT: '1',
                PGDATABASE: 'lockness_444_never',
                PGUSER: 'lockness_444_never',
            },
            stdin: 'null',
            stdout: 'piped',
            stderr: 'piped',
            signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
        },
    ).output()
    const decoder = new TextDecoder()
    // Colour codes would split the phrases the assertions look for.
    // deno-lint-ignore no-control-regex
    const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
    return {
        ok: success,
        output: plain(decoder.decode(stdout) + decoder.decode(stderr)),
    }
}

/**
 * Whether an instruction is about the database — the instructions #444 is
 * about.
 *
 * @param instruction - The instruction.
 * @returns True for `deno task db:<x>` and `deno task cli db:<x>`.
 */
function aboutTheDatabase(instruction: Instruction): boolean {
    return instruction.task.startsWith('db:') ||
        (instruction.task === 'cli' &&
            (instruction.command?.startsWith('db:') ?? false))
}

/** One instruction found in the app's text. */
interface Instruction {
    readonly file: string
    readonly task: string
    readonly command: string | undefined
}

/**
 * Every `deno task …` instruction in the files the app authors.
 *
 * @param dir - The app.
 * @returns The instructions, with the file each one is in.
 */
async function instructions(dir: string): Promise<Instruction[]> {
    const found: Instruction[] = []
    const visit = async (current: string, prefix: string): Promise<void> => {
        for await (const entry of Deno.readDir(current)) {
            const file = prefix + entry.name
            if (entry.isDirectory) {
                if (!SKIPPED_DIRS.has(entry.name)) {
                    await visit(join(current, entry.name), `${file}/`)
                }
                continue
            }
            // deno.json holds the tasks themselves; deno.lock is generated.
            if (!entry.isFile || !TEXT_FILE.test(entry.name)) continue
            if (file === 'deno.json' || file === 'deno.lock') continue
            const content = await Deno.readTextFile(join(current, entry.name))
            for (const match of content.matchAll(INSTRUCTION)) {
                found.push({ file, task: match[1], command: match[2] })
            }
        }
    }
    await visit(dir, '')
    return found
}

for (const kit of migratingKits()) {
    Deno.test(`#444 QA ${kit}: the app's instructions run, and its db commands refuse without DATABASE_URL`, async (t) => {
        const workdir = await Deno.makeTempDir({ prefix: 'lockness-444-qa-' })
        try {
            const scaffold = await scaffoldKit(kit, workdir)
            assert(scaffold.ok, scaffold.output)
            const dir = scaffold.dir

            const listed = await inApp(dir, ['task', 'cli', 'list'])
            if (!listed.ok && OFFLINE.test(listed.output)) {
                console.warn(
                    `[#444] skipped ${kit} — the app's npm packages are unavailable offline`,
                )
                return
            }
            assert(listed.ok, listed.output)
            assert(
                !listed.output.includes('Failed to load commands'),
                listed.output,
            )
            const commands = new Set(
                [...listed.output.matchAll(/^ {2}([a-z][\w:-]*) /gm)]
                    .map((m) => m[1]),
            )
            assert(commands.has('db:migrate'), listed.output)

            await t.step(
                'every database command it tells the user to run exists',
                async () => {
                    const tasks = (JSON.parse(
                        await Deno.readTextFile(join(dir, 'deno.json')),
                    ) as { tasks: Record<string, string> }).tasks

                    const said = (await instructions(dir)).filter(
                        aboutTheDatabase,
                    )
                    // Not vacuous: the README is where #444 was found.
                    assert(
                        said.some((i) =>
                            i.file === 'README.md' && i.task === 'db:migrate'
                        ),
                        'README.md no longer says `deno task db:migrate`',
                    )
                    for (const { file, task, command } of said) {
                        assert(
                            task in tasks,
                            `${file}: \`deno task ${task}\` is not a task`,
                        )
                        if (task === 'cli' && command !== undefined) {
                            assert(
                                commands.has(command),
                                `${file}: \`deno task cli ${command}\` is not a command`,
                            )
                        }
                    }
                    for (const [task, line] of Object.entries(tasks)) {
                        const command = CLI_TASK.exec(line)?.[1]
                        if (command === undefined) continue
                        assert(
                            commands.has(command),
                            `task "${task}" runs \`cli.ts ${command}\`, which is not a command`,
                        )
                    }
                },
            )

            await t.step(
                'unset DATABASE_URL: no credentials, db:migrate fails, db:fresh refuses',
                async () => {
                    const dotenv = await Deno.readTextFile(join(dir, '.env'))
                    assertEquals(
                        /^\s*DATABASE_URL\s*=/m.test(dotenv),
                        false,
                        '.env sets DATABASE_URL — the scaffold must ship without one',
                    )

                    // The config as drizzle-kit and db:fresh load it. Any
                    // credentials here, of any spelling, are a fallback.
                    const config = await inApp(dir, [
                        'eval',
                        `const { default: c } = await import('./drizzle.config.ts');` +
                        ` console.log('CREDENTIALS=' + JSON.stringify(c.dbCredentials ?? null))`,
                    ])
                    assert(config.ok, config.output)
                    assertStringIncludes(config.output, 'CREDENTIALS=null')

                    const migrate = await inApp(dir, ['task', 'db:migrate'])
                    assertEquals(migrate.ok, false, migrate.output)
                    assertStringIncludes(
                        migrate.output,
                        'connection "url" or "host", "database" are required',
                    )

                    const fresh = await inApp(dir, ['task', 'cli', 'db:fresh'])
                    assertEquals(fresh.ok, false, fresh.output)
                    assertStringIncludes(fresh.output, 'db:fresh refused')
                    assertStringIncludes(fresh.output, 'Nothing was dropped')
                },
            )
        } finally {
            await Deno.remove(workdir, { recursive: true })
        }
    })
}
