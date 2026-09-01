# Plan: Framework-wide shutdown lifecycle for `@lockness/core`

**Branch**: `004-shutdown-lifecycle` | **Date**: 2026-09-01 | **Backlog item**:
[#129 — Add a framework-wide shutdown lifecycle to @lockness/core: @OnShutdown, signal wiring and ordered teardown](https://github.com/locknessland/lockness-monorepo/issues/129)

**This is the feature's one planning document.**

---

## 1. Why this exists

`@lockness/core` has **no shutdown lifecycle at all**. Verified on this tree, not quoted from the
issue:

```
grep -rn "shutdown" packages/core --include='*.ts' | grep -v tests
  packages/core/app.ts:491         *  @example Graceful shutdown
  packages/core/app.ts:497         *      server.shutdown()
  packages/core/http/server.ts:53  *  // Graceful shutdown
  packages/core/http/server.ts:54  *  Deno.addSignalListener('SIGINT', () => server.shutdown())
```

Four hits, **all four inside JSDoc comments**. There is no `@OnShutdown`, no signal wiring, no
teardown counterpart to the 15 bootstrap steps in `kernel/bootstrap/registry.ts`, and
`docs/lifecycle-events.md` documents boot / request / response with no shutdown section. The
framework's entire answer to "how do I exit cleanly" is a comment telling the author to write
`Deno.addSignalListener` themselves.

Every package that holds a resource needs this, which is why it is framework-wide:

| Package | What leaks today | Where |
| :--- | :--- | :--- |
| `@lockness/scheduler` | cron timers | `scheduler.ts:307` — `stop()` exists, and **`grep -rn '\.stop()' packages/core` finds one caller: a test** |
| `@lockness/queue` | the worker loop | `queue/mod.ts:426` |
| `@lockness/sse` | heartbeat `setInterval`s | `sse/channel.ts:349` |
| `@lockness/session` | Deno KV / Redis handles | `session/drivers/deno_kv.ts:70`, `redis.ts:148` |

The scheduler is the sharpest case and it is **new**: it shipped with a working `stop()` that
nothing in the framework ever calls.

## 2. User scenarios

### US1 — An author gets a clean exit without writing signal code (P1)

**Given** an application booted with `createApp(AppKernel)` and `app.listen(8888)`
**When** the operator presses Ctrl-C, or an orchestrator sends `SIGTERM`
**Then** the HTTP server stops accepting, every registered teardown runs in a defined order, and the
process exits — with no `Deno.addSignalListener` anywhere in the author's code.

### US2 — A package hands the framework its teardown (P1)

**Given** a package that holds a resource (a timer, a socket, a KV handle)
**When** its bootstrap step registers a teardown with the app
**Then** that teardown runs at shutdown, at a priority that puts it in the right place relative to
the author's own hooks — and the package never touches a signal handler.

### US3 — A failing teardown does not strand the rest (P2)

**Given** four registered shutdown hooks where the second throws
**When** shutdown runs
**Then** all four are attempted, the failure is reported with the hook's name, and the process still
exits.

### US4 — Shutdown is bounded (P2)

**Given** an application holding an open SSE response
**When** shutdown starts
**Then** it completes within a bounded time and the process exits, rather than waiting forever on a
stream that will never close.

### Edge cases

| Case | Expected |
| :--- | :--- |
| Ctrl-C pressed twice | The second signal exits immediately. No second teardown. |
| `app.shutdown()` called by the author *and* a signal arrives | One teardown. Both callers observe the same result. |
| The platform refuses a signal (`SIGTERM` is unsupported on Windows) | A warning; the other signal still installs; boot is not failed. |
| `shutdown()` before `listen()` | Hooks run; there is no server to stop. Not an error. |
| A hook registered *during* shutdown | Refused, with a warning. The list is frozen once the sequence starts. |
| An app that never calls `listen()` (test / `app.fetch` use) | No signal handlers installed, no behaviour change. |

## 3. Requirements

| # | Requirement |
| :--- | :--- |
| **FR-001** | `@OnShutdown({ priority })` decorates a kernel method, mirroring `@OnBoot`. Applied to a non-method it throws, with the same message shape. |
| **FR-002** | `getShutdownHooks(kernelOrClass)` returns the registered hook metadata, mirroring `getBootHooks`. |
| **FR-003** | `App.onShutdown(name, fn, priority?)` registers a teardown imperatively. This list is the **only** thing shutdown traverses; the decorator is one way into it, not a second list. |
| **FR-004** | Hooks run in **ascending** priority — the exact reverse of `@OnBoot`'s descending. Equal priorities keep registration order. |
| **FR-005** | `App.shutdown()` is idempotent. N calls produce one teardown; every caller resolves with the same report. |
| **FR-006** | `shutdown()` stops the HTTP server **before** running any hook, so no request can arrive against a torn-down resource. |
| **FR-007** | A hook that throws is caught, reported by name, and the remaining hooks still run. The catch logs — never swallows (constitution: no silent catches). |
| **FR-008** | The whole sequence — server drain **and** hooks — is bounded by one deadline. On expiry the remainder is abandoned, and that fact is reported. |
| **FR-009** | `App.listen()` installs `SIGINT` and `SIGTERM` handlers by default. `@Kernel({ shutdown: { signals: false } })` opts out. |
| **FR-010** | A signal the platform refuses degrades to a warning. The remaining signals still install and boot continues. |
| **FR-011** | The signal path exits the process: `0` when everything ran clean, `1` when a hook failed or the deadline expired. |
| **FR-012** | A second signal while shutdown is in flight exits immediately, without waiting. |
| **FR-013** | A bootstrap step moves the kernel's `@OnShutdown` metadata into the app's registry, mirroring `steps/boot_hooks.ts`. |
| **FR-014** | `docs/lifecycle-events.md` gains a shutdown section: the decorator, the signal wiring, the ordering rule, and the guarantees **and non-guarantees** an author may rely on. The non-guarantees are named, not left implied: (a) an existing hand-written signal handler now runs **concurrently** and may be cut short by the framework's exit — remove it or set `signals: false` (R3, the only way an upgrade can harm an existing app, so it is an **upgrade note**, not a footnote); (b) `App.shutdown()` is a process-lifecycle API — never expose it from a route handler, middleware or devtools panel, since it terminates the process for every caller with no authorization of its own (S6); (c) a programmatic `await app.shutdown()` **abandons** a hung hook, it does not cancel it — only the signal path guarantees termination (invariant 4); (d) a hook's error message is logged, so do not put a credential in one (S3); (e) a failure inside `listen()` itself exits before hooks are reachable (invariant 3). |
| **FR-015** | JSDoc with `@example` on every newly exported symbol; every one exported through `kernel/mod.ts` **and** `packages/core/mod.ts`. Enumerated by search over the new files' `export` statements, not by example. |
| **FR-016** | **Shutdown itself** adds no permission requirement — measured on Deno 2.9.6 with zero flags: `Deno.build.os`, `addSignalListener` (`SIGINT`/`SIGTERM`/`SIGHUP`/`SIGQUIT`) and `Deno.exit` all succeed. It does **not** follow that `listen()` needs none: `http/server.ts:61` calls `displayBanner()`, which reads `DENO_ENV`/`APP_ENV` unguarded at `:79`, so `listen()` already requires `--allow-env` — unchanged by this feature, and stated here so nobody hardens a compiled binary on the strength of the first sentence. No code on the shutdown or signal-install path may call `Deno.env.get` without the guard used at `steps/events_debug.ts:56-61`, and the deadline default is a literal constant, never an env read. |
| **FR-023** | `@OnBoot`'s initialiser moves from the truthiness test at `decorators.ts:196` to the same `Object.hasOwn` own-property test `@OnShutdown` uses, so a subclass no longer writes into its parent's hook array (R7). Ships as its own `fix:` commit. Regression test pins the measured case: `new Base()` then `new Child()` must leave `getBootHooks(Base)` as `['common']`, not `['common','extra']`. |
| **FR-021** | `deadlineMs` is validated at boot against a **named literal default of `10_000` ms** (Q1, 2026-09-01), rejecting anything that is not a finite integer in `[1, 2**31-1]` — loudly, the way `steps/events_debug.ts:74` and `steps/scheduler.ts:92` reject an unrecognised env value. Measured cause: Deno clamps `-1`, `NaN`, `Infinity` and `2**31` to **1 ms** with a warning, and `undefined`/`0` fire in 3–13 ms. Without this, `deadlineMs: Infinity` written to mean "never time out" produces the shortest possible deadline, silently. |
| **FR-022** | Every hook name and every rendered error passes through `safeForLog` from `@lockness/contract` (re-exported by core — no new workspace edge). An error is rendered as `error.name` plus a **truncated** `safeForLog(error.message)` — never the whole object, never the stack, because `console.error('...', error)` prints both. Reason, not theory: `packages/session/drivers/redis.ts:104` throws a Redis server's reply verbatim on the path `close()` takes. |
| **FR-018** | The shutdown sequence emits **`KernelTerminating`** — the event that already ships at `packages/events/kernel_events.ts:218`, is re-exported at `packages/core/mod.ts:72`, is documented as "emitted when the application is shutting down", and has **zero emitters**. Emitted after the server stops and before the hooks run, so a listener sees the same ordering position a hook at priority 0 would. Not a new name: the invented `KernelShuttingDown` in §12 was a mistake. |
| **FR-019** | The two teardowns **core itself owns** are registered by their own bootstrap steps: `steps/database.ts` (which calls `db.connect()` at `:52` — verified, 0 `close()` callers in non-test core) and `steps/scheduler.ts` (whose `scheduler().stop()` has exactly one caller repo-wide, a test). Both are core files, so this is core wiring, not the consumer-package migration #129 defers. This is what makes SC-005 reachable. |
| **FR-020** | Shutdown priorities for framework-registered teardowns come from a named band declared once in `shutdown_registry.ts`. **A `BootstrapStep.order` value is never reused as a shutdown priority** — the two axes are numerically similar and semantically unrelated. |
| **FR-017** | Every document **and JSDoc block** that claims the framework has no shutdown lifecycle, or teaches the manual wiring, is corrected in this change. This is a **correctness** requirement, not tidiness: R3 measures that the framework's exit truncates the very handler `packages/scheduler/docs/DOCS.md:336-345` tells authors to write, so leaving that block published ships a documented pattern the framework now breaks. Also covers `packages/core/app.ts:491-499` and `packages/core/http/server.ts:53-54`, the two `@example Graceful shutdown` blocks §1 cites as evidence the feature is missing. Enumerated by search, not by example: `grep -rn "addSignalListener" docs/ packages/*/docs/ packages/*/README.md packages/init/stubs/` and `grep -rni "shutdown lifecycle" --include='*.md'`. Today that search returns exactly one file — `packages/scheduler/docs/DOCS.md:336-348`, which both teaches the manual block **and** states "Lockness has no framework-wide shutdown lifecycle yet". Its snippet also uses the unbounded `await server.shutdown()` that R2 measured as hanging. |

## 4. Success criteria

| # | Criterion |
| :--- | :--- |
| **SC-001** | An author deletes their hand-written `Deno.addSignalListener` block and Ctrl-C still exits cleanly. |
| **SC-002** | An application holding an open SSE response exits on Ctrl-C within the deadline, instead of hanging. |
| **SC-003** | With the second of four hooks throwing, all four are attempted and the failure names the hook. |
| **SC-004** | Ten signals in rapid succession produce exactly one teardown. |
| **SC-005** | A scheduled task's timer is released at exit — the test sanitizer reports no leak. |
| **SC-006** | An application that does not call `listen()` behaves exactly as it does today. Holds **by measurement**: no test calls `listen()`, so all 40 `new App()` test sites are untouched. |
| **SC-007** | `deadlineMs: Infinity` **fails boot** rather than silently becoming a 1 ms deadline. |
| **SC-008** | A hook named `"a\nFAKE LOG LINE"` produces one log line, not two — mirroring `packages/contract/tests/log_sanitize.test.ts`. |
| **SC-009** | An application with a pre-existing `SIGINT` handler and `shutdown: { signals: false }` behaves exactly as it does today. |
| **SC-010** | A listener on `KernelTerminating` fires — the event has shipped with zero emitters since it was written. |

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **There is exactly ONE list of teardowns** — the decorator, the bootstrap step and any package all register into it; nothing else is traversed at shutdown | `packages/core/kernel/shutdown_registry.ts` — the registry instance owned by `App` | A separate `KERNEL_SHUTDOWN_HOOKS` traversal inside `App.shutdown()` (the way `createApp` reads `KERNEL_BOOT_HOOKS` directly today, `loader.ts:141`); a per-package teardown list; a second array for "framework" vs "user" hooks |
| **Each kernel class owns its own hook metadata** — a subclass never writes into its parent's array | `packages/core/kernel/decorators.ts` — the `Object.hasOwn` test in `@OnShutdown`'s initialiser | The truthiness test `@OnBoot` uses today (`decorators.ts:196`), which reads through the prototype chain — see R7 |
| **"The app is shutting down"** — asked once, answered once, however many callers ask | `packages/core/app.ts` — the memoised promise inside `App.shutdown()` | A `#stopping` guard in the SIGINT handler; a second one in the SIGTERM handler; a `#stopped` flag inside the registry |
| **Teardown order** — ascending priority, the reverse of `@OnBoot` | `packages/core/kernel/shutdown_registry.ts` — the comparator | A `.sort()` inside `App.shutdown()`; a re-sort in the bootstrap step; a doc sentence naming the opposite direction |
| **A failing hook does not stop the ones after it** | `packages/core/kernel/shutdown_registry.ts` — `run()`'s per-hook `try/catch` | A `try/catch` wrapped around each registration site; a second catch in `App.shutdown()`; a bare `.catch(() => {})` in the signal handler |
| **Shutdown is bounded in time** | `packages/core/kernel/shutdown_sequence.ts` — one deadline raced against the whole sequence | A per-hook timeout in the registry; a second `setTimeout` in the signal handler; a drain timer inside `ServerListener`; a separate bound on the `KernelTerminating` announce that draws from the same budget rather than a share of it |

> **Corrected after review.** This row first named `packages/core/app.ts`, which
> contradicted §6's file table once A8 moved the deadline into
> `ShutdownSequence`. Two parts of a binding document disagreeing is worse than
> either answer, and the code followed §6. The home is the sequence.
| **The server stops accepting before any resource is torn down** | `packages/core/app.ts` — `shutdown()` awaits the server before touching the registry | A reserved priority constant for "the server" inside the registry; a `server.shutdown()` call in the signal handler |
| **Which signals mean shutdown, and that the process exits afterwards** | `packages/core/kernel/signals.ts` | A `Deno.exit` inside `App.shutdown()`; a second `addSignalListener` in the `init` stubs or `main.ts` |
| **A signal the platform refuses degrades, it does not fail boot** | `packages/core/kernel/signals.ts` — `try/catch` per signal | A `Deno.build.os === 'windows'` branch anywhere else |
| **What the framework claims about its own shutdown story** | `docs/lifecycle-events.md` — the shutdown section | A second narrative in `packages/scheduler/docs/DOCS.md`; a third in the `@lockness/init` stub comments; a fourth in `packages/core/app.ts`'s `@example Graceful shutdown` JSDoc, which still teaches the hand-written block |
| **Is a sequence already in flight?** (FR-012's second signal) | `packages/core/kernel/shutdown_sequence.ts` — a read-only `isShuttingDown`, backed by the same memoised promise as row 3. `signals.ts` **asks** it; it does not decide. | A `#stopping` boolean in the SIGINT handler and another in the SIGTERM handler — the shape row 3 forbids but, before this row existed, left no alternative |
| **Whether the signal wiring is on at all** (FR-009's opt-out) | `packages/core/kernel/kernel_decorators.ts` — the `ShutdownConfig.signals` field, defaulting to on | A second `if (config.shutdown?.signals !== false)` inside `listen()` as well as inside `signals.ts`; an env variable that also turns it off |
| **How a report becomes an exit code** (FR-011) | `packages/core/kernel/signals.ts` | A `process.exitCode` set inside the sequence; a second mapping in the `@lockness/init` `main.ts` stub |
| **What number a framework teardown registers at** (FR-020) | `packages/core/kernel/shutdown_registry.ts` — the `SHUTDOWN_PRIORITY` band | Reusing a `BootstrapStep.order` value because it is the number already in that file. `steps/database.ts` is order **100**; under ascending priority, 100 closes the database **first**. The two axes are numerically similar and semantically unrelated. |
| **How a shutdown report is encoded for a log line** (FR-022) | `packages/contract/logging/sanitize.ts` — `safeForLog`, already the repo's one encoder | A local escape helper in `shutdown_registry.ts`; a `JSON.stringify` at the call site; a bare `console.error('...', error)`, which prints the whole object and its stack |
| **What a valid `deadlineMs` is** (FR-021) | `packages/core/kernel/shutdown_sequence.ts` — one validator, at boot | A `?? DEFAULT` at the `setTimeout` call site *and* a range check elsewhere; relying on TypeScript, whose types are erased before this value arrives from JSON or an env read |

**Note on the last row.** The guard is a `try/catch` around each registration, **not** a platform
check. A platform check encodes a belief about which signals each OS supports; the `try/catch` is
correct whether or not that belief is right, and it stays correct when Deno's list changes.

**Deliberate asymmetry with boot, and why.** `boot_runner.ts` exports both `getBootHooks` and
`runBootHooks`. Shutdown exports **`getShutdownHooks` only**. There is exactly one thing that runs
teardown — `App.shutdown()` — because it is the only thing that can also stop the server, honour the
deadline and dedupe concurrent callers. A public `runShutdownHooks` would be a second runner that
does none of those, which is the two-deciders defect this table exists to prevent.

## 6. Technical context

**Language/Version**: TypeScript on Deno 2.9.6, TC39 Stage 3 decorators.
**Primary Dependencies**: none new. `@lockness/core` only; no new workspace edge.
**Storage**: N/A.
**Testing**: `Deno.test`, plus **subprocess tests** for signal delivery — a real `SIGINT` cannot be
observed in-process without hijacking the runner's own handler. The technique already exists in this
repo at `packages/core/tests/events_debug_step.test.ts:53`, which spawns a `Deno.Command` to observe
a permission failure that is equally unfakeable in-process.
**Target Platform**: Deno server, all OSes. Windows is where the signal list differs.
**Project Type**: framework library.
**Constraints**: no new permission (FR-016, measured); no new dependency; `listen()`'s return type
and value unchanged.
**Scale/Scope**: 5 new files, **8 edited** source files, 2 docs. The "3 edited" this section first
claimed understated it by 2.7× (A6), and `tasks.md` derives from this number, so it is enumerated
rather than estimated:

| New | Edited |
| :--- | :--- |
| `kernel/shutdown_decorators.ts` (A7 — not appended to `decorators.ts`) | `app.ts` — `onShutdown` / `shutdown` delegating to the sequence |
| `kernel/shutdown_registry.ts` — the list, the comparator, `SHUTDOWN_PRIORITY` | `kernel/kernel_decorators.ts:115` — `KernelConfig` has no `shutdown` key |
| `kernel/shutdown_sequence.ts` (A8 — server + deadline + memoisation) | `kernel/bootstrap/types.ts:77` — a `shutdownHooks` field beside `bootHooks` |
| `kernel/signals.ts` | `kernel/loader.ts:138-149` — read the metadata, mirroring `bootHooks` |
| `kernel/bootstrap/steps/shutdown_hooks.ts` | `kernel/bootstrap/registry.ts:47-87` — the array **and** the order-list JSDoc above it |
| | `kernel/mod.ts:15-39`, `packages/core/mod.ts:96-119` — the export blocks |
| | `steps/database.ts`, `steps/scheduler.ts` — FR-019's two core-owned teardowns |

### Domain model

No new entities — this is process lifecycle, not a bounded context with identity.

- **Vocabulary**: a **hook** is one registered teardown. **Priority** orders hooks. The **sequence**
  is server-stop followed by all hooks. The **deadline** bounds the sequence. A **report** is what
  the sequence produced.
- **Value objects**: `ShutdownHookMeta { method, priority }` (mirrors `BootHookMeta`);
  `ShutdownReport { ran, failed[], timedOut }`.
- **Invariants**:
  1. The sequence runs at most once per `App`.
  2. The registry is frozen once the sequence starts.
  3. Every registered hook is either attempted or reported as abandoned. Silence about a hook is a
     defect — **with one stated exception**: a failure inside `listen()` itself exits before hooks
     are reachable. `packages/core/http/server.ts:158` already calls `Deno.exit(1)` on an
     unresolvable port conflict, at a point where bootstrap has completed all 15 steps and the
     scheduler, database and session store are live. That path is pre-existing and out of scope to
     fix; an invariant that is quietly untrue in one known case gets trusted in the others, so it is
     written down rather than left to be discovered (S7, A14).
  4. **Abandoned is not cancelled.** The deadline stops the sequence *waiting*; it cannot stop a hung
     hook running. On the signal path the process exits regardless, so this is invisible. On a
     programmatic `await app.shutdown()` there is no exit, so a hung hook keeps running in a live,
     half-torn-down process — which a liveness probe reads as a hung container. A non-guarantee, and
     FR-014 states it.

### Measured behaviour this design rests on

Three probes, run against Deno 2.9.6 before the design was fixed. Each one changed it:

| Probe | Result | What it decided |
| :--- | :--- | :--- |
| `Deno.addSignalListener` with no flags | Succeeds for `SIGINT` and `SIGTERM` | FR-016. Unlike `Deno.env.get`, this needs no permission guard — the trap that cost the events feature a boot failure does not repeat here. |
| Register a `SIGINT` handler, then raise `SIGINT` | Handler ran; **process stayed alive**; default exit suppressed | FR-011 and FR-012. Installing a handler *removes* Deno's kill-on-Ctrl-C. Without an explicit exit this feature turns a working Ctrl-C into a hang. |
| `server.shutdown()` with one open `text/event-stream` response | **Did not resolve** within a 2 s probe | FR-008. `@lockness/sse` exists in this repo and holds responses open by design, so an unbounded drain hangs forever in exactly the apps most likely to use it. |

The last two are why the deadline is a **safety requirement rather than a convenience**: without it,
shipping this feature is a regression for any streaming application.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | No new import; `app.ts` already holds its Hono instances. |
| JSR-only specifiers | pass | No new dependency at all. |
| No `any` in exported APIs | pass | `ShutdownHook = () => void \| Promise<void>`; the report is a typed record. `loader.ts` has pre-existing `as any` casts — this feature adds none, and does not fix them (out of scope). |
| Tailwind v4 syntax | pass | No UI surface. |
| Pre-completion gate | pass | `deno fmt && deno lint && deno check && deno task test` before done. |
| Never edit `deno.lock` | pass | No dependency change. |
| JSDoc on public APIs | pass | FR-015. |
| MVC layering | pass | Kernel/infrastructure layer only; no controller, service or model touched. |
| Commit discipline | pass | `feat` (mechanism), `test`, `docs` split. |
| TDD | pass | Each FR gets its failing test first. |
| No silent catches | pass | Both catches — the per-hook one (FR-007) and the per-signal one (FR-010) — log at ERROR/WARN. |

### Complexity tracking

No violations.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/core` public API | **yes** | New: `OnShutdown`, `OnShutdownOptions`, `ShutdownHookMeta`, `getShutdownHooks`, `ShutdownReport`, `App.onShutdown`, `App.shutdown`. All additive. |
| `App.listen()` runtime behaviour | **yes** | Installs signal handlers by default. Return type and value unchanged. **The one behaviour change in this feature** — see R3. |
| `@Kernel()` config | **yes** | New optional `shutdown?: { signals?: boolean; deadlineMs?: number }`. |
| Bootstrap step registry | **yes** | One new step, `shutdown_hooks`, order 320. |
| `@lockness/scheduler`, `queue`, `sse`, `session`, `cache` | **no** | Migrating them is explicitly out of scope (#129) — each is a follow-up. This feature builds the socket they plug into. |
| Front-end / UX-UI | **no** | This feature has no front-end surface. |
| CLI / `nessy` | **no** | |
| `@lockness/devtools` | **no** | Out of scope per #129. |

### Documentation (this feature)

```text
.specnaut/specs/004-shutdown-lifecycle/
├── plan.md    # This file
└── tasks.md   # derived from THIS file once approved
```

## 9. Risks

| # | Risk | Mitigation |
| :--- | :--- | :--- |
| **R1** | Installing a SIGINT handler suppresses Deno's default exit (**measured**). Any path that fails to exit turns a working Ctrl-C into a hang. | FR-011 (always exit), FR-012 (second signal hard-exits), FR-008 (deadline). Proven by a subprocess test that sends a real signal and asserts the process died. |
| **R2** | `server.shutdown()` never resolves against an open stream (**measured**). | FR-008 — the deadline races the **whole** sequence, not just the hooks. |
| **R3** | FR-009 changes Ctrl-C behaviour for every existing application, including ones that already wired their own handler. **This is the one direction in which the feature is a regression**; in every other direction it is a strict improvement on today's instant kill. | **The original mitigation here was false and is withdrawn.** It read: "An author's own handler still runs — `addSignalListener` is additive, not exclusive." Additive describes *registration*, not *completion*: both handlers run concurrently and the first to reach `Deno.exit` severs the other. Measured, with an author handler awaiting 200 ms and a framework handler exiting after 10 ms — `AUTHOR_HANDLER_COMPLETED` never printed. Found independently by both audit seats. Real mitigation: (1) `@Kernel({ shutdown: { signals: false } })` preserves today's behaviour exactly; (2) FR-017 rewrites the docs that teach the truncated pattern — it is *our own* `packages/scheduler/docs/DOCS.md:336-345`; (3) FR-014 carries it as a named upgrade note, since it is the only way an existing application can be harmed. Same mechanism fires on FR-012's second signal, and supervisors double-deliver in practice (a `preStop` hook plus `SIGTERM`), so this is not only a doubled Ctrl-C. |
| **R4** | `listen()` currently retains nothing. `shutdown()` must reach the server. | `App` stores it. Non-breaking: the return value is unchanged. |
| **R5** | **`listen()` does not return a server — it returns a Promise cast to one.** `ServerListener.listen` ends in `return this.tryServe(...) as unknown as Deno.HttpServer<Deno.NetAddr>`, and `tryServe` is `async` (`http/server.ts:60-67`). So `App.#server` will hold a Promise wearing a server's type, and `#server.shutdown()` would be `undefined is not a function`. | `App` stores the value as `Promise<Deno.HttpServer> \| undefined` internally and `await`s it before calling `shutdown()`. **The existing public cast is left alone** — correcting it is a breaking signature change and belongs in its own item. Recorded here so the next reader does not rediscover it the hard way. |
| **R6** | A hook registered after the sequence starts would silently never run. | Invariant 2: the registry is frozen at start; a late registration warns. |
| **R7** | **`@OnBoot`'s metadata leaks from a subclass into its parent, and #129 asks `@OnShutdown` to mirror `@OnBoot`.** Cause: `decorators.ts:196` tests `if (!constructor[KERNEL_BOOT_HOOKS])`, a truthiness test that reads **through the prototype chain**. When the parent already owns an array, the subclass finds it and pushes into it. Measured, and the trigger is **instantiation order**, not inheritance alone: <br>• `new Base()` then `new Child()` → `getBootHooks(Base)` is `['common','extra']` — the parent has absorbed the child's hook, and the two classes share one array object. <br>• `new Child()` then `new Base()` → `getBootHooks(Base)` is `['common']` — correct. <br>Sibling classes do **not** contaminate each other; I asserted they would and disproved it. So the blast radius is narrow — a base kernel instantiated before a subclass — but in teardown that means a resource closed twice. | `@OnShutdown` uses `Object.hasOwn(constructor, KERNEL_SHUTDOWN_HOOKS)` — an own-property test, immune to instantiation order. Whether `@OnBoot` itself is fixed in the same change is **Q3** at the stop: it is a real bug, but changing boot behaviour is not what #129 asked for. |

## 10. Architecture audit

`architect-expert`, on this plan, before any code. **Verdict: fail** — 5 HIGH, 6 MEDIUM, 3 LOW.
Two findings refuted claims this plan asserted, and I re-measured both myself rather than relaying
them.

**Note on numbering:** the seat audited the plan as dispatched (FR-001…FR-016, seven decision rows).
FR-017 and two rows were added while it worked, so a few "no row" verdicts below were already
addressed before it reported. Those are marked *already fixed*.

### Findings, and what was done with each

| # | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| A1 | HIGH | **R3's mitigation is false.** "An author's own handler still runs — `addSignalListener` is additive" is true of *registration* and false of *completion*: the first handler to call `Deno.exit` truncates the others. | **Plan changed.** I re-ran the probe independently: with an author handler awaiting 200 ms and a framework handler exiting after 10 ms, `AUTHOR_HANDLER_COMPLETED` never printed. R3 rewritten; FR-017 promoted from tidiness to correctness, because `packages/scheduler/docs/DOCS.md:336-345` ships exactly the handler this truncates. |
| A2 | HIGH | **No rule maps `BootstrapStep.order` (asc, 10→600) onto shutdown `priority` (asc).** US2/FR-013 make framework teardowns register *from step files*, so an implementer writes the number already in that file — and `database` order 100 becomes shutdown priority 100, which under ascending closes the database **first**. | **Plan changed.** New decision row + `SHUTDOWN_PRIORITY` named band in `shutdown_registry.ts`, and an explicit rule that a step's `order` is never reused as a shutdown priority. |
| A3 | HIGH | **`KernelTerminating` already exists and nothing emits it.** `packages/events/kernel_events.ts:218`, re-exported at `packages/core/mod.ts:72`, documented with a `closeConnections` listener example — zero emitters repo-wide. §12 declined to add an event under an *invented* name (`KernelShuttingDown`) on the premise that `@lockness/events` is optional. | **Plan changed; my premise was wrong.** Verified: `packages/core/deno.json:29` declares it a hard dependency and `mod.ts:84` statically re-exports ~39 of its symbols. The `tryImportOptionalPackage` call in `steps/events.ts` is defensive, not evidence of optionality. New **FR-018** emits the event that already ships. |
| A4 | HIGH | **FR-012 had no row**, and row 1 forbids its obvious implementation (`#stopping` guards in the handlers) without offering a replacement. | **Plan changed.** `App` exposes a read-only `isShuttingDown`; `signals.ts` *asks* it. Two askers is fine; two deciders is the defect. |
| A5 | HIGH | **SC-005 is backed by no FR** and contradicted by §8's "scheduler untouched". As written it cannot pass. | **Plan changed.** New **FR-019**. The seat is right that this is inside the boundary: `steps/scheduler.ts` is a *core* file, and wiring core's own step is not "migrating the consumer package" — it is the same kind of wiring the reporter already does there. |
| A6 | MEDIUM | **§8's "3 edited" understates the real set of 8 source files**, and `tasks.md` derives from it. | **Plan changed** — §8 now enumerates all 8. |
| A7 | MEDIUM | `@OnShutdown` into `kernel/decorators.ts` doubles a file whose `@fileoverview` scopes it to boot; `kernel_decorators.ts` is the package's own precedent for splitting. | **Accepted** — `kernel/shutdown_decorators.ts`. |
| A8 | MEDIUM | **`App` gains a fifth responsibility** on top of 540 lines and nine collaborators; the field/method partition is clean now and expensive to extract later. | **Accepted** — a `ShutdownSequence` owns server + deadline + memoisation + registry; `App.shutdown()` delegates. |
| A9 | MEDIUM | **FR-013's named template contains the duplication FR-004's row forbids**: `steps/boot_hooks.ts:34-37` re-sorts what `boot_runner.ts:131` already sorted. | **Verified true** (both are `b.priority - a.priority`). Row 2's third column now names the template file explicitly, so copying it is a visible violation. |
| A10 | MEDIUM | **`packages/core/app.ts:23-27` declares a local `Deno` shim exposing only `env.get`** — so any `Deno.addSignalListener` / `Deno.exit` in `app.ts` fails `deno check`. | **Verified true**, and recorded. This makes `kernel/signals.ts` *mandatory* rather than stylistic — the plan already chose it, but for a weaker reason. |
| A11 | MEDIUM | **`steps/database.ts:52` opens a connection nothing in core closes.** §1's leak table lists four *other* packages and omits the one core opens itself. | **Verified true** — 0 `close()`/`disconnect` callers in non-test core. Folded into **FR-019**. The best demonstration of US2 the feature could ship. |
| A12 | LOW | `shutdown?: {...}` inline where `DatabaseConfig` / `SessionConfig` / `CacheConfig` are named exported interfaces. | **Accepted** — `ShutdownConfig`, exported. |
| A13 | LOW | ~30 JSDoc/Markdown `app.listen(` examples go stale, including the two §1 cites as proof the feature is missing. | **Accepted** — FR-017 widened from `.md` files to JSDoc blocks. |
| A14 | LOW | `packages/core/http/server.ts:158` calls `Deno.exit(1)` inside the promise `App` will hold, contradicting row 6's "single home for process exit". | **Recorded in R5.** Not fixed here — it is a pre-existing path and correcting it is a separate item. |

### What the seat cleared, and what that covers

FR-004's ascending choice is correct **for the decorator axis** (checked against both existing
comparators). §12's rejection of a public `runShutdownHooks` is sound. Row 7's `try/catch`-per-signal
over a platform check is right. SC-006 holds *by measurement* — no test calls `listen()`, so all 40
`new App()` test sites are untouched.

**Blast radius, counted independently by the seat and by me — the numbers agree:** 2 executable
`app.listen(` sites (`main.ts:7`, `packages/init/stubs/init/main.ts.stub:7`), ~30 more in
documentation; 23 `@Kernel({` sites, none forced to change; 41 `new App()` of which 40 are tests and
1 is `steps/app_init.ts:29`.

**Not covered by the seat:** `@lockness/queue` / `sse` / `session` internal teardown surfaces; the
subprocess-test technique; whether `Deno.serve` installs signal handling of its own.

## 11. Security audit

`security-expert`, on this plan, before any code. **Verdict: needs_followup** — 0 CRITICAL,
0 HIGH, 5 MEDIUM, 2 LOW. Nothing here blocks the design. Kept separate from §10 deliberately: the
architect asks whether a rule has one home, this seat asks whether that home is reachable by someone
who should not reach it.

| # | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| S1 | MEDIUM | **`deadlineMs` has no validator and no stated default**, and Deno silently clamps bad values to **1 ms**. | **Plan changed — new FR-021.** Re-measured myself: Deno 2.9.6 prints `TimeoutOverflowWarning` / `TimeoutNaNWarning` and sets the duration to 1 for `-1`, `NaN`, `Infinity` and `2**31`; `undefined` and `0` fire in 3–13 ms; `2**31-1` is honoured. So `deadlineMs: Infinity` written to mean "never time out" becomes the shortest possible deadline — the exact inverse, silently. It turns this plan's own named safety control into a no-op that then exits `1` on every shutdown, which a supervisor reads as a crash loop. |
| S2 | MEDIUM | **The report reaches a log line with no encoder.** `safeForLog` appears nowhere in the plan, repeating the omission `@lockness/events` had to fix. | **Plan changed — new FR-022 + a decision row.** The seat's evidence is specific and I verified it: `packages/session/drivers/redis.ts:104` throws `new Error(response.substring(1, response.indexOf('\r\n')))` — a Redis server's reply verbatim — and `close()` at `:148` reaches it via `sendCommand(['QUIT'])`. The `\r\n` cut stops a forged newline; nothing stops `\x1b`. `events/mod.ts:399,422` is *precisely* FR-007's shape and already encodes. |
| S3 | MEDIUM | **A teardown error can carry a credential into a log.** FR-007 never says *what of* the error is rendered, and `console.error('...', error)` prints the whole object. | **Plan changed — folded into FR-022.** Render `error.name` + truncated `safeForLog(error.message)`; never the object, never the stack. The seat deliberately downgraded this from its domain file's HIGH default and said why — it could not name a driver *in this repo* whose close-path error provably embeds a DSN. I accept the downgrade and the reasoning. |
| S4 | MEDIUM | **FR-016's "no permission requirement" is true of shutdown and false of `listen()`**, which opens with an unguarded `Deno.env.get`. | **Plan changed — FR-016 reworded.** Verified: `server.ts:61` calls `displayBanner()` first, and `:79` reads `DENO_ENV`/`APP_ENV` unguarded. So a `deno compile --allow-net` binary dies in `listen()` *before* a handler is installed. My FR-016 was true of the feature and would have misled an operator hardening a binary — the same class that cost the events feature a boot failure. |
| S5 | MEDIUM | **R3 understates the two-handler race**: additive means *concurrent*, and only one handler calls `Deno.exit`. | **Plan changed.** Independently confirmed by the architect seat and by my own probe. Both seats found this from different directions, which is why R3 is rewritten rather than annotated. |
| S6 | LOW | `App.shutdown()` becomes public with no "do not route this" guidance. | **Accepted — one sentence in FR-014.** Labelled a *suspicion*, not a finding, because the seat proved it unreachable today four ways: devtools gets a `Hono` not the `App`; `RouteProvider` is structurally `{ getRoutes() }`; the container binds no `App`; handlers get a Hono `Context` with no `app` key. |
| S7 | LOW | **Invariant 3 is already false on the port-conflict path** — `server.ts:158` exits with every resource live and no hook attempted. | **Plan changed** — invariant 3 now states its exception. Also pairs with A14. |

### Where the two seats disagreed, and who was right

The security seat listed under *what is clean*: "No `KernelBooted`-style event at shutdown avoids a
lifecycle that depends on an optional package." **That endorsement is wrong, and the architect seat
is right.** Verified directly: `packages/core/deno.json:29` declares `@lockness/events` a hard
dependency and `packages/core/mod.ts:84` statically re-exports ~39 of its symbols. The seat accepted
my §12 premise instead of checking it; the architect checked it. See A3 and FR-018 — the finding
stands, and this "clean" line does not.

### What the seat cleared, and what that covers

`try/catch` per signal over a platform check (permission model is platform-independent; only signal
*availability* is not). `signals` unset meaning **on** — the strict value, so fail-closed holds by
construction. No silent catch: FR-007 and FR-010 both log. `shutdown()` resolving rather than
rejecting. Question 4 answered **"nothing"** with its checks named: no route added, no identifier
minted, no authorization decision touched, no session/token read, no tenant boundary — the only
cross-user effect is *integrity* (a deadline expiry mid-request), not access.

The seat also extended FR-016's measurement usefully: `addSignalListener` needs no flag for `SIGINT`,
`SIGTERM`, `SIGHUP` and `SIGQUIT`; `Deno.kill` on **self** needs none while `Deno.kill` on another
pid requires `--allow-run`.

## 12. Open questions

Three, and they are **mutually independent** — no answer changes another, so they are put together
rather than in three rounds. Ordered by how much of the plan each one moves.

| # | Question | Options | Recommendation |
| :--- | :--- | :--- | :--- |
| **Q1** | **What is the deadline default?** FR-021 needs a literal, and Deno silently clamps anything invalid to 1 ms, so "whatever the author passes" is not an answer. | **10 s** — leaves headroom inside Kubernetes' 30 s default grace period, so the container exits on its own terms rather than being `SIGKILL`ed mid-teardown · **30 s** — matches that grace period exactly, which means a slow teardown races the kill · **no default, must be set** — explicit, but every existing app fails boot on upgrade | **10 s** |
| **Q2** | **`@OnBoot` writes a subclass's hooks into its parent's array** (R7, measured). `@OnShutdown` will use `Object.hasOwn` and be immune. Does `@OnBoot` get fixed in the same change? | **Fix both** — one `Object.hasOwn` change, and the bug stops existing · **Guard the new decorator only** — #129 asked for shutdown, and changing boot behaviour is scope the issue did not authorise · **Fix `@OnBoot` separately** — a `fix:` commit on its own, backlogged now | **Fix both.** It is a one-line change in the file already being read, and shipping `@OnShutdown` correct beside an `@OnBoot` that is wrong is the kind of asymmetry nobody remembers to revisit. |
| **Q3** | **Does FR-019 stay in?** #129 defers "migrating the consumer packages". FR-019 registers teardowns for the database and the scheduler — but does it from `steps/database.ts` and `steps/scheduler.ts`, which are **core** files. | **Keep it** — it is core wiring, not consumer migration, and SC-005 cannot pass without it · **Drop it and drop SC-005** — ship the mechanism with zero users and migrate everything later | **Keep it.** The scheduler's `stop()` currently has one caller repo-wide and it is a test; core's own database connection has none at all. A lifecycle with no registered teardown cannot be shown to work. |

### Answers — settled 2026-09-01

| # | Answer | What it binds |
| :--- | :--- | :--- |
| **Q1** | **10 s.** | `DEFAULT_SHUTDOWN_DEADLINE_MS = 10_000`, a named literal in `shutdown_sequence.ts` — never an env read (FR-016), never an inline number at the `setTimeout` call site (FR-021's decision row). Chosen to leave headroom inside Kubernetes' 30 s default grace period, so the container exits on its own terms rather than being `SIGKILL`ed mid-teardown. |
| **Q2** | **Fix both.** | New **FR-023**. `@OnBoot` moves to the same `Object.hasOwn` own-property test as `@OnShutdown`, with a regression test pinning the measured case — `new Base()` then `new Child()` must leave `getBootHooks(Base)` as `['common']`. Ships as its own `fix:` commit, separate from the feature's `feat:`, per hard rule #9. |
| **Q3** | **Keep FR-019.** | The database and scheduler teardowns stay in, registered from `steps/database.ts` and `steps/scheduler.ts`. This is core wiring, not the consumer-package migration #129 defers, and SC-005 is untestable without it. |

### Decided without asking

| Decision | Why it needed no question |
| :--- | :--- |
| **Signal handlers install by default**, with `@Kernel({ shutdown: { signals: false } })` to opt out. | #129's acceptance criterion says the author "no longer has to call `Deno.addSignalListener` to get a clean exit". Opt-in would not satisfy it. |
| **Ascending priority**, not a second ordering axis. | `@OnBoot` sorts descending. Ascending is its exact mirror, so `@OnBoot({priority:100}) connectDb` pairs with `@OnShutdown({priority:100}) closeDb` and the database closes last. The bootstrap-step `order` axis (ascending, 10→600) is deliberately **not** reused: mixing two axes in one comparator is the duplication this plan's table exists to catch. |
| **`shutdown()` resolves with a report; it does not reject.** | A rejection inside a signal handler is an unhandled rejection at the worst possible moment. The exit code carries the failure instead (FR-011). |
| ~~**No `KernelShuttingDown` event.**~~ **Withdrawn — the reasoning was wrong on its facts.** The feature now emits **`KernelTerminating`** (FR-018). | The original entry claimed `@lockness/events` is optional because it is loaded through `tryImportOptionalPackage`. Verified false: `packages/core/deno.json:29` declares it a hard dependency and `packages/core/mod.ts:84` statically re-exports ~39 of its symbols — the dynamic import in `steps/events.ts` is defensive, not evidence of optionality. Worse, the entry invented a name for an event **that already ships**: `KernelTerminating` at `packages/events/kernel_events.ts:218`, re-exported at `core/mod.ts:72`, documented with a `closeConnections` listener example, and emitted by nothing. Kept visible rather than deleted, because a decision recorded and then quietly replaced is how the same mistake gets made twice. |
| **The server is not a hook.** | It has no priority worth choosing: it is always first. A reserved constant would invite a second one. |
