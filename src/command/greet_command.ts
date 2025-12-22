import { Command, type CommandContext, type ICommand } from '@lockness/ace'

@Command('greet', 'Description of greet command')
export class GreetCommand implements ICommand {
    async handle(ctx: CommandContext) {
        const name = ctx.arg(0) || 'World'
        
        // Check for flags
        if (ctx.hasFlag('verbose')) {
            console.log('Running in verbose mode...')
        }
        
        console.log(`Hello from GreetCommand!`)
        console.log(`Arguments: ${ctx.args.join(', ') || '(none)'}`)
        
        // Example: Get a flag value
        const format = ctx.getFlag('format')
        if (format) {
            console.log(`Format: ${format}`)
        }
    }
}
