# @lockness/features

Feature flags for Lockness — progressive rollout and A/B, with per-scope
resolution, a deterministic percentage rollout, and a pluggable override store.
Zero dependencies.

```ts
import { configureFeatures, features } from '@lockness/features'

configureFeatures({
    flags: {
        beta: true, // on for everyone
        'new-ui': { rollout: 25 }, // 25% — deterministic per scope
        'gpu-path': (scope) => isInternal(scope), // custom resolver
    },
})

if (await features().active('new-ui', user)) {
    // …stable for this user across requests
}

// Progressive rollout / overrides:
await features().activate('new-ui', user) // force on for this scope
await features().deactivate('beta') // force off globally
```

Resolution order: an **override** wins, then the **definition**, then the
default (**off**). Resolution is **fail-closed** — a throwing resolver or a
failing store resolves to `off`, never open.

## Not an authorization boundary

Flags are a rollout/config mechanism. For a flag that gates access or
entitlement, pass a **server-verified** scope (your authenticated user/tenant),
never a raw header/cookie/param — otherwise a caller can choose a scope on the
"on" side.

## Scaffold

```bash
deno task cli make:flag new-ui
```

A missing or malformed name writes nothing, prints one `❌` line and exits `1`.

## Upgrading to v0.5.0

One item. **Migration step:** if your code imports `handleMakeFlag`, run
`make:flag` through the CLI instead.

### 1. `handleMakeFlag` is no longer exported, and `make:flag` fails non-zero

`handleMakeFlag`, the handler behind `make:flag`, was exported from
`@lockness/features`. On a missing or malformed name it printed `❌` itself and
returned `undefined`, so `make:flag` exited `0` on a failure (#436). It is now
internal: it throws a failure the CLI prints once, and `make:flag` exits `1`.
`registerFeaturesCommands` is still exported and is the way to add the command
to a `Cli`; code that called `handleMakeFlag` directly can dispatch the command
instead (`await cli.dispatch(['make:flag', 'new-ui'])` returns the exit status).
