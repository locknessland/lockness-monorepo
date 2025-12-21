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
Bundle your application into a single, optimized JavaScript file in the `_build` directory:
```bash
deno task build
```

### Running in Production
Run the optimized production build:
```bash
deno task start
```

---

## 📂 Project Structure

- **`lockness/`**: The core library source code.
- **`src/`**: Your application logic (Controllers, Kernels, etc.).
- **`data/`**: Assets and static data.

---

## 📖 Learn More

For a deep dive into the framework's philosophy and technical details, check out:
- [GEMINI.md](./GEMINI.md) - Project objectives and roadmap.

