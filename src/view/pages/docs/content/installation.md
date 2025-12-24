# Installation

> Lockness JS requires **Deno 2.0+**. Make sure you have it installed before
> proceeding.

## 📦 Quick Start

The fastest way to create a new Lockness project is using the official init
command:

```bash
deno run -Ar jsr:@lockness/init
```

This command will:

- Scaffold a complete project structure
- Install all dependencies
- Set up database configuration (PostgreSQL + Drizzle ORM)

## 🚀 Start Development Server

Once the project is created, navigate to the directory and start the development
server:

```bash
cd my-lockness-app
deno task dev
```

Your app will be available at `http://localhost:5173`

## 🔧 Available Commands

**deno task dev** - Start development server with hot-reload

**deno task build** - Build optimized production bundle

**deno task start** - Run production server

**deno task compile** - Compile to standalone binary

**deno task test** - Run test suite

**deno task test:coverage** - Run tests with coverage

## 📁 Project Structure

```plaintext
my-lockness-app/
├── src/
│   ├── controller/      # HTTP Controllers
│   ├── model/          # Database Models
│   ├── repository/      # Data Access Layer
│   ├── service/         # Business Logic
│   ├── middleware/      # Custom Middlewares
│   ├── command/         # CLI Commands
│   ├── view/            # JSX Views & Layouts
│   └── kernel.ts        # App Configuration
├── migrations/          # Database Migrations
├── static/             # Static Assets
├── main.ts             # Server Entry Point
├── ace.ts              # CLI Entry Point
└── deno.json           # Deno Configuration
```

## Next Steps

Now that you have Lockness installed, you can:

- [Read the Getting Started Guide](/docs/getting-started)
- [Learn about Routing & Controllers](/docs/routing)
- [Explore Models & Database](/docs/models)
