/**
 * @fileoverview The transform cache: what its key covers, where it lives, and
 * the checks that keep another local user from planting code in it — the path
 * walk from the app root, the private cache directory, and the verification of
 * every entry through the descriptor it is read from (plan 274 §5, audit S9,
 * #618).
 *
 * @module @lockness/transform/tests/cache
 */

import { test } from 'node:test'
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import {
    assertEquals,
    assertMatch,
    assertNotEquals,
    assertThrows,
} from '@std/assert'
import {
    cacheDirFor,
    cacheKey,
    type CacheKeyInput,
    isTrustedEntry,
    TransformCache,
} from '../cache.ts'

const BASE: CacheKeyInput = {
    transformerVersion: '0.4.0+typescript@6.0.3',
    compilerOptions: { target: 9, jsx: 4, jsxImportSource: '@lockness/core' },
    fileName: '/app/main.ts',
    source: 'export const x = 1\n',
}

/**
 * The skip reason for a test of POSIX ownership, mode bits or symlinks, or
 * `false` where they exist. Windows has neither `getuid` nor POSIX modes, and
 * the cache keeps only its symlink and directory checks there (#618).
 */
const POSIX_ONLY: string | false = process.platform === 'win32'
    ? 'POSIX ownership and mode bits do not exist on Windows'
    : false

/** A fresh app root: a private temp directory, as `mkdtemp` makes it. */
function appRoot(): string {
    return mkdtempSync(join(tmpdir(), 'lockness-transform-cache-'))
}

/**
 * Run `body` with `process.getuid` answering `uid`, then restore it.
 *
 * @param uid - The uid the stub reports.
 * @param body - The code to run under the stub.
 */
function withUid(uid: number, body: () => void): void {
    const original = process.getuid
    process.getuid = () => uid
    try {
        body()
    } finally {
        process.getuid = original
    }
}

test('the cache key is a full SHA-256, stable for the same inputs', () => {
    const key = cacheKey(BASE)
    assertMatch(key, /^[0-9a-f]{64}$/)
    assertEquals(cacheKey({ ...BASE }), key)
})

test('the cache key changes with the transformer version', () => {
    assertNotEquals(
        cacheKey({ ...BASE, transformerVersion: '0.4.1+typescript@6.0.3' }),
        cacheKey(BASE),
    )
})

test('the cache key changes with the compiler options', () => {
    assertNotEquals(
        cacheKey({
            ...BASE,
            compilerOptions: { ...BASE.compilerOptions, jsx: 2 },
        }),
        cacheKey(BASE),
    )
})

test('the cache key does not depend on the order compiler options were declared in', () => {
    assertEquals(
        cacheKey({
            ...BASE,
            compilerOptions: {
                jsxImportSource: '@lockness/core',
                jsx: 4,
                target: 9,
            },
        }),
        cacheKey(BASE),
    )
})

test('the cache key changes with the source bytes', () => {
    assertNotEquals(
        cacheKey({ ...BASE, source: 'export const x = 2\n' }),
        cacheKey(BASE),
    )
})

test('the cache key changes with the file name (a .tsx parses differently)', () => {
    assertNotEquals(
        cacheKey({ ...BASE, fileName: '/app/main.tsx' }),
        cacheKey(BASE),
    )
})

test('the cache key does not collide when bytes move between fields', () => {
    assertNotEquals(
        cacheKey({ ...BASE, transformerVersion: 'a', source: 'bc' }),
        cacheKey({ ...BASE, transformerVersion: 'ab', source: 'c' }),
    )
})

test('the cache lives under the app root at node_modules/.cache/lockness-transform', () => {
    assertEquals(
        cacheDirFor('/srv/app'),
        join('/srv/app', 'node_modules', '.cache', 'lockness-transform'),
    )
})

