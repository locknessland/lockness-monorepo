# @lockness/init

Project scaffolding and initialization for new Lockness applications.

## Features

- 🚀 **Quick Start**: Scaffold a complete Lockness project in seconds
- 📁 **Full Structure**: Pre-configured directory layout (controllers, models,
  views, etc.)
- ⚙️ **Environment Setup**: Automatic .env file creation
- 🎨 **Stubs**: Template-based project generation
- 📦 **Ready to Run**: Generated projects work out of the box

## Usage

### Create a New Project

```bash
deno run -A jsr:@lockness/init project-name
```

Or using the Nessy CLI:

```bash
./nessy init my-app
```

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
├── kernel.tsx                # Application kernel
├── public/                   # Static files
│   └── css/
├── app/
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
- **kernel.tsx**: Application bootstrap with middleware configuration
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
APP_KEY=your-secret-key-here
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
- [@lockness/core](../core/README.md) - Core framework features
