# Technical Task: Implement `@lockness/kysely`

## 📋 Task Overview

Implement `@lockness/kysely`, a new database integration package for the
Lockness framework using **Kysely**, a type-safe SQL query builder. This package
will serve as an alternative to the existing `@lockness/drizzle` implementation,
allowing users to choose their preferred ORM/Query Builder.

The new package should follow the same architectural patterns as
`@lockness/drizzle` (CLI integration, dependency injection, migration
management, seeding, and stubs).

## 🎯 Objectives

1. **Framework Integration**: Create `@lockness/kysely` package integrated with
   Lockness DI and Core.
2. **CLI Commands**: Implement CLI commands for migrations (`db:migrate`,
   `db:rollback`, etc.) and scaffolding (`make:model`).
3. **Migration System**: Implement a robust migration system compatible with
   `Kysely` migrations.
4. **Seeding System**: Implement database seeding functionality.
5. **Developer Experience**: Provide typed models, repositories, and easy
   configuration.

## 📁 Affected File Paths

### New Package Structure

- `/packages/kysely/mod.ts` - Main entry point exporting the Database service.
- `/packages/kysely/deno.json` - Package configuration and dependencies.
- `/packages/kysely/cli_commands.ts` - CLI command registration (`db:*`,
  `make:*`).
- `/packages/kysely/install.ts` - Installer script for the package.
- `/packages/kysely/README.md` - Documentation.
- `/packages/kysely/types.ts` - Type definitions for Kysely integration.

### Stubs to Create

- `/packages/kysely/stubs/kysely.config.ts.stub` - Configuration file stub.
- `/packages/kysely/stubs/model.stub` - Kysely interface model stub.
- `/packages/kysely/stubs/repository.stub` - Repository using Kysely stub.
- `/packages/kysely/stubs/migration.stub` - Migration file stub.
- `/packages/kysely/stubs/seeder.stub` - Seeder stub.

### Framework Files to Extend

- `/packages/cli/stubs/make/model.stub` - Update or note that this is
  package-specific.
- _(Note: CLI commands are registered dynamically via `registerKyselyCommands`
  similar to Drizzle)_

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Dependency Inversion Principle (DIP)**

- **Solution**: The `Database` class in `@lockness/kysely` should provide the
  Kysely instance via Dependency Injection, just like `@lockness/drizzle`.
- **Abstraction**:
  ```typescript
  @Service()
  export class Database {
      public db!: Kysely<DatabaseSchema>
      // ... connect/disconnect methods
  }
  ```

**2. Open/Closed Principle (OCP)**

- **Solution**: The package is an extension. Users choose `@lockness/kysely` or
  `@lockness/drizzle` without modifying `@lockness/core`.

**3. Single Responsibility Principle (SRP)**

- **Solution**:
  - `cli_commands.ts`: Handles CLI interaction.
  - `mod.ts`: Handles database connection and service registration.
  - `install.ts`: Handles project setup.

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  User Application Layer                  │  ← Repositories use Kysely query builder
├─────────────────────────────────────────┤
│  Framework Integration Layer             │  ← @lockness/kysely (DI, Config, CLI)
├─────────────────────────────────────────┤
│  Kysely (Library)                        │  ← Type-safe SQL Builder
├─────────────────────────────────────────┤
│  Database Driver (Postgres/MySQL/etc)    │  ← node-postgres, mysql2, etc. (via npm/deno)
└─────────────────────────────────────────┘
```

## 🎨 Proposed API Design

### User Configuration (`kysely.config.ts`)

```typescript
import { defineConfig } from '@lockness/kysely'

export default defineConfig({
    dialect: 'postgres', // or 'mysql', 'sqlite'
    credentials: {
        url: Deno.env.get('DATABASE_URL')!,
    },
    migrations: {
        folder: './database/migrations',
    },
})
```

### Repository Usage

```typescript
import { Inject, Service } from '@lockness/core'
import { Database } from '@lockness/kysely'
import type { User, UserReceiver, UserUpdater } from '../model/user.ts' // Generated interfaces

@Service()
export class UserRepository {
    @Inject(Database)
    private database!: Database

    async findById(id: number): Promise<User | undefined> {
        return await this.database.db
            .selectFrom('users')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst()
    }
}
```

### Migration File (`database/migrations/TIMESTAMP_create_users.ts`)

```typescript
import { Kysely } from '@lockness/kysely'

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('users')
        .addColumn('id', 'serial', (col) => col.primaryKey())
        .addColumn('first_name', 'varchar', (col) => col.notNull())
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('users').execute()
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Package Structure & Connection

