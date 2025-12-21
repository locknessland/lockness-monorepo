# 🌊 Lockness JS

**Lockness JS** is a high-performance, fullstack MVC web framework built natively for **Deno**. Heavily inspired by the elegance of Laravel and AdonisJS, it leverages the speed of **HonoJS** while providing a structured and ergonomic development experience.

---

## 🚀 Key Features

- **MVC Architecture**: Clear separation of concerns (Models, Views, Controllers).
- **Stage 3 Decorators**: Modern, native TypeScript decorators for expressive routing.
- **Deno-First**: No `node_modules`, zero-config TypeScript, and built-in security.
- **Hono Engine**: Powered by the fastest web router in the ecosystem.
- **Built-in Bundler**: Integrated production build system using `esbuild`.

---

## 🛠️ Usage

### Development
Start the development server with hot-reload and environment variables:
```bash
deno task dev
```

### Production Build
Bundle your application into an optimized TypeScript file in the `_output` directory:
```bash
deno task build
```

### Compile to Binary
Create a standalone executable for your target platform:
```bash
deno task compile
```

### Running in Production
Run the optimized production build:
```bash
deno task start
```

---

## 📂 Project Structure

```text
.
├── lockness/              # 🏗️ Core Library (Internal Logic)
│   └── core.ts            # Main class & decorators
├── src/                   # 🚀 Framework Template (Boilerplate)
│   ├── controller/        # HTTP Controllers
│   ├── model/             # Database Models
│   ├── service/           # Business Logic
│   └── kernel.ts          # App Initialization
├── data/                  # Static Data & Assets
├── scripts/               # Build & Internal Scripts
├── _output/               # Build Artifacts & Binaries
├── main.ts                # Entry point
└── deno.json              # Config & Aliases
```

- **`lockness/`**: Core library source code (Development).
- **`src/`**: Application logic following the MVC pattern.
- **`data/`**: Assets and static data.
- **`_output/`**: Build artifacts and compiled binaries.



---

## 📖 Learn More

For a deep dive into the framework's philosophy and technical details, check out:
- [GEMINI.md](./GEMINI.md) - Project objectives and roadmap.

