/**
 * @fileoverview #444, #453 — what a fresh app TELLS its user to run is what
 * it can run, and a web or api app's database commands are safe before a
 * database is configured.
 *
 * `kit_migrations_test.ts` proves the shipped migrations folder; the
 * live-postgres suite proves `db:migrate` and `db:fresh` against a server;
 * `kits:smoke` proves the app boots. None of them reads the app's own text.
 * For every kit, an app is scaffolded the way `kits:smoke` does it (`init`
 * in a subprocess, repointed at this working tree), and then:
 *
 * 1. every `deno task <x>` written anywhere in the app — README, `.env`,
 *    doc comments, and the body of each task in `deno.json`, since a task
 *    that runs `deno task <x>` is an instruction the app executes itself —
 *    names a task in its `deno.json`. This step is offline. #444 was a README
 *    saying `deno task db:migrate` to an app answering "Unknown command";
 *    #453 was every kit's `app/kernel.ts` naming a `deno task compile` no
 *    kit defined;
 * 2. every `deno task cli <command>` in that same text, and every task that
 *    runs `cli.ts <command>`, names a command the app's CLI registers;
 * 3. for the kits that ship migrations, with `DATABASE_URL` unset — the
 *    state the scaffold ships in — the drizzle config holds no credentials at
 *    all, and `db:migrate` and `db:fresh` both refuse before connecting,
 *    saying `dbCredentials` is not set (#442: `db:migrate` reads the config
 *    in-process, as `db:fresh` does). A fallback url of ANY spelling would
 *    point a destructive command at a database nobody chose; `kits.test.ts`
 *    only catches the `?? ''` spelling.
 *
 * Step 3 is ordered so this test cannot itself be destructive: the config is
 * proven credential-free before `db:fresh` runs, `.env` is proven to set no
 * `DATABASE_URL`, and `PG*` points at a closed loopback port.
 *
 * Steps 2 and 3 run the app's commands, which resolve npm packages; on a cold
 * offline machine they are skipped with a printed reason — only on a
 * recognised network error (`isOffline`, the #157 classifier shared from
 * `packages/vite/tests/offline.ts`). A refused connection is NOT one here:
 * step 3 points `PG*` at a closed port, so a refusal is a fault to report.
 * Step 1 needs no network.
 *
 * Only the `deno task <x>` grammar is read: `./nessy <x>`, `deno run … cli.ts
 * <x>` in prose, and descriptions such as "run the compile task" are not.
 *
 * @module
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { type KitName, KITS } from '@lockness/init'
import { isOffline } from '../packages/vite/tests/offline.ts'
import { shipsMigrations } from './kit_migrations.ts'
import { scaffoldKit } from './kit_smoke.ts'

/** How long one app command may take — the first one installs npm deps. */
const COMMAND_TIMEOUT_MS = 300_000

/**
 * `deno task <task> [<command>]`, as a user would copy it. Flags between
 * `task` and its name (`deno task -q compile`) and prose wrapped across a line
 * are read too.
 */
const INSTRUCTION =
    /deno\s+task\s+(?:-\S+\s+)*([a-z][\w:-]*)(?:[ \t]+([a-z][\w-]*:[\w:-]+|[a-z][\w-]*))?/g

/** A task that runs the app's CLI: `… cli.ts <command>`. */
const CLI_TASK = /\bcli\.ts[ \t]+([a-z][\w:-]*)/

/** Directories the app does not author, or that hold no instructions. */
const SKIPPED_DIRS: ReadonlySet<string> = new Set([
    'node_modules',
    'public',
    '.git',
])

/** Files that carry text a user reads, or a command a build runs unattended. */
const TEXT_FILE = /(\.(md|ts|tsx|json|css|sh)|^\.env.*|^Dockerfile)$/

/**
 * Run `deno` inside the app with no database configured.
 *
 * `DATABASE_URL`, `APP_ENV` and `DENO_ENV` (whose stray value would trip the
 * #504 boot tripwire) are withheld so the app's own
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

/** One instruction found in the app's text. */
interface Instruction {
    readonly file: string
    readonly task: string
    readonly command: string | undefined
}

