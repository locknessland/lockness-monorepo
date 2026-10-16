/**
 * @fileoverview The one runtime detector (plan 274 §5, FR-002): which of
 * Deno, Bun and Node this process runs on.
 *
 * Every framework decision that differs per runtime asks
 * {@link currentRuntime}; none tests the runtime itself. Hono's
 * `getRuntimeKey()`, a `'Deno' in globalThis` probe or a `globalThis.Bun`
 * check anywhere else is a second detector, and so is a runtime-keyed
 * conditional export.
 *
 * **How it knows.** All three runtimes expose `process.versions` through
 * `node:process`, and each names itself there: Deno adds `deno`, Bun adds
 * `bun`, and both also report the Node version they are compatible with. So
 * the order is fixed — Deno, then Bun, then Node — and the probe needs no
 * `Deno` or `Bun` global, which keeps this module runtime-neutral.
 *
 * **What it refuses.** A process that reports none of the three, and a Bun
 * below {@link BUN_FLOOR}: Bun before 1.3.10 silently ignores TC39 decorators
 * (the original method runs, no error), and Bun before 1.4.0 lacks the
 * `node:test` subtests and `node:sqlite` the framework relies on. Running on
 * it would look like working and be wrong, so the detector raises
 * {@link UnsupportedRuntimeError} instead of answering.
 *
 * This subpath, `@lockness/runtime/runtime`, is the one `@lockness/contract`
 * may import (a recorded exception, plan 274 §7): keep it free of imports
 * beyond `node:` built-ins.
 *
 * @module @lockness/runtime/runtime
 */

import process from 'node:process'

/** A runtime Lockness runs on. */
export type RuntimeId = 'deno' | 'bun' | 'node'

/**
 * The part of `process.versions` the detector reads: each runtime's version,
 * when the process reports it.
 */
export interface RuntimeVersions {
    /** Deno's version, reported by Deno only. */
    readonly deno?: string
    /** Bun's version, reported by Bun only. */
    readonly bun?: string
    /** The Node version — reported by Node, and by Deno and Bun as well. */
    readonly node?: string
}

/**
 * The lowest Bun the framework runs on. Below 1.3.10 TC39 decorators are
 * silently ignored; below 1.4.0 `node:test` subtests and `node:sqlite` are
 * missing (plan 274 §6, F4, F10, F12).
 */
export const BUN_FLOOR = '1.4.0'

/**
 * Raised when the process runs on a runtime Lockness does not support: none
 * of Deno, Bun and Node, or a Bun below {@link BUN_FLOOR}.
 *
 * @example
 * ```ts
 * try {
 *     currentRuntime()
 * } catch (error) {
 *     if (error instanceof UnsupportedRuntimeError) console.error(error.message)
 * }
 * ```
 */
export class UnsupportedRuntimeError extends Error {
    /**
     * Build the refusal.
     *
     * @param message - What was found, and what is supported instead.
     */
    constructor(message: string) {
        super(message)
        this.name = 'UnsupportedRuntimeError'
    }
}

/**
 * The numeric `major.minor.patch` of a version string, ignoring a pre-release
 * or build suffix.
 *
 * @param version - A version such as `1.4.0` or `1.4.0-canary.12+abc`.
 * @returns The three components, or `undefined` when it does not start with
 *   three dot-separated numbers.
 */
function versionTriple(version: string): [number, number, number] | undefined {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
    if (!match) return undefined
    return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Whether `version` is at or above `floor`, component by component.
 *
 * @param version - The version found.
 * @param floor - The lowest accepted version.
 * @returns `false` too when `version` is unreadable.
 */
function atLeast(version: string, floor: string): boolean {
    const found = versionTriple(version)
    const lowest = versionTriple(floor)
    if (found === undefined || lowest === undefined) return false
    for (let i = 0; i < 3; i++) {
        if (found[i] !== lowest[i]) return found[i] > lowest[i]
    }
    return true
}

/** Whether a reported version is present: a non-empty string. */
function reported(version: string | undefined): version is string {
    return typeof version === 'string' && version !== ''
}

/**
 * Decide the runtime from its `process.versions` record — the one function
 * that does (FR-002).
 *
 * Deno is asked first and Bun second, because both also report a `node`
 * version. Pure: callers pass the record, so every branch is testable on any
 * runtime. Framework code asks {@link currentRuntime} instead.
 *
 * @param versions - The process's `process.versions`, or a forged one.
 * @returns The runtime.
 * @throws {UnsupportedRuntimeError} When none of the three is reported, or
 *   Bun is below {@link BUN_FLOOR}.
 *
 * @example
 * ```ts
 * detectRuntime({ bun: '1.4.3', node: '24.3.0' }) // 'bun'
 * ```
 */
export function detectRuntime(versions: RuntimeVersions): RuntimeId {
    if (reported(versions.deno)) return 'deno'
    if (reported(versions.bun)) {
        if (!atLeast(versions.bun, BUN_FLOOR)) {
            throw new UnsupportedRuntimeError(
                `Bun ${versions.bun} is not supported: Lockness needs Bun ` +
                    `${BUN_FLOOR} or later. Older versions silently ignore ` +
                    'TC39 decorators and lack node:test subtests and ' +
                    'node:sqlite. Upgrade Bun.',
            )
        }
        return 'bun'
    }
    if (reported(versions.node)) return 'node'
    throw new UnsupportedRuntimeError(
        'Unsupported runtime: Lockness runs on Deno, Bun or Node, and this ' +
            'process reports none of them in process.versions.',
    )
}

/**
 * Build a lazy, memoised detector over a source of `process.versions`.
 *
 * The source is read on the first call, not before, and a successful answer
 * is kept: the runtime cannot change during a process. A refusal is not kept
 * as an answer — it is raised again on the next call.
 *
 * @param read - Where the versions come from; {@link currentRuntime} reads
 *   `process.versions`.
 * @returns A function answering the runtime.
 *
 * @example
 * ```ts
 * const probe = runtimeProbe(() => ({ node: '24.22.0' }))
 * probe() // 'node'
 * ```
 */
export function runtimeProbe(read: () => RuntimeVersions): () => RuntimeId {
    let answer: RuntimeId | undefined
    return () => {
        if (answer === undefined) answer = detectRuntime(read())
        return answer
    }
}

/**
 * The runtime this process runs on, detected once and remembered.
 *
 * @returns `'deno'`, `'bun'` or `'node'`.
 * @throws {UnsupportedRuntimeError} When the runtime is not supported.
 *
 * @example
 * ```ts
 * import { currentRuntime } from '@lockness/runtime/runtime'
 *
 * if (currentRuntime() === 'deno') {
 *     // Deno-only path, reached through the detector
 * }
 * ```
 */
export const currentRuntime: () => RuntimeId = runtimeProbe(() =>
    process.versions as RuntimeVersions
)
