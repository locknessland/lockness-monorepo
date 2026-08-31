/**
 * @fileoverview Discovering `@Schedule`-decorated classes.
 *
 * **This module is the single home of which classes get scheduled.** The
 * `@lockness/scheduler` package never reads the filesystem; core owns discovery
 * because core owns the DI container wiring and the bootstrap pipeline — the
 * same division `@lockness/events` and `events/listener_discovery.ts` already use.
 *
 * It mirrors that module with **three deliberate deviations**, each of which is
 * a defect in the original:
 *
 * 1. The resolved directory is asserted to be inside `Deno.cwd()`.
 * 2. Module URLs are built with `toFileUrl()` rather than `` `file://${path}` ``,
 *    which mis-parses a path containing `#` or `?` and silently skips the file.
 * 3. There is **no bare `catch { continue }`**. `listener_discovery.ts:153` has
 *    one, and it would swallow the duplicate-name error that exists precisely
 *    to stop one task silently replacing another.
 *
 * @module @lockness/core/scheduler/schedule_discovery
 */

import { join, resolve, SEPARATOR, toFileUrl } from '@std/path'
import { container } from '@lockness/container'
import {
    DEFAULT_SCHEDULES_DIR,
    getScheduleMetadata,
    type Scheduler,
    scheduler as sharedScheduler,
} from '@lockness/scheduler'

/** A class that may carry `@Schedule` metadata. */
export type ScheduleClass = new (...args: unknown[]) => object

/**
 * Is this export a `class`, as opposed to any other callable?
 *
 * A `class` has a non-writable `prototype` descriptor; a `function` declaration
 * has a writable one, and an arrow function has none at all. That distinction
 * is what keeps discovery from constructing — and therefore executing — a plain
 * helper function that happens to sit beside a scheduled class.
 *
 * @param value - The export to test.
 * @returns `true` only for class declarations.
 */
function isClass(value: unknown): value is ScheduleClass {
    if (typeof value !== 'function') return false
    const descriptor = Object.getOwnPropertyDescriptor(value, 'prototype')
    return descriptor !== undefined && descriptor.writable === false
}

/**
 * Register the schedules declared on a list of classes.
 *
 * Each class is instantiated through the DI container first — TC39
 * `addInitializer` populates metadata at construction, not at definition, so
 * reading it before instantiating finds nothing.
 *
 * @param classes - The classes to register.
 * @param target - The scheduler to register into. Defaults to the shared one.
 * @returns How many schedules were registered.
 * @throws {Error} If two schedules resolve to the same name — a silent
 * replacement is the failure this refuses to perform.
 *
 * @example
 * ```ts
 * registerSchedules([ReportService, CleanupService])
 * ```
 */
export function registerSchedules(
    classes: readonly ScheduleClass[],
    target: Scheduler = sharedScheduler(),
): number {
    let registered = 0

    for (const ScheduleClass of classes) {
        const instance = container.get(ScheduleClass) as Record<string, unknown>

        for (const meta of getScheduleMetadata(ScheduleClass)) {
            const method = instance[meta.methodName]
            if (typeof method !== 'function') continue

            const bound = method.bind(instance) as (
                signal: AbortSignal,
            ) => unknown
            target.register({
                expression: meta.expression,
                body: bound,
                options: meta.options,
                className: ScheduleClass.name,
                methodName: meta.methodName,
            })
            registered++
        }
    }

    return registered
}

/**
 * Every `.ts` file under a directory, recursively.
 *
 * Symlinks are **not** followed: a scanned directory's contents are imported
 * and executed, and a symlink can point anywhere.
 *
 * @param dir - An absolute directory path.
 * @returns Absolute file paths.
 */
async function scan(dir: string): Promise<string[]> {
    const files: string[] = []
    for await (const entry of Deno.readDir(dir)) {
        if (entry.isSymlink) continue
        const path = join(dir, entry.name)
        if (entry.isFile && entry.name.endsWith('.ts')) files.push(path)
        else if (entry.isDirectory) files.push(...await scan(path))
    }
    return files
}

