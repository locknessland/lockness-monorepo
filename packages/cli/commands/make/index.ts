/**
 * @fileoverview Registry of all make:* scaffolding commands.
 *
 * Collects every {@link MakeCommand} into a single ordered array and exposes
 * {@link registerMakeCommands}, which registers each one against a {@link Cli}
 * instance. Keeping the collection separate from the command bodies lets each
 * command live in its own cohesive module.
 *
 * @module @lockness/cli/commands/make
 */

import type { Cli } from '../../mod.ts'
import type { MakeCommand } from './types.ts'
import { makeController } from './controller.ts'
import { makeMiddleware } from './middleware.ts'
import { makeService } from './service.ts'
import { makePolicy } from './policy.ts'
import { makeView } from './view.ts'
import { makeComponent } from './component.ts'
import { makeCommand } from './command.ts'
import { makeJob } from './job.ts'
import { makeErrorPages } from './error_pages.ts'
import { makeCrud } from './crud.ts'
import { makeAction } from './action.ts'
import { makeEvent } from './event.ts'
import { makeListener } from './listener.ts'
import { makeSchedule } from './schedule.ts'

/**
 * Every make:* command, in registration order.
 *
 * The order is significant only for the command list display; behaviour does
 * not otherwise depend on it. New commands are appended here.
 */
export const MAKE_COMMANDS: readonly MakeCommand[] = [
    makeController,
    makeMiddleware,
    makeService,
    makePolicy,
    makeView,
    makeComponent,
    makeCommand,
    makeJob,
    makeErrorPages,
    makeCrud,
    makeAction,
    makeEvent,
    makeListener,
    makeSchedule,
]

/**
 * Register all make:* commands on a CLI instance.
 *
 * Iterates over {@link MAKE_COMMANDS} and registers each command's handler and
 * description under its name.
 *
 * @param cli - The CLI instance to register commands on
 *
 * @example
 * ```ts
 * const cli = new Cli()
 * registerMakeCommands(cli)
 * await cli.run(['make:controller', 'User'])
 * ```
 */
export function registerMakeCommands(cli: Cli): void {
    for (const command of MAKE_COMMANDS) {
        cli.register(command.name, command.handler, command.description)
    }
}
