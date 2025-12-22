# Lockness JS

**Lockness JS** is a high-performance, fullstack MVC web framework built
natively for **Deno**. Heavily inspired by the elegance of Laravel and AdonisJS,
it leverages the speed of **HonoJS** while providing a structured and ergonomic
development experience.

### Development

Start the development server with hot-reload and environment variables:

```bash
deno task dev
```

### Production Build

Bundle your application into an optimized TypeScript file in the `_output`
directory:

```bash
deno task build
```

### Running in Production

Run the optimized production build:

```bash
deno task start
```

### Compile to Binary

Create a standalone executable for your target platform:

```bash
deno task compile
```