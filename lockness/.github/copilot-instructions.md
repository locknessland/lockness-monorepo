# Lockness JS - Copilot Instructions

You are an expert developer working on **Lockness JS**, a fullstack MVC framework for Deno. Lockness focuses on ergonomics, speed, and providing a structured development experience similar to Laravel, AdonisJS, or Symfony.

## 🎯 Project Overview
Lockness JS is powered by **HonoJS** for routing and middleware but abstracts it into a complete MVC (Model-View-Controller) architecture.

## 📂 Repository Structure
```text
.
├── lockness/              # 🏗️ Core Library (Library Development)
│   ├── core.ts            # Core Logic
│   └── cli.ts             # Ace Engine
├── src/                   # 🚀 Framework Architecture (Boilerplate)
│   ├── controller/        # User Controllers
│   ├── model/             # Models
│   ├── service/           # Services
│   └── kernel.ts          # Bootstrapper
├── data/                  # Static Data
├── docs/                  # Reference Documentation
├── scripts/               # Build Scripts
├── _output/               # Build Artifacts
├── main.ts                # Application Entry point
├── ace.ts                 # CLI Entry point
└── deno.json              # Configuration
```
- **`lockness/`**: Core library source code. This is the package intended for publication.
- **Root & `src/`**: Framework boilerplate/template. This structure is what the CLI generates for new projects.
- **`docs/`**: Contains reference documentation and rules, including HonoJS docs, for AI assistance.
- **`_output/`**: Output directory for builds (`server.ts`) and compiled binaries.


## 🚀 Core Philosophy
- **Deno First**: Use native Deno features. No `node_modules`. Use TypeScript natively.
- **MVC Architecture**: Strictly separate business logic (Controllers), data (Models), and display (Views).
- **Inspiration**: Follow patterns and naming conventions inspired by **Laravel** and **AdonisJS**.
- **Performance**: Leverage HonoJS under the hood for maximum speed.

## 🛠 Technical Stack & Rules
- **Runtime**: Deno
- **Routing**: Expressive routing based on Hono but adapted for MVC.
- **Logic**: Use Controllers for all request handling logic.
- **Middleware**: Use robust middleware support for cross-cutting concerns.
- **Views**: Use JSX as the primary view engine powered by Hono's JSX runtime.
    - Path mapping for `hono/jsx` must be present in `deno.json`.
- **Dependency Injection**: 
    - Use the `@Service()` decorator for classes in `src/service/` or `src/repository/`.
    - Use the `@Inject(ServiceClass)` decorator to inject dependencies into controllers or other services.
    - Dependencies are managed as singletons via the internal `container`.
- **Database**: Use the integrated ORM / Query Builder (as defined in the project).

## 📝 Coding Standards
- Write clean, expressive, and ergonomic code.
- Ensure all components are modular and follow the MVC pattern.
- Prioritize security and modern tooling provided by Deno.
- When generating code, skip explanations unless asked, and focus on providing complete, functional MVC components.
- **Validation**: Always verify your changes by running `deno fmt` and `deno lint` to ensure code quality and consistency.
