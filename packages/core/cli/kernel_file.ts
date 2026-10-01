/**
 * @fileoverview Where an app's kernel file lives — the one lookup every core
 * command that loads the `@Kernel` shares (#485).
 *
 * `compile` used to read a fixed `app/kernel.tsx` while every scaffold ships
 * `app/kernel.ts`, and `ssg:build` kept its own candidate list. Two answers to
 * one question drift; this module is the single answer.
 *
 * **Precedence.** The candidates are tried in {@link KERNEL_CANDIDATES} order
 * and the first one that exists as a file wins: `app/kernel.ts` (what
 * `lockness init` and every kit ship) before `app/kernel.tsx`. An app holding
 * both gets `app/kernel.ts`; the `.tsx` is never imported. The lookup only
 * finds the file — it does not fall through to the next candidate when the
 * winner declares no `@Kernel` class, so the file a command reports is the
 * file it read.
 *
 * Importing the winner is the caller's job, through `importAppFile` (#477).
 *
 * @module @lockness/core/cli/kernel_file
 */

import { exists } from '@std/fs'
import { join } from '@std/path'

/**
 * The kernel file paths, relative to the app root, in precedence order.
 *
 * `app/kernel.ts` comes first because it is the file the scaffold ships;
 * `app/kernel.tsx` is still accepted for apps that renamed it.
 */
export const KERNEL_CANDIDATES: readonly string[] = Object.freeze([
    'app/kernel.ts',
    'app/kernel.tsx',
])

/** The kernel file a lookup found. */
export interface KernelFile {
    /** The candidate that matched, as written in {@link KERNEL_CANDIDATES}. */
    readonly candidate: string
    /** Its absolute path under the app root, ready for `importAppFile`. */
    readonly path: string
}

/**
 * Find an app's kernel file: the first of {@link KERNEL_CANDIDATES} that
 * exists as a file under `root`.
 *
 * @param root - The app root. Defaults to the working directory.
 * @returns The matching candidate and its path, or `undefined` when no
 * candidate exists — report it with {@link kernelFileNotFoundMessage}.
 *
 * @example
 * ```ts
 * const kernel = await resolveKernelFile()
 * if (kernel) await importAppFile(kernel.path)
 * ```
 */
export async function resolveKernelFile(
    root: string = Deno.cwd(),
): Promise<KernelFile | undefined> {
    for (const candidate of KERNEL_CANDIDATES) {
        const path = join(root, candidate)
        if (await exists(path, { isFile: true })) return { candidate, path }
    }
    return undefined
}

/**
 * The message for an app with no kernel file, naming every path tried.
 *
 * @returns A one-line message listing each of {@link KERNEL_CANDIDATES}.
 *
 * @example
 * ```ts
 * kernelFileNotFoundMessage()
 * // 'Kernel file not found (tried app/kernel.ts, app/kernel.tsx)'
 * ```
 */
export function kernelFileNotFoundMessage(): string {
    return `Kernel file not found (tried ${KERNEL_CANDIDATES.join(', ')})`
}
