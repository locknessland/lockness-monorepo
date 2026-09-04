/**
 * @fileoverview Tests for feature flags — SC-001/001a/002 + make:flag (SC-007).
 *
 * @module @lockness/features/tests/features
 */

import { assert, assertEquals } from '@std/assert'
import { configureFeatures, features, resetFeatures } from '../features.ts'
import { handleMakeFlag, isContained } from '../cli_commands.ts'

Deno.test('SC-001: override wins → definition → default off', async () => {
    resetFeatures()
    configureFeatures({ flags: { beta: true, off: false } })
    const f = features()
    assertEquals(await f.active('beta'), true)
    assertEquals(await f.active('off'), false)
    assertEquals(await f.active('unknown'), false) // unknown → off, no throw

    await f.deactivate('beta', 'user:1') // scoped override wins
    assertEquals(await f.active('beta', 'user:1'), false)
    assertEquals(await f.active('beta', 'user:2'), true) // other scope unaffected
    resetFeatures()
})

Deno.test('SC-001: a rollout is stable per scope across repeated calls', async () => {
    resetFeatures()
    configureFeatures({ flags: { ramp: { rollout: 50 } } })
    const f = features()
    const first = await f.active('ramp', 'user:42')
    for (let i = 0; i < 5; i++) {
        assertEquals(await f.active('ramp', 'user:42'), first) // never flips
    }
    resetFeatures()
})

Deno.test('SC-002: a rollout splits scopes roughly by the percentage', async () => {
    resetFeatures()
    configureFeatures({ flags: { ramp: { rollout: 30 } } })
    const f = features()
    let on = 0
    const N = 2000
    for (let i = 0; i < N; i++) if (await f.active('ramp', `u${i}`)) on++
    const pct = (on / N) * 100
    assert(
        pct > 20 && pct < 40,
        `rollout ~30% expected, got ${pct.toFixed(1)}%`,
    )
    resetFeatures()
})

Deno.test('SC-001a: a throwing resolver / erroring driver fails closed (false)', async () => {
    resetFeatures()
    configureFeatures({
        flags: {
            boom: () => {
                throw new Error('resolver blew up')
            },
        },
        driver: {
            get: () => {
                throw new Error('driver down')
            },
            set: () => {},
            remove: () => {},
        },
    })
    // Driver.get throws first → fail-closed to false, no throw.
    assertEquals(await features().active('boom', 'u1'), false)
    resetFeatures()
})

Deno.test('forget() reverts an override to the definition', async () => {
    resetFeatures()
    configureFeatures({ flags: { beta: true } })
    const f = features()
    await f.deactivate('beta', 'u1')
    assertEquals(await f.active('beta', 'u1'), false) // override active
    await f.forget('beta', 'u1')
    assertEquals(await f.active('beta', 'u1'), true) // reverted to definition
    resetFeatures()
})

Deno.test('SC-001a: a throwing RESOLVER (driver ok) fails closed to false', async () => {
    resetFeatures()
    configureFeatures({
        flags: {
            boom: () => {
                throw new Error('resolver blew up')
            },
        },
        // A working driver returning no override → resolution reaches the resolver.
        driver: { get: () => undefined, set: () => {}, remove: () => {} },
    })
    assertEquals(await features().active('boom', 'u1'), false)
    resetFeatures()
})

Deno.test('a boolean/percentage/resolver definition each resolve', async () => {
    resetFeatures()
    configureFeatures({
        flags: {
            on: true,
            ramp: { rollout: 100 },
            dyn: (scope) => scope === 'yes',
        },
    })
    const f = features()
    assertEquals(await f.active('on'), true)
    assertEquals(await f.active('ramp', 'x'), true)
    assertEquals(await f.active('dyn', 'yes'), true)
    assertEquals(await f.active('dyn', 'no'), false)
    resetFeatures()
})

Deno.test('SC-007: make:flag scaffolds + rejects a traversal name', async () => {
    const dir = await Deno.makeTempDir()
    const prev = Deno.cwd()
    Deno.chdir(dir)
    try {
        const path = await handleMakeFlag(['new-ui'])
        assertEquals(path, 'app/features/new_ui_flag.ts')
        assert(await Deno.readTextFile(`${dir}/app/features/new_ui_flag.ts`))
        assertEquals(await handleMakeFlag(['../../etc/x']), undefined)
        assertEquals(await handleMakeFlag(['bad/slash']), undefined)
    } finally {
        Deno.chdir(prev)
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('isContained rejects escapes', () => {
    assert(isContained('./app/features', './app/features/x_flag.ts'))
    assert(!isContained('./app/features', './app/features/../../etc'))
})
