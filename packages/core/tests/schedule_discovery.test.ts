/**
 * Schedule discovery.
 *
 * Three of these exist because the mechanism this mirrors has the defect they
 * check for: `listener_discovery.ts` joins without verifying containment,
 * builds module URLs by string interpolation, and wraps per-export
 * instantiation in a bare `catch { continue }`.
 */

import { assertEquals, assertRejects, assertThrows } from '@std/assert'
import { Schedule, Scheduler } from '@lockness/scheduler'
import {
    discoverSchedules,
    registerSchedules,
} from '../scheduler/schedule_discovery.ts'

const quiet = { error: () => {}, warn: () => {} }

/** Write a throwaway schedules directory under the working directory. */
async function withSchedulesDir(
    files: Record<string, string>,
    run: (relativeDir: string) => Promise<void>,
): Promise<void> {
    const rel = `tmp/schedule-discovery-${crypto.randomUUID().slice(0, 8)}`
    const abs = `${Deno.cwd()}/${rel}`
    await Deno.mkdir(abs, { recursive: true })
    try {
        for (const [name, source] of Object.entries(files)) {
            await Deno.writeTextFile(`${abs}/${name}`, source)
        }
        await run(`./${rel}`)
    } finally {
        await Deno.remove(abs, { recursive: true })
    }
}

Deno.test('registerSchedules - registers every decorated method on a class', () => {
    class ReportService {
        @Schedule('0 3 * * *')
        nightly() {}

        @Schedule('0 * * * *', { name: 'hourly-sync' })
        sync() {}

        notScheduled() {}
    }

    const s = new Scheduler(quiet)
    assertEquals(registerSchedules([ReportService], s), 2)
    assertEquals(
        s.getStats().tasks.map((t) => t.name).sort(),
        ['ReportService.nightly', 'hourly-sync'],
    )
})

Deno.test('registerSchedules - a duplicate name propagates rather than being swallowed', () => {
    class A {
        @Schedule('0 3 * * *', { name: 'clash' })
        run() {}
    }
    class B {
        @Schedule('0 4 * * *', { name: 'clash' })
        run() {}
    }

    const s = new Scheduler(quiet)
    registerSchedules([A], s)
    assertThrows(
        () => registerSchedules([B], s),
        Error,
        'already registered',
        'a silent replacement is the failure this refuses to perform',
    )
})

Deno.test('discoverSchedules - finds decorated classes in a directory', async () => {
    await withSchedulesDir({
        'digest.ts': `
import { Schedule } from '@lockness/scheduler'
export class DigestService {
    @Schedule('0 3 * * *', { name: 'digest' })
    send() {}
}
`,
    }, async (dir) => {
        const s = new Scheduler(quiet)
        assertEquals(await discoverSchedules(dir, s), 1)
        assertEquals(s.getStats().tasks[0].name, 'digest')
    })
})

Deno.test('discoverSchedules - scans subdirectories', async () => {
    const rel = `tmp/schedule-nested-${crypto.randomUUID().slice(0, 8)}`
    const abs = `${Deno.cwd()}/${rel}`
    await Deno.mkdir(`${abs}/inner`, { recursive: true })
    try {
        await Deno.writeTextFile(
            `${abs}/inner/deep.ts`,
            `
import { Schedule } from '@lockness/scheduler'
export class DeepService {
    @Schedule('0 5 * * *', { name: 'deep' })
    run() {}
}
`,
        )
        const s = new Scheduler(quiet)
        assertEquals(await discoverSchedules(`./${rel}`, s), 1)
        assertEquals(s.getStats().tasks[0].name, 'deep')
    } finally {
        await Deno.remove(abs, { recursive: true })
    }
})

Deno.test('discoverSchedules - a missing directory throws NotFound for the caller to decide on', async () => {
    const s = new Scheduler(quiet)
    await assertRejects(
        () => discoverSchedules('./tmp/definitely-not-here', s),
        Deno.errors.NotFound,
    )
})

Deno.test('discoverSchedules - a path escaping the working directory is refused', async () => {
    const s = new Scheduler(quiet)
    for (const escape of ['../..', './app/../../..', '/etc']) {
        await assertRejects(
            () => discoverSchedules(escape, s),
            TypeError,
            'not a directory inside the working directory',
            `expected "${escape}" refused`,
        )
    }
})

