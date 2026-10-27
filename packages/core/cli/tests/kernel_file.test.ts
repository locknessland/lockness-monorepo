/**
 * The one kernel-file lookup `compile` and `ssg:build` share (#485).
 *
 * Pins the candidate list, the "first existing candidate wins" precedence
 * when an app holds both files, and the not-found message naming every path
 * that was tried.
 *
 * @module @lockness/core/cli/tests/kernel_file
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import {
    KERNEL_CANDIDATES,
    kernelFileNotFoundMessage,
    resolveKernelFile,
} from '../kernel_file.ts'

/** Run `fn` in a fresh temp dir holding `files` (paths relative to it). */
async function withRoot(
    files: readonly string[],
    fn: (root: string) => Promise<void>,
): Promise<void> {
    const root = await Deno.makeTempDir()
    try {
        for (const file of files) {
            await Deno.mkdir(join(root, file, '..'), { recursive: true })
            await Deno.writeTextFile(join(root, file), '')
        }
        await fn(root)
    } finally {
        await Deno.remove(root, { recursive: true })
    }
}

Deno.test("KERNEL_CANDIDATES - the scaffold's app/kernel.ts first, then app/kernel.tsx", () => {
    assertEquals([...KERNEL_CANDIDATES], ['app/kernel.ts', 'app/kernel.tsx'])
})

Deno.test('resolveKernelFile - finds app/kernel.ts', async () => {
    await withRoot(['app/kernel.ts'], async (root) => {
        assertEquals(await resolveKernelFile(root), {
            candidate: 'app/kernel.ts',
            path: join(root, 'app/kernel.ts'),
        })
    })
})

Deno.test('resolveKernelFile - finds app/kernel.tsx', async () => {
    await withRoot(['app/kernel.tsx'], async (root) => {
        assertEquals(await resolveKernelFile(root), {
            candidate: 'app/kernel.tsx',
            path: join(root, 'app/kernel.tsx'),
        })
    })
})

Deno.test('resolveKernelFile - app/kernel.ts wins when both exist', async () => {
    await withRoot(['app/kernel.tsx', 'app/kernel.ts'], async (root) => {
        assertEquals(
            (await resolveKernelFile(root))?.candidate,
            'app/kernel.ts',
        )
    })
})

Deno.test('resolveKernelFile - undefined when neither exists', async () => {
    await withRoot(['app/other.ts'], async (root) => {
        assertEquals(await resolveKernelFile(root), undefined)
    })
})

Deno.test('resolveKernelFile - a directory named like a candidate is not a kernel file', async () => {
    await withRoot(['app/kernel.ts/placeholder'], async (root) => {
        assertEquals(await resolveKernelFile(root), undefined)
    })
})

Deno.test('kernelFileNotFoundMessage - names every path that was tried', () => {
    const message = kernelFileNotFoundMessage()
    for (const candidate of KERNEL_CANDIDATES) {
        assertStringIncludes(message, candidate)
    }
})
