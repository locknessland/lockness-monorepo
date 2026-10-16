/**
 * @fileoverview The entry Node loads with `--import`: it refuses production,
 * then installs the load hook that runs the app's TypeScript through
 * `transpile` (plan 274 §5).
 *
 * Importing this module has an effect and exports nothing:
 *
 * ```bash
 * node --import @lockness/transform/register main.ts
 * ```
 *
 * `module.registerHooks` runs the hook in-thread and synchronously, for
 * `import` and `require` alike. It exists since Node 22.15, but the package
 * claims Node ≥ 24 only (`engines.node`): that is what the Node lane proves. The plan gives the flag one
 * home — `@lockness/runtime`'s Node invocation — never an app script.
 *
 * @module
 */

import { registerHooks } from 'node:module'
import process from 'node:process'
import { assertNotProduction, createLoadHook } from './hook.ts'

assertNotProduction(process.env)
registerHooks({ load: createLoadHook() })
