/**
 * @fileoverview The `DEBUG_BAR` switch, read when devtools is enabled (#630).
 *
 * It used to be read while building the default config at module load, so
 * importing `@lockness/devtools` without env permission threw `NotCapable` or
 * raised a permission prompt. It is now read on demand through contract's
 * prompt-free `readEnv`. Internal: not re-exported from `mod.ts`.
 *
 * @module
 */

import { readEnv } from '@lockness/contract/environment/read/internal'

/**
 * Whether the debug bar is shown when `config.showDebugBar` is not given.
 *
 * Only `DEBUG_BAR=false` turns it off. An unset variable, and one the process
 * may not read or that is not valid Unicode, keep the default: shown. The read
 * never prompts and never throws for those states.
 *
 * @returns `false` when `DEBUG_BAR` is readable and equal to `'false'`.
 * @throws Only an unexpected failure of the environment read itself.
 *
 * @example
 * ```typescript
 * const showDebugBar = config.showDebugBar ?? debugBarDefault()
 * ```
 */
export function debugBarDefault(): boolean {
    const read = readEnv('DEBUG_BAR')
    return !(read.state === 'set' && read.value === 'false')
}
