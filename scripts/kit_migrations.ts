#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Generate the starter kits' migrations folders from their
 * schema stubs, and tell whether the shipped ones still match (#444).
 *
 * **The kit's schema stub is the single source of truth.** Its
 * `database/migrations/` folder — the SQL, `meta/_journal.json` and
 * `meta/0000_snapshot.json` — is drizzle-kit's own output, generated here from
 * that schema and committed verbatim as `.stub` files. Nothing in it is
 * hand-written: a hand-kept journal or snapshot drifts from its SQL (the api
 * kit's SQL and schema had already parted ways), and a snapshot that names a
 * constraint the SQL never created makes a later `DROP CONSTRAINT` fail.
 *
 * The folder is generated **in the repository, at build time**, not by `init`
 * at scaffold time: `init` would otherwise need npm drizzle-kit and a
 * `node_modules` before the project exists, and an offline scaffold would
 * break.
 *
 * Write mode only writes when the shipped folder no longer matches a fresh
 * generation. drizzle-kit stamps every run with a new snapshot `id` and a new
 * journal `when`; rewriting on every run would churn both for nothing. A match
 * is: the same file set, SQL byte-identical, the snapshot identical except its
 * `id`, the journal identical except each entry's `when` — and every shipped
 * `when` an integer no later than now, because drizzle-orm applies a migration
 * only when its `when` is later than the last one applied: a future stamp
 * would make a user's next migrations skip silently.
 *
 * `scripts/kit_migrations_test.ts` runs the comparison on every `deno task
 * test`, so a schema stub edited without regenerating fails the suite.
 *
 * @example
 * ```bash
 * deno task kits:migrations   # regenerate every kit whose folder drifted
 * ```
 *
 * @module
 */

import { equal } from '@std/assert'
import { dirname, fromFileUrl, join, relative } from '@std/path'
import { type KitName, KITS } from '@lockness/init'

/** The repository root, whatever the working directory. */
const ROOT = fromFileUrl(new URL('..', import.meta.url))

/** Where `init` keeps its stub trees. */
const STUBS = join(ROOT, 'packages', 'init', 'stubs')

/** The migrations folder, relative to a kit (and to a scaffolded project). */
export const MIGRATIONS_DIR = 'database/migrations'

/** The name drizzle-kit gives the kits' first migration. */
export const MIGRATION_NAME = 'create_users'

/** The shared base stub drizzle-kit reads its settings from. */
const CONFIG_STUB = 'drizzle.config.ts.stub'

/** The folder the shipped `drizzle.config.ts` points `schema` at. */
const SCHEMA_DIR = 'app/model/'

/** How long one drizzle-kit run may take before it is killed. */
const DRIZZLE_KIT_TIMEOUT_MS = 180_000

/**
 * A migrations folder: each file's path relative to the folder, `/`-separated
 * and without the `.stub` suffix, mapped to its exact text.
 */
export type MigrationFiles = ReadonlyMap<string, string>

/** What one drizzle-kit process produced. */
export interface DrizzleKitRun {
    /** Its exit code; `-1` when it was killed for exceeding the timeout. */
    readonly code: number
    /** Its stdout followed by its stderr. */
    readonly output: string
}

/**
 * A drizzle-kit process that exited non-zero.
 *
 * Carries the output so a caller can tell a network failure (no registry to
 * fetch the package from) from a real one.
 */
export class DrizzleKitError extends Error {
    /** The failed run. */
    readonly run: DrizzleKitRun

    /**
     * @param message - What was being attempted.
     * @param run - The failed run.
     */
    constructor(message: string, run: DrizzleKitRun) {
        super(`${message} (drizzle-kit exited ${run.code})\n${run.output}`)
        this.name = 'DrizzleKitError'
        this.run = run
    }
}

/**
 * Whether a kit ships a migrations folder — the one definition of the kit
 * list this script and its callers work on, read from `KITS` so there is no
 * second list to keep in step.
 *
 * @param kit - The kit.
 * @returns True when its overlay holds anything under `database/migrations/`.
 *
 * @example
 * ```ts
 * shipsMigrations('api') // true
 * shipsMigrations('slim') // false
 * ```
 */
export function shipsMigrations(kit: KitName): boolean {
    return KITS[kit].overlay.some((file) =>
        file.startsWith(`${MIGRATIONS_DIR}/`)
    )
}

/**
 * The kits that ship a migrations folder.
 *
 * @returns Their names, in `KITS` order.
 *
 * @example
 * ```ts
 * migratingKits() // ['web', 'api']
 * ```
 */
export function migratingKits(): KitName[] {
    return (Object.keys(KITS) as KitName[]).filter(shipsMigrations)
}

/**
 * Every file under a directory, keyed by its `/`-separated relative path.
 *
 * @param dir - The directory. A missing one reads as empty.
 * @returns Path to text.
 * @throws {Error} On any read failure other than the directory not existing.
 *
 * @example
 * ```ts
 * const before = await readTree('database/migrations')
 * ```
 */
export async function readTree(dir: string): Promise<Map<string, string>> {
    const files = new Map<string, string>()
    const visit = async (current: string): Promise<void> => {
        for await (const entry of Deno.readDir(current)) {
            const path = join(current, entry.name)
            if (entry.isDirectory) await visit(path)
            else if (entry.isFile) {
                const key = relative(dir, path).replaceAll('\\', '/')
                files.set(key, await Deno.readTextFile(path))
            }
        }
    }
    try {
        await visit(dir)
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return files
        throw error
    }
    return files
}

/**
 * The `drizzle-orm` and `drizzle-kit` mappings a kit's `deno.json.stub`
 * declares — the versions an app scaffolded from it runs. The `drizzle-kit`
 * one is pinned to `DRIZZLE_KIT_SPECIFIER` by `@lockness/drizzle`'s #437 test.
 *
 * @param kit - The kit.
 * @returns Both specifiers.
 * @throws {Error} When the stub maps either one to anything but `npm:`.
 *
 * @example
 * ```ts
 * (await kitDrizzleImports('web'))['drizzle-kit'] // 'npm:drizzle-kit@0.31.10'
 * ```
 */
export async function kitDrizzleImports(
    kit: KitName,
): Promise<{ 'drizzle-orm': string; 'drizzle-kit': string }> {
    const stub = JSON.parse(
        await Deno.readTextFile(join(STUBS, 'kits', kit, 'deno.json.stub')),
    ) as { imports?: Record<string, string> }
    const orm = stub.imports?.['drizzle-orm']
    const kitSpecifier = stub.imports?.['drizzle-kit']
    if (!orm?.startsWith('npm:') || !kitSpecifier?.startsWith('npm:')) {
        throw new Error(
            `${kit}/deno.json.stub must map drizzle-orm and drizzle-kit to npm: specifiers`,
        )
    }
    return { 'drizzle-orm': orm, 'drizzle-kit': kitSpecifier }
}

/**
 * Lay out a throwaway project drizzle-kit can run in: the given files plus a
 * minimal `deno.json` that maps the two drizzle packages and lets Deno build
 * the `node_modules` drizzle-kit loads the schema through.
 *
 * @param files - Project-relative path to text.
 * @param imports - The `drizzle-orm` / `drizzle-kit` mappings.
 * @returns The project directory, in the system temp dir. The caller removes
 * it.
 *
 * @example
 * ```ts
 * const dir = await drizzleProject(files, await kitDrizzleImports('web'))
 * ```
 */
export async function drizzleProject(
    files: ReadonlyMap<string, string>,
    imports: Readonly<Record<string, string>>,
): Promise<string> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-kit-migrations-' })
    const all = new Map(files)
    all.set(
        'deno.json',
        `${JSON.stringify({ nodeModulesDir: 'auto', imports }, null, 4)}\n`,
    )
    for (const [path, content] of all) {
        const target = join(dir, path)
        await Deno.mkdir(dirname(target), { recursive: true })
        await Deno.writeTextFile(target, content)
    }
    return dir
}

/**
 * Run drizzle-kit in a project, with a bounded timeout.
 *
 * `DATABASE_URL` is withheld from the child: generating never needs a
 * database, and the config then has no credentials to read.
 *
 * @param dir - The project directory.
 * @param specifier - The `npm:drizzle-kit@<version>` specifier to run.
 * @param args - drizzle-kit's arguments, e.g. `['generate']`.
 * @returns The exit code and combined output; never throws on a non-zero
 * exit.
 *
 * @example
 * ```ts
 * const { output } = await runDrizzleKit(dir, 'npm:drizzle-kit@0.31.10', ['generate'])
 * ```
 */
export async function runDrizzleKit(
    dir: string,
    specifier: string,
    args: readonly string[],
): Promise<DrizzleKitRun> {
    const env = Deno.env.toObject()
    delete env.DATABASE_URL
    const child = new Deno.Command(Deno.execPath(), {
        args: ['run', '-A', specifier, ...args],
        cwd: dir,
        clearEnv: true,
        env,
        stdout: 'piped',
        stderr: 'piped',
    }).spawn()
    let timedOut = false
    const timer = setTimeout(() => {
        timedOut = true
        try {
            child.kill('SIGKILL')
        } catch (error) {
            // It exited between the deadline and the kill: its output is
            // still awaited below, and still reported as timed out.
            console.warn(`drizzle-kit could not be killed: ${error}`)
        }
    }, DRIZZLE_KIT_TIMEOUT_MS)
    let result: Deno.CommandOutput
    try {
        result = await child.output()
    } finally {
        clearTimeout(timer)
    }
    const decoder = new TextDecoder()
    const output = decoder.decode(result.stdout) +
        decoder.decode(result.stderr)
    return timedOut
        ? {
            code: -1,
            output: `${output}\ntimed out after ${DRIZZLE_KIT_TIMEOUT_MS}ms`,
        }
        : { code: result.code, output }
}

/**
 * The stub files drizzle-kit reads to generate a kit's migrations: the shared
 * `drizzle.config.ts` and every schema module under `app/model/`, base first
 * and overlay over it, exactly as `init` layers them.
 *
 * They are copied as they are, never templated: a placeholder in a file whose
 * generated output is committed once would bake one project's value into every
 * project.
 *
 * @param kit - The kit.
 * @returns Project-relative path to text.
 * @throws {Error} When one of them holds a `{{` placeholder.
 */
async function schemaInputs(kit: KitName): Promise<Map<string, string>> {
    const sources: [string, string][] = [
        ...KITS[kit].base
            .filter((f) => f === CONFIG_STUB || f.startsWith(SCHEMA_DIR))
            .map((f): [string, string] => [join(STUBS, 'init', f), f]),
        ...KITS[kit].overlay
            .filter((f) => f.startsWith(SCHEMA_DIR))
            .map((f): [string, string] => [join(STUBS, 'kits', kit, f), f]),
    ]
    const files = new Map<string, string>()
    for (const [source, stub] of sources) {
        const content = await Deno.readTextFile(source)
        if (content.includes('{{')) {
            throw new Error(
                `${kit}: ${stub} holds a {{ placeholder }}; drizzle-kit's input must not be templated`,
            )
        }
        files.set(stub.replace(/\.stub$/, ''), content)
    }
    if (!files.has(CONFIG_STUB.replace(/\.stub$/, ''))) {
        throw new Error(`${kit}: its base does not list ${CONFIG_STUB}`)
    }
    return files
}

/**
 * Generate a kit's migrations folder from its schema stubs, with the
 * drizzle-kit version the kit pins.
 *
 * @param kit - A kit that ships migrations.
 * @returns The generated folder.
 * @throws {DrizzleKitError} When drizzle-kit fails — including when its
 * package cannot be fetched.
 * @throws {Error} When an input holds a placeholder, or the kit's
 * `deno.json.stub` does not map drizzle.
 *
 * @example
 * ```ts
 * const generated = await generateKitMigrations('api')
 * generated.has('0000_create_users.sql') // true
 * ```
 */
export async function generateKitMigrations(
    kit: KitName,
): Promise<MigrationFiles> {
    const imports = await kitDrizzleImports(kit)
    const dir = await drizzleProject(await schemaInputs(kit), imports)
    try {
        const run = await runDrizzleKit(dir, imports['drizzle-kit'], [
            'generate',
            '--name',
            MIGRATION_NAME,
        ])
        if (run.code !== 0) {
            throw new DrizzleKitError(
                `${kit}: drizzle-kit generate failed`,
                run,
            )
        }
        return await readTree(join(dir, MIGRATIONS_DIR))
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

/**
 * The migrations folder a kit ships, as it will be scaffolded.
 *
 * @param kit - The kit.
 * @returns The folder, keys without the `.stub` suffix.
 * @throws {Error} When a file in it is not a `.stub`.
 */
export async function shippedKitMigrations(
    kit: KitName,
): Promise<MigrationFiles> {
    const tree = await readTree(join(STUBS, 'kits', kit, MIGRATIONS_DIR))
    const files = new Map<string, string>()
    for (const [path, content] of tree) {
        if (!path.endsWith('.stub')) {
            throw new Error(`${kit}: ${path} is not a .stub file`)
        }
        files.set(path.slice(0, -'.stub'.length), content)
    }
    return files
}

/** A journal as drizzle-kit writes it. */
interface Journal {
    entries?: { when?: unknown }[]
    [key: string]: unknown
}

/**
 * Compare a shipped migrations folder with a fresh generation.
 *
 * @param shipped - The folder the kit ships.
 * @param generated - drizzle-kit's output for the same schema.
 * @param now - The time a shipped `when` must not exceed, in ms.
 * @returns One line per difference; empty when the shipped folder matches.
 *
 * @example
 * ```ts
 * compareMigrations(shipped, generated) // []
 * ```
 */
export function compareMigrations(
    shipped: MigrationFiles,
    generated: MigrationFiles,
    now: number = Date.now(),
): string[] {
    const differences: string[] = []
    for (const path of [...generated.keys()].sort()) {
        if (!shipped.has(path)) differences.push(`missing: ${path}`)
    }
    for (const path of [...shipped.keys()].sort()) {
        if (!generated.has(path)) differences.push(`not generated: ${path}`)
    }
    for (const [path, expected] of generated) {
        const actual = shipped.get(path)
        if (actual === undefined) continue
        if (path.endsWith('.sql')) {
            if (actual !== expected) differences.push(`differs: ${path}`)
            continue
        }
        const parsed = parseJson(actual)
        if (parsed === undefined) {
            differences.push(`not JSON: ${path}`)
            continue
        }
        const fresh = JSON.parse(expected) as Record<string, unknown>
        if (path === 'meta/_journal.json') {
            const journal = parsed as Journal
            for (const entry of journal.entries ?? []) {
                if (
                    !Number.isInteger(entry.when) ||
                    (entry.when as number) > now
                ) {
                    differences.push(
                        `${path}: when ${
                            String(entry.when)
                        } is not an integer no later than now`,
                    )
                }
            }
            if (!equal(withoutWhen(journal), withoutWhen(fresh as Journal))) {
                differences.push(`differs (ignoring when): ${path}`)
            }
        } else if (!equal(withoutId(parsed), withoutId(fresh))) {
            differences.push(`differs (ignoring id): ${path}`)
        }
    }
    return differences
}

/**
 * Parse JSON, or say it was not.
 *
 * @param text - Candidate JSON.
 * @returns The object, or `undefined` when it is not a JSON object.
 */
function parseJson(text: string): Record<string, unknown> | undefined {
    try {
        const value: unknown = JSON.parse(text)
        return typeof value === 'object' && value !== null &&
                !Array.isArray(value)
            ? value as Record<string, unknown>
            : undefined
    } catch (error) {
        if (error instanceof SyntaxError) return undefined
        throw error
    }
}

/** A journal with every entry's `when` dropped. */
function withoutWhen(journal: Journal): Journal {
    return {
        ...journal,
        entries: (journal.entries ?? []).map(({ when: _when, ...rest }) =>
            rest
        ),
    }
}

/** A snapshot with its random `id` dropped. */
function withoutId(snapshot: Record<string, unknown>): Record<string, unknown> {
    const { id: _id, ...rest } = snapshot
    return rest
}

/**
 * Regenerate a kit's migrations and compare them with the shipped folder.
 *
 * @param kit - A kit that ships migrations.
 * @returns One line per difference; empty when the shipped folder matches.
 * @throws {DrizzleKitError} When drizzle-kit fails.
 *
 * @example
 * ```ts
 * assertEquals(await diffKitMigrations('web'), [])
 * ```
 */
export async function diffKitMigrations(kit: KitName): Promise<string[]> {
    return compareMigrations(
        await shippedKitMigrations(kit),
        await generateKitMigrations(kit),
    )
}

/**
 * Replace a kit's shipped migrations folder with a generated one.
 *
 * @param kit - The kit.
 * @param generated - drizzle-kit's output.
 * @throws {Error} When the output holds a `{{` — `init` would treat it as a
 * placeholder and rewrite the committed SQL.
 */
async function writeKitMigrations(
    kit: KitName,
    generated: MigrationFiles,
): Promise<void> {
    for (const [path, content] of generated) {
        if (content.includes('{{')) {
            throw new Error(
                `${kit}: generated ${path} holds "{{", which init would template; refusing to write`,
            )
        }
    }
    const folder = join(STUBS, 'kits', kit, MIGRATIONS_DIR)
    await Deno.remove(folder, { recursive: true }).catch((error) => {
        if (!(error instanceof Deno.errors.NotFound)) throw error
    })
    for (const [path, content] of generated) {
        const target = join(folder, `${path}.stub`)
        await Deno.mkdir(dirname(target), { recursive: true })
        await Deno.writeTextFile(target, content)
    }
}

/** Regenerate every kit whose shipped folder drifted. */
async function main(): Promise<void> {
    for (const kit of migratingKits()) {
        const generated = await generateKitMigrations(kit)
        const differences = compareMigrations(
            await shippedKitMigrations(kit),
            generated,
        )
        if (differences.length === 0) {
            console.log(`✅ ${kit}: up to date`)
            continue
        }
        await writeKitMigrations(kit, generated)
        console.log(`✍️  ${kit}: regenerated\n   ${differences.join('\n   ')}`)

        const listed = new Set(KITS[kit].overlay)
        const unlisted = [...generated.keys()]
            .map((path) => `${MIGRATIONS_DIR}/${path}.stub`)
            .filter((stub) => !listed.has(stub))
        if (unlisted.length > 0) {
            console.log(
                `⚠️  ${kit}: add to KITS.${kit}.overlay in packages/init/kits.ts:\n   ${
                    unlisted.join('\n   ')
                }`,
            )
        }
    }
}

if (import.meta.main) {
    await main()
}