test('a written entry reads back; an absent one reads as undefined', () => {
    const root = appRoot()
    try {
        const cache = new TransformCache(root)
        const key = cacheKey(BASE)
        assertEquals(cache.read(key), undefined)
        cache.write(key, 'export const x = 1;\n')
        assertEquals(cache.read(key), 'export const x = 1;\n')
        // No temporary file is left beside the entry.
        assertEquals(readdirSync(cacheDirFor(root)), [`${key}.js`])
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test('a read creates nothing: the cache directory appears on the first write', () => {
    const root = appRoot()
    try {
        new TransformCache(root).read(cacheKey(BASE))
        assertEquals(readdirSync(root), [])
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test('the cache directory is created 0700 and entries 0600', {
    skip: POSIX_ONLY,
}, () => {
    const root = appRoot()
    try {
        const dir = cacheDirFor(root)
        new TransformCache(root).write(cacheKey(BASE), '')
        assertEquals(statSync(dir).mode & 0o777, 0o700)
        assertEquals(
            statSync(join(dir, `${cacheKey(BASE)}.js`)).mode & 0o777,
            0o600,
        )
        // The directories above it are created without group/other write.
        assertEquals(statSync(join(root, 'node_modules')).mode & 0o022, 0)
        assertEquals(
            statSync(join(root, 'node_modules', '.cache')).mode & 0o022,
            0,
        )
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test('a cache directory with group or other bits is refused, not narrowed', {
    skip: POSIX_ONLY,
}, () => {
    for (const mode of [0o777, 0o770, 0o702, 0o750]) {
        const root = appRoot()
        try {
            const dir = cacheDirFor(root)
            mkdirSync(dir, { recursive: true })
            chmodSync(dir, mode)
            const error = assertThrows(
                () => new TransformCache(root).read(cacheKey(BASE)),
                Error,
                dir,
            )
            assertMatch(error.message, /remove it/)
            // Not silently narrowed: the directory keeps the mode it had.
            assertEquals(statSync(dir).mode & 0o777, mode)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    }
})

test(
    'a directory on the way to the cache that group or others can write is refused',
    {
        skip: POSIX_ONLY,
    },
    () => {
        for (
            const below of ['', 'node_modules', join('node_modules', '.cache')]
        ) {
            const root = appRoot()
            try {
                mkdirSync(cacheDirFor(root), { recursive: true, mode: 0o700 })
                chmodSync(join(root, below), 0o777)
                assertThrows(
                    () => new TransformCache(root).read(cacheKey(BASE)),
                    Error,
                    join(root, below),
                )
            } finally {
                rmSync(root, { recursive: true, force: true })
            }
        }
    },
)

test('a sticky, world-writable directory on the way to the cache is allowed', {
    skip: POSIX_ONLY,
}, () => {
    const root = appRoot()
    try {
        const cache = new TransformCache(root)
        cache.write(cacheKey(BASE), 'export {}\n')
        chmodSync(join(root, 'node_modules'), 0o1777)
        assertEquals(cache.read(cacheKey(BASE)), 'export {}\n')
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test(
    'a directory on the way to the cache that belongs to another user is refused',
    {
        skip: POSIX_ONLY,
    },
    () => {
        const root = appRoot()
        try {
            const cache = new TransformCache(root)
            cache.write(cacheKey(BASE), 'export {}\n')
            withUid(process.getuid!() + 1, () => {
                assertThrows(
                    () => cache.read(cacheKey(BASE)),
                    Error,
                    'belongs to another user',
                )
            })
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    },
)

test('a cache path that is a symlink or a file is refused', {
    skip: POSIX_ONLY,
}, () => {
    const root = appRoot()
    try {
        const elsewhere = join(root, 'elsewhere')
        mkdirSync(elsewhere, { mode: 0o700 })
        const dir = cacheDirFor(root)
        mkdirSync(join(dir, '..'), { recursive: true })
        symlinkSync(elsewhere, dir)
        assertThrows(
            () => new TransformCache(root).read(cacheKey(BASE)),
            Error,
            'symlink',
        )

        rmSync(dir)
        writeFileSync(dir, '')
        assertThrows(
            () => new TransformCache(root).read(cacheKey(BASE)),
            Error,
            'not a directory',
        )
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test(
    'a directory swapped for a symlink after the first read is never trusted',
    {
        skip: POSIX_ONLY,
    },
    () => {
        // The attack of #618: whoever can write a parent replaces a component
        // with a symlink to their own directory once the cache has been checked,
        // and plants an entry under the (computable) key.
        const swaps: ReadonlyArray<readonly [string, readonly string[]]> = [
            // [the component swapped, the path of the cache dir below it]
            [join('node_modules', '.cache', 'lockness-transform'), []],
            [join('node_modules', '.cache'), ['lockness-transform']],
            ['node_modules', ['.cache', 'lockness-transform']],
        ]
        for (const [component, below] of swaps) {
            const root = appRoot()
            try {
                const key = cacheKey(BASE)
                const cache = new TransformCache(root)
                cache.write(key, 'export const genuine = true\n')
                assertEquals(cache.read(key), 'export const genuine = true\n')

                const swapped = join(root, component)
                const planted = join(root, 'planted')
                renameSync(swapped, planted)
                writeFileSync(
                    join(planted, ...below, `${key}.js`),
                    'export const planted = true\n',
                    { mode: 0o600 },
                )
                symlinkSync(planted, swapped)

                let answer: string | undefined
                try {
                    answer = cache.read(key)
                } catch (error) {
                    assertMatch(String(error), /symlink/)
                    continue
                }
                assertEquals(answer, undefined, `${component} swapped`)
            } finally {
                rmSync(root, { recursive: true, force: true })
            }
        }
    },
)

test('an entry that is a symlink reads as a miss, and a write replaces it', {
    skip: POSIX_ONLY,
}, () => {
    const root = appRoot()
    try {
        const key = cacheKey(BASE)
        const cache = new TransformCache(root)
        cache.write(key, '')
        const outside = join(root, 'outside.js')
        writeFileSync(outside, 'export const planted = true\n', {
            mode: 0o600,
        })
        const entry = join(cacheDirFor(root), `${key}.js`)
        rmSync(entry)
        symlinkSync(outside, entry)
        assertEquals(cache.read(key), undefined)

        cache.write(key, 'export const genuine = true\n')
        assertEquals(cache.read(key), 'export const genuine = true\n')
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test('an entry group or others can read or write reads as a miss', {
    skip: POSIX_ONLY,
}, () => {
    for (const mode of [0o640, 0o604, 0o620, 0o602, 0o666]) {
        const root = appRoot()
        try {
            const key = cacheKey(BASE)
            const cache = new TransformCache(root)
            cache.write(key, 'export const planted = true\n')
            chmodSync(join(cacheDirFor(root), `${key}.js`), mode)
            assertEquals(cache.read(key), undefined)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    }
})

test('an entry that is not a regular file reads as a miss', () => {
    const root = appRoot()
    try {
        const key = cacheKey(BASE)
        const cache = new TransformCache(root)
        cache.write(key, '')
        rmSync(join(cacheDirFor(root), `${key}.js`))
        mkdirSync(join(cacheDirFor(root), `${key}.js`), { mode: 0o700 })
        assertEquals(cache.read(key), undefined)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test('an entry is trusted only as a regular file owned by the uid with no group/other bits', () => {
    const file = (uid: number, mode: number, isFile = true) => ({
        isFile: () => isFile,
        uid,
        mode,
    })
    assertEquals(isTrustedEntry(file(501, 0o100600), 501), true)
    assertEquals(isTrustedEntry(file(501, 0o100400), 501), true)
    // Foreign-owned: another user wrote it.
    assertEquals(isTrustedEntry(file(502, 0o100600), 501), false)
    // Group or other bits, read or write.
    assertEquals(isTrustedEntry(file(501, 0o100640), 501), false)
    assertEquals(isTrustedEntry(file(501, 0o100602), 501), false)
    // Not a regular file.
    assertEquals(isTrustedEntry(file(501, 0o040700, false), 501), false)
    // Windows: no uid, no POSIX mode; a regular file is all that is checked.
    assertEquals(isTrustedEntry(file(0, 0o100666), undefined), true)
    assertEquals(isTrustedEntry(file(0, 0o100666, false), undefined), false)
})

test('a path that cannot be inspected throws its own error, not a miss', () => {
    // A component name longer than any filesystem allows: lstat fails with
    // ENAMETOOLONG, which must surface, not read as "no cache yet".
    const root = join(tmpdir(), 'x'.repeat(300))
    assertThrows(
        () => new TransformCache(root).read(cacheKey(BASE)),
        Error,
        'ENAMETOOLONG',
    )
})

test('a key that is not a SHA-256 hex digest is refused (no path out of the cache)', () => {
    const root = appRoot()
    try {
        const cache = new TransformCache(root)
        assertThrows(() => cache.read('../../escape'), Error, 'cache key')
        assertThrows(() => cache.write('../../escape', ''), Error, 'cache key')
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})
