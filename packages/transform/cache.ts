/**
 * @fileoverview The project-local cache of transformed user TypeScript
 * (plan 274 §5, audit S9, #618).
 *
 * Every entry is JavaScript the Node load hook will execute, so the cache is a
 * code-injection surface: whoever can write into it runs code in the app. It
 * therefore lives inside the project (`node_modules/.cache/lockness-transform`,
 * never a shared temp dir), and nothing in it is trusted on its location
 * alone. On every read and write:
 *
 * - **The path is walked.** Each directory from the app root down to the
 *   cache directory is `lstat`-ed: none may be a symlink, each must belong to
 *   the current user, and none may be writable by others unless it carries
 *   the sticky bit. The walk runs per access, not once per process, so a
 *   component swapped for a symlink after the first read is caught. A parent
 *   that fails (the app root, `node_modules`, `.cache`) disables the cache
 *   for the process with one warning — reads miss, writes are skipped — and
 *   never fails a load.
 * - **The cache directory is private.** It is created 0700. One that has any
 *   group or other bit, belongs to another user or is a symlink is refused
 *   with a message to remove it, never narrowed and reused: whatever it holds
 *   may have been planted while it was open.
 * - **Each entry is verified through the descriptor it is read from.** It is
 *   opened `O_RDONLY | O_NOFOLLOW` and `fstat`-ed: only a regular file, owned
 *   by the current user, with no group or other bit, is used. Anything else is
 *   a miss, and the hook emits afresh. Checking the open descriptor, not the
 *   path, closes the race an `lstat` followed by an `open` would leave.
 *
 * Entries are written 0600 beside their final name and renamed into place.
 *
 * **The trust boundary.** The app root's ancestors are trusted, and so is
 * the source tree: the cache can be no safer than the sources it is keyed on.
 * Group write on the parents is therefore allowed — under a `002` umask the
 * sources are group-writable too, and anyone in that group can edit them
 * directly, which no check here could stop. Opening the entry and checking
 * its descriptor closes the check-then-use race for **reads**; a write lands
 * in a directory that passed the walk, but a parent changed between the walk
 * and the rename is not re-checked.
 *
 * On Windows, which has neither `getuid` nor POSIX mode bits, only the
 * symlink and directory checks apply.
 *
 * The key is a full SHA-256 over everything the emit depends on — the
 * transformer version (this package and TypeScript), the compiler options,
 * the file name and the source bytes — so a hit is never stale. The file name
 * is in the key beside the plan's three inputs because the emit depends on it
 * too: the same bytes parse differently as `.ts` and `.tsx`, and a source map
 * names the file.
 *
 * Not exported from the package: the load hook is its one consumer.
 *
 * @module
 */

import { createHash, randomBytes } from 'node:crypto'
import {
    closeSync,
    constants,
    fstatSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    type Stats,
    writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

/** Everything a transform's output depends on. */
export interface CacheKeyInput {
    /** This package's version and the TypeScript version, e.g. `0.4.0+typescript@6.0.3`. */
    readonly transformerVersion: string
    /** The compiler options the file is emitted with. */
    readonly compilerOptions: Readonly<Record<string, unknown>>
    /** The absolute path of the source file. */
    readonly fileName: string
    /** The file's source text. */
    readonly source: string
}

/**
 * The stat of a cache entry, as far as trusting it goes: the `fstat` of the
 * descriptor the entry is read from.
 */
export interface CacheEntryStat {
    /** Whether the entry is a regular file. */
    isFile(): boolean
    /** The uid of the entry's owner. */
    readonly uid: number
    /** The entry's mode, type bits included. */
    readonly mode: number
}

/** A key: 64 lowercase hex characters. Anything else never reaches a path. */
const KEY = /^[0-9a-f]{64}$/

/** Owner read/write/search only: the mode the cache directory is created with. */
const DIR_MODE = 0o700

/**
 * The mode the directories above the cache are created with when missing:
 * never group- or other-writable, whatever the umask.
 */
const PARENT_MODE = 0o755

/** Owner read/write only. */
const FILE_MODE = 0o600

/** Any group or other permission bit. */
const GROUP_OTHER = 0o077

/** The other-write bit. Group write on a parent is allowed (see above). */
const OTHER_WRITE = 0o002

/** The sticky bit: only an entry's owner may rename or remove it. */
const STICKY = 0o1000

/**
 * Open an entry for reading without following a symlink. Windows has no
 * `O_NOFOLLOW`; the flag is then 0 and the `fstat` check still applies.
 */
const ENTRY_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)

/**
 * What `open` reports for a symlink under `O_NOFOLLOW`: `ELOOP` on Linux and
 * macOS, `EMLINK` on FreeBSD.
 */
const SYMLINK_REFUSED: ReadonlySet<string> = new Set(['ELOOP', 'EMLINK'])

/**
 * JSON with object keys sorted at every depth, so two equal option sets
 * serialise identically whatever order they were declared in.
 *
 * @param value - A JSON-compatible value.
 * @returns Its canonical JSON text.
 */
