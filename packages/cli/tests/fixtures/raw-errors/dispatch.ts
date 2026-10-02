/**
 * @fileoverview A process whose one command throws `new Error(Deno.args[0])`,
 * run through `Cli.run` exactly as an application's `cli.ts` would (#508).
 *
 * `cli_dispatch.test.ts` spawns it with an environment the test process cannot
 * build in-process — `Deno.env.set` takes a string, so a variable holding bytes
 * that are not valid Unicode only exists in a child.
 *
 * @module @lockness/cli/tests/fixtures/raw-errors/dispatch
 */

import { Cli } from '../../../mod.ts'

const cli = new Cli()
cli.register('task', () => Promise.reject(new Error(Deno.args[0])), 'Throws')
await cli.run(['task'])
