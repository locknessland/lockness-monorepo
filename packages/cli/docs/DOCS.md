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
using `c.html()`. If the view cannot be written, the command still finishes,
writing a controller that renders no view, then exits 1 naming the `view` step.

**make:action** - Add a new action (method) to an existing controller:

```bash
deno task cli make:action User show

# With specific HTTP method
deno task cli make:action User store --method=post

# With automatic view generation
deno task cli make:action User create --view
```

With `--view`, a view that already exists is kept, never overwritten; one that
cannot be written does not stop the command, which still adds the action without
a view, then exits 1 naming the `view` step.

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
| The handler throws `CommandFailedError` (or the same shape) | its `exitCode` if `1`–`255`, else `1` | `❌ <message>`, then `caused by: <cause>` when it has one, on one line; no stack                                                 |
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
- Write the message on **one line**, naming the step, the file or the next
  action. A usage hint belongs on the same line
  (`Usage: cli package:install
  <package-name> (e.g., cli package:install openapi)`).
- When a caught error caused the failure, pass it as `cause` and do not quote
  its text in the message: the CLI prints it after the message, rendered.
- Do not print the failure yourself as well; the CLI prints it.
- `cli.run()` sets `Deno.exitCode` and never calls `Deno.exit()`, so `finally`
  blocks (closing a connection) still run. `cli.dispatch(args)` returns the same
  status without touching the process, which is what a test wants.

### What a failure prints

A failure is printed as a single `console.error` call: `❌`, the message, and,
when the error carries a `cause`, `caused by:` and the cause, on the same line.

```typescript
try {
    await migrate(connection)
} catch (error) {
    throw new CommandFailedError('Failed to apply migrations', { cause: error })
}
```

```text
❌ Failed to apply migrations caused by: PostgresError [42P07]: relation "users" already exists
```

Both halves are rendered before they are printed:

- **The message** goes through `renderMessage`: a DSN's userinfo and any
  credential `name=value` pair are replaced with `***`, a control or format
  character is encoded (a newline prints as `\x0a`, so a message cannot forge a
  second line), and at most 512 code points are kept. A message is text a
  program wrote, but it can carry a file name, a URL or the user's argument, and
  CLI output lands in CI logs.
- **The cause** goes through `renderError`, without frames: its name, its code
  when it is spelled like one, its message and at most two of its own `cause`
  links, redacted the same way as
  [an unexpected error](#what-an-unexpected-error-prints).

The same redaction shapes apply, with the same limits: a JSON `"token":"…"`, an
`Authorization: Bearer …` header or a bare token with no name still prints.

### Commands with several steps

A command that writes several files (`make:model -a`, `make:crud`,
`auth:install`, an installer) should not stop at the first failure and skip
files it could have written, nor leave the user guessing which ones exist.
`runSteps`, from `@lockness/cli/command-failure`, runs every step in order
whatever the one before it did, then throws one `CommandFailedError` naming the
steps that failed, with the first failure as its `cause`:

```typescript
import { runSteps } from '@lockness/cli/command-failure'

await runSteps([
    { label: 'model', run: () => writeModel(name) },
    { label: 'repository', run: () => writeRepository(name) },
    { label: 'seeder', run: () => writeSeeder(name) },
])
```

```text
❌ 1 of 3 steps failed: repository caused by: PermissionDenied [EACCES]: Permission denied (os error 13): open './app/repository/post_repository.ts'
```

A second or later failure is named by its label only; its error is not printed.
Check what must hold before anything is written (a missing name, a file outside
the project) ahead of `runSteps`, so a refusal writes nothing.

### Standalone tools

A tool run with `deno run jsr:@lockness/<pkg>` rather than through a `Cli` — an
installer, `@lockness/init`, `@lockness/ui`, `@lockness/upgrade` — follows the
same contract through `runEntry`, from `@lockness/cli/entry`. Its work throws;
`runEntry` prints the throw once, through the same printer as `Cli.dispatch()`,
and sets `Deno.exitCode`:

```typescript
import { CommandFailedError } from '@lockness/cli/command-failure'
import { runEntry } from '@lockness/cli/entry'

async function main(args: string[]): Promise<void> {
    if (args.length === 0) {
        throw new CommandFailedError('A component name is required')
    }
    // …
}

if (import.meta.main) await runEntry('tool', () => main(Deno.args))
```

| `main`                        | Exit                       | Printed                                                   |
| :---------------------------- | :------------------------- | :-------------------------------------------------------- |
| resolves                      | `0`                        | —                                                         |
| throws a failure-shaped error | its `exitCode` (`1`–`255`) | `❌ <message>`, then `caused by: <cause>` when it has one |
| throws anything else          | `1`                        | `❌ <label> failed:` and the error with its frames        |

`runEntry` catches **any** throw, not only a failure: an error that escaped a
standalone entry would otherwise be printed by Deno as `error: Uncaught`, with
its message, source line, stack and whole cause chain, none of it redacted. It
returns the status too, and never calls `Deno.exit()`. `main` must return the
promise of its work: a promise it starts without awaiting escapes `runEntry`, as
it would escape any `try`. `@lockness/cli/entry` does not load the
`@lockness/cli` barrel, so a tool that uses it loads none of the built-in
commands. An installer's shape is in
[INSTALL_SCRIPTS.md](../INSTALL_SCRIPTS.md).

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
redacted the same way, with a `data:` URL collapsed to `data:…` and the frame's
`:line:col`. A message line that looks like a frame is part of the message, so
it is truncated and redacted with it and never printed as a frame.

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
ignored. A value that cannot be read at all, such as bytes that are not valid
Unicode, also keeps it off, and the notice shows it as `<not valid Unicode>`;
the command's own error still prints. A process that was not granted env access
to the variable reads it as off. The CLI checks the permission first, so it
never shows a permission prompt in the middle of an error report.

### Packages that cannot import `@lockness/cli`

The contract is matched by **shape**, not by class: any `Error` with an integer
`exitCode` is an expected failure. A package whose dependency policy forbids
importing `@lockness/cli` meets it with **one local class**, which it does not
export:

```typescript
/**
 * A failed mail command. Deliberately not exported: the shape is the contract,
 * so the class is not public API.
 */
class MailCommandError extends Error {
    readonly exitCode = 1
    override readonly name = 'MailCommandError'
}

throw new MailCommandError(
    'Invalid mailable name "x-y" — letters and digits only',
)
```

- **One class per package**, beside the package's structural `Cli` interface.
  Not in `mod.ts` and not in `deno.json` `exports`: exported, it would become
  public API that every user could start throwing or catching.
- **`Error`'s own constructor**, `(message, options)`, so `{ cause: error }`
  works and is printed after the message exactly as for `CommandFailedError`.
  The rules on one-line messages and causes are the same.
- **Pinned by a test** that throws it through the real `Cli.dispatch()` and
  checks the status and the one printed line, so a drifted copy fails.

The built-in packages that do this are `@lockness/core`, `@lockness/mail`,
`@lockness/notification`, `@lockness/features`, `@lockness/search` and
`@lockness/i18n`.

A package that may import the CLI but must stay light at runtime imports the
dependency-free subpath rather than the barrel. `CommandFailedError` and
`runSteps` are both exported there:

```typescript
import { CommandFailedError, runSteps } from '@lockness/cli/command-failure'
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
