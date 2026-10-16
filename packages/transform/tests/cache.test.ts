/**
 * @fileoverview The transform cache: what its key covers, where it lives, and
 * the 0700 directory that keeps another local user from planting code in it
 * (plan 274 §5, audit S9).
 *
 * @module @lockness/transform/tests/cache
 */

import { test } from 'node:test'
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
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
    TransformCache,
} from '../cache.ts'

const BASE: CacheKeyInput = {
    transformerVersion: '0.4.0+typescript@6.0.3',
    compilerOptions: { target: 9, jsx: 4, jsxImportSource: '@lockness/core' },
    fileName: '/app/main.ts',
    source: 'export const x = 1\n',
}

/** POSIX permission bits are meaningless on Windows. */
const POSIX = process.platform !== 'win32'

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
    const root = mkdtempSync(join(tmpdir(), 'lockness-transform-cache-'))
    try {
        const cache = new TransformCache(cacheDirFor(root))
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

test('the cache directory is created with mode 0700', { skip: !POSIX }, () => {
    const root = mkdtempSync(join(tmpdir(), 'lockness-transform-cache-'))
    try {
        const dir = cacheDirFor(root)
        new TransformCache(dir).write(cacheKey(BASE), '')
        assertEquals(statSync(dir).mode & 0o777, 0o700)
        assertEquals(
            statSync(join(dir, `${cacheKey(BASE)}.js`)).mode & 0o777,
            0o600,
        )
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test(
    'an existing, wider cache directory is narrowed to 0700 before it is read',
    {
        skip: !POSIX,
    },
    () => {
        const root = mkdtempSync(join(tmpdir(), 'lockness-transform-cache-'))
        try {
            const dir = cacheDirFor(root)
            mkdirSync(dir, { recursive: true })
            chmodSync(dir, 0o777)
            new TransformCache(dir).read(cacheKey(BASE))
            assertEquals(statSync(dir).mode & 0o777, 0o700)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    },
)

test(
    'a cache path that is not a real directory is refused',
    { skip: !POSIX },
    () => {
        const root = mkdtempSync(join(tmpdir(), 'lockness-transform-cache-'))
        try {
            const elsewhere = join(root, 'elsewhere')
            mkdirSync(elsewhere)
            const dir = cacheDirFor(root)
            mkdirSync(join(dir, '..'), { recursive: true })
            symlinkSync(elsewhere, dir)
            assertThrows(
                () => new TransformCache(dir).read(cacheKey(BASE)),
                Error,
                'not a directory',
            )

            rmSync(dir)
            writeFileSync(dir, '')
            assertThrows(
                () => new TransformCache(dir).read(cacheKey(BASE)),
                Error,
                'not a directory',
            )
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    },
)

test('an entry that exists but cannot be read throws, rather than reading as a miss', () => {
    const root = mkdtempSync(join(tmpdir(), 'lockness-transform-cache-'))
    try {
        const dir = cacheDirFor(root)
        const key = cacheKey(BASE)
        const cache = new TransformCache(dir)
        cache.read(key) // creates the directory
        mkdirSync(join(dir, `${key}.js`)) // EISDIR on read
        assertThrows(() => cache.read(key))
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test('a key that is not a SHA-256 hex digest is refused (no path out of the cache)', () => {
    const root = mkdtempSync(join(tmpdir(), 'lockness-transform-cache-'))
    try {
        const cache = new TransformCache(cacheDirFor(root))
        assertThrows(() => cache.read('../../escape'), Error, 'cache key')
        assertThrows(() => cache.write('../../escape', ''), Error, 'cache key')
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})
