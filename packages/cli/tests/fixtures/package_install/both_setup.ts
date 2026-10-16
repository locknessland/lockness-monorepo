import type { PackageSetup } from '@lockness/contract/setup'
import { calls } from './calls.ts'

/** Records that the setup step ran. */
export const setup: PackageSetup = () => {
    calls.push('setup')
    return Promise.resolve()
}
