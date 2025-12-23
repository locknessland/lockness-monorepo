import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { CommandBlock } from '@view/components/code_block.tsx'

export const CliPage = () => {
    return (
        <DocsLayout title="CLI (Ace) - Lockness JS">
            <div class="max-w-4xl mx-auto">
                <h1 class="text-4xl font-bold mb-4">CLI (Ace)</h1>
                <p class="text-xl text-gray-600 mb-8">
                    Ace is Lockness's powerful command-line interface for scaffolding, database management, and custom commands.
                </p>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Using Ace</h2>
                    <p class="mb-4">Run any Ace command:</p>
                    <CommandBlock lang='terminal'>
{`deno task ace [command] [arguments] [--flags]`}
                    </CommandBlock>
                    <p class="mb-4">List all available commands:</p>
                    <CommandBlock lang='terminal'>
{`deno task ace`}
                    </CommandBlock>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Scaffolding Commands</h2>
                    
                    <div class="space-y-6">
                        <div>
                            <h3 class="text-2xl font-bold mb-2">make:controller</h3>
                            <p class="mb-2">Create a new controller:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace make:controller User`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">make:model</h3>
                            <p class="mb-2">Create a model with optional related files:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace make:model Post        # Just the model
deno task ace make:model Post -r    # + Repository
deno task ace make:model Post -s    # + Seeder
deno task ace make:model Post -c    # + Controller
deno task ace make:model Post -a    # All of the above`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">make:middleware</h3>
                            <p class="mb-2">Create a new middleware:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace make:middleware Auth`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">make:service</h3>
                            <p class="mb-2">Create a new service:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace make:service User`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">make:job</h3>
                            <p class="mb-2">Create a background job:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace make:job SendWelcomeEmail`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">make:command</h3>
                            <p class="mb-2">Create a custom CLI command:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace make:command Greet`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">make:component</h3>
                            <p class="mb-2">Create a JSX component:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace make:component Button`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">make:view</h3>
                            <p class="mb-2">Create a new view/page:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace make:view home`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">make:auth</h3>
                            <p class="mb-2">Scaffold authentication system:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace make:auth            # Basic auth
deno task ace make:auth --social   # With OAuth2 providers`}
                            </CommandBlock>
                        </div>
                    </div>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Database Commands</h2>
                    
                    <div class="space-y-6">
                        <div>
                            <h3 class="text-2xl font-bold mb-2">db:generate</h3>
                            <p class="mb-2">Generate migrations from schema:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace db:generate`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">db:migrate</h3>
                            <p class="mb-2">Run pending migrations:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace db:migrate`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">db:push</h3>
                            <p class="mb-2">Push schema directly to database (dev):</p>
                            <CommandBlock lang='terminal'>
{`deno task ace db:push`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">db:studio</h3>
                            <p class="mb-2">Launch Drizzle Studio:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace db:studio`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">make:seeder</h3>
                            <p class="mb-2">Create a database seeder:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace make:seeder User`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">db:seed</h3>
                            <p class="mb-2">Run database seeders:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace db:seed        # Run all seeders
deno task ace db:seed User   # Run specific seeder`}
                            </CommandBlock>
                        </div>
                    </div>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Queue Commands</h2>
                    
                    <div class="space-y-6">
                        <div>
                            <h3 class="text-2xl font-bold mb-2">queue:work</h3>
                            <p class="mb-2">Process jobs from queue:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace queue:work                    # Default queue
deno task ace queue:work --queue=emails     # Specific queue
deno task ace queue:work --once             # Process once and exit`}
                            </CommandBlock>
                        </div>

                        <div>
                            <h3 class="text-2xl font-bold mb-2">queue:clear</h3>
                            <p class="mb-2">Clear all jobs from a queue:</p>
                            <CommandBlock lang='terminal'>
{`deno task ace queue:clear emails`}
                            </CommandBlock>
                        </div>
                    </div>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Interactive REPL</h2>
                    <p class="mb-4">Explore your application interactively:</p>
                    <CommandBlock lang='terminal'>
{`deno task ace tinker`}
                    </CommandBlock>
                    <p class="mb-4">The REPL automatically loads:</p>
                    <ul class="list-disc list-inside space-y-2 mb-6">
                        <li>All models from <code>src/model/</code></li>
                        <li>All services from <code>src/service/</code></li>
                        <li>All repositories from <code>src/repository/</code></li>
                    </ul>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`🔮 Lockness Tinker - Interactive REPL
📦 Loaded: users, UserService, UserRepository

>>> 2 + 2
4
>>> await UserRepository.findAll()
[{ id: 1, email: "..." }]
>>> .exit
👋 Bye!`}</code></pre>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Creating Custom Commands</h2>
                    <p class="mb-4">Create your own CLI commands:</p>
                    <CommandBlock lang='terminal'>
{`deno task ace make:command Greet`}
                    </CommandBlock>
                    <p class="mb-4">This creates <code>src/command/greet_command.ts</code>:</p>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`import { Command, type CommandContext, type ICommand } from '@lockness/ace'

@Command('greet', 'Say hello to someone')
export class GreetCommand implements ICommand {
    async handle(ctx: CommandContext) {
        const name = ctx.arg(0) || 'World'
        const loud = ctx.hasFlag('loud')
        
        const message = \`Hello, \${name}!\`
        console.log(loud ? message.toUpperCase() : message)
    }
}`}</code></pre>
                    <p class="mb-4">Run your custom command:</p>
                    <CommandBlock lang='terminal'>
{`deno task ace greet John
# Hello, John!

deno task ace greet John --loud
# HELLO, JOHN!`}
                    </CommandBlock>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Command Context API</h2>
                    <pre class="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mb-6"><code>{`ctx.arg(0)              // Get first argument
ctx.arg(1, 'default')   // Get second argument with default
ctx.args                // Get all arguments
ctx.hasFlag('verbose')  // Check if flag exists
ctx.getFlag('name')     // Get flag value`}</code></pre>
                </section>

                <div class="flex justify-between mt-12 pt-8 border-t">
                    <a href="/docs/middleware" class="text-blue-600 hover:underline">← Middleware</a>
                    <a href="/docs/installation" class="text-blue-600 hover:underline">Back to Installation →</a>
                </div>
            </div>
        </DocsLayout>
    )
}
