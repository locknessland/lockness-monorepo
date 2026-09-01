# @lockness/init

Project scaffolding and initialization for new Lockness applications.

## Features

- 🎒 **Starter kits**: `web`, `api` or `slim`, chosen with `--kit`
- 🚀 **Quick Start**: Scaffold a complete Lockness project in seconds
- 📁 **Full Structure**: Pre-configured directory layout (controllers, models,
  views, etc.)
- ⚙️ **Environment Setup**: Automatic .env file creation
- 🎨 **Stubs**: Template-based project generation
- 📦 **Ready to Run**: Generated projects work out of the box

## Starter kits

| Kit    | What you get                                                              |
| :----- | :------------------------------------------------------------------------ |
| `web`  | JSX views, Tailwind v4, cookie session, session auth, Drizzle, login flow |
| `api`  | JSON only: bearer tokens, CORS, throttling, OpenAPI, Drizzle              |
| `slim` | One controller, one named middleware, nothing else                        |

`web` is the default. Each kit ships its own `README.md` and a smoke test that
passes without a database.

## Usage

### Create a New Project

```bash
# Latest version, web kit (both default)
deno run -A jsr:@lockness/init my-app

# A JSON API, no view layer
deno run -A jsr:@lockness/init my-api --kit api

# The smallest possible starting point
deno run -A jsr:@lockness/init my-app --kit slim
```

Or using the Nessy CLI:

```bash
./nessy init my-app --kit slim
```

### Version Control

Control which version of Lockness packages your project will use:

```bash
# Use specific version
deno run -A jsr:@lockness/init my-app --use 0.1.15

# Use short flag
deno run -A jsr:@lockness/init my-app -u 0.1.15

# Use version range (caret - allows patch + minor updates)
deno run -A jsr:@lockness/init my-app --use "^0.1.0"

# Use version range (tilde - allows patch updates only)
deno run -A jsr:@lockness/init my-app --use "~0.1.20"

# Use latest version explicitly
deno run -A jsr:@lockness/init my-app --use latest
```

### Pin Init Package Version

Use JSR's native version syntax to pin the init package itself:

```bash
# Use specific init package version
deno run -A jsr:@lockness/init@0.1.10 my-app

# Combine: specific init + specific framework
deno run -A jsr:@lockness/init@0.1.10 my-app --use 0.1.8
```

### Version Format Reference

| Format   | Description   | Example   | Result in deno.json |
| -------- | ------------- | --------- | ------------------- |
| `X.Y.Z`  | Exact version | `0.1.15`  | `^0.1.15`           |
| `^X.Y.Z` | Caret range   | `^0.1.0`  | `^0.1.0`            |
| `~X.Y.Z` | Tilde range   | `~0.1.20` | `~0.1.20`           |
| `latest` | Latest stable | `latest`  | `^0.1.22`           |

**Caret (`^`)**: Allows patch and minor updates (recommended)

- `^0.1.15` matches `0.1.15`, `0.1.16`, `0.1.999`
- Won't match `0.2.0` or `1.0.0`

**Tilde (`~`)**: Allows patch updates only

- `~0.1.15` matches `0.1.15`, `0.1.16`
- Won't match `0.2.0`

### Why Version Control?

**Use Cases:**

- **Stability**: Pin to tested versions for production
- **Compatibility**: Match existing codebases
- **Testing**: Verify compatibility with specific versions
- **Migration**: Gradually upgrade across projects

### Getting Help

```bash
# Display help
deno run -A jsr:@lockness/init --help

# Show init package version
deno run -A jsr:@lockness/init --version
```

### What Gets Scaffolded

This will:

- Create a new directory with your project name
- Generate the complete Lockness project structure
- Set up configuration files (deno.json, .env)
- Install dependencies
- Create sample controllers and views

## Generated Structure

```
my-app/
├── deno.json                 # Deno configuration with workspace
├── .env                      # Environment variables
├── .env.exemple              # Environment template
├── main.ts                   # Application entry point
├── cli.ts                    # CLI entry point
├── public/                   # Static files
│   └── css/
├── app/
│   ├── kernel.ts             # Application kernel
│   ├── controller/           # HTTP controllers
│   ├── middleware/           # Custom middleware
│   ├── model/                # Data models
│   ├── repository/           # Data repositories
│   ├── service/              # Business logic
│   ├── view/                 # JSX view components
│   └── routes.ts             # Route definitions
├── database/
│   ├── migrations/           # Database migrations
│   └── seeders/              # Database seeders
└── lockness/                 # Framework packages (workspace)
```

## Quick Start After Init

```bash
cd my-app
deno task dev
```

Your application will be running at `http://localhost:8888`

## Configuration

The init command creates a fully configured project with:

- **deno.json**: Workspace configuration with tasks and imports
- **.env**: Environment variables (APP_ENV, APP_PORT, DATABASE_URL)
- **kernel.ts**: Application bootstrap with middleware configuration
- **main.ts**: HTTP server entry point

## Customization

### Project Name

The project name is used for:

- Directory name
- Default configuration values
- Generated file headers

```bash
deno run -A jsr:@lockness/init awesome-api
```

### Manual Setup

If you prefer manual setup, you can copy individual stubs from the `stubs/init/`
directory:

```typescript
import { Stub } from '@lockness/cli'

await Stub.scaffoldFrom(
    './node_modules/@lockness/init/stubs/init',
    './my-project',
    {
        projectName: 'my-project',
    },
)
```

## What's Included

The scaffolded project includes:

- **MVC Architecture**: Controllers, models, views pre-configured
- **Routing**: Automatic route discovery
- **Middleware**: Logger, CORS, error handling
- **Database**: Drizzle ORM integration ready
- **Authentication**: @lockness/auth ready to configure
- **CLI Commands**: Nessy wrapper and custom commands
- **Development Tools**: Hot reload, route generation

## Environment Variables

Default `.env` configuration:

```env
APP_ENV=development
APP_PORT=8888
APP_KEY=base64:...   # generated for you by `lockness init`
DATABASE_URL=postgres://user:password@localhost:5432/mydb
```

## Next Steps

After initializing:

1. **Configure Database**: Update `DATABASE_URL` in `.env`
2. **Install Packages**: `./nessy package:install drizzle`
3. **Generate Code**: `./nessy make:controller User`
4. **Start Development**: `deno task dev`

## See Also

- [@lockness/cli](../cli/README.md) - CLI system documentation
- [@lockness/contract](../core/README.md) - Core framework features
