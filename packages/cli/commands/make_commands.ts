/**
 * @fileoverview Make commands for scaffolding application components.
 *
 * Provides commands to generate controllers, middleware, services, views,
 * components, jobs, error handlers, and actions from stub templates.
 *
 * This module is a thin barrel: each command lives in its own module under
 * `./make/`, and the registry in `./make/index.ts` wires them onto the CLI.
 *
 * @module @lockness/cli/commands/make
 */

export { MAKE_COMMANDS, registerMakeCommands } from './make/index.ts'
export type { MakeCommand } from './make/types.ts'
