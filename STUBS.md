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

| Source File                      | Stub File                                              | Sync? |
| -------------------------------- | ------------------------------------------------------ | ----- |
| `cli.ts`                         | `lockness/init/stubs/init/cli.ts.stub`                 | ✅    |
| `main.ts`                        | `lockness/init/stubs/init/main.ts.stub`                | ✅    |
| `deno.json`                      | `lockness/init/stubs/init/deno.json.stub`              | ✅    |
| `README.md`                      | `lockness/init/stubs/init/README.md.stub`              | ✅    |
| `drizzle.config.ts`              | `lockness/drizzle/stubs/drizzle.config.ts.stub`        | ✅    |
| `.env.exemple`                   | `lockness/init/stubs/init/.env.exemple.stub`           | ✅    |
| `.gitignore`                     | `lockness/init/stubs/init/.gitignore.stub`             | ✅    |
| `data/todo.json`                 | `lockness/init/stubs/init/data/todo.json.stub`         | ✅    |
| `src/kernel.tsx`                 | `lockness/init/stubs/init/src/kernel.tsx.stub`         | ✅    |
| `src/controller/todo_controller` | `lockness/init/stubs/init/src/controller/todo_...stub` | ✅    |
| `src/view/app.ts`                | `lockness/init/stubs/init/src/view/app.ts.stub`        | ✅    |
| `src/view/assets/style.css`      | `lockness/init/stubs/init/src/view/assets/style...`    | ✅    |
| `src/view/assets/landing.css`    | `lockness/init/stubs/init/src/view/assets/landing...`  | ✅    |
| `src/view/components/ui.tsx`     | `lockness/init/stubs/init/src/view/components/ui...`   | ✅    |
| `src/view/layouts/main_layout`   | `lockness/init/stubs/init/src/view/layouts/main...`    | ✅    |
| `src/view/pages/home.tsx`        | `lockness/init/stubs/init/src/view/pages/home...`      | ✅    |

---

## 🔧 Make Stubs (Code Generation)

These stubs are used by `deno task cli make:*` commands to generate individual
files.

### Core CLI Stubs (`lockness/cli/stubs/make/`)

| Command            | Stub File                | Generates                                   |
| ------------------ | ------------------------ | ------------------------------------------- |
| `make:controller`  | `controller.stub`        | `src/controller/{name}_controller.ts`       |
| `make:middleware`  | `middleware.stub`        | `src/middleware/{name}_middleware.ts`       |
| `make:service`     | `service.stub`           | `src/service/{name}_service.ts`             |
| `make:view`        | `view.stub`              | `src/view/pages/{name}.tsx`                 |
| `make:command`     | `command.stub`           | `src/command/{name}_command.ts`             |
| `make:job`         | `job.stub`               | `src/job/{name}_job.ts`                     |
| `make:component`   | `component.stub`         | `src/view/components/{name}.tsx`            |
| `make:error-pages` | `error_*.stub` (4 files) | All error pages in `src/view/pages/errors/` |

### Auth Stubs (`lockness/cli/stubs/auth/`)

| Command            | Stub File                     | Generates                                  |
| ------------------ | ----------------------------- | ------------------------------------------ |
| `make:auth`        | `auth_controller.stub`        | `src/controller/auth_controller.ts`        |
| `make:auth`        | `user_provider.stub`          | `src/auth/user_provider.ts`                |
| `make:social-auth` | `social_auth_controller.stub` | `src/controller/social_auth_controller.ts` |

### Nessy Stubs (`lockness/cli/stubs/nessy/`)

| Command | Stub File        | Generates                    |
| ------- | ---------------- | ---------------------------- |
| `nessy` | `nessy.stub`     | Nessy ASCII art template     |
| `nessy` | `nessy.cmd.stub` | Nessy command line templates |

### Drizzle CLI Stubs (`lockness/drizzle/stubs/`)

| Command                | Stub File              | Generates                             |
| ---------------------- | ---------------------- | ------------------------------------- |
| `make:model`           | `model.stub`           | `src/model/{name}.ts`                 |
| `make:model -r`        | `repository.stub`      | `src/repository/{name}_repository.ts` |
| `make:model -c`        | `controller.stub`      | `src/controller/{name}_controller.ts` |
| `make:model -s`        | `seeder.stub`          | `src/seeder/{name}_seeder.ts`         |
| `make:seeder`          | `seeder.stub`          | `src/seeder/{name}_seeder.ts`         |
| `make:seeder Database` | `database_seeder.stub` | `src/seeder/database_seeder.ts`       |

---

## 📋 Checklist Before Commit

When modifying core framework files, check this list:

- [ ] Modified `cli.ts`? → Update `cli.ts.stub`
- [ ] Modified `src/kernel.tsx`? → Update `kernel.tsx.stub`
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

_Last updated: 2025-12-22_
