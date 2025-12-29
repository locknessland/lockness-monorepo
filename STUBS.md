# 📁 Stubs Mapping

This document tracks the correspondence between **source files** in the main
project and their **stub templates** used for scaffolding new projects or
generating code via CLI commands.

> ⚠️ **Important**: When modifying a source file that has a corresponding stub,
> remember to update the stub as well to keep them in sync!

---

## 🏗️ Init Stubs (Project Scaffolding)

These stubs are used when running `deno task cli init` to scaffold a new
project.

| Source File                         | Stub File                                                         | Sync? |
| ----------------------------------- | ----------------------------------------------------------------- | ----- |
| `cli.ts`                            | `lockness/init/stubs/init/cli.ts.stub`                            | ✅    |
| `main.ts`                           | `lockness/init/stubs/init/main.ts.stub`                           | ✅    |
| `postcss.config.js`                 | `lockness/init/stubs/init/postcss.config.js.stub`                 | ✅    |
| `public/img/lockness-logo.svg`      | `lockness/init/stubs/init/public/img/lockness-logo.svg`           | ✅    |
| `public/favicon.ico`                | `lockness/init/stubs/init/public/favicon.ico`                     | ✅    |
| `public/favicon-16x16.png`          | `lockness/init/stubs/init/public/favicon-16x16.png`               | ✅    |
| `public/favicon-32x32.png`          | `lockness/init/stubs/init/public/favicon-32x32.png`               | ✅    |
| `public/apple-touch-icon.png`       | `lockness/init/stubs/init/public/apple-touch-icon.png`            | ✅    |
| `public/android-chrome-192x192.png` | `lockness/init/stubs/init/public/android-chrome-192x192.png`      | ✅    |
| `public/android-chrome-512x512.png` | `lockness/init/stubs/init/public/android-chrome-512x512.png`      | ✅    |
| `deno.json`                         | `lockness/init/stubs/init/deno.json.stub`                         | ✅    |
| `README.md`                         | `lockness/init/stubs/init/README.md.stub`                         | ✅    |
| `drizzle.config.ts`                 | `lockness/drizzle/stubs/drizzle.config.ts.stub`                   | ✅    |
| `.env.exemple`                      | `lockness/init/stubs/init/.env.exemple.stub`                      | ✅    |
| `.gitignore`                        | `lockness/init/stubs/init/.gitignore.stub`                        | ✅    |
| `app/kernel.tsx`                    | `lockness/init/stubs/init/app/kernel.tsx.stub`                    | ✅    |
| `app/controller/app_controller.tsx` | `lockness/init/stubs/init/app/controller/app_controller.tsx.stub` | ✅    |
| `app/view/app.ts`                   | `lockness/init/stubs/init/app/view/app.ts.stub`                   | ✅    |
| `app/view/assets/app.css`           | `lockness/init/stubs/init/app/view/assets/app.css.stub`           | ✅    |
| `app/view/components/ui.tsx`        | `lockness/init/stubs/init/app/view/components/ui.tsx.stub`        | ✅    |
| `app/view/layouts/main_layout.tsx`  | `lockness/init/stubs/init/app/view/layouts/main_layout.tsx.stub`  | ✅    |
| `app/view/pages/home.tsx`           | `lockness/init/stubs/init/app/view/pages/home.tsx.stub`           | ✅    |

---

## 🔧 Make Stubs (Code Generation)

These stubs are used by `deno task cli make:*` commands to generate individual
files.

### Core CLI Stubs (`lockness/cli/stubs/make/`)

| Command            | Stub File                                        | Generates                                   |
| ------------------ | ------------------------------------------------ | ------------------------------------------- |
| `make:controller`  | `lockness/cli/stubs/make/controller.stub`        | `app/controller/{name}_controller.ts`       |
| `make:middleware`  | `lockness/cli/stubs/make/middleware.stub`        | `app/middleware/{name}_middleware.ts`       |
| `make:service`     | `lockness/cli/stubs/make/service.stub`           | `app/service/{name}_service.ts`             |
| `make:view`        | `lockness/cli/stubs/make/view.stub`              | `app/view/pages/{name}.tsx`                 |
| `make:command`     | `lockness/cli/stubs/make/command.stub`           | `app/command/{name}_command.ts`             |
| `make:job`         | `lockness/cli/stubs/make/job.stub`               | `app/job/{name}_job.ts`                     |
| `make:component`   | `lockness/cli/stubs/make/component.stub`         | `app/view/components/{name}.tsx`            |
| `make:error-pages` | `lockness/cli/stubs/make/error_*.stub` (4 files) | All error pages in `app/view/pages/errors/` |

