/**
 * @fileoverview #485 — `compile` finds the kernel of a freshly scaffolded
 * app, for every kit.
 *
 * `compile` read a fixed `app/kernel.tsx` while `init` and every kit ship
 * `app/kernel.ts`, so on a new app it printed "Kernel file not found" and
 * built nothing. The unit tests in `packages/core` pin the lookup against
 * hand-written roots; this one pins it against what the scaffold really
 * writes, so renaming the kernel stub breaks a test instead of a user's first
 * production build.
 *
 * Each kit is scaffolded the way `kits:smoke` does it (`init` in a
 * subprocess). It is not repointed at the working tree: the lookup reads the
 * file system only, and imports nothing. A full `deno compile` is out of
 * scope — `kits:smoke` owns booting the app.
 *
 * @module
 */

import { assert, assertEquals } from '@std/assert'
import { type KitName, KITS } from '@lockness/init'
import { resolveKernelFile } from '../packages/core/cli/kernel_file.ts'
import { scaffoldKit } from './kit_smoke.ts'

for (const kit of Object.keys(KITS) as KitName[]) {
    Deno.test(`#485 ${kit}: compile's kernel lookup finds the scaffolded kernel`, async () => {
        const workdir = await Deno.makeTempDir({ prefix: 'lockness-485-' })
        try {
            const scaffold = await scaffoldKit(kit, workdir, { local: false })
            assert(scaffold.ok, scaffold.output)

            const kernel = await resolveKernelFile(scaffold.dir)
            assertEquals(kernel?.candidate, 'app/kernel.ts')
        } finally {
            await Deno.remove(workdir, { recursive: true })
        }
    })
}