Deno.test('discoverSchedules - an undecorated export is ignored, not an error', async () => {
    await withSchedulesDir({
        'mixed.ts': `
import { Schedule } from '@lockness/scheduler'
export const NOT_A_CLASS = 42
export function helper() { return 1 }
export class Plain {}
export class Scheduled {
    @Schedule('0 6 * * *', { name: 'only-this' })
    run() {}
}
`,
    }, async (dir) => {
        const s = new Scheduler(quiet)
        assertEquals(await discoverSchedules(dir, s), 1)
        assertEquals(s.getStats().tasks[0].name, 'only-this')
    })
})

Deno.test('discoverSchedules - a bad expression fails the discovery instead of booting clean', async () => {
    await withSchedulesDir({
        'broken.ts': `
import { Schedule } from '@lockness/scheduler'
export class Broken {
    @Schedule('0 0 30 2 *', { name: 'impossible' })
    run() {}
}
`,
    }, async (dir) => {
        const s = new Scheduler(quiet)
        // 30 February parses, but has no occurrence. It must surface — the
        // mirrored listeners step would have logged and continued.
        await discoverSchedules(dir, s)
        assertThrows(() => s.start(), RangeError, 'no occurrence')
    })
})

// ============================================================================
// The three deviations from listener_discovery — each needs its own test,
// because each is a defect in the module this one mirrors. Without these, a
// revert to the original behaviour ships green.
// ============================================================================

Deno.test("discoverSchedules - imports a file whose name contains '#' or '?'", async () => {
    // The reason toFileUrl() replaced `file://${path}`: string interpolation
    // makes '#' a fragment and '?' a query, so the path is silently truncated
    // and the file never imported — a task its author believes is scheduled.
    await withSchedulesDir({
        'odd#name.ts': `
import { Schedule } from '@lockness/scheduler'
export class HashService {
    @Schedule('0 7 * * *', { name: 'hash-task' })
    run() {}
}
`,
        'query?name.ts': `
import { Schedule } from '@lockness/scheduler'
export class QueryService {
    @Schedule('0 8 * * *', { name: 'query-task' })
    run() {}
}
`,
    }, async (dir) => {
        const s = new Scheduler(quiet)
        assertEquals(await discoverSchedules(dir, s), 2)
        assertEquals(
            s.getStats().tasks.map((t) => t.name).sort(),
            ['hash-task', 'query-task'],
        )
    })
})

Deno.test('discoverSchedules - a failing constructor is reported by name and does not abort the scan', async () => {
    // listener_discovery.ts:153 is a bare `catch { continue }`. Downgrading to
    // that would make this class vanish with no signal — the S3 failure.
    const errors: string[] = []
    const original = console.error
    console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(' '))
    }
    try {
        await withSchedulesDir({
            'broken_ctor.ts': `
import { Schedule } from '@lockness/scheduler'
export class ExplodingService {
    constructor() { throw new Error('constructor blew up') }
    @Schedule('0 9 * * *', { name: 'never' })
    run() {}
}
export class HealthyService {
    @Schedule('0 10 * * *', { name: 'healthy' })
    run() {}
}
`,
        }, async (dir) => {
            const s = new Scheduler(quiet)
            assertEquals(
                await discoverSchedules(dir, s),
                1,
                'the healthy class is still registered',
            )
            assertEquals(s.getStats().tasks[0].name, 'healthy')
        })
    } finally {
        console.error = original
    }

    assertEquals(
        errors.some((e) =>
            e.includes('ExplodingService') && e.includes('constructor blew up')
        ),
        true,
        'the failure names the export and the cause — never a silent continue',
    )
})

Deno.test('discoverSchedules - does not follow symlinks', async () => {
    // A scanned directory's contents are imported and executed; a symlink can
    // point anywhere, so it is skipped rather than traversed.
    const id = crypto.randomUUID().slice(0, 8)
    const outside = `${Deno.cwd()}/tmp/outside-${id}`
    const inside = `${Deno.cwd()}/tmp/schedules-${id}`
    await Deno.mkdir(outside, { recursive: true })
    await Deno.mkdir(inside, { recursive: true })
    try {
        await Deno.writeTextFile(
            `${outside}/sneaky.ts`,
            `
import { Schedule } from '@lockness/scheduler'
export class SneakyService {
    @Schedule('0 11 * * *', { name: 'sneaky' })
    run() {}
}
`,
        )
        await Deno.symlink(outside, `${inside}/linked`)

        const s = new Scheduler(quiet)
        assertEquals(
            await discoverSchedules(`./tmp/schedules-${id}`, s),
            0,
            'the symlinked directory was not traversed',
        )
    } finally {
        await Deno.remove(inside, { recursive: true })
        await Deno.remove(outside, { recursive: true })
    }
})

