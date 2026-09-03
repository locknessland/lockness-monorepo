/**
 * Tests for the `ssg` field on the `@Kernel` config (#54).
 *
 * The curated locale list for static-site generation has exactly one home: the
 * kernel SSG config, discovered via `KERNEL_CONFIG` — the same marker
 * `createApp` reads, so the `ssg:build` command finds it without importing app
 * config (which would be a core→app layer violation). This pins that the field
 * round-trips through the decorator and that its absence yields `undefined`
 * (a root-only build, no locale variants).
 *
 * @module @lockness/core/tests/kernel_ssg_config
 */

import { assertEquals } from '@std/assert'
import {
    Kernel,
    KERNEL_CONFIG,
    type KernelConfig,
    type SsgConfig,
} from '../mod.ts'

Deno.test('@Kernel - stores the ssg locale list via KERNEL_CONFIG', () => {
    const ssg: SsgConfig = { locales: ['en-us', 'fr-ca'] }
    const config: KernelConfig = { controllersDir: './app/controller', ssg }

    @Kernel(config)
    class TestKernel {}

    const stored =
        (TestKernel as unknown as Record<symbol, KernelConfig>)[KERNEL_CONFIG]
    assertEquals(stored?.ssg?.locales, ['en-us', 'fr-ca'])
})

Deno.test('@Kernel - absent ssg config yields undefined (root-only build)', () => {
    @Kernel({ controllersDir: './app/controller' })
    class TestKernel {}

    const stored =
        (TestKernel as unknown as Record<symbol, KernelConfig>)[KERNEL_CONFIG]
    assertEquals(stored?.ssg, undefined)
})
