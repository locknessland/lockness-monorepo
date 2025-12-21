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

- **Expressive Routing** (based on Hono but adapted for MVC)
- **Controllers** for request logic
- **Robust Middleware Support**
- **ORM / Query Builder** (to be defined/integrated)
- **View Engine** (JSX)
- **Dependency Injection**

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
