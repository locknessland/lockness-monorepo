# Binary Compilation

Lockness provides a powerful, declarative way to bundle your entire application
into a single, standalone executable using `deno compile`. This process is
orchestrated by the Lockness CLI, which handles pre-compilation tasks, asset
management, and framework invariants.

## How it works

The compilation process is controlled through the `@Kernel` decorator in your
`app/kernel.ts`. When you run `deno task compile` (which calls
`deno task cli compile`), the Lockness CLI performs the following steps in
order:

1. **Kernel lookup**: Reads the `@Kernel` from `app/kernel.ts`, the file
   `lockness init` and every kit ship. `app/kernel.tsx` also works. If both
   exist, `app/kernel.ts` wins and the `.tsx` is not read. `ssg:build` uses the
   same lookup. If neither file exists, `compile` prints both paths it tried,
   builds nothing and exits `1`.
2. **Preparation**: Ensures the output directory (default: `_dist`) exists.
3. **Routes Generation**: Automatically scans your controllers and generates
   `app/routes.ts`. This ensures all routes are statically available for the
   binary, as runtime directory scanning is not possible in a compiled
   executable.
4. **User Scripts**: Executes any custom scripts or commands defined in your
   kernel's `compile.scripts` list (e.g., CSS building, documentation syncing).
5. **Asset Management**: Copies declared files and folders to the distribution
   directory alongside the binary.
6. **Compilation**: Executes the native `deno compile` command with your
   configured flags.

## When a step fails

`compile` exits `0` only when the binary was built. Any failed step stops it
**before `deno compile` runs**, so no binary is built from stale routes, without
a declared asset, or after a failed script. It prints one line on stderr and
exits `1`, so `deno task compile && deploy`, a CI step or a
`RUN deno task cli compile` line in a Dockerfile fails with it:

| Step that fails                                                                            | What `compile` prints                                                          |
| :----------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| No kernel file                                                                             | `❌ Kernel file not found (tried app/kernel.ts, app/kernel.tsx)`               |
| Routes generation                                                                          | `❌ Failed to generate ./app/routes.ts from ./app/controller caused by: …`     |
| A pre-compile script exits non-zero                                                        | `❌ Pre-compile script "<script>" failed (<program> exited <code>)`            |
| A declared asset does not exist                                                            | `❌ Declared asset not found: <source>`                                        |
| `deno compile` exits non-zero                                                              | `❌ Compilation failed (deno compile exited <code>)`                           |
| Anything else (a kernel that fails to load, a copy that fails, a script that cannot start) | `❌ compile failed:` and the error with its stack frames, credentials redacted |

- **A child process's output passes through as it is written.** Pre-compile
  scripts and `deno compile` write straight to the terminal, so their own error
  is on screen above the `❌` line, which names only the step and the exit code.
- **Scripts stop at the first failure.** A later script, the asset copy and
  `deno compile` do not run.
- **What earlier steps did stays.** The output directory exists, `app/routes.ts`
  may have been regenerated, and earlier scripts and assets have run or been
  copied. A binary left at the `output` path by an earlier successful run is not
  removed, so judge a build by the exit status, not by the file being there.

## Configuration

Lockness encourages externalizing your compilation settings in
`config/compile.ts` to keep your kernel clean.

### 1. Define the configuration

Create or edit `config/compile.ts`:

```typescript
// config/compile.ts
import type { CompileConfig } from '@lockness/core'

export const compileConfig: CompileConfig = {
    output: '_dist/lockness', // Name and path of the binary
    main: 'main.ts', // Entry point of your app
    flags: ['-A', '--env-file=.env.production.local'], // Deno compile flags
    assets: [ // Files/folders to copy to _dist
        'public',
        { source: 'docs', target: 'docs', include: /\.md$/ }, // Only copy .md files
        { source: 'packages/ui/components', target: 'packages/ui/components' },
    ],
    scripts: [ // Commands to run before compilation
        'deno task css:build',
        'scripts/prepare_docs.ts',
    ],
}
```

### 2. Register in the Kernel

Then, reference it in your `app/kernel.ts`:

```tsx
// app/kernel.ts
import { config } from '../config/mod.ts'

@Kernel({
    // ... other config
    compile: config.compile,
})
export class AppKernel {}
```

## Why externalize configuration?

Lockness follows the **Dependency Inversion Principle**. By moving configuration
out of the `app/kernel.ts`, you ensure that:

- The Kernel remains a declarative overview of the application components.
- Configuration is easily testable and discoverable in the `config/` directory.
- Application-specific tasks (like building search registries or syncing project
  docs) are clearly separated from framework logic.

## Runtime Behavior

When running as a binary, Lockness detects it's in a production environment and:

- Disables runtime controller discovery.
- Uses the generated `app/routes.ts` registry for routing.
- Points to the orchestrated `assets` relative to the binary location.

## Deployment

To deploy your application, you only need to copy the contents of your `output`
directory (e.g., `_dist/`) to your server. The binary is self-contained and only
requires the Deno runtime environment if dynamic scripts are executed at
runtime.