function canonicalJson(value: unknown): string {
    return JSON.stringify(value, (_key, v: unknown) => {
        if (v === null || typeof v !== 'object' || Array.isArray(v)) return v
        const record = v as Record<string, unknown>
        return Object.fromEntries(
            Object.keys(record).sort().map((k) => [k, record[k]]),
        )
    })
}

/**
 * The cache key of one transform.
 *
 * The inputs are hashed as one canonical JSON array, so bytes cannot move from
 * one field to its neighbour and produce the same digest.
 *
 * @param input - Everything the output depends on.
 * @returns The SHA-256 of the inputs, as 64 hex characters.
 *
 * @example
 * ```ts
 * cacheKey({ transformerVersion, compilerOptions, fileName, source })
 * // 'e3b0c442…'
 * ```
 */
export function cacheKey(input: CacheKeyInput): string {
    const payload = canonicalJson([
        input.transformerVersion,
        input.compilerOptions,
        input.fileName,
        input.source,
    ])
    return createHash('sha256').update(payload, 'utf8').digest('hex')
}

/**
 * The cache directory of an app.
 *
 * @param appRoot - The app's root directory.
 * @returns `<appRoot>/node_modules/.cache/lockness-transform`.
 */
export function cacheDirFor(appRoot: string): string {
    return join(appRoot, 'node_modules', '.cache', 'lockness-transform')
}

/**
 * Whether a cache entry may be returned as module source.
 *
 * @param stat - The entry's `fstat`, taken on the descriptor it is read from.
 * @param uid - The current user's uid, or `undefined` where the platform has
 *   none (Windows).
 * @returns `true` only for a regular file owned by `uid` with no group or
 *   other bit. Without a uid, only the regular-file check applies.
 *
 * @example
 * ```ts
 * isTrustedEntry(fstatSync(fd), process.getuid?.())
 * ```
 */
export function isTrustedEntry(
    stat: CacheEntryStat,
    uid: number | undefined,
): boolean {
    if (!stat.isFile()) return false
    if (uid === undefined) return true
    return stat.uid === uid && (stat.mode & GROUP_OTHER) === 0
}

/**
 * The transform cache of one app: one `<key>.js` per entry under
 * {@link cacheDirFor}'s directory.
 *
 * Nothing is created on a read; the directories appear on the first write.
 * Every access walks the path from the app root first (see the module
 * documentation for the rules), and a read returns an entry only once it has
 * been verified through its open descriptor.
 *
 * @example
 * ```ts
 * const cache = new TransformCache(appRoot)
 * const code = cache.read(key) ?? emitAndStore()
 * ```
 */
export class TransformCache {
    readonly #root: string
    readonly #dir: string
    #warned = false

    /**
     * @param root - The app root: the directory of the governing
     *   `tsconfig.json`. The path walk starts here.
     */
    constructor(root: string) {
        this.#root = root
        this.#dir = cacheDirFor(root)
    }

