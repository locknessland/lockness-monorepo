# CLI Engine

Cli is Lockness's powerful command-line interface for scaffolding, database
management, and custom commands.

## Using Cli

Run any Cli command:

```bash
deno task cli [command] [arguments] [--flags]
```

List all available commands:

```bash
deno task cli
```

## Scaffolding Commands

**make:controller** - Create a new controller:

```bash
deno task cli make:controller User

# With automatic view generation
deno task cli make:controller User --view
```

The `--view` flag automatically creates a corresponding view in
`src/view/pages/{name}.tsx` and generates a controller method that renders it
using `c.html()`.

**make:action** - Add a new action (method) to an existing controller:

```bash
deno task cli make:action User show

# With specific HTTP method
deno task cli make:action User store --method=post

# With automatic view generation
deno task cli make:action User create --view
```

Supported methods: `get`, `post`, `put`, `delete`, `patch`. The command follows
RESTful conventions for common action names (index, show, create, store, edit,
update, destroy).

**make:model** - Create a model with optional related files:

```bash
deno task cli make:model Post        # Just the model
deno task cli make:model Post -r    # + Repository
deno task cli make:model Post -s    # + Seeder
deno task cli make:model Post -c    # + Controller
deno task cli make:model Post -a    # All of the above
```

**make:middleware** - Create a new middleware:

```bash
deno task cli make:middleware Auth
```

**make:service** - Create a new service:

```bash
deno task cli make:service User
```

**make:repository** - Create a new repository:

```bash
deno task cli make:repository Post
```

**make:job** - Create a background job:

```bash
deno task cli make:job SendWelcomeEmail
```

**make:command** - Create a custom CLI command:

```bash
deno task cli make:command Greet
```

**make:component** - Create a JSX component:

```bash
deno task cli make:component Button
```

**make:view** - Create a new view/page:

```bash
deno task cli make:view home
```

**make:error-pages** - Generate all error pages (404, 401, 403, 500):

```bash
deno task cli make:error-pages
```

Creates error pages in `src/view/pages/errors/` with minimal HTML (no styling).
After generation, configure the error handler in `src/kernel.tsx`.

**make:crud** - Scaffold complete CRUD (model, repository, service, controller,
views):

```bash
deno task cli make:crud Post
```

Generates:

- `src/model/post.ts` - Drizzle schema
- `src/repository/post_repository.ts` - Data access layer
- `src/service/post_service.ts` - Business logic
- `src/controller/post_controller.tsx` - HTTP handler
- `src/view/pages/post/index.tsx` - List view
- `src/view/pages/post/show.tsx` - Detail view

After generation, define your schema in the model and run
`deno task db:generate` to create migrations.

**make:auth** - Scaffold authentication system:

```bash
deno task cli make:auth            # Basic auth
deno task cli make:auth --social   # With OAuth2 providers
```

## Database Commands

**db:generate** - Generate migration from schema:

```bash
deno task cli db:generate
```

**db:migrate** - Run pending migrations:

```bash
deno task cli db:migrate
```

**db:push** - Push schema directly to database:

```bash
deno task cli db:push
```

**db:studio** - Launch Drizzle Studio:

```bash
deno task cli db:studio
```

**db:seed** - Run database seeders:

```bash
deno task cli db:seed         # Run all seeders
deno task cli db:seed User    # Run specific seeder
```

## Custom Commands

Create your own CLI commands:

```typescript
import { Command, type CommandContext, type ICommand } from '@lockness/cli'

@Command('greet', 'Say hello to someone')
export class GreetCommand implements ICommand {
    async handle(ctx: CommandContext) {
        const name = ctx.arg(0) || 'World'

        if (ctx.hasFlag('verbose')) {
            console.log('Running in verbose mode...')
        }

        console.log(`Hello, ${name}!`)

        const format = ctx.getFlag('format')
        if (format) {
            console.log(`Format: ${format}`)
        }
    }
}
```

## Plugin System & Extensions

Lockness features a zero-config extension system that allows official and
third-party packages to register their own CLI commands automatically.

### Automatic Package Loading

The `cli.ts` entry point in your project uses `loadPackageCommands(cli)` to
dynamically load commands from any package listed in your `deno.json`.

```json
// deno.json
{
    "lockness": {
        "packages": [
            "drizzle",
            "openapi",
            "queue"
        ]
    }
}
```

When you run `deno task cli`, the engine:

1. Reads the `lockness.packages` array.
2. Dynamically imports `@lockness/{name}`.
3. Executes the package's registration function.

This means that after installing a new package, its commands (like `db:migrate`
or `openapi:generate`) are immediately available without any manual code
changes.

### Custom Command Discovery

Your own commands are automatically discovered from `src/command/` as long as
they use the `@Command` decorator and the class is exported.

```typescript
import { Command, type CommandContext, type ICommand } from '@lockness/cli'

@Command('greet', 'Say hello')
export class GreetCommand implements ICommand {
    async handle(ctx: CommandContext) {
        console.log(`Hello, ${ctx.arg(0) || 'World'}!`)
    }
}
```

### Manual Registration

For advanced scenarios, you can manually register commands in `cli.ts`:

```typescript
import { Cli, registerCoreCommands } from '@lockness/cli'
import { MyCustomCommand } from './my_command.ts'

const cli = new Cli()
registerCoreCommands(cli)

// Manually register a class
cli.registerCommand(MyCustomCommand)

// Or a simple function
cli.register('simple', async (args) => {
    console.log('Simple command')
}, 'A simple function command')

await cli.run(Deno.args)
```

Commands are auto-discovered from `src/command/`.

Run your command:

```bash
deno task cli greet John
deno task cli greet --verbose
deno task cli greet --format=json
```

## Interactive REPL (Tinker)

Explore your application interactively:

```bash
deno task cli tinker
```

The REPL automatically loads:

- All models from `src/model/`
- All services from `src/service/`
- All repositories from `src/repository/`

Example session:

```typescript
🔮 Lockness Tinker - Interactive REPL
📦 Loaded: users, UserService, UserRepository

>>> 2 + 2
4
>>> await UserRepository.findAll()
[{ id: 1, email: "..." }]
>>> .exit
👋 Bye!
```

**REPL Commands:**

- `.help` - Show available commands
- `.context` - List loaded variables
- `.clear` - Clear the screen
- `.exit` - Exit the REPL

## Queue Commands

**queue:work** - Process background jobs:

```bash
deno task cli queue:work
```

**queue:clear** - Clear all jobs from queue:

```bash
deno task cli queue:clear
```
