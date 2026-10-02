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
`app/view/pages/{name}.tsx` and generates a controller method that renders it
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

Creates error pages in `app/view/pages/errors/` with inline CSS
(framework-agnostic). The error handler is automatically discovered by the
framework - no manual registration needed in `app/kernel.ts`.

**make:crud** - Scaffold complete CRUD (model, repository, service, controller,
views):

```bash
deno task cli make:crud Post
```

Generates:

- `app/model/post.ts` - Drizzle schema
- `app/repository/post_repository.ts` - Data access layer
- `app/service/post_service.ts` - Business logic
- `app/controller/post_controller.tsx` - HTTP handler
- `app/view/pages/post/index.tsx` - List view
- `app/view/pages/post/show.tsx` - Detail view

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

Every `db:*` command exits `1` when it fails and `0` when it succeeds. The
per-command table is in the
[`@lockness/drizzle` docs](../../drizzle/docs/DOCS.md#exit-codes).

## Custom Commands

Create your own CLI commands:

```typescript
import {
    Command,
    type CommandContext,
    type CommandContract,
} from '@lockness/cli'

@Command('greet', 'Say hello to someone')
export class GreetCommand implements CommandContract {
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

## Exit Codes

A command reports failure by **throwing**, never by printing an error and
returning. `cli.run()` prints the failure once and sets the process exit status,
so a script or CI step can branch on it:

| Outcome                                                     | Exit                                  | Printed                                                                                                                          |
| :---------------------------------------------------------- | :------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------- |
| No command                                                  | `0`                                   | the command list                                                                                                                 |
| Unknown command                                             | `1`                                   | `❌ Unknown command: <name>`, then the list                                                                                      |
| The handler resolves                                        | `0`                                   | —                                                                                                                                |
| The handler throws `CommandFailedError` (or the same shape) | its `exitCode` if `1`–`255`, else `1` | `❌ <message>`, no stack                                                                                                         |
| The handler throws anything else                            | `1`                                   | `❌ <command> failed:` then name, vetted code, redacted message per link, then frames; raw only with `LOCKNESS_CLI_RAW_ERRORS=1` |

```typescript
import { CommandFailedError } from '@lockness/cli'

cli.register('deploy', async () => {
    const code = await runMigrations()
    if (code !== 0) {
        // Printed once as "❌ Migrations failed (exited 2)"; the process exits 1.
        throw new CommandFailedError(`Migrations failed (exited ${code})`)
    }
})
```

- Throw `CommandFailedError` for a failure you expected and can explain in one
  message. Throw (or let through) any other error for a bug: its stack frames
  are printed, redacted.
- Do not print the failure yourself as well; the CLI prints it.
- `cli.run()` sets `Deno.exitCode` and never calls `Deno.exit()`, so `finally`
  blocks (closing a connection) still run. `cli.dispatch(args)` returns the same
  status without touching the process, which is what a test wants.

### What an unexpected error prints

Any error that is not failure-shaped is printed through `renderError`, the same
renderer the framework uses for its own logs, as a single `console.error`:

```text
❌ db:seed failed: Error: connect failed: postgres://***:***@db.test/app caused by: Error [ECONNREFUSED]: connection refused
    at connect (file:///app/database/seed.ts:4:11)
    at async Cli.dispatch (…)
(Credentials redacted. LOCKNESS_CLI_RAW_ERRORS=1 prints the raw error; never set it where the log is public.)
```

The first line is the error's name, its code when it is spelled like a runtime
or driver code (`ECONNREFUSED`, `23505`), and its message, then at most two
`cause` links rendered the same way. A DSN's userinfo and any credential
`name=value` pair (`token=`, `password=`, `api_key=`, …) are replaced with `***`
in every link. The next lines are up to 10 stack frames of the top-level error,
redacted the same way, with a `data:` URL collapsed to `data:…`.

It shows less than the raw error does: no other own property (`detail`, `hint`,
`parameters`), no frames of a cause, no `AggregateError` members, and long
messages are truncated. Redaction only knows the shapes it knows: a bare secret
with no `name=` in front of it still prints, and frame text outside a URL (a
function or class name) is never redacted.

### Seeing the raw error

Set `LOCKNESS_CLI_RAW_ERRORS` to `1` (or `true`, `on`, `yes`) and the error
object is handed to `console.error` as-is, behind a banner, so every property,
the whole cause chain and every stack are printed:

```bash
LOCKNESS_CLI_RAW_ERRORS=1 ./nessy db:seed
```

```text
⚠️ LOCKNESS_CLI_RAW_ERRORS is on: the error below is unredacted.
❌ db:seed failed: Error: connect failed: postgres://app:<password>@db.test/app
    …
```

> **Warning: never set it where the log is public.** The raw error carries
> whatever the failing code put in it: a database password in a DSN, an API
> token in a URL, row data in a driver's `detail`. CI and build logs of an
> open-source project are usually readable by anyone. Use the switch in a local
> terminal, re-run the command there, and leave it unset in CI configuration and
> `.env` files.

The switch is off unless it is recognisably on. `0`, `false`, `off`, `no` or an
empty value keep it off. Any other value also keeps it off and replaces the hint
with a notice naming the value, so a typo is visible instead of silently
ignored. A process without `--allow-env` reads it as off.

### Packages that cannot import `@lockness/cli`

The contract is matched by **shape**, not by class: any `Error` with an integer
`exitCode` is an expected failure. A package whose dependency policy forbids
importing `@lockness/cli` meets it with a local subclass:

```typescript
class MailCommandError extends Error {
    readonly exitCode = 1
}
```

A package that may import the CLI but must stay light at runtime imports the
dependency-free subpath rather than the barrel:

```typescript
import { CommandFailedError } from '@lockness/cli/command-failure'
```

Some built-in commands outside `db:*` still report certain failures by printing
and exiting `0`; they are being moved to this contract.

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

Your own commands are automatically discovered from `app/command/` as long as
they use the `@Command` decorator and the class is exported.

```typescript
import {
    Command,
    type CommandContext,
    type CommandContract,
} from '@lockness/cli'

@Command('greet', 'Say hello')
export class GreetCommand implements CommandContract {
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

Commands are auto-discovered from `app/command/`.

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

- All models from `app/model/`
- All services from `app/service/`
- All repositories from `app/repository/`

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
