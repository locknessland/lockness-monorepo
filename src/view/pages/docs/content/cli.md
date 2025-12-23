# CLI (Ace)

Ace is Lockness's powerful command-line interface for scaffolding, database management, and custom commands.

## Using Ace

Run any Ace command:

```bash
deno task ace [command] [arguments] [--flags]
```

List all available commands:

```bash
deno task ace
```

## Scaffolding Commands

**make:controller** - Create a new controller:

```bash
deno task ace make:controller User
```

**make:model** - Create a model with optional related files:

```bash
deno task ace make:model Post        # Just the model
deno task ace make:model Post -r    # + Repository
deno task ace make:model Post -s    # + Seeder
deno task ace make:model Post -c    # + Controller
deno task ace make:model Post -a    # All of the above
```

**make:middleware** - Create a new middleware:

```bash
deno task ace make:middleware Auth
```

**make:service** - Create a new service:

```bash
deno task ace make:service User
```

**make:repository** - Create a new repository:

```bash
deno task ace make:repository Post
```

**make:job** - Create a background job:

```bash
deno task ace make:job SendWelcomeEmail
```

**make:command** - Create a custom CLI command:

```bash
deno task ace make:command Greet
```

**make:component** - Create a JSX component:

```bash
deno task ace make:component Button
```

**make:view** - Create a new view/page:

```bash
deno task ace make:view home
```

**make:auth** - Scaffold authentication system:

```bash
deno task ace make:auth            # Basic auth
deno task ace make:auth --social   # With OAuth2 providers
```

## Database Commands

**db:generate** - Generate migration from schema:

```bash
deno task ace db:generate
```

**db:migrate** - Run pending migrations:

```bash
deno task ace db:migrate
```

**db:push** - Push schema directly to database:

```bash
deno task ace db:push
```

**db:studio** - Launch Drizzle Studio:

```bash
deno task ace db:studio
```

**db:seed** - Run database seeders:

```bash
deno task ace db:seed         # Run all seeders
deno task ace db:seed User    # Run specific seeder
```

## Custom Commands

Create your own CLI commands:

```typescript
import { Command, type CommandContext, type ICommand } from '@lockness/ace'

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

Commands are auto-discovered from `src/command/`.

Run your command:

```bash
deno task ace greet John
deno task ace greet --verbose
deno task ace greet --format=json
```

## Interactive REPL (Tinker)

Explore your application interactively:

```bash
deno task ace tinker
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
deno task ace queue:work
```

**queue:clear** - Clear all jobs from queue:

```bash
deno task ace queue:clear
```
