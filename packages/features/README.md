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