### Auth Stubs (`lockness/cli/stubs/auth/`)

| Command            | Stub File                                             | Generates                                  |
| ------------------ | ----------------------------------------------------- | ------------------------------------------ |
| `make:auth`        | `lockness/cli/stubs/auth/auth_controller.stub`        | `app/controller/auth_controller.ts`        |
| `make:auth`        | `lockness/cli/stubs/auth/user_provider.stub`          | `app/auth/user_provider.ts`                |
| `make:social-auth` | `lockness/cli/stubs/auth/social_auth_controller.stub` | `app/controller/social_auth_controller.ts` |

### Nessy Stubs (`lockness/cli/stubs/nessy/`)

| Command | Stub File                                 | Generates                    |
| ------- | ----------------------------------------- | ---------------------------- |
| `nessy` | `lockness/cli/stubs/nessy/nessy.stub`     | Nessy ASCII art template     |
| `nessy` | `lockness/cli/stubs/nessy/nessy.cmd.stub` | Nessy command line templates |

### Drizzle CLI Stubs (`lockness/drizzle/stubs/`)

| Command                | Stub File                                     | Generates                             |
| ---------------------- | --------------------------------------------- | ------------------------------------- |
| `make:model`           | `lockness/drizzle/stubs/model.stub`           | `app/model/{name}.ts`                 |
| `make:model -r`        | `lockness/drizzle/stubs/repository.stub`      | `app/repository/{name}_repository.ts` |
| `make:model -c`        | `lockness/drizzle/stubs/controller.stub`      | `app/controller/{name}_controller.ts` |
| `make:model -s`        | `lockness/drizzle/stubs/seeder.stub`          | `app/seeder/{name}_seeder.ts`         |
| `make:seeder`          | `lockness/drizzle/stubs/seeder.stub`          | `app/seeder/{name}_seeder.ts`         |
| `make:seeder Database` | `lockness/drizzle/stubs/database_seeder.stub` | `app/seeder/database_seeder.ts`       |

---

## 📋 Checklist Before Commit

When modifying core framework files, check this list:

- [ ] Modified `cli.ts`? → Update `cli.ts.stub`
- [ ] Modified `app/kernel.tsx`? → Update `kernel.tsx.stub`
- [ ] Modified `deno.json` tasks? → Update `deno.json.stub`
- [ ] Added new decorator/feature? → Update relevant `make:*` stubs
- [ ] Changed validation pattern? → Update `controller.stub` in drizzle
- [ ] Changed middleware pattern? → Update `middleware.stub`
- [ ] Updated README.md? → Update `README.md.stub`
- [ ] Updated `.env.exemple`? → Update `.env.exemple.stub`
- [ ] Added new CLI command? → Update `cli.ts.stub` if needed

---

## 🔄 Stub Variables

Common template variables used in stubs:

| Variable               | Description                        | Example          |
| ---------------------- | ---------------------------------- | ---------------- |
| `{{ className }}`      | PascalCase class name              | `User`           |
| `{{ fileName }}`       | lowercase file name (no extension) | `user`           |
| `{{ tableName }}`      | lowercase plural table name        | `users`          |
| `{{ route }}`          | URL route path                     | `users`          |
| `{{ ModelName }}`      | PascalCase model name              | `User`           |
| `{{ RepositoryName }}` | Repository class name              | `UserRepository` |
| `{{ middlewareName }}` | lowercase middleware name          | `auth`           |
| `{{ projectName }}`    | Project name (init only)           | `my-app`         |

---

_Last updated: 2025-12-28_