/**
 * Every `deno task …` instruction in a piece of text.
 *
 * @param file - Where the text came from, for the failure message.
 * @param content - The text.
 * @returns The instructions it holds.
 */
function instructionsIn(file: string, content: string): Instruction[] {
    return [...content.matchAll(INSTRUCTION)].map((match) => ({
        file,
        task: match[1],
        command: match[2],
    }))
}

/**
 * Every `deno task …` instruction the app's own tasks run — `build` running
 * `deno task routes:generate`, `compile` running `deno task cli compile`.
 *
 * @param tasks - The `tasks` of the app's `deno.json`.
 * @returns The instructions, each attributed to its task.
 */
function taskInstructions(tasks: Record<string, string>): Instruction[] {
    return Object.entries(tasks).flatMap(([name, body]) =>
        instructionsIn(`deno.json task "${name}"`, body)
    )
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
            found.push(...instructionsIn(file, content))
        }
    }
    await visit(dir, '')
    return found
}

for (const kit of Object.keys(KITS) as KitName[]) {
    const refusal = shipsMigrations(kit)
        ? ', and its db commands refuse without DATABASE_URL'
        : ''
    Deno.test(`#444 #453 QA ${kit}: the app's instructions run${refusal}`, async (t) => {
        const workdir = await Deno.makeTempDir({ prefix: 'lockness-444-qa-' })
        try {
            const scaffold = await scaffoldKit(kit, workdir)
            assert(scaffold.ok, scaffold.output)
            const dir = scaffold.dir

            const tasks = (JSON.parse(
                await Deno.readTextFile(join(dir, 'deno.json')),
            ) as { tasks: Record<string, string> }).tasks
            const said = [
                ...(await instructions(dir)),
                ...taskInstructions(tasks),
            ]

            await t.step(
                'every `deno task <x>` it tells the user to run is a task',
                () => {
                    // Not vacuous: app/kernel.ts is where #453 was found, and
                    // the README is where #444 was.
                    assert(
                        said.some((i) =>
                            i.file === 'app/kernel.ts' && i.task === 'compile'
                        ),
                        'app/kernel.ts no longer says `deno task compile`',
                    )
                    if (shipsMigrations(kit)) {
                        assert(
                            said.some((i) =>
                                i.file === 'README.md' &&
                                i.task === 'db:migrate'
                            ),
                            'README.md no longer says `deno task db:migrate`',
                        )
                    }
                    const missing = said
                        .filter(({ task }) => !(task in tasks))
                        .map(({ file, task }) =>
                            `${file}: \`deno task ${task}\` is not a task`
                        )
                    assertEquals([...new Set(missing)], [])
                },
            )

            const listed = await inApp(dir, ['task', 'cli', 'list'])
            if (!listed.ok && isOffline(listed.output)) {
                console.warn(
                    `[#444] skipped the CLI and database steps for ${kit} — the app's npm packages are unavailable offline`,
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
            assert(commands.has('compile'), listed.output)

            await t.step(
                'every CLI command it tells the user to run is registered',
                () => {
                    const missing: string[] = []
                    for (const { file, task, command } of said) {
                        if (task !== 'cli' || command === undefined) continue
                        if (!commands.has(command)) {
                            missing.push(
                                `${file}: \`deno task cli ${command}\` is not a command`,
                            )
                        }
                    }
                    for (const [task, line] of Object.entries(tasks)) {
                        const command = CLI_TASK.exec(line)?.[1]
                        if (command === undefined || commands.has(command)) {
                            continue
                        }
                        missing.push(
                            `task "${task}" runs \`cli.ts ${command}\`, which is not a command`,
                        )
                    }
                    assertEquals([...new Set(missing)], [])
                },
            )

            if (!shipsMigrations(kit)) return

            await t.step(
                'unset DATABASE_URL: no credentials, db:migrate and db:fresh refuse',
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
                        'db:migrate refused: drizzle.config.ts: ' +
                            '`dbCredentials` is not set',
                    )
                    assertStringIncludes(
                        migrate.output,
                        'No migration was applied.',
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