**Step 1.1: Create basic package structure**

- Create `packages/kysely/` directory.
- Create `deno.json`:
  ```json
  {
      "name": "@lockness/kysely",
      "version": "0.1.0",
      "exports": {
          ".": "./mod.ts",
          "./install": "./install.ts"
      },
      "imports": {
          "kysely": "npm:kysely@^0.27.2",
          "pg": "npm:pg@^8.11.3",
          "@std/path": "jsr:@std/path@^0.213.0"
      }
  }
  ```

**Step 1.2: Implement `Database` Service (`mod.ts`)**

- Implement `Database` class decorated with `@Service()`.
- **Export Kysely types**: Re-export `Kysely`, `Generated`, `sql` and other
  useful types so users don't need direct npm dependency.
- Implement `connect()` method that initializes `Kysely` instance.
- Support at least `PostgresDialect` initially (extensible to others).
- **Note**: Deno requires specific dialect handling (using `pg` via npm
  compatibility or Deno-native drivers if available/preferred, but `kysely`
  standard is often node-drivers). Let's stick to `pg` (node-postgres) for
  consistency with Kysely docs for Deno (using `npm:` imports).

### Phase 2: Migration System

**Step 2.1: Implement Migration Provider**

- Kysely has a `Migrator` class.
- Create a `DenoFileMigrationProvider` that reads migration files from
  `./database/migrations` using Deno APIs (since `fs` module is Node.js
  specific).

**Step 2.2: Implement `cli_commands.ts` for Migrations**

- `db:migrate`: Runs `migrator.migrateToLatest()`.
- `db:rollback`: Runs `migrator.migrateDown()`.
- `db:status`: Lists executed migrations.
- `make:migration`: Creates a new migration timestamped file from stub.

### Phase 3: Scaffolding & Stubs

**Step 3.1: Create Stubs**

- `model.stub`: Since Kysely uses interfaces, generate TypeScript interfaces.
  ```typescript@lockness/
  import { Generated } from 'kysely'
  export interface UserTable {
      id: Generated<number>
      name: string
  }
  ```
- `repository.stub`: Kysely query syntax.

**Step 3.2: Implement `make:model` command**

- Create interfaces file in `app/model/`.
- Create repository in `app/repository/` (optional flag `-r`).
- Create controller in `app/controller/` (optional flag `-c`).

### Phase 4: Installer

**Step 4.1: Implement `install.ts`**

- Creates usage directories: `database/migrations`, `app/model`.
- Creates `kysely.config.ts`.
- Updates `deno.json` imports if helpful.

## 🔄 Migration Guide

### User Choice

Users choose their DB provider at installation:

- `deno run -A jsr:@lockness/drizzle/install` or
- `deno run -A jsr:@lockness/kysely/install`

### Breaking Changes

N/A - This is a new optional package.

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Update `/README.md` to list Kysely as a database option.
- [ ] Create `/packages/kysely/README.md` with full usage guide.

### User Documentation (Web Docs)

- [ ] Create `/app/view/pages/docs/content/database-kysely.md`.

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test `Database` connection logic (mocked).
- [ ] Test `migrator` provider (mocked file system).

### Integration Tests

- [ ] Real connection test to a Postgres container (if CI environment allows).
- [ ] Test CLI commands `db:migrate`, `make:model` flow on a temporary
      directory.

## ✅ Definition of Done

- [ ] `@lockness/kysely` package created and published (or ready to publish).
- [ ] `Database` service connects to Postgres.
- [ ] `db:migrate`, `db:rollback`, `db:status` commands work.
- [ ] `make:migration` creates valid Kysely migration files.
- [ ] `make:model` scaffolds interfaces and repositories.
- [ ] `deno check` and `deno lint` pass.
- [ ] Documentation created.

## 📅 Timeline

- **Start Date**: 2026-01-15
- **Estimated Completion**: 2026-01-17

## 📝 Notes

- **Dialects**: Start with PostgreSQL (`pg` driver).
- **Deno Compatibility**: Kysely works well with Deno using `npm:` specifiers.
  Ensure `DenoFileMigrationProvider` properly handles `import()` of migration
  files.