Deno.test('discoverSchedules - a duplicate name across two files fails the boot', async () => {
    // Tested through discoverSchedules, not only registerSchedules: the throw
    // has to survive the discovery loop, which is where a catch-all would eat it.
    await withSchedulesDir({
        'a.ts': `
import { Schedule } from '@lockness/scheduler'
export class AService {
    @Schedule('0 3 * * *', { name: 'collide' })
    run() {}
}
`,
        'b.ts': `
import { Schedule } from '@lockness/scheduler'
export class BService {
    @Schedule('0 4 * * *', { name: 'collide' })
    run() {}
}
`,
    }, async (dir) => {
        const s = new Scheduler(quiet)
        await assertRejects(
            () => discoverSchedules(dir, s),
            Error,
            'already registered',
        )
    })
})

Deno.test('discoverSchedules - a symlinked schedules directory is refused', async () => {
    // resolve() is lexical and never follows a link, but Deno.readDir does —
    // it lists the target's entries as ordinary files, so the per-entry symlink
    // guard is inert against a symlinked ROOT. realPath closes that.
    const id = crypto.randomUUID().slice(0, 8)
    // Genuinely outside the project — a target under ./tmp would be inside the
    // working directory and correctly allowed, which would prove nothing.
    const outside = await Deno.makeTempDir({ prefix: 'lockness-outside-' })
    const linked = `${Deno.cwd()}/tmp/linked-${id}`
    try {
        await Deno.writeTextFile(
            `${outside}/evil.ts`,
            `
import { Schedule } from '@lockness/scheduler'
export class OutsideService {
    @Schedule('0 12 * * *', { name: 'outside' })
    run() {}
}
`,
        )
        await Deno.symlink(outside, linked)
        try {
            const s = new Scheduler(quiet)
            await assertRejects(
                () => discoverSchedules(`./tmp/linked-${id}`, s),
                TypeError,
                'not a directory inside the working directory',
            )
        } finally {
            await Deno.remove(linked)
        }
    } finally {
        await Deno.remove(outside, { recursive: true })
    }
})

Deno.test('discoverSchedules - the working directory itself is refused', async () => {
    // schedulesDir '.' would otherwise import and construct every export of
    // every .ts file in the whole project, at boot.
    const s = new Scheduler(quiet)
    for (const self of ['.', './', 'app/..']) {
        await assertRejects(
            () => discoverSchedules(self, s),
            TypeError,
            'not a directory inside the working directory',
            `expected ${JSON.stringify(self)} refused`,
        )
    }
})

Deno.test('discoverSchedules - a plain exported function is never constructed', async () => {
    // container.get calls `new token()` on anything callable, and an
    // `export function` IS constructible — so without a class check its body
    // would execute at boot carrying no @Schedule at all.
    await withSchedulesDir({
        'helpers.ts': `
import { Schedule } from '@lockness/scheduler'

export function sideEffect() {
    Deno.writeTextFileSync('${Deno.cwd()}/tmp/SIDE_EFFECT_RAN', 'boom')
}

export class RealService {
    @Schedule('0 13 * * *', { name: 'real' })
    run() {}
}
`,
    }, async (dir) => {
        const s = new Scheduler(quiet)
        assertEquals(await discoverSchedules(dir, s), 1)
        assertEquals(s.getStats().tasks[0].name, 'real')

        let ran = false
        try {
            await Deno.stat(`${Deno.cwd()}/tmp/SIDE_EFFECT_RAN`)
            ran = true
            await Deno.remove(`${Deno.cwd()}/tmp/SIDE_EFFECT_RAN`)
        } catch { /* the file must not exist */ }
        assertEquals(ran, false, 'the plain function body must never have run')
    })
})
