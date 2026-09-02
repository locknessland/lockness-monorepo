# Plan: `debug:event-dispatcher` CLI command

**Branch**: `014-cli-event-debug` | **Date**: 2026-09-02 | **Backlog item**: [#90 — CLI Debug Event Dispatcher](https://github.com/locknessland/lockness-monorepo/issues/90)

**This is the feature's one planning document.**

---

## 1. Why this exists

A developer has no way to see which event listeners an app declares, or their priorities, without
reading every file under `app/listener`. A `./nessy debug:event-dispatcher` command (à la Symfony's)
lists event→listener pairs, grouped, filterable — the events counterpart to the existing
`router:list`.

## 2. User scenarios

### US1 — List events and listeners (P1)

**Given** the app declares `@Listener` methods under `app/listener`
**When** the developer runs `./nessy debug:event-dispatcher`
**Then** each event is printed with its listener count and, per listener, the listener class, method,
and priority — grouped by event.

### US2 — Filter (P1)

**Given** many listeners
**When** the developer runs `./nessy debug:event-dispatcher <term>`
**Then** only events/listeners whose event name **or** listener class contains `<term>`
(case-insensitive) are shown; no match prints a friendly message and exits 0.

### US3 — Flag + graceful degradation (P2)

**Given** `--dispatcher=<name>` is passed, or there are no listeners, or `@lockness/events` is absent
**When** the command runs
**Then** the flag is accepted (defaults to the global dispatcher), and an empty/missing registry
prints a friendly message and exits 0 — never a crash.

### Edge cases

- No `app/listener` directory → treated as "no listeners", friendly message, exit 0.
- A file under `app/listener` that fails to import → skipped with a warning, the rest still listed.

## 3. Requirements

- **FR-001**: The command lists every decorator-declared listener, grouped by event name, with a
  per-event count. Enumerated by: it reads **every** exported class under `app/listener` via a
  **recursive** directory walk matching core's `discoverListeners` traversal (A2) — **not**
  `router:list`'s flat walk (which would miss listeners in subdirectories).
- **FR-002**: For each discovered class the command **constructs a throwaway instance** (bare `new`,
  in a try/catch — a listener whose constructor needs injected deps is skipped with a warning, A1)
  to fire the `@Listener` initializer, **then** reads `getListenerMetadata()`. Each row shows listener
  class (the class's `.name`), method name (`String(meta.methodName)`, A6), and priority
  (`meta.options.priority`), with event name from `meta.eventClass.name`. Without the instantiation
  step the metadata is empty (A1).
- **FR-003**: A positional argument filters by case-insensitive substring on event name **or**
  listener class name.
- **FR-004**: `--dispatcher=<name>` is parsed and accepted (defaults to the global dispatcher).
- **FR-005**: No matches / no listeners / missing `@lockness/events` → a friendly message, exit 0.
  A per-file **import _or_ instantiation** failure is skipped with a warning, not fatal — the
  `new Exported()` call has its own try/catch distinct from the import catch (S3).
- **FR-006**: The command lives **only** in `@lockness/cli`; it consumes `@lockness/events`' public
  API and does **not** import `@lockness/core` (tier boundary). Enumerated by: the new file is under
  `packages/cli/`, and its only `@lockness/*` import beyond contract is `@lockness/events`.

## 4. Success criteria

- **SC-001**: A developer sees, in one command, every event their app listens to and each listener's
  class/method/priority, grouped.
- **SC-002**: Filtering narrows the list predictably by event or listener name.
- **SC-003**: On an app with no listeners the command succeeds with a clear message (exit 0), never a
  stack trace.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Listener metadata is read from the public decorator API | `packages/cli/commands/debug_commands.ts` — one call to `getListenerMetadata()` per discovered class | Reaching into the emitter's private `listenerMap`; building a new `debug_registry.ts`; importing core's `listener_discovery` |
| A class is instantiated before its metadata is read (A1) | `packages/cli/commands/debug_commands.ts` — a `new Exported()` in try/catch, once per class, before `getListenerMetadata` | Reading metadata without constructing (returns `[]`); constructing in the formatter |
| Empty/missing registry → friendly message, exit 0; per-file skip-with-warning (FR-005) | `packages/cli/commands/debug_commands.ts` — the one handler | A second empty-check in the formatter; a silent skip |
| Listeners are discovered by walking `app/listener` | `packages/cli/commands/debug_commands.ts` — a local dir walk (mirrors `router:list`) | Importing `@lockness/core`'s `listener_discovery` (tier-2 → tier-1 violation); booting the kernel from the CLI |
| Filtering — substring, case-insensitive, event name or listener class | `packages/cli/commands/debug_commands.ts` — one filter predicate | A second filter in the formatter; a per-field ad-hoc check |
| The command is CLI-only | `packages/cli/` — the command; `@lockness/events` exposes API only | Command logic in core or events |

## 6. Technical context

**Language/Version**: TypeScript on Deno.
**Primary Dependencies**: `@lockness/cli` (`Cli.register`), `@lockness/events` (`getListenerMetadata`,
`ListenerMetadata`), `@std/fs`/`@std/path` for the walk (as `router:list` uses).
**Storage**: none — reads source files at command time.
**Testing**: `Deno.test` — the filter/grouping helpers as pure units; a command run against a fixture
`app/listener` dir (or captured `console.log`), following the cli test pattern.
**Project Type**: CLI command (framework tooling).
**Constraints**: no kernel boot (the global dispatcher is empty at CLI time); read-only; tier-1 only.
**Scale/Scope**: tens of listeners; single command invocation.

### Domain model

- **Bounded context**: CLI developer tooling (events introspection view).
- **Vocabulary**: *event*, *listener*, *priority*, *dispatcher*.
- **Entities**: none.
- **Value objects**: a display row `{ eventName, listenerClass, methodName, priority }` derived from
  `ListenerMetadata` + the class name; `methodName` is coerced via `String()` (it is `string | symbol`,
  A6).
- **Invariants**: read-only; no app boot; **decorator-declared** listeners only (runtime
  `dispatcher().on()` attachments are not visible at CLI time and carry no class/method — documented
  limitation).
- **Out of scope**: web devtools UI (#27 shipped the runtime-fires panel), multi-dispatcher
  discovery, timing/metrics, real-time streams (all #90 out-of-scope).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | Not applicable — CLI command. |
| JSR-only specifiers | pass | New dep `@lockness/events` declared pinned in cli's deno.json. |
| No `any` in exported APIs | pass | The command's rows are typed; no exported `any`. |
| Tailwind v4 | n/a | No UI. |
| Pre-completion gate | pass | fmt/lint/check/test + `deps:analyze`. |
| JSDoc on public APIs | pass | The registered handler + helpers documented. |
| MVC layering | pass | CLI consumes the events API; no business logic added to events/core. |
| No silent catches | pass | The per-file import-failure catch logs a warning. |
| One category per commit | pass | feat / test / docs / chore(deps) split. |

### Complexity tracking

No violations, and a **removed** complexity worth noting: the issue prescribed a new
`packages/events/debug_registry.ts` fed by `listener_discovery.ts`. The audit-time research found
every needed field already on the **public** `getListenerMetadata()`, so that registry is YAGNI and
is dropped (Q1). The feature shrinks from the issue's 4 phases to a single CLI command + a deps edge.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| CLI command | yes | New `packages/cli/commands/debug_commands.ts` (`debug:event-dispatcher`). |
| CLI registration | yes | `packages/cli/core_commands.ts` — register the command module. |
| CLI manifest | yes | `packages/cli/deno.json` gains pinned `@lockness/events`. |
| Dependency policy | yes | `deps.policy.jsonc` — widen `cli.allow` to include `events` (own `chore(deps)` commit). |
| `@lockness/events` | **1-line** | Remove the `@internal` JSDoc on `getListenerMetadata`/`ListenerMetadata` to promote them to public (A3, Q_internal) — no logic change. |
| `@lockness/core` | **no** | Not imported (tier boundary, FR-006). |
| Tests | yes | Filter/grouping units (incl. a symbol-method fixture, A6) + a command run over a fixture `app/listener` dir with a dependency-carrying `@Service` listener (A1). |
| Docs | yes | `packages/cli/README.md`, `packages/events/docs/DOCS.md`, `docs/nessy.md` (command reference, A4); `docs/dependencies.md` regenerates with the deps edge (A4). |

### Documentation (this feature)

```text
.specnaut/specs/014-cli-event-debug/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Command shows nothing because the dispatcher is empty at CLI time | By design it walks `app/listener` and reads decorator metadata, not the live dispatcher — the only source with class/method/priority. |
| Developer expects runtime `.on()` listeners to appear | Document the decorator-declared scope; runtime-attached listeners have no class/method to show. |
| `--dispatcher` implies multi-dispatcher support that doesn't exist | Accept the flag (AC), default to global; document it as single-dispatcher today (multi is #90 out-of-scope). |
| Dir walk imports app code (arbitrary execution) | Same trust model as `router:list`/`queue:work` — a dev running their own project's CLI. |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Kept
separate from §11.*

| # | Sev | Finding | What was done |
| :--- | :--- | :--- | :--- |
| A1 | HIGH | **The load-bearing step is unstated.** `getListenerMetadata(class)` returns `[]` until the class is **instantiated** — `@Listener` attaches metadata via a construction-time `addInitializer`. As written (walk → read metadata) the command lists **nothing**. `router:list` (the copied pattern) knows this and does `new Exported()` in a try/catch. Also: cli can't use `container.get()` (container isn't in `cli.allow`, a 2nd deps widening), so it must use a bare `new`, which throws for a listener whose constructor dereferences injected deps → skip-with-warning. | **Plan changed.** FR-002 now makes the mechanism explicit: walk → import → **construct a throwaway instance** (bare `new`, try/catch, skip-with-warning) to fire the initializer → **then** `getListenerMetadata`. §5 gains an instantiation row. A test fixture uses a dependency-carrying `@Service` listener to prove bare `new` still yields metadata (or is skipped cleanly). |
| A2 | MEDIUM | **Flat vs recursive walk.** `router:list` walks `app/controller` flat; core's real `discoverListeners` walks `app/listener` **recursively**. Copying the flat walk under-reports listeners in subdirectories. | **Plan changed.** FR-001 specifies a **recursive** walk matching `discoverListeners`' traversal, not `router:list`'s flat one. |
| A3 | MEDIUM | **`@internal` vs public.** `getListenerMetadata` is exported but its JSDoc is tagged `@internal`. Q1's YAGNI rests on "the public introspection API is already met" — yet the function is annotated not-public, and the plan also proposes documenting it as public. That is a contract decision, not a no-op. | **Plan changed** (Q_internal): **remove the `@internal` tag** and document `getListenerMetadata`/`ListenerMetadata` as public in `events/docs/DOCS.md` — a 1-line JSDoc + docs change. §8 "events: no change" → "events: 1-line (promote the API)". |
| A4 | LOW | §8 under-counts two docs surfaces: `docs/dependencies.md` (regenerated by `deps:analyze` when `cli→events` is added) and `docs/nessy.md` (the command reference). | **Plan changed.** §8 adds both; `dependencies.md` folds into the `chore(deps)` commit (generated, not hand-edited). |
| A5 | LOW | **`--dispatcher` is inert** — one global dispatcher, no registry, so the flag always resolves to the same value (mild speculative generality). | **Recorded as Q_dispatcher** — keep it for AC compliance (honest §9 note) or drop until multi-dispatcher exists (adding later is non-breaking). User decides at the stop. |
| A6 | LOW | `methodName` is `string \| symbol`; a symbol dropped into a template string / `padEnd` throws or renders `Symbol(...)`. | **Plan changed.** §6 display row derives `methodName` via `String(meta.methodName)`; a symbol-method fixture covers it. |

**Verdict** (`fail` → resolved by edits): the two biggest calls are **endorsed** — dropping
`debug_registry.ts` is correct YAGNI, and the `cli → events` (never `cli → core`) tier boundary is
clean and cycle-free. A1 (the instantiation step) and A2 (recursive walk) are mechanism corrections
the plan omitted; A3 is a small contract decision. All folded; `confirms #27` (complementary runtime
panel, no overlap). Coverage: the plan + 8 source files + `deps.policy.jsonc`; predicted, not executed
(no code exists).

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel. Kept separate from §10.*
A local dev CLI: fixed walk path, substring (not regex) filter, metadata-only output, first-party
dynamic import. Verdict up front: **nothing exploitable**; the findings are invariants to keep so the
implementer does not drift.

| # | Sev | Finding | What was done |
| :--- | :--- | :--- | :--- |
| S1 | INFO/accept | No injection / ReDoS / path traversal: the filter is a substring over in-memory strings; `--dispatcher` is inert; the walk path is fixed. | **Invariant recorded.** Implement the filter with `String.includes`/`indexOf`, **never** `new RegExp(term)`; build the dynamic-import specifier only from `Deno.cwd()` + the fixed `app/listener` + the `Deno.readDir` entry name — **never** from the filter term or `--dispatcher`. |
| S3 | INFO/accept | Output is code identifiers only (event/class/method names, integer priority) — no instance field, config, or env — so no secret exposure. The one real behaviour is constructor **side effects** at instantiation (same as `router:list`). | **Plan clarified.** FR-005's catch covers **instantiation** as well as import: the `new Exported()` call is wrapped in its own try/catch (as `router_commands.ts` does), so a throwing/side-effecting constructor is skipped-with-warning, not fatal. |
| S4 | INFO/accept | Dynamic `import()` of `app/listener/*.ts` is arbitrary code execution — but it is the developer's own first-party source, already executed by `dev`/boot/`router:list`/`queue:work`, run with the developer's own privileges. No new trust boundary or capability. | **Accepted.** Confirms the §9 risk row. `06-supply-chain` (remote/untrusted fetch) does not apply — first-party local code. |
| S5 | INFO (forward) | If **multi-dispatcher** support (out-of-scope now) later maps `--dispatcher=<name>` to a file/module path, that flag becomes a path-traversal / import-target surface. | **Recorded** for the future: today the flag is inert; when it is wired to a loader, add the guard then. One line now, cheaper than retrofitting later. |

**Verdict** (`pass`): covered the two inputs (filter, flag), the fixed walk path, the metadata-only
output, instantiation side effects, and the first-party dynamic-import trust model against the real
`router:list`/`queue:work` precedent. No CRITICAL/HIGH/MEDIUM/LOW — four accepts with the invariants
above folded in.

## 12. Open questions

| # | Question | Recommendation | Answer | Date |
| :--- | :--- | :--- | :--- | :--- |
| Q1 | Build the prescribed `packages/events/debug_registry.ts` + `listener_discovery` hook, or reuse the existing public `getListenerMetadata()`? | **Reuse `getListenerMetadata()`** — both audits confirm it exposes eventClass/methodName/priority; the registry is YAGNI. (Requires instantiating each class first — A1, now in FR-002.) | **Reuse** | 2026-09-02 |
| Q_internal | `getListenerMetadata` is exported but JSDoc-tagged `@internal` (A3). Promote it to public (remove the tag + document), or consume it as an exported-internal? | **Promote it** (remove `@internal`, document in events DOCS.md) — a 1-line change that makes the "public introspection API" real (matches Q1's premise and the AC). | **Promote** | 2026-09-02 |
| Q_dispatcher | `--dispatcher=<name>` is inert (one global, no registry — A5). Keep it (AC compliance) or drop until multi-dispatcher exists? | **Keep it**, default to global, honest §9 note — the AC lists it and adding it later is non-breaking either way. | **Keep** | 2026-09-02 |
| Q3 | Data source: decorator-declared (recursive walk of `app/listener`) vs the live dispatcher. | **Decorator-declared via the recursive walk** — the only source with class/method/priority; the dispatcher is empty at CLI time. Scope documented. | Decorator/recursive walk | 2026-09-02 |
| Q4 | Which directory to walk? | **`app/listener`** (recursively, A2); configurable path out of scope. | `app/listener` | 2026-09-02 |

### Decided without asking

- **CLI-only, tier-1** — consume `@lockness/events`; never import `@lockness/core` (its `listener_discovery` is tier-2).
- **Copy `router:list`'s patterns** — the dir walk, the hand-rolled grouped table, raw-args parsing.
- **`chore(deps)` for the `cli.allow` widening** — per `deps.policy.jsonc`'s own "own commit" rule.
