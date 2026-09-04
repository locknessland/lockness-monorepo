/**
 * @fileoverview Shared type for individual make:* command definitions.
 *
 * Each scaffolding command is expressed as a self-contained {@link MakeCommand}
 * object so that the registry can iterate over them uniformly, keeping the
 * registration mechanism separate from the command bodies.
 *
 * @module @lockness/cli/commands/make/types
 */

import type { CommandHandler } from '../../mod.ts'

/**
 * A single `make:*` scaffolding command.
 *
 * Bundles the command name, its help description, and the handler that performs
 * the scaffolding into one cohesive unit. The registry consumes an array of
 * these to register every command against a {@link Cli} instance.
 *
 * @example
 * ```ts
 * export const makeService: MakeCommand = {
 *   name: 'make:service',
 *   description: 'Create a new service class',
 *   handler: async (args) => {
 *     // scaffold the service...
 *   },
 * }
 * ```
 */
export interface MakeCommand {
    /** The command name as invoked on the CLI (e.g. `make:controller`). */
    readonly name: string
    /** The description shown in the command list. */
    readonly description: string
    /** The handler that performs the scaffolding work. */
    readonly handler: CommandHandler
}
