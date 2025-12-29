# Refactor `src` to `app`

## Objective

Rename the root `src` directory to `app` to align with the framework's evolving
folder structure conventions. This change requires updating all file paths,
configuration settings, and scripts that reference `src`.

## Task Details

### 1. Rename Directory

- Rename the root directory `src/` to `app/`.

### 2. Update Configuration Files

- **`deno.jsonc`**:
  - Update `imports` mapping:
    - `@controller/` -> `./app/controller/`
    - `@service/` -> `./app/service/`
    - `@middleware/` -> `./app/middleware/`
    - `@model/` -> `./app/model/`
    - `@repository/` -> `./app/repository/`
    - `@view/` -> `./app/view/`
    - `@kernel` -> `./app/kernel.tsx`
  - Update `tasks`:
    - `css:build` & `css:watch`: `src/view/assets/...` -> `app/view/assets/...`
    - `routes:generate`: `scripts/generate_routes.ts` (the script content needs
      update, see below).
    - `routes:watch`: `scripts/watch_routes.ts` (the script content needs
      update, see below).
- **`drizzle.config.ts`**:
  - Update schema path: `'./src/model/*.ts'` -> `'./app/model/*.ts'`.

### 3. Update Scripts

- **`scripts/dev.sh`**:
  - Update Tailwind CSS path: `src/view/assets/app.css` ->
    `app/view/assets/app.css`.
- **`scripts/generate_routes.ts`**:
  - Update `CONTROLLER_DIR` constant to point to `./app/controller`.
  - Update `OUTPUT_FILE` constant to point to `./app/routes.ts`.
- **`scripts/watch_routes.ts`**:
  - Update `CONTROLLER_DIR` constant to point to `./app/controller`.
  - Update `OUTPUT_FILE` constant to point to `./app/routes.ts`.

### 4. Update Application Code

- **`app/kernel.tsx`** (formerly `src/kernel.tsx`):
  - Update `controllersDir` configuration to `./app/controller`.
  - Update import of `UserProvider` if it references `../src/...`.
- **`app/controller/api_docs_controller.ts`**:
  - Update any hardcoded paths referencing `src/controller`.
- **`cli.ts`**:
  - Update `cli.discoverCommands` path: `'./src/command'` -> `'./app/command'`.

### 5. Update Framework CLI Tools

- **`lockness/cli/commands/make_commands.ts`**:
  - Update all hardcoded strings referencing `./src/...` to `./app/...`.
    - `make:controller`: `./src/controller`
    - `make:view`: `./src/view/pages`
    - `make:middleware`: `./src/middleware`
    - `make:service`: `./src/service`
    - `make:component`: `./src/view/components`
    - `make:command`: `./src/command`
    - `make:job`: `./src/job`
    - `make:error-pages`: `./src/view/pages/errors`
    - `make:crud`: `./src/model`, `./src/repository`, `./src/service`,
      `./src/controller`, `./src/view/pages`
    - `make:action`: `./src/controller`, `./src/view/pages`

### 6. Update Stubs

- **`lockness/init/stubs/init/`**:
  - Rename directory `src` to `app`.
  - **`deno.json.stub`**: Update imports and tasks.
  - **`cli.ts.stub`**: Update command discovery path.
  - **`Dockerfile.stub`**: Update `COPY src/ ./src/` to `COPY app/ ./app/`.
  - **`scripts/dev.sh.stub`**: Update CSS path.
  - **`scripts/generate_routes.ts.stub`**: Update controller/output paths.
  - **`scripts/watch_routes.ts.stub`**: Update controller/output paths.
  - **`src/kernel.tsx.stub`** (will be in `app/`): Update `controllersDir`.
  - **`README.md.stub`**: Update documentation text references.
- **`lockness/drizzle/stubs/drizzle.config.ts.stub`**: Update schema glob path.
- **`lockness/openapi/stubs/api_docs_controller.stub`**: Update
  `controllersDir`.
- **`lockness/cli/stubs/make/view.stub`**: Update helper text.

### 7. Documentation & Stubs (Optional but Recommended)

- **`GEMINI.md`**: Update references to `src/` to `app/`.
- **`README.md`**: Update references to `src/` to `app/`.

## Impacted Files Checklist

- [ ] `src/` (Directory rename)
- [ ] `deno.jsonc`
- [ ] `drizzle.config.ts`
- [ ] `scripts/dev.sh`
- [ ] `scripts/generate_routes.ts`
- [ ] `scripts/watch_routes.ts`
- [ ] `cli.ts`
- [ ] `app/kernel.tsx`
- [ ] `app/controller/api_docs_controller.ts`
- [ ] `lockness/cli/commands/make_commands.ts`
- [ ] `lockness/init/stubs/init/src` (Directory rename to `app`)
- [ ] `lockness/init/stubs/init/deno.json.stub`
- [ ] `lockness/init/stubs/init/cli.ts.stub`
- [ ] `lockness/init/stubs/init/Dockerfile.stub`
- [ ] `lockness/init/stubs/init/scripts/dev.sh.stub`
- [ ] `lockness/init/stubs/init/scripts/generate_routes.ts.stub`
- [ ] `lockness/init/stubs/init/scripts/watch_routes.ts.stub`
- [ ] `lockness/init/stubs/init/src/kernel.tsx.stub`
- [ ] `lockness/init/stubs/init/README.md.stub`
- [ ] `lockness/drizzle/stubs/drizzle.config.ts.stub`
- [ ] `lockness/openapi/stubs/api_docs_controller.stub`
- [ ] `lockness/cli/stubs/make/view.stub`
