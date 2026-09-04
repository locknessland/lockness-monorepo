# Plan: Polish — feature flags, full-text search, mail depth

**Branch**: `239-polish-feature-flags` | **Date**: 2026-09-05 | **Backlog item**: [#239 — Polish: feature flags, search, mail depth](https://github.com/locknessland/lockness-monorepo/issues/239) (epic; children [#240](https://github.com/locknessland/lockness-monorepo/issues/240), [#241](https://github.com/locknessland/lockness-monorepo/issues/241), [#242](https://github.com/locknessland/lockness-monorepo/issues/242))

**This is the epic's one planning document.** Unlike the other epics this one bundles **three independent features** (competitive gaps #15/#16/#17); the shared thread is "lower-priority polish". Each child ships on its own; the decision table homes all three.

---

## 1. Why this exists

Three gaps, each first-class elsewhere and absent here:

- **Feature flags** (#240) — no progressive-rollout / A-B capability (Laravel Pennant, Unleash, Flipper).
- **Full-text search** (#241) — no search abstraction over a pluggable engine (Laravel Scout).
- **Mail depth** (#242) — `@lockness/mail` is baseline (`to/subject/text/html/send`, driver switch); no markdown/templated mailables, no queued mail, no dev preview (Laravel Mailables, Mailpit).

All three are greenfield (grep found no flag/search/mailable/index code). #242 extends the existing `@lockness/mail` (`allow: []`, zero deps today); #240/#241 are new packages.

## 2. User scenarios

### US1 — Feature flags per scope with rollout (#240, P2)

**Given** flags configured (a boolean, a percentage rollout, or a resolver) and an app-supplied scope
**When** the app asks `features().active('new-checkout', scope)`
**Then** it returns the flag's state for that scope — a percentage rollout is **stable per scope** (the same scope always lands the same side), an override can force it on/off, and resolution is async-safe.

### US2 — Index and query models (#241, P2)

**Given** a search index and a driver
**When** the app indexes records (`search('posts').index(id, doc)`) and later queries (`search('posts').query('deno framework')`)
**Then** it returns matching ids ranked by relevance; a memory driver ships as the reference engine, and the driver is pluggable for an external engine later.

### US3 — Markdown mailable, queued, previewable (#242, P2)

**Given** a `Mailable` that renders a **markdown** body, opts into the **queue**, and a **dev preview**
**When** the app sends it
**Then** the markdown renders to an HTML mail body (through `@lockness/markdown`, loaded only when a markdown mailable is used); a queued mailable is delivered by a `@lockness/queue` job (identifiers serialised, re-rendered in `handle()`); and in dev the sent mail (subject + full HTML + time) is captured and viewable through a preview handler.

### Edge cases

- A flag with no definition → a documented default (off), never a throw; an unknown scope → the default resolution.
- A percentage rollout must be **deterministic** per scope (a stable hash) — never `Math.random()` per call (a scope must not flthan flip between requests).
- A search query with no matches → empty result; indexing the same id twice → replace, not duplicate.
- A markdown mailable when `@lockness/markdown` is not installed → a clear "install `@lockness/markdown` for markdown mailables" error, never a raw stack.
- A queued mailable → serialise identifiers, not a rendered `MailMessage` (PII at rest / DLQ — the notification S5 lesson).
- The dev preview must be **dev-gated** (never mounted in production) and expose no mail to an unauthenticated caller.

## 3. Requirements

### Feature flags (#240) — `@lockness/features`

- **FR-001**: A `@lockness/features` package provides `configureFeatures({ driver?, flags })`, a `FlagDriver` interface (persisted overrides) with a **memory** default driver, and `features()` → `{ active(name, scope?), value(name, scope?), activate(name, scope?), deactivate(name, scope?) }`. A flag definition is a **boolean**, a **percentage** (`{ rollout: 0..100 }`), or a **resolver** `(scope) => boolean | Promise<boolean>`. The **resolution order is one home** (`features.ts active()`, arch M3): the driver **override** wins, then the definition (boolean/percentage/resolver), then the documented **default off**.
- **FR-001a** (security S6): Flag resolution **fails closed** — a throwing resolver or an erroring `FlagDriver` read resolves to the safe default (**off**); the exception is never propagated to the caller and resolution never fails open. Unknown flag → off (already fail-closed).
- **FR-002**: A percentage rollout is **deterministic per scope** — a stable (non-cryptographic) hash of `(flagName, scopeKey)` decides the side, so a scope never flips between calls. `Math.random()` is never used for resolution. The rollout hash is not a security boundary (a user guessing their side is harmless) and is never reused as a token/secret.
- **FR-003**: The **scope is app-supplied** — `active(name, scope)` takes a scope value, and a `scopeKey(scope)` normaliser (one home) derives a stable string. `@lockness/features` does **not** hard-depend on `@lockness/auth`/`@lockness/session`; an app passes its user/tenant as the scope (the notification `routeNotificationFor` precedent).
- **FR-003a** (security S5): The app-supplied scope **must be a server-verified identity** (never a raw header/cookie/query param) whenever a flag influences **access, entitlement, or security-sensitive behaviour** — otherwise an attacker chooses a scope on the "on" side. Feature flags are a **rollout/config mechanism, not an authorization boundary**; this is stated in the package docs.

### Full-text search (#241) — `@lockness/search`

- **FR-004**: A `@lockness/search` package provides `configureSearch({ driver? })`, a `SearchDriver` interface (`index(indexName, id, document)`, `search(indexName, query, options?)`, `delete(indexName, id)`), and a `search(indexName)` facade over it. A **memory** driver ships as the reference engine.
- **FR-005**: The memory driver is a **tokenised inverted index** (lowercased, whitespace/punctuation split), ranking results by match count; `index` replaces an existing id (no duplicates); `delete` removes it. Results are `{ id, score }[]`, bounded by an optional `limit`. **The query is tokenised as data and is NEVER compiled into or used as a regular expression** (no ReDoS, security S7); the tokeniser split is linear-time and is **one shared function** used by both `index()` and `query()` (arch L1). Query length, query token count, and per-document token count are **capped** (documented defaults); over-limit input is truncated/rejected, not processed unbounded.
- **FR-006**: Indexing is **explicit** — the app (or its repository) calls `search(index).index(id, doc)`; there is no ORM lifecycle hook (none exists). A `Searchable` contract (`searchIndex()`, `toSearchDocument()`) documents the record→document shape, and a `search().index(searchable)` overload consumes it directly (arch L2). **Index-sync is the app's responsibility** (arch M2, §9): the app's repository calls `index()`/`delete()` on save/delete; a `reindex` affordance rebuilds an index from a record set, and `make:searchable` scaffolds a repository showing the pattern (stale/ghost-result risk otherwise).

### Mail depth (#242) — extends `@lockness/mail`

- **FR-007**: A `Mailable` abstract class builds a `Mail` (subject + body). A **markdown** mailable renders a markdown string to the HTML body through **soft-loaded `@lockness/markdown`**. The soft-load goes through **mail's OWN local `tryImport`** (`packages/mail/optional.ts`, mirroring `packages/notification/optional.ts`) — **never** imported from `@lockness/core` (an upward layer violation) or `@lockness/notification` (a cycle) (arch H1). `@lockness/mail` stays `allow: []`: **no value OR `import type`** of `markdown`/`queue` (an `import type` also hardens the edge and fails `deps:analyze`); the render result stays `unknown`, the queued-job shape is a local structural interface. A missing package fails clear.
- **FR-008**: **Queued mail** mirrors `@lockness/notification`: a mailable opts into queuing; the app wires a **soft** `@lockness/queue` dispatcher; one job serialises **identifiers only** (`mailableName` + `constructorPayload`), rehydrates + renders + sends in `handle()` — never a rendered `MailMessage` at rest (no recipients/HTML/tokens in the store or DLQ). **Rehydration resolves the mailable ONLY through an explicit allowlist registry** — `registerMailable(name, factory)` populated at app boot (there is no mail boot step, so registration is app-explicit; arch M1) — an unregistered/unknown name is **rejected without instantiation**, never a dynamic `import()` / global lookup / `eval` of a payload-supplied name (security S3, CWE-502); `constructorPayload` is schema-validated data-only before construction.
- **FR-009**: A **dev preview** — a **bounded** capture store (a ring buffer, max N, oldest evicted; documented default — security S4/arch M4) records each sent mail (id, timestamp, `to`, subject, **full HTML**); the send→capture tap is named in `preview.ts` and records **only when the preview is explicitly enabled** (one toggle home). A `mailPreviewHandler()` (a native `(Request) => Response`, **no hono dep**; mounted `app.all(path, (c) => handler(c.req.raw))`) serves the captured list/detail with these controls:
  - **XSS containment (security S1):** a captured body is served **only inside a sandboxed iframe** — a dedicated raw-body endpoint returning `Content-Type: text/html`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'` — **never inlined** into the tool's own DOM; all embedded metadata (`to`, subject, timestamp) is HTML-encoded.
  - **Access + prod fail-closed (security S2):** capture is **opt-in via a dedicated flag defaulting OFF** (not env inference alone); **both the store and the handler perform a request-time production check and fail closed (404 / no-op) when the environment is production or undeterminable**, independent of the flag; the handler is mounted behind the app's auth gate (dev-gating is not authorization).

### Cross-cutting

- **FR-010**: JSDoc on every export (#7); no `any` in exported signatures (#3); JSR-bare specifiers pinned per package (#2); no direct `hono` import (#1); soft edges declared in `deps.policy.jsonc` only (loaded via variable-specifier `tryImport`).
- **FR-010a** (security S8): **Logging discipline.** `features`/`search` (both `allow: [contract]`) pass any logged scope/query value through `safeForLog`; PII (search query text, flag scope) is redacted where it need not appear. `@lockness/mail` (`allow: []`) **logs no request/PII-derived value at all** — a queued-mail failure logs only the `mailableName` + job id (never the recipient, subject, or rendered body), and captured HTML is **stored only in the dev preview, never logged / never written to the DLQ**. This keeps mail dep-free (no `contract` edge) by construction.
- **FR-011**: `make:flag <name>`, `make:searchable <Model>`, `make:mail <Name>` scaffolds via each package's `registerXCommands` (package-command pattern, structural `Cli`, local stub reader). Each name argument passes **two layers** (security S2/S9): a **shape allowlist** regex that excludes `.`/`/`/`\`, **and** a resolved-path **containment** check under the target dir (normalize-then-verify, not the regex alone).

## 4. Success criteria

- **SC-001** (#240): `active('f', scopeA)` for a 50% rollout is **stable** across repeated calls for `scopeA`, and an `activate`/`deactivate` override wins (override → definition → default); an unknown flag returns the default (off) without throwing.
- **SC-001a** (#240, S6): a **throwing resolver** and an **erroring `FlagDriver` read** both make `active()` return `false` (fail-closed) without propagating the exception.
- **SC-002** (#240): two different scopes over a rollout split roughly by the percentage (a distribution check over N scopes), proving the hash is per-scope not per-call.
- **SC-003** (#241): index three docs, query a term → the matching ids ranked; re-indexing an id replaces it (no dup); `delete` removes it; a no-match query → empty.
- **SC-003a** (#241, S7): a query containing regex metacharacters is matched as **literal tokens** (no regex, no ReDoS); an over-length query / over-large document is **bounded** (truncated/rejected), not processed unbounded.
- **SC-004** (#242): a markdown mailable renders markdown → HTML body (fake markdown module via mail's local `tryImport`); a missing `@lockness/markdown` yields the actionable install error, not a stack.
- **SC-005** (#242): a queued mailable enqueues **one** identifiers-only job (fake queue); the job re-renders + sends in `handle()`; the serialised payload contains **no rendered HTML / no recipient**.
- **SC-005a** (#242, S3): a queued job naming an **unregistered** mailable is **rejected without instantiation** (allowlist registry); a registered one rehydrates.
- **SC-006** (#242): the dev preview captures a sent mail (subject + full HTML) and the handler returns it; with the preview flag disabled nothing is captured; capturing more than N retains only the most recent N (bounded).
- **SC-006a** (#242, S1/S2): a captured mail whose subject/`to`/body contains `<script>`/`onerror=` renders **inert** (sandboxed iframe + encoded metadata); with `APP_ENV=production` the handler **404s and captures nothing** even if the flag is on; an unauthenticated request is refused by the app's auth gate.
- **SC-007** (#240/#241/#242): `make:flag`/`make:searchable`/`make:mail` scaffold + register; a **traversal name** (`../…`) is rejected by all three (shape + containment).
- **SC-008**: Full gate green (`deno fmt && deno lint && deno check && deno task test && deno task deps:analyze && deno task agents:brief --check && deno task publish:check`).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Flag definition + resolution + **precedence** (override → definition → default off) | `packages/features/features.ts` (`features()`, `active`/`value`) | A controller re-implementing flag logic; the precedence split across two files |
| A scope's stable key | `packages/features/features.ts` `scopeKey(scope)` (one home, feeds `rollout.ts`) | A second normaliser in the rollout hash |
| Percentage rollout determinism | `packages/features/rollout.ts` (one stable-hash `(flag, scopeKey) → side`) | A `Math.random()` check; a second hash |
| Flag persistence (overrides) | `packages/features/driver.ts` + `drivers/memory.ts` (`FlagDriver`) | A flag stored ad-hoc in a controller |
| A flag's scope | app-supplied to `active(name, scope)` + one `scopeKey(scope)` normaliser | `features` reading a session/auth user directly |
| Search index + query facade | `packages/search/search.ts` (`search(index)`) over `SearchDriver` | A controller talking to a driver directly |
| The search engine seam | `packages/search/driver.ts` + `drivers/memory.ts` (**one shared tokeniser** for index + query; query is data, never a regex) | A second index structure; a per-model bespoke search; a different tokeniser on index vs query |
| Index-sync ownership | the app's repository calls `index()`/`delete()` on save/delete; a `reindex` affordance rebuilds (no ORM hook exists) | A framework "auto-index" that does not exist; leaving sync unowned (stale/ghost results) |
| Record→document shape | the app's `Searchable` (`searchIndex`/`toSearchDocument`) | A driver reading model columns directly |
| The mailable abstraction | `packages/mail/mailable.ts` (`Mailable`) | A controller hand-building a `Mail` per template |
| Mail's soft-load mechanism | `packages/mail/optional.ts` — mail's **own local `tryImport`** (mirrors `notification/optional.ts`) | Importing the helper from `core` (upward layer violation) or `notification` (cycle); a value **or `import type`** of markdown/queue (hardens the edge) |
| Markdown→HTML for mail | `mailable.ts` via mail's local `tryImport('@lockness/markdown')` (variable specifier) | A static/`import type` of markdown in mail; a second renderer |
| Queued-mail serialization + **rehydration registry** | `packages/mail/queued.ts` (identifiers-only job; `registerMailable(name, factory)` allowlist, app-registered; unregistered → rejected) | Serialising a rendered `MailMessage`; a dynamic `import()`/global lookup of a payload class name (CWE-502); a second dispatch path |
| The dev-preview capture + handler | `packages/mail/preview.ts` — **bounded** capture store + enabled-toggle + the send→capture tap + native `mailPreviewHandler` (sandboxed-iframe body, prod fail-closed) | Extending devtools' `MailInfo` (needs a devtools↔mail edge); an unbounded store; inlining body into the tool DOM |
| `make:flag`/`make:searchable`/`make:mail` | each package's `cli_commands.ts` + `stubs/` (structural `Cli`) | Adding to `cli/commands/make/` |

## 6. Technical context

**Language/Version**: Deno / TypeScript.
**Primary Dependencies**: `features` — `@lockness/contract` (hard). `search` — `@lockness/contract` (hard). `mail` — unchanged `allow: []` hard; **soft** `@lockness/markdown` + `@lockness/queue`.
**Storage**: flags + search default to in-memory drivers; both are pluggable. Mail preview is an in-memory capture (dev only).
**Testing**: `Deno.test`. Flags/search are pure (no context) tested directly; the memory drivers unit-tested; mail-depth uses a fake markdown module + a fake queue dispatcher + the capture store.
**Target Platform**: Deno server.
**Project Type**: framework libraries (two new packages + one extended).
**Constraints**: strict acyclic DAG; hard rules #1–#9. No cycles (features/search are sinks; mail gains only soft edges).
**Scale/Scope**: three independent children; two new packages (`features`, `search`) + `@lockness/mail` extensions; `lockness.packages += features, search` (for `make:*`).

### Domain model

- **Feature flags**: *flag* (a named toggle — boolean/percentage/resolver), *scope* (the app-supplied subject a flag resolves against), *rollout* (a deterministic per-scope split), *FlagDriver* (override persistence).
- **Search**: *index* (a named document collection), *document* (the searchable text for a record), *SearchDriver* (the engine), *Searchable* (a record's index + document projection).
- **Mail depth**: *Mailable* (a class that builds a Mail), *markdown body*, *queued mailable* (identifiers serialised, rendered in the job), *preview capture* (dev-only sent-mail store).
- **Invariants**: a rollout is deterministic per scope; a queued mailable never serialises rendered content; the preview never runs in production; markdown/queue load only when used; re-indexing an id replaces it.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| #1 no direct hono | pass | mail preview is a native `(Request)=>Response`; no package imports raw hono |
| #2 JSR-only | pass | hard deps declared+pinned; markdown/queue soft (deps.policy only) |
| #3 no `any` | pass | flag/doc/payload values `unknown` + guards |
| #4 Tailwind | pass (N/A) | no UI (preview is minimal HTML/JSON) |
| #5 gate | pass | full gate per child |
| #6 deno.lock | pass | generated |
| #7 JSDoc | pass | FR-010 |
| #8 MVC | pass | all three are infrastructure; drivers are adapters |
| #9 commits | pass | one per child + `chore(deps)` for the packages + soft edges |
| DDD | pass | pure cores; drivers + app callbacks are the ports |
| Domain Model gate | pass | §6 |

### Complexity tracking

Two new packages + one extended in one epic — acceptable because the three are independent and each is small. Mail keeps `allow: []` (markdown/queue soft), so no existing package hardens a new edge.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/features` (NEW) | yes | flag API + rollout + `FlagDriver` + memory driver + `make:flag` |
| `@lockness/search` (NEW) | yes | search facade + `SearchDriver` + memory inverted-index driver + `make:searchable` |
| `@lockness/mail` (extended) | yes | `Mailable`, markdown body (soft), queued mail (soft), dev preview + `make:mail` |
| `deps.policy.jsonc` | yes | `features`/`search` entries; `mail.soft += markdown, queue` — a `chore(deps)` |
| Root `deno.jsonc` | yes | two workspace members; `lockness.packages += features, search` |
| `@lockness/core` | no | none of the three needs a boot step (all app-configured, like mail/queue) |
| Docs | yes | three docs (or one polish doc) + `make:*` in the CLI reference |

### Documentation (this feature)

```text
.specnaut/specs/239-polish-feature-flags/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A rollout that flips per call (non-deterministic) | FR-002: stable hash of `(flag, scopeKey)`; SC-001/SC-002 prove per-scope stability + distribution |
| A queued mailable serialises PII (rendered HTML at rest) | FR-008: identifiers-only job, render in `handle()` — the notification S5 lesson; SC-005 asserts no HTML in the payload |
| The dev preview leaks mail (live tokens/PII) in staging/prod (S2) | FR-009: opt-in flag default OFF + **request-time production fail-closed** (store + handler 404/no-op) independent of the flag + mounted behind the app auth gate; SC-006a |
| The preview inlines untrusted mail HTML → stored XSS vs the developer (S1) | FR-009: body served only in a **sandboxed iframe** (CSP `sandbox; default-src 'none'`, `nosniff`), metadata HTML-encoded; SC-006a proves an inert render |
| A crafted queued-mail payload instantiates an arbitrary class (CWE-502, S3) | FR-008: rehydration only via the `registerMailable` **allowlist**; unregistered → rejected without instantiation; payload schema-validated; SC-005a |
| Search index drifts from the source of truth (stale/ghost results, M2) | FR-006 + §5: the app repository owns `index()`/`delete()` on save/delete; a `reindex` affordance + a scaffolded pattern |
| Markdown/queue harden mail's zero-dep surface | both are **soft** via mail's **own local `tryImport`** (H1 — not imported from core/notification); no value **or `import type`**; mail's `allow` stays `[]`; a missing package fails clear |
| A hostile `make:*` name writes outside the target dir | FR-011: shape allowlist + path containment (the notification S2 precedent) |
| A search query/doc with unbounded size | the memory driver bounds token count + result `limit`; documents are app-provided text |
| Three features in one epic dilute review focus | each child is a separate commit + its own gate; the review runs per child, the last is the stop |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Verdict: **fail** — 0 critical, 1 HIGH, 4 MEDIUM, 3 LOW. Spine confirmed sound: two new `allow:[contract]` sinks + extending mail (not a new mailable package) is the cohesive call; Q1/Q2/Q3 recommendations endorsed; **2 new hard edges + 2 new soft edges, 0 cycle, existing-package churn confined to mail + deps.policy + deno.jsonc**.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A-H1 | **HIGH** — mail's soft-load mechanism was unhomed, and both shortcuts break the DAG (importing `tryImport` from `core` = upward layer violation; from `notification` = cycle); the no-import warning omitted `import type` | **Plan changed.** FR-007 + §5 row: mail vendors its **own** `packages/mail/optional.ts` (mirrors `notification/optional.ts`); the invariant now forbids a value **or `import type`** of markdown/queue |
| A-M1 | MED — the queued-mailable rehydration registry had no home, and mail has no boot step to populate it | **Plan changed.** FR-008 + §5: a `registerMailable(name, factory)` allowlist registry in `queued.ts`, **app-explicit** registration (no mail boot step), unregistered → clear error. Converges with security S3 |
| A-M2 | MED — explicit indexing has a stale-index risk with no owner + no §9 row | **Plan changed.** FR-006 + §5 + §9: the app repository owns `index()`/`delete()` on save/delete; a `reindex` affordance + a scaffolded pattern |
| A-M3 | MED — flag override-vs-definition precedence (the crux of SC-001) had no home | **Plan changed.** FR-001 + §5: resolution order homed in `features.ts active()` — override → definition → default off |
| A-M4 | MED — the preview capture lifecycle was under-homed (no bound, no toggle home, no send→capture tap) | **Plan changed.** FR-009 + §5: a **bounded** ring-buffer store, the enabled-toggle home, and the named send→capture tap. Converges with security S4 |
| A-L1 | LOW — `scopeKey` + the memory tokeniser needed a single named home | **Plan changed.** §5 rows: `scopeKey` one home; the tokeniser one shared function for index + query |
| A-L2 | LOW — every index call would hand-write the `Searchable` projection | **Plan changed.** FR-006: a `search().index(searchable)` overload |
| A-L3 | LOW — the native preview handler's mount was unshown | **Recorded.** FR-009: `app.all(path, (c) => handler(c.req.raw))` |

**Verdict**: **fail** → folded. The one HIGH (mail soft-load home + `import type`) and the four MEDIUM are named-home/invariant gaps, all applied before code; the architecture needed no redesign.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel. Verdict: **fail** — 0 critical, 3 HIGH, 5 MEDIUM, 1 LOW. The sharpest surface is the dev mail preview (full HTML bodies + an HTTP handler); the identifiers-only queued job and default-off flags were confirmed right.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | **HIGH** — the preview would inline untrusted mail HTML into the tool origin → stored XSS vs the developer | **Plan changed.** FR-009 + SC-006a: body served **only in a sandboxed iframe** (CSP `sandbox; default-src 'none'`, `nosniff`), metadata HTML-encoded |
| S2 | **HIGH** — preview authz + request-time production fail-closed were intent, not requirement | **Plan changed.** FR-009 + SC-006a: opt-in flag default OFF + **request-time prod fail-closed** (store + handler) independent of the flag + mounted behind the app auth gate |
| S3 | **HIGH** — queued-mail rehydration could instantiate an arbitrary class (CWE-502) | **Plan changed.** FR-008 + SC-005a: rehydration only via the `registerMailable` **allowlist**; unregistered rejected without instantiation; payload schema-validated (converges with arch M1) |
| S4 | MED — the in-memory preview store grows unbounded | **Plan changed.** FR-009 + SC-006: bounded ring buffer, oldest evicted (converges with arch M4) |
| S5 | MED — flag scope must be a verified identity when a flag gates access | **Plan changed.** FR-003a: the app-supplied scope must be server-verified for security-sensitive flags; flags are not an authz boundary (docs) |
| S6 | MED — flag resolution must fail-closed on resolver/driver errors, not only unknown | **Plan changed.** FR-001a + SC-001a: a throwing resolver / erroring driver → `false`, never propagate, never fail-open |
| S7 | MED — search bounds under-specified; "query is never a regex" not an invariant | **Plan changed.** FR-005 + SC-003a: query is tokenised data, never a regex; query/token/document caps |
| S8 | MED — no `safeForLog` requirement on scope/query/recipient | **Plan changed.** FR-010a: features/search `safeForLog` logged scope/query; mail logs no PII (class + id only), never to the DLQ — keeps mail dep-free |
| S9 | LOW — the traversal SC omitted `make:mail`; state two-layer containment | **Plan changed.** SC-007 covers all three; FR-011 states shape allowlist **and** path containment |

**Verdict**: **fail** → resolved in-plan. All three HIGH are the dev-preview/queued-mail data-model decisions the pre-code audit exists to catch (each a one-line plan edit now, a rewrite after code).

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — feature-flag scope source.** | **App-supplied scope** + `scopeKey` normaliser — no `auth`/`session` hard dep; the app passes its verified user/tenant (server-verified for security-sensitive flags, FR-003a). | 2026-09-05 |
| **Q2 — mail dev preview home.** | **Mail-side capture store + a native `mailPreviewHandler()`** — no `mail`↔`devtools` edge; `mail` stays `allow: []`; sandboxed-iframe body + prod fail-closed (FR-009). | 2026-09-05 |
| **Q3 — search engine scope for the MVP.** | **Memory inverted-index driver only** — the reference engine; external engines (Meilisearch/Typesense) are a scoped follow-up. | 2026-09-05 |

### Folded from the audits (not user decisions)

- **A-H1 (HIGH) + S1/S2/S3 (HIGH)** are folded as spec — mail's local `tryImport`, the sandboxed-iframe preview, the prod-fail-closed preview, and the allowlist rehydration each have one right answer (FR-007/FR-008/FR-009).
- **S3 ≡ arch M1** (the allowlist registry is both the security control and the missing home); **S4 ≡ arch M4** (the bounded preview store).
- All MEDIUM/LOW are folded into FRs / SCs / §5 / §9; none reopens a design fork; the spine (two sinks + extend mail, Q1/Q2/Q3 (a)) was confirmed sound.