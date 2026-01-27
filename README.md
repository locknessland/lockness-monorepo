# Lockness JS - Monorepo

> ⚠️ **Looking for Lockness framework?** If you want to use Lockness in your
> project, check out the core package:
> [locknessland/core](https://github.com/locknessland/core)

This is the **monorepo** for developing Lockness JS - a high-performance,
fullstack MVC web framework built natively for Deno. This repository contains
all packages, the documentation website, and the demo application.

## 📖 Documentation

Full framework documentation is available at
[lockness.land/docs](https://lockness.land/docs)

## 🏗️ Repository Structure

```
packages/           # All @lockness/* packages
├── core/           # Main framework package
├── auth/           # Authentication system
├── cli/            # CLI tools
├── container/      # Dependency injection
├── session/        # Session management
├── ...
app/                # Demo application & documentation website
public/             # Static assets
```

## 🚀 Getting Started (Contributors)

### Prerequisites

- [Deno 2+](https://deno.land/) installed
- PostgreSQL database (for the demo app)

### Setup

````bash
# Clone the repository
git clone https://github.com/locknessland/lockness.git
cd lockness

# Copy environment file
cp .env.example .env

### Development

Run each watcher in a separate terminal:

```bash
# Terminal 1: CSS Watcher
deno task css:watch

# Terminal 2: Development Server
deno task dev
````

### Common Commands

| Command                     | Description              |
| --------------------------- | ------------------------ |
| `deno task dev`             | Start development server |
| `deno task test`            | Run test suite           |
| `deno task test:watch`      | Run tests in watch mode  |
| `deno task test:coverage`   | Run tests with coverage  |
| `deno task css:watch`       | Watch and compile CSS    |
| `deno task cli db:migrate`  | Run database migrations  |
| `deno task cli db:studio`   | Open Drizzle Studio      |
| `deno task cli router:list` | Display all routes       |

## 🧪 Testing

```bash
# Run all tests
deno task test

# Run tests with coverage
deno task test:coverage

# Watch mode
deno task test:watch
```

**Testing Guidelines:**

- Use `FakeTime` from `@std/testing/time` for time-based tests
- Use in-memory mocks instead of filesystem I/O
- Keep tests hermetic (no external side effects)
- Target: full suite < 30 seconds

See [GEMINI.md](./GEMINI.md#-testing-best-practices) for detailed patterns.

## 📦 Publishing Packages

Packages are published to [JSR](https://jsr.io/@lockness). Each package in
`packages/` has its own `deno.json` with version and exports.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`deno task test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Conventions

- All packages use `mod.ts` as their main entry point
- Tests are located in `packages/<name>/tests/`
- Use workspace imports for cross-package dependencies (e.g., `@lockness/core`)

For more details, see the
[Contribution Guide](https://lockness.land/docs/contribution).

## 📄 License

MIT License