/**
 * Discover and register every `@Schedule`-decorated class under a directory.
 *
 * @param schedulesDir - The directory to scan, relative to the working
 * directory. Defaults to `DEFAULT_SCHEDULES_DIR`.
 * @param target - The scheduler to register into. Defaults to the shared one.
 * @returns How many schedules were registered.
 * @throws {Deno.errors.NotFound} If the directory does not exist — the caller
 * decides whether that is an error, because a project with no scheduled tasks
 * legitimately has no directory.
 * @throws {TypeError} If the resolved directory escapes the working directory.
 * @throws {Error} If two schedules resolve to the same name.
 *
 * @example
 * ```ts
 * const count = await discoverSchedules('./app/schedule')
 * ```
 */
export async function discoverSchedules(
    schedulesDir: string = DEFAULT_SCHEDULES_DIR,
    target: Scheduler = sharedScheduler(),
): Promise<number> {
    // `realPath`, not `resolve`. `resolve` is purely lexical and never touches
    // the filesystem, so a symlinked `app/schedule` passes a lexical check while
    // `Deno.readDir` transparently lists the target's entries as ordinary files
    // — the per-entry symlink guard in `scan` is inert against exactly that.
    // `realPath` throws `Deno.errors.NotFound` for a missing directory, which is
    // the same signal the caller already handles.
    const root = await Deno.realPath(Deno.cwd())
    const absolute = await Deno.realPath(resolve(root, schedulesDir))

    // The directory's contents are imported and executed under whatever
    // permissions the process holds, so a path that escapes the project is not
    // something to discover quietly. `SEPARATOR` rather than a literal '/',
    // because `resolve` is platform-dispatched and a hardcoded '/' rejects every
    // valid Windows path. The working directory ITSELF is refused too:
    // `schedulesDir: '.'` would otherwise import every .ts in the project.
    if (absolute === root || !absolute.startsWith(root + SEPARATOR)) {
        throw new TypeError(
            `schedulesDir "${schedulesDir}" resolves to "${absolute}", which is not a directory inside the working directory "${root}". ` +
                `It must name a subdirectory, and must be a constant in application source — never environment-derived.`,
        )
    }

    const files = await scan(absolute)
    let registered = 0

    for (const file of files) {
        // toFileUrl escapes correctly; `file://${path}` mis-parses '#' and '?'
        // and would silently skip a file its author believes is scheduled.
        const module = await import(toFileUrl(file).href)

        for (const [exportName, exported] of Object.entries(module)) {
            // `typeof === 'function'` is not enough. `container.get` calls
            // `new token()` on anything callable, and a plain
            // `export function helper() { … }` IS constructible — so its body
            // would execute at boot, under the process's full permissions,
            // carrying no `@Schedule` at all. Arrow and `const` exports are
            // already safe because they are not constructible; the declared
            // function is the dangerous case.
            if (!isClass(exported)) continue

            let instance: object
            try {
                instance = container.get(exported as ScheduleClass)
            } catch (caught) {
                // A non-constructible export — an interface helper, a plain
                // function — is not an error. Anything else is reported rather
                // than swallowed, because a class that fails to construct is a
                // task the author believes is scheduled and is not.
                const error = caught instanceof Error
                    ? caught
                    : new Error(String(caught))
                console.error(
                    `⚠️  Could not construct "${exportName}" from ${file} while discovering schedules: ${error.message}`,
                )
                continue
            }

            const meta = getScheduleMetadata(exported as object)
            if (meta.length === 0) continue

            const record = instance as Record<string, unknown>
            for (const entry of meta) {
                const method = record[entry.methodName]
                if (typeof method !== 'function') continue
                // A duplicate-name error propagates deliberately: it exists to
                // stop one task silently replacing another, and a catch here
                // would deliver exactly the silence it forbids.
                target.register({
                    expression: entry.expression,
                    body: method.bind(instance) as (
                        signal: AbortSignal,
                    ) => unknown,
                    options: entry.options,
                    className: (exported as ScheduleClass).name,
                    methodName: entry.methodName,
                })
                registered++
            }
        }
    }

    return registered
}
