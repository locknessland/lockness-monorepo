# Contributing to Lockness

Lockness is a monorepo containing multiple libraries. Contributing to the core
of the framework requires understanding how the workspace is structured.

## Monorepo Structure

The project uses **Deno Workspaces** to manage multiple internal libraries. All
core libraries are located in the `lockness/` directory:

- `@lockness/core`: The web framework core (routing, controllers, etc.)
- `@lockness/auth`: Authentication system
- `@lockness/cli`: CLI engine
- `@lockness/drizzle`: Database integration
- ...and more.

## Development Workflow

### Deno Workspaces

Deno Workspaces allow you to use the final import names (e.g., `@lockness/core`)
in your code. Deno automatically resolves these to the local folders in the
workspace.

You don't need to change any imports when switching between development and
production.

### Naming Convention

Each library in the workspace follows the Deno convention for its entry point:

- **`mod.ts`**: This is the main entry point of the library. It exports the
  public API.
- **`deno.json`**: Each library has its own configuration and versioning.

### Running Tests

To ensure your changes don't break the framework, run the global test suite:

```bash
deno task test
```

This will run all tests for all libraries in the workspace.

### Version Management

When releasing a new version of Lockness, all packages in the monorepo need to
be bumped to the same version. Use the `bump` command:

```bash
deno task bump 0.2.0
```

This command automatically:

- Updates the `version` field in all workspace packages' `deno.json`
- Updates all inter-package dependencies (e.g., `@lockness/core@^0.1.0` →
  `@lockness/core@^0.2.0`)
- Preserves version prefixes (`^` or `~`)
- Provides a summary of changes

**After bumping:**

1. Review changes: `git diff`
2. Run tests: `deno task test`
3. Commit: `git commit -am "chore: bump version to 0.2.0"`
4. Publish packages: `deno publish --allow-dirty` (in each package directory)

## Contributing

1. **Fork the repository**:
   [locknessjs/lockness](https://github.com/locknessjs/lockness)
2. **Create a branch**: `git checkout -b feature/my-new-feature`
3. **Make your changes**: Ensure you follow the `mod.ts` convention for exports.
4. **Test your changes**: Run `deno task test` to verify everything works.
5. **Submit a Pull Request**: Describe your changes and why they are needed.

## Local Development linking

If you want to test your local changes in another project, you can use the
`imports` section of your project's `deno.json` to point to your local clones of
the Lockness libraries, or better, use the workspace feature if your project is
also a monorepo.
