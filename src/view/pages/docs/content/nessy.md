# Nessy CLI Wrapper

**Nessy** is a convenient CLI wrapper that simplifies your development workflow
by providing shortcuts for common Deno and Lockness commands. Instead of typing
`deno task ace` every time, just use `./nessy`.

## Installation

Generate the Nessy wrapper in your project:

```bash
deno task ace nessy:install
```

This creates a `nessy` script (or `nessy.cmd` on Windows) in your project root
and makes it executable. The script is automatically added to `.gitignore`.

## Basic Usage

Once installed, use Nessy instead of `deno task ace`:

```bash
# Instead of:
deno task ace make:controller User

# Use:
./nessy make:controller User
```

Nessy passes all arguments directly to the ACE CLI, so all your existing
commands work exactly the same way.

## Developer Experience Commands

Nessy includes several built-in commands to improve your development workflow:

### Development Server

Start the development server with hot-reload:

```bash
./nessy dev
```

This is equivalent to `deno task dev` but faster to type.

### Testing

Run tests with various options:

```bash
# Run all tests
./nessy test

# Run tests matching a pattern
./nessy test UserService

# Watch mode (re-run on changes)
./nessy test --watch
```

### Type Checking

Type-check all TypeScript files in your project:

```bash
./nessy check
```

Runs `deno check **/*.ts **/*.tsx` to verify type correctness without running
the code.

### Fresh Install

Clean all caches and reinstall dependencies:

```bash
./nessy fresh
```

This command:

- Removes `.vite`, `dist`, `coverage`, `.compiled` directories
- Clears the Deno cache
- Rebuilds `deno.lock` with fresh dependencies

Useful when you encounter cache-related issues or dependency conflicts.

### Clean Build Artifacts

Remove build artifacts without touching dependencies:

```bash
./nessy clean
```

Only removes `.vite`, `dist`, `coverage`, and `.compiled` directories. Faster
than `fresh` when you just need to clean build outputs.

### Watch Mode

Start development server in watch mode:

```bash
./nessy watch
```

Equivalent to `deno task dev --watch` for automatic restart on file changes.

### Project Status

Display project health information:

```bash
./nessy status
```

Shows:

- Git status (branch, uncommitted changes)
- Deno version
- Database configuration (from DATABASE_URL)
- Nessy installation status

Example output:

```
🌊 Nessy Status Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Git
   Branch: main
   Status: 3 files modified, 1 file staged

🦕 Deno
   Version: 2.1.4

🗄️  Database
   Provider: PostgreSQL
   Host: localhost:5432
   Database: lockness_dev

✅ Nessy
   Status: Ready
   Location: ./nessy
```

### Install Dependencies

Add packages using Deno's package manager:

```bash
./nessy install zod
./nessy install @std/path@^1.0.0
```

Equivalent to `deno add <package>`.

### Version Information

Display Lockness and Nessy version:

```bash
./nessy --version
```

### Help

Show all available Nessy commands:

```bash
./nessy --help
```

Displays comprehensive help including:

- ACE commands (make:_, db:_, etc.)
- Developer experience commands
- Usage examples

## Command Summary

| Command                  | Description                     |
| ------------------------ | ------------------------------- |
| `./nessy <ace-command>`  | Run any ACE CLI command         |
| `./nessy dev`            | Start development server        |
| `./nessy build`          | Build production bundle         |
| `./nessy start`          | Start production server         |
| `./nessy test [pattern]` | Run tests (optionally filtered) |
| `./nessy check`          | Type-check all files            |
| `./nessy fresh`          | Clean everything and reinstall  |
| `./nessy clean`          | Remove build artifacts only     |
| `./nessy watch`          | Dev server in watch mode        |
| `./nessy status`         | Show project health info        |
| `./nessy install <pkg>`  | Add a dependency                |
| `./nessy --version`      | Show version information        |
| `./nessy --help`         | Display help                    |

## Platform Support

Nessy works on all major platforms:

- **Unix/Linux/macOS**: Uses shell script (`nessy`)
- **Windows**: Uses batch script (`nessy.cmd`)

The correct script is automatically generated based on your operating system
when you run `nessy:install`.

## Why Nessy?

1. **Faster to type**: `./nessy` vs `deno task ace`
2. **Consistent interface**: One command for all operations
3. **Enhanced DX**: Built-in shortcuts for common tasks
4. **Project-specific**: Generated per-project, not global
5. **Always up-to-date**: Calls `ace.ts` directly, no compilation needed

## Examples

```bash
# Scaffolding
./nessy make:controller Post
./nessy make:model Comment -a
./nessy make:auth --social

# Database operations
./nessy db:generate
./nessy db:migrate
./nessy db:studio

# Development workflow
./nessy dev           # Start server
./nessy test User     # Run user tests
./nessy check         # Verify types
./nessy router:list   # Show all routes

# Maintenance
./nessy clean         # Clean build
./nessy fresh         # Full reset
./nessy status        # Check health
```

## Uninstallation

If you want to remove Nessy, simply delete the script:

```bash
# Unix/Linux/macOS
rm nessy

# Windows
del nessy.cmd
```

You can reinstall it anytime with `deno task ace nessy:install`.
