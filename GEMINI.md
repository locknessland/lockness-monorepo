Fullstack MVC framework for Deno. Lockness JS is a fullstack Web framework with
a focus on ergonomics and speed. It takes care of much of the Web development
hassles, offering you a clean and stable API to build Web apps and
microservices.

## 🎯 Project Objective

The main objective of Lockness is to provide a robust and structured development
experience, similar to what is found in established ecosystems like **Laravel**,
**AdonisJS**, or **Symfony**, while leveraging the modernity and speed of Deno.

Although powered by the high-performance engine of **HonoJS** (for routing,
middleware, etc.), Lockness abstracts this layer to offer a complete and
familiar MVC (Model-View-Controller) architecture.

## 🚀 Philosophy

- **Solid Foundation**: Uses HonoJS under the hood for maximum performance and
  efficient HTTP request management.
- **MVC Architecture**: A clear structure separating business logic, data, and
  display.
- **Inspiration**: Heavily inspired by the elegance of Laravel and AdonisJS.
- **Deno First**: Built natively for Deno, taking advantage of its security and
  modern tooling (native TypeScript, no `node_modules`, etc.).

## 🛠 Target Features

- **Expressive Routing**: (based on Hono but adapted for MVC)
- **Controllers**: Class-based controllers with decorators (`@Controller`, `@Get`, `@Post`, etc.)
- **Robust Middleware Support**: Class-based middlewares with the `@Middleware` decorator
- **Dependency Injection**: A built-in IoC container managing services with `@Service` and `@Inject` decorators
- **View Engine (JSX)**: Native JSX support powered by Hono's JSX runtime, facilitating component-based UI development
- **ORM / Query Builder**: (to be defined/integrated)

## 🛠 Architectural Highlights

### Dependency Injection (DI)
Lockness features a built-in Service Container for managing dependencies. Services should be decorated with `@Service()` and can be injected into controllers or other services using `@Inject(ServiceClass)`.

```typescript
@Service()
export class UserService {
    execute() { ... }
}

@Controller('/users')
export class UserController {
    @Inject(UserService)
    private userService!: UserService
}
```

### View Engine (JSX)
The framework uses Hono's JSX runtime. To ensure correct resolution, the root `deno.json` must be configured with:

```json
"compilerOptions": {
    "jsx": "precompile",
    "jsxImportSource": "hono/jsx"
}
```
And Hono must be mapped in the imports:
```json
"imports": {
    "hono": "npm:hono@^4.11.1",
    "hono/": "npm:hono@^4.11.1/"
}
```

## 📂 Repository Structure

```text
.
├── lockness/              # 🏗️ Core Library (Internal Logic)
│   ├── core.ts            # Main class & decorators
│   └── cli.ts             # CLI engine (Ace)
├── src/                   # 🚀 Framework Template (Boilerplate)
│   ├── controller/        # HTTP Controllers
│   ├── model/             # Database Models
│   ├── service/           # Business Logic
│   └── kernel.ts          # App Initialization
├── data/                  # Static Data & Assets
├── docs/                  # Documentation & AI Rules
├── scripts/               # Build & Internal Scripts
├── _output/               # Build Artifacts & Binaries
├── main.ts                # Entry point
├── ace.ts                 # CLI Entry point
└── deno.json              # Config & Aliases
```

- **`lockness/`**: This directory contains the core library code. This is the package that will be published to JSR/NPM.
- **Root Files & `src/`**: These files represent the framework's boilerplate structure generated for users.
- **`docs/`**: Contains reference documentation and rules, including HonoJS docs, for AI assistance.
- **`_output/`**: Output directory for builds (`server.ts`) and compiled binaries.

## ⚙️ Development Workflow

- **Quality Assurance**: Every code modification must be validated by running `deno fmt` and `deno lint`. This ensures that the codebase remains clean, consistent, and free of linting errors.