    /**
     * Read an entry.
     *
     * @param key - A key from {@link cacheKey}.
     * @returns The cached JavaScript, or `undefined` when there is no entry or
     *   the entry fails its checks (a symlink, not a regular file, owned by
     *   another user, or with a group or other bit).
     * @throws {Error} When the key is malformed, a directory on the path fails
     *   its checks, or the entry exists but cannot be opened or read.
     */
    read(key: string): string | undefined {
        const name = entryName(key)
        const uid = currentUid()
        if (this.#walk(uid, false) !== 'trusted') return undefined
        let fd: number
        try {
            fd = openSync(join(this.#dir, name), ENTRY_FLAGS)
        } catch (error) {
            if (isNotFound(error) || SYMLINK_REFUSED.has(codeOf(error))) {
                return undefined
            }
            throw error
        }
        try {
            if (!isTrustedEntry(fstatSync(fd), uid)) return undefined
            return readFileSync(fd, 'utf8')
        } finally {
            closeSync(fd)
        }
    }

    /**
     * Store an entry. The file is written 0600 beside its final name and
     * renamed into place, so a concurrent reader sees the whole entry or none.
     *
     * @param key - A key from {@link cacheKey}.
     * @param code - The JavaScript to store.
     * Skipped (with the walk's one warning) when a parent directory fails
     * its checks.
     *
     * @param key - A key from {@link cacheKey}.
     * @param code - The JavaScript to store.
     * @throws {Error} When the key is malformed, the cache directory fails its
     *   checks, or the file cannot be written.
     */
    write(key: string, code: string): void {
        const path = join(this.#dir, entryName(key))
        if (this.#walk(currentUid(), true) !== 'trusted') return
        const temporary = `${path}.${process.pid}.${
            randomBytes(6).toString('hex')
        }.tmp`
        writeFileSync(temporary, code, { mode: FILE_MODE, flag: 'wx' })
        renameSync(temporary, path)
    }

    /**
     * Check every component from the app root down to the cache directory.
     *
     * @param uid - The current uid, `undefined` on Windows.
     * @param create - Create the missing directories below the app root.
     * @returns `'trusted'` when every directory passes, `'absent'` when the
     *   cache directory does not exist (and `create` is unset), `'untrusted'`
     *   when a parent fails — after one warning per instance.
     * @throws {Error} When the cache directory itself fails its checks.
     */
    #walk(
        uid: number | undefined,
        create: boolean,
    ): 'trusted' | 'absent' | 'untrusted' {
        const components = [
            this.#root,
            join(this.#root, 'node_modules'),
            join(this.#root, 'node_modules', '.cache'),
            this.#dir,
        ]
        for (const [index, path] of components.entries()) {
            const isCacheDir = index === components.length - 1
            let stat = lstatOrUndefined(path)
            if (stat === undefined) {
                // The app root is never created: it holds the tsconfig.json.
                if (!create || index === 0) return 'absent'
                mkdirSync(path, { mode: isCacheDir ? DIR_MODE : PARENT_MODE })
                stat = lstatSync(path)
            }
            const problem = directoryProblem(stat, uid, isCacheDir)
            if (problem === undefined) continue
            if (isCacheDir) throw refusal(path, problem)
            this.#warnUntrusted(path, problem)
            return 'untrusted'
        }
        return 'trusted'
    }

    /**
     * Warn, once per instance (one per app and process), that a parent
     * directory disables the cache.
     *
     * @param path - The parent that failed.
     * @param problem - What is wrong with it.
     */
    #warnUntrusted(path: string, problem: string): void {
        if (this.#warned) return
        this.#warned = true
        console.warn(
            `@lockness/transform: the cache at ${this.#dir} is disabled: ` +
                `${path} ${problem}, so another user could swap the cache ` +
                `under it. Modules load uncached; fix its ownership or ` +
                `permissions to re-enable the cache.`,
        )
    }
}

/**
 * What makes a directory on the cache path untrustworthy, if anything.
 *
 * @param stat - The directory's `lstat`.
 * @param uid - The current uid, `undefined` on Windows.
 * @param isCacheDir - Whether it is the cache directory itself, which must
 *   have no group or other bit at all. A parent may be group-writable, but
 *   not other-writable unless sticky.
 * @returns The problem, phrased to follow the path, or `undefined`.
 */
function directoryProblem(
    stat: Stats,
    uid: number | undefined,
    isCacheDir: boolean,
): string | undefined {
    if (stat.isSymbolicLink()) return 'is a symlink'
    if (!stat.isDirectory()) return 'is not a directory'
    if (uid === undefined) return undefined
    if (stat.uid !== uid) return 'belongs to another user'
    if (isCacheDir) {
        if ((stat.mode & GROUP_OTHER) === 0) return undefined
        return `has group or other permissions (mode ${octal(stat.mode)}), ` +
            'so its entries may have been planted'
    }
    if ((stat.mode & OTHER_WRITE) !== 0 && (stat.mode & STICKY) === 0) {
        return `is writable by others (mode ${octal(stat.mode)})`
    }
    return undefined
}

/**
 * The error for a cache path that fails its checks.
 *
 * @param path - The offending path.
 * @param problem - What is wrong with it.
 * @returns An error naming both, and telling the user what to do.
 */
function refusal(path: string, problem: string): Error {
    return new Error(
        `@lockness/transform: the cache directory ${path} ${problem}; the ` +
            `transform cache cannot be trusted. Fix its ownership or ` +
            `permissions, or remove it (the cache is rebuilt on the next run).`,
    )
}

/**
 * The file name of an entry.
 *
 * @param key - A key from {@link cacheKey}.
 * @returns `<key>.js`.
 * @throws {Error} When the key is not 64 lowercase hex characters, so no key
 *   can name a path outside the cache.
 */
function entryName(key: string): string {
    if (!KEY.test(key)) {
        throw new Error(
            `@lockness/transform: invalid cache key ${JSON.stringify(key)}`,
        )
    }
    return `${key}.js`
}

/**
 * The current user's uid.
 *
 * @returns The uid, or `undefined` where the platform has none (Windows).
 */
function currentUid(): number | undefined {
    return typeof process.getuid === 'function' ? process.getuid() : undefined
}

/**
 * A mode's permission bits, for a message.
 *
 * @param mode - A `stat` mode.
 * @returns E.g. `0770`.
 */
function octal(mode: number): string {
    return `0${(mode & 0o7777).toString(8)}`
}

/**
 * `lstat` a path that may not exist.
 *
 * @param path - The path.
 * @returns Its stats (of the link itself, for a symlink), or `undefined` when
 *   nothing is there.
 * @throws {Error} Any failure other than a missing path.
 */
function lstatOrUndefined(path: string): Stats | undefined {
    try {
        return lstatSync(path)
    } catch (error) {
        if (isNotFound(error)) return undefined
        throw error
    }
}

/**
 * The `code` of a Node system error.
 *
 * @param error - A thrown value.
 * @returns Its `code`, or `''` when it has none.
 */
function codeOf(error: unknown): string {
    if (!(error instanceof Error)) return ''
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : ''
}

/**
 * Whether an error is a file-not-found.
 *
 * @param error - A thrown value.
 * @returns `true` for an `ENOENT` error.
 */
function isNotFound(error: unknown): boolean {
    return codeOf(error) === 'ENOENT'
}
