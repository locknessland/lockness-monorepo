# Plan: Registration introspection on @lockness/container

**Branch**: `018-container-introspection` | **Date**: 2026-09-02 | **Backlog item**: [#128 — Expose registration introspection on @lockness/container](https://github.com/locknessland/lockness-monorepo/issues/128)

**This is the feature's one planning document.** Business and technical together, read whole by
whoever implements it.

---

## 1. Why this exists

`@lockness/container` can resolve a service but cannot report what it holds. Its public surface is
`get` / `set` / `has` / `delete` / `clear` / `size` — there is a *count* of registrations but no way
to *enumerate* them. A caller can ask "how many?" and "is this one present?" but never "what are
they?".

That blocks four consumers, each of which independently justifies the feature: a `debug:container`
CLI command, a boot-time assertion that a required service was registered, a test asserting nothing
leaked between cases, and a future devtools DI panel. (The panel was originally motivated by
[#27](https://github.com/locknessland/lockness-monorepo/issues/27), now **closed** — the debug bar
shipped without a DI panel — so the standalone CLI / boot-check / test uses are the live drivers;
devtools hardening is tracked separately under
[#149](https://github.com/locknessland/lockness-monorepo/issues/149).) Every one needs the same
missing capability: read the set of registration identifiers without touching resolution.

## 2. User scenarios

Actor throughout: **framework code that reads the container** (devtools panel, CLI, boot checks,
tests) — never an end user.

### US1 — Enumerate registrations for display (P1)

**Given** a container holding a class-token service, a symbol-token service and a string-token
service
**When** the caller enumerates its registrations
**Then** it receives one entry per registration, each carrying a display-ready string identifier and
a `resolved` flag, and it can render the list without a single cast.

### US2 — Reading must not instantiate (P1)

**Given** a class token that has never been resolved (absent from the container)
**When** the caller enumerates registrations
**Then** no constructor runs, and the container's contents are byte-for-byte unchanged — opening the
panel must not instantiate the object graph.

### US3 — The returned data is inert (P2)

**Given** a caller that received an enumeration
**When** it mutates the returned array or its entries
**Then** the container is unaffected; a subsequent enumeration reflects only real container state.
The collection and descriptor *objects* are inert; `token` is a live identity key by design —
`new token()` outside the container is a caller's own choice, not a guarantee this API makes.

### Edge cases

- **Empty container** → enumeration returns an empty collection, never `undefined` or a throw.
- **A registration whose stored value is `undefined`/`null`** (a caller did `set(token, undefined)`)
  → it still appears as a registration; presence in the map, not truthiness of the value, defines a
  registration.
- **Two tokens with the same display string** (a class `Foo` and `Symbol('Foo')`) → both appear as
  separate entries; the identifier is for display, and is not promised to be unique.

## 3. Requirements

- **FR-001**: The `Container` exposes a read-only method that returns one descriptor per current
  registration. It enumerates **every** entry in the container's internal registry — the search that
  defines the set is "every key in the `services` map".
- **FR-002**: Each descriptor carries a **string identifier** derived from the token, meaningful for
  a class constructor (its name), a symbol (its description) and a string (itself), displayable
  without casting.
- **FR-003**: Each descriptor carries the **raw token** (`Constructor | symbol | string`) so a
  caller can re-look-up the service (`container.get(descriptor.token)`) without reconstructing it —
  typed as a union, never `any`.
- **FR-004**: Each descriptor carries a **`resolved` boolean**. See the decision table and §12: under
  the container's current single-map design every enumerable entry is an already-built instance, so
  the field reads `true` for every entry today; it exists so a caller (and a future lazy-registration
  channel) has a stable, honest slot to read.
- **FR-005**: Enumeration is **side-effect free** — it triggers no construction and mutates nothing
  in the container (US2).
- **FR-006**: The returned collection and its descriptor objects are **fresh per call** — mutating
  them does not reach the container (US3). The `token` field is deliberately **not** cloned: it must
  be the real map key so `get(descriptor.token)` works (FR-003), and it is safe because the container
  keys by object identity — mutating a property *through* a returned token cannot alter map
  membership (SEC-A).
- **FR-007**: The method is declared on the published `ContainerContract` interface in
  `@lockness/contract` (where `size` already lives) and implemented on `Container`; JSDoc with
  `@example`; `README.md` and `docs/DOCS.md` updated.

## 4. Success criteria

- **SC-001**: A caller can list every registered service's display name and resolved-state from the
  public API alone, without importing container internals and without a type cast.
- **SC-002**: Enumerating a container that contains an unresolved class token instantiates nothing —
  provable by a test whose service constructor increments a counter that stays at zero.
- **SC-003**: Mutating the returned array or a descriptor's `id`/`resolved` leaves a re-read
  identical to the pre-mutation read. (`token` is deliberately the live key, not a copy — see FR-006.)
- **SC-004**: The change is additive — every existing `@lockness/container` test still passes
  unchanged, and no existing signature changes.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **What a registration descriptor is** (`{ id, token, resolved }` — its fields and their types) | `packages/contract/types.ts` (new `ContainerRegistration` interface + method on `ContainerContract`) | A second inline object literal type in `container.ts`, `mod.ts`, or a devtools/CLI consumer re-declaring the shape instead of importing it |
| **How a token becomes a display id** | `packages/container/container.ts` — the existing `describeToken()` helper, reused (not re-implemented) | A consumer calling `.name` / `.description` / `String(token)` itself; a second `describeToken` copy in a caller or in `helpers.ts` |
| **What set gets enumerated** ("every entry in the `services` map, nothing more") | `packages/container/container.ts` — the new method reads `this.services` directly | A caller filtering `size` vs entries differently; any second source of "what is registered" |
| **What `resolved` means** ("an instance exists in the registry for this token") | `packages/container/container.ts` — computed at enumeration time from map membership | A consumer inferring resolved-state from whether `token` is a function, or caching its own resolved flags |
| **Enumeration never constructs** (FR-005 / US2) | `packages/container/container.ts` — the method reads `this.services` **directly** and never calls `this.get()` | Any enumeration path routed through `get()` (which constructs and mutates the map), or a probe that attempts resolution to compute `resolved` |
| **The returned collection is fresh and inert** (FR-006 / US3) | `packages/container/container.ts` — the method allocates a **new array of new `{id, token, resolved}` objects** on every call | Caching the array, returning a live `this.services.keys()`/`.entries()` view, or reusing descriptor instances across calls |

## 6. Technical context

**Language/Version**: Deno / TypeScript (TC39 Stage-3 decorators), matching the workspace toolchain.
**Primary Dependencies**: `@lockness/contract` only (the package's sole dependency; unchanged).
**Storage**: N/A — in-memory `Map` already present.
**Testing**: `deno test` (`@std/assert`), extending `packages/container/tests/`.
**Target Platform**: library, consumed by every Lockness app and by devtools/CLI.
**Project Type**: library (foundation tier).
**Performance Goals**: enumeration is O(n) over registrations, n = number of registered services
(tens, not thousands); no measurable hot path.
**Constraints**: additive, non-breaking, no resolution/lifetime change, no new runtime dependency,
no `any` in the exported surface.
**Scale/Scope**: one new method, one new type, tests + docs. ~40 lines of source.

### Domain model

- **Bounded context**: dependency injection / the service container.
- **Vocabulary**: *registration* (a token bound in the container), *token* (class / symbol / string
  key), *resolved* (an instance exists for the token), *descriptor* (the read-only view of one
  registration).
- **Entities** (have identity): the **Container** (identified by instance; owns the registry).
- **Value objects** (no identity): **ContainerRegistration** `{ id, token, resolved }` — an inert
  snapshot of one registration at read time.
- **Invariants**: enumeration never constructs; a descriptor mirrors map membership at the instant of
  the call; the returned collection shares no mutable state with the container.
- **Out of scope**: dependency-graph edges (who depends on whom); the devtools panel (#27); any
  lazy-registration channel; any resolution/lifetime behaviour.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | Not touched. |
| JSR-only specifiers | pass | No new dependency; `@lockness/contract` already pinned. |
| No `any` in exported APIs | pass | `token` is `Constructor \| symbol \| string`; `id` string; `resolved` boolean. |
| Tailwind v4 syntax | pass | No UI in this package. |
| Pre-completion gate | pass (obligation) | `deno fmt && deno lint && deno check && deno task test` before done. |
| Never hand-edit `deno.lock` | pass | No dependency change. |
| JSDoc on public APIs | pass (obligation) | New method + type documented with `@example`. |
| MVC layering | pass | Foundation library; no controller/service/model split applies. |
| Commit discipline | pass (obligation) | Split: `plan` / `feat` / `test` / `docs` by category. |
| No silent catches | pass | No `catch` introduced. |
| TDD (developer agent) | pass (obligation) | Failing test first per §2 scenarios. |
| Domain Model gate | pass | §6 above. |

### Complexity tracking

No violations. The one judgement call — a `resolved` field that is uniformly `true` today — is
recorded as an open question (§12), not a violation: it is honest data, not accidental complexity.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/contract` public types | yes | New `ContainerRegistration` interface; `ContainerContract` gains one read-only method. Additive. |
| `@lockness/container` public API | yes | `Container` gains the method; `ContainerRegistration` added to the **named** re-export allowlists in `mod.ts` **and** `types.ts` (these barrels use a named list, not `export *`). Additive. |
| `@lockness/container` local `ContainerReader` type | yes | Gains the method to stay a faithful read surface. |
| Devtools panel (#27) | no | Consumes this later; not built here. |
| CLI | no | A `debug:container` command is a separate future item. |
| `@lockness/core` consumers | auto | `contract/mod.ts` and `core/mod.ts` use `export *`, so `ContainerRegistration` reaches core automatically — no core re-export row needed. |
| `contract` / `core` AGENTS.md stub tables | yes | Add `ContainerRegistration` + the new method to the interface stub tables (repo stub-sync discipline). |
| Every other package | no | No signature changes; nothing existing is altered. Blast radius counted: exactly **1** implementer of `ContainerContract` (`Container`), **0** structural/`satisfies` implementers, **0** `ContainerReader` consumers. |

### Interface contract exposed

```ts
interface ContainerRegistration {
  /** Display-ready identifier: class name, symbol description, or the string token. */
  id: string
  /** The raw token, for re-lookup via container.get(token). */
  token: Constructor | symbol | string
  /** Whether an instance currently exists in the container for this token. */
  resolved: boolean
}
// on ContainerContract / Container:
registrations(): ContainerRegistration[]
```

### Documentation (this feature)

```text
.specnaut/specs/018-container-introspection/
├── plan.md    # This file
└── tasks.md   # tasks output, derived from THIS file once approved
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **`resolved` is always `true` today**, so a consumer might hard-code "all resolved" and break if a lazy channel later lands. | Document the field's contract as "an instance exists now", not "resolution finished"; the panel reads the field, never assumes. Recorded as OQ-1. |
| **Exposing the raw `token`** could tempt a caller to mutate through it. | The token is an identity key (class/symbol/string); there is nothing container-affecting to mutate on it. `get(token)` is the only useful op and is already public. |
| **Contract change ripples** to any other `ContainerContract` implementer. | Grep confirms `Container` is the *only* implementer in the workspace; the addition is non-breaking for all consumers (they call, not implement). |
| **Descriptor could leak a live reference** enabling accidental container mutation. | Fresh array + fresh objects per call; no reference to the internal `Map` escapes (FR-006 / SC-003). |

## 10. Architecture audit

**`architect-expert` verdict: PASS-WITH-FINDINGS** (1 HIGH, 1 MEDIUM, 3 LOW). The design is
architecturally sound — correct homing on all three axes (the `ContainerRegistration` DTO in the
foundation `contract` package; id-derivation reusing the existing private `describeToken()`; the new
read member beside `size` on the published `ContainerContract`), a genuinely **additive** contract
change, and a **counted** blast radius of exactly one implementer.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| ARCH-1 | HIGH | The §5 decision table homed every data-shape decision but **neither behavioural invariant** — FR-005 (no construction) and FR-006 (fresh/inert), which back both P1/P2 scenarios and two success criteria. A missing row is the defect this phase exists to catch. | **Plan amended** — two rows added to §5 before `tasks`. |
| ARCH-2 | MEDIUM | `resolved` is not merely "true today" but **tautologically true**: the single `services` map holds only built instances, so `resolved === true` equals "the entry exists". Zero information bits, and its meaning is pre-committed to change when a lazy channel lands on a published contract. Confirms OQ-1. | **Decided at the stop** — see §12 OQ-1. |
| ARCH-3 | LOW | US3/SC-003 "inert" was imprecise — the descriptor/array are fresh, but `token` is a live mutable class reference (`new token()` bypasses the singleton cache + cycle tracking). | **Plan amended** — US3, SC-003, FR-006 reworded; no code change. |
| ARCH-4 | LOW | §1 cited **#27 (CLOSED)** as the blocking consumer; no DI panel exists and devtools does not consume the container read surface today. | **Plan amended** — §1 re-pointed to the live CLI / boot-check / test drivers; panel noted as future, hardening tracked under #149. |
| ARCH-5 | LOW | `ContainerRegistration` must be added to the **named** re-export allowlists in `container/mod.ts` **and** `container/types.ts`, and to the contract/core AGENTS.md stub tables (these barrels are not `export *`; core reach is automatic). | **Plan amended** — §8 expanded with both barrels + stub tables. |

**Blast radius (counted, per the audit):** `implements ContainerContract` → **1** (`Container`);
structural / `satisfies ContainerContract` → **0**; `ContainerReader` consumers → **0**; external
uses of the interface as a *type* → doc tables only (callers, not implementers — cannot break).
The change is confirmed additive and non-breaking.


## 11. Security audit

**`security-expert` verdict: PASS-WITH-FINDINGS** (1 LOW, 2 INFO — none blocking). No input
surface (zero-parameter read), no misplaced authz (the container is a trusted in-process service
locator; gating belongs to the consumer, not the primitive), no secret reachable through the
descriptor (instances are never returned; tokens are already surfaced by existing error messages),
and no path to an authenticated stranger today. FR-005/FR-006 guards are baked into the §5 decision
table, not left to the implementer.

| # | Sev | Finding | Disposition |
| :-- | :-- | :--- | :--- |
| SEC-1 | LOW | The obligation to gate *rendered* output is unrecorded. `registrations()` returns architectural metadata (service identifiers); a consumer that renders the list on a prod/public surface leaks an architectural fingerprint (reconnaissance only — no secret in the list itself). Gating in the primitive is wrong (breaks CLI/boot/test consumers). | **Plan amended** — obligation recorded below; no code change in this package. Inherited by consumers #27 / #149. |
| SEC-A | INFO | Ambiguity between "fresh objects per call" (FR-006) and "raw token for re-lookup" (FR-003) could tempt an implementer to clone the token (breaking `get(descriptor.token)`). | **Plan amended** — FR-006 now states the token is deliberately not cloned. |
| SEC-B | INFO | A string/symbol used *as a token* is already rendered into error messages today; `registrations()` surfaces the same class of data, not a new kind. | **Recorded as a usage guideline** — tokens are identifiers, not secret stores; secrets live in the instance, which this method never returns. |

**Recorded obligation (SEC-1):** `registrations()` returns architectural metadata (service
identifiers). Any surface that renders it to an untrusted user — a devtools DI panel served in
production, an error page — **MUST** be dev-gated or authz-gated. Boot checks, the CLI and tests are
trusted consumers and need no gate. Devtools rendering hardening is tracked under
[#149](https://github.com/locknessland/lockness-monorepo/issues/149); the DI panel consumer is
[#27](https://github.com/locknessland/lockness-monorepo/issues/27).

**Usage guideline (SEC-B):** tokens are identifiers, not secret stores. Never use secret material as
a service token; secrets belong inside the instance (which `registrations()` never returns).

## 12. Open questions

- **OQ-1 — the `resolved` field (ARCH-2, MEDIUM).** Sharper than first written: under the single
  `services` map the field is **tautologically** `true` — the map holds only built instances, so
  "resolved" is definitionally equal to "present in the enumeration". It carries zero information
  today, and if a lazy-registration channel ever lands, the field's meaning silently shifts on a
  *published* contract. Two defensible answers, **for the user to pick at the stop**:
  - **(A) Keep `resolved`, ship now** — documented as "an instance exists now", it gives consumers a
    stable slot and the panel *renders* it but never *branches* on it; its semantics are flagged as
    change-pending. Cost: a published boolean that is uniform until the lazy channel arrives.
    *(Recommended — the AC explicitly asks for the flag, and adding a field later is itself a
    consumer-visible change.)*
  - **(B) Drop `resolved` from v1** — ship `{ id, token }` only, and reintroduce `resolved` together
    with the lazy channel that gives it two real values. Cost: the AC's "resolved vs lazy" bullet is
    partially deferred; a second consumer-visible change later.
  **DECIDED 2026-09-02 → (A) Keep `resolved`.** Ship `{ id, token, resolved }`. `resolved` is
  documented as "an instance exists now"; consumers *render* it but must not *branch* on it; its
  semantics are pre-committed to change when a lazy channel lands. Rationale: the AC explicitly asks
  for the flag, and adding a field later is itself a consumer-visible change.
- **OQ-2 — method name and return shape. DECIDED 2026-09-02 → `registrations(): ContainerRegistration[]`.**
  Over `entries()` (collides with `Map.entries`), an iterator (loses the eager array + the resolved
  slot), or `keys()` + `describe()` (two calls, re-derivation). Reads well beside `size`; taken as an
  informed default at the stop.
