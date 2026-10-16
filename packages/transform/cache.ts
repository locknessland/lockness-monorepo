/**
 * @fileoverview The project-local cache of transformed user TypeScript
 * (plan 274 §5, audit S9).
 *
 * Every entry is JavaScript the Node load hook will execute, so the cache is a
 * code-injection surface: whoever can write into it runs code in the app. It
 * therefore lives inside the project (`node_modules/.cache/lockness-transform`,
 * never a shared temp dir), in a directory the current user owns with mode
 * 0700, and entries are written 0600.
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
    chmodSync,
    lstatSync,
    mkdirSync,
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

/** A key: 64 lowercase hex characters. Anything else never reaches a path. */
const KEY = /^[0-9a-f]{64}$/

/** Owner read/write/search only. */
const DIR_MODE = 0o700

/** Owner read/write only. */
const FILE_MODE = 0o600

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
 * A directory of transformed files, one `<key>.js` per entry.
 *
 * The directory is created (or checked) on first use: it must be a real
 * directory, not a symlink, owned by the current user, and its mode is set to
 * 0700 if it is wider.
 *
 * @example
 * ```ts
 * const cache = new TransformCache(cacheDirFor(process.cwd()))
 * const code = cache.read(key) ?? emitAndStore()
 * ```
 */
export class TransformCache {
    readonly #dir: string
    #ready = false

    /**
     * @param dir - The cache directory, normally {@link cacheDirFor}'s answer.
     */
    constructor(dir: string) {
        this.#dir = dir
    }

    /**
     * Read an entry.
     *
     * @param key - A key from {@link cacheKey}.
     * @returns The cached JavaScript, or `undefined` when there is no entry.
     * @throws {Error} When the key is malformed, the directory fails its
     *   checks, or the entry exists but cannot be read.
     */
    read(key: string): string | undefined {
        const path = this.#entry(key)
        try {
            return readFileSync(path, 'utf8')
        } catch (error) {
            if (isNotFound(error)) return undefined
            throw error
        }
    }

    /**
     * Store an entry. The file is written beside its final name and renamed
     * into place, so a concurrent reader sees the whole entry or none.
     *
     * @param key - A key from {@link cacheKey}.
     * @param code - The JavaScript to store.
     * @throws {Error} When the key is malformed, the directory fails its
     *   checks, or the file cannot be written.
     */
    write(key: string, code: string): void {
        const path = this.#entry(key)
        const temporary = `${path}.${process.pid}.${
            randomBytes(6).toString('hex')
        }.tmp`
        writeFileSync(temporary, code, { mode: FILE_MODE, flag: 'wx' })
        renameSync(temporary, path)
    }

    /** The path of an entry, after the key and directory checks. */
    #entry(key: string): string {
        if (!KEY.test(key)) {
            throw new Error(
                `@lockness/transform: invalid cache key ${JSON.stringify(key)}`,
            )
        }
        this.#ensureDir()
        return join(this.#dir, `${key}.js`)
    }

    /** Create the directory 0700, or check and narrow an existing one. */
    #ensureDir(): void {
        if (this.#ready) return
        let stat = lstatOrUndefined(this.#dir)
        if (stat === undefined) {
            mkdirSync(this.#dir, { recursive: true, mode: DIR_MODE })
            stat = lstatSync(this.#dir)
        }
        if (!stat.isDirectory()) {
            throw new Error(
                `@lockness/transform: the cache path ${this.#dir} is not a directory (a symlink or a file); remove it`,
            )
        }
        const uid = typeof process.getuid === 'function'
            ? process.getuid()
            : undefined
        if (uid !== undefined && stat.uid !== uid) {
            throw new Error(
                `@lockness/transform: the cache directory ${this.#dir} belongs to another user; remove it`,
            )
        }
        if ((stat.mode & 0o777) !== DIR_MODE) chmodSync(this.#dir, DIR_MODE)
        this.#ready = true
    }
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
 * Whether an error is a file-not-found.
 *
 * @param error - A thrown value.
 * @returns `true` for an `ENOENT` error.
 */
function isNotFound(error: unknown): boolean {
    return error instanceof Error &&
        (error as { code?: unknown }).code === 'ENOENT'
}
