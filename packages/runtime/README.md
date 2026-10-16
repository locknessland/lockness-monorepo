# `@lockness/runtime`

What differs between Deno, Bun and Node, decided once for
[Lockness](https://lockness.land): which runtime the process runs on, the
command line that starts a script or an npm bin there, and how to subscribe to a
shutdown signal.

Framework packages use it so that no other code tests the runtime itself. An app
rarely needs it directly.

Runs on Deno ≥ 2.2, Bun ≥ 1.4 and Node ≥ 24.

## Which runtime

```ts
import { currentRuntime } from '@lockness/runtime/runtime'

currentRuntime() // 'deno' | 'bun' | 'node'
```

Detected once, on first use, from `process.versions`. A process that is none of
the three, or a Bun older than 1.4.0, gets an `UnsupportedRuntimeError` rather
than an answer: Bun before 1.3.10 silently ignores TC39 decorators, which would
look like working and be wrong.

## Starting a process

```ts
import { spawn } from 'node:child_process'
import process from 'node:process'
import {
    binInvocation,
    resolveBinEntry,
    scriptInvocation,
} from '@lockness/runtime/process'

const dev = scriptInvocation('main.ts', { watch: true, allowAll: true })
spawn(dev.command, dev.args, { stdio: 'inherit' })

const entry = await resolveBinEntry(process.cwd(), 'drizzle-kit')
const kit = binInvocation(entry, { allowAll: true, args: ['migrate'] })
spawn(kit.command, kit.args, { stdio: 'inherit' })
```

An invocation is a command and its arguments, meant for `spawn` **without a
shell**. What it contains, per runtime:

|                       | Deno                | Bun            | Node                                    |
| :-------------------- | :------------------ | :------------- | :-------------------------------------- |
| Script                | `deno run <script>` | `bun <script>` | `node <script>`                         |
| `allowAll`            | `-A`                | —              | —                                       |
| `watch`               | `--watch`           | `--watch`      | `--watch`                               |
| `.ts` / `.tsx` script | —                   | —              | `--import=@lockness/transform/register` |
| npm bin               | `deno run <entry>`  | `bun <entry>`  | `node <entry>`                          |

The current runtime runs under its own executable (`process.execPath`); pass
`runtime: 'node'` (or `'deno'`, `'bun'`) to build the command for another one,
found on `PATH`. A bin runs as the JavaScript file its `package.json` names,
never through a `node_modules/.bin` shim. A Node child keeps only the parent's
`--conditions`, `--enable-source-maps` and transform `--import` flags; any
`--inspect*` flag is dropped, so a child never opens a second debugger port.

## Shutdown signals

```ts
import { onSignal } from '@lockness/runtime/signals'

const off = onSignal('SIGTERM', () => server.close())
// later
off()
```

`SIGINT`, `SIGTERM` and `SIGHUP`. Installing a listener replaces the runtime's
default exit on that signal, so your listener must end the process. A signal the
platform will not bind (`SIGTERM` on Windows) throws, and you decide whether
that matters.

## License

MIT
