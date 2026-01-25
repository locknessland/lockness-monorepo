# Binary Compilation

Lockness provides a powerful, declarative way to bundle your entire application
into a single, standalone executable using `deno compile`. This process is
orchestrated by the Lockness CLI, which handles pre-compilation tasks, asset
management, and framework invariants.

## How it works

The compilation process is controlled through the `@Kernel` decorator in your
`app/kernel.tsx`. When you run `deno task compile` (which calls
`deno task cli compile`), the Lockness CLI performs the following steps in
order:

1. **Preparation**: Ensures the output directory (default: `_dist`) exists.
2. **Routes Generation**: Automatically scans your controllers and generates
   `app/routes.ts`. This ensures all routes are statically available for the
   binary, as runtime directory scanning is not possible in a compiled
   executable.
3. **User Scripts**: Executes any custom scripts or commands defined in your
   kernel's `compile.scripts` list (e.g., CSS building, documentation syncing).
4. **Asset Management**: Copies declared files and folders to the distribution
   directory alongside the binary.
5. **Compilation**: Executes the native `deno compile` command with your
   configured flags.

## Configuration

In your `app/kernel.tsx`, use the `compile` property to define your build
requirements:

```tsx
@Kernel({
    // ... other config
    compile: {
        output: '_dist/lockness', // Name and path of the binary
        main: 'main.ts', // Entry point of your app
        flags: ['-A', '--env-file=.env'], // Deno compile flags
        assets: [ // Files/folders to copy to _dist
            'public',
            'docs',
            { source: 'config/config.json', target: 'config/config.json' },
        ],
        scripts: [ // Commands to run before compilation
            'deno task css:build',
            'scripts/my_custom_task.ts',
        ],
    },
})
export class AppKernel {}
```

## Why separate scripts?

Lockness follows the **Dependency Inversion Principle**. While the framework
provides the orchestration engine, application-specific tasks (like building
search registries or syncing project docs) should remain in your project
scripts. This keeps the core framework clean and distribution-agnostic.

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
