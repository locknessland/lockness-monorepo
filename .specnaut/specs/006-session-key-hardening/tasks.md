---

description: "Dependency-ordered breakdown for the session key hardening"
---

# Tasks: Fail closed on the session key, and make it per-deployment

**Input**: `/.specnaut/specs/006-session-key-hardening/plan.md`
**Backlog item**: [#137 — Session cookie is forgeable: crypto skipped on empty secret, fallback key committed](https://github.com/locknessland/lockness-monorepo/issues/137)

**Tests**: required, and first. TDD is non-negotiable per the constitution.

**Scope, after the stop**: `APP_KEY` becomes `base64:` + 32 decoded bytes (Q1).
Session-id validation lands here (Q2, FR-020); the Redis RESP encoder, the redis
`regenerate` lifetime bug and the memory-driver persistence defect are **filed,
not fixed** (Q2, Q3).

## 🔒 Carried forward from the decision table

`plan.md` §5 binds every task below. The traps, and the task most likely to
spring each:

| The rule | Its only home | The task that would duplicate it |
| :--- | :--- | :--- |
| Is this secret usable | `packages/session/secret.ts` — `assertUsableSecret` | T014 — leaving an `if (!secret)` in the cookie driver "just in case" |
| The floor, the list, the shape | `packages/session/secret.ts` | T007 — a second `32` written into `cookie.ts`, or `types.ts:87`'s "at least 32 characters" JSDoc left contradicting it |
| How a key is generated | `packages/session/secret.ts` — `generateAppKey` | T019 and T027 — a second `crypto.getRandomValues` in core or in init |
| Where a secret comes from | `packages/core/kernel/bootstrap/helpers.ts` | T018 — `Deno.env.get('APP_KEY')` surviving in `config/session.ts` or a stub |
| The dev key is per **process** | `helpers.ts`, one module-level memo | T019 — generating inside `normalizeSessionConfig`'s body, which runs 5× in the suite |
| Production refuses to boot | `packages/core/kernel/bootstrap/steps/session.ts` | T021 — putting the gate in `sessionMiddleware()`, which throws for **every** app in development |
| When config is resolved | `packages/session/middleware.ts`, inside the handler | T005 — leaving the `{ ...getSessionConfig() }` spread at factory-call time |
| Which drivers need a secret | `drivers/mod.ts`'s switch, `default:` deleted | T016 — keeping `default:` and gating on `driver === 'cookie'`, two predicates over one decision |
| The wire format | `drivers/cookie.ts` — one `seal`/`open` pair | T012 — a second parser in a test fixture, or a compatibility read path |
| Bounded rejection reporting | `drivers/cookie.ts`, one module-level counter | T013 — a second flag in `middleware.ts`, or a per-request `console.warn` |
| The secret never reaches output | `secret.ts` — `SessionSecretError`'s constructor | T008 — `Session secret "${secret}" is too short`, the message everyone writes |

---

## Phase 1 — Setup

- [X] T001 Confirm branch `006-session-key-hardening` and `.specnaut/feature.json` naming this directory with `linked_issue: 137`
- [X] T002 Record the **baseline** before touching anything: run `deno task test` and save the pass/fail counts to the scratchpad. R8 says a green suite is not evidence here — `middleware.test.ts:29` is green over a driver that does not work — so the baseline is what later comparisons mean, not proof of health
- [X] T003 Write the **regression test that reproduces #137 end to end** in `packages/session/tests/forgery.test.ts`: drive a real request pair through `sessionMiddleware()` with a good key configured *after* the factory call, and assert the emitted cookie is **not** `JTdCJTIyYXV0aF93ZWIlMjIlM0ExJTdE`. It must be **red today** — if it passes, the reproduction is wrong, not the bug

## Phase 2 — Foundational (blocks every story)

### The secret contract

- [X] T004 [P] Write the failing tests in `packages/session/tests/secret.test.ts`: `base64:` + exactly 32 decoded bytes passes; 31 and 33 bytes fail; a bare base64 string with no prefix fails; every entry in `REJECTED` fails; `generateAppKey()` output passes `assertUsableSecret` (the round-trip that keeps the two from drifting)
- [X] T005 [P] Write the failing test that **no rejection message contains the input**, its length, or any substring of it — one case per rejection branch (FR-018). ⚠️ This is the test that fails silently by being written to match whatever message the implementation happens to produce; assert `!message.includes(input)`, never `message === '...'`
- [X] T006 Create `packages/session/secret.ts` — `MIN_KEY_BYTES = 32`, `KEY_PREFIX = 'base64:'`, `REJECTED`, `assertUsableSecret`, `generateAppKey`, `SessionSecretError`. **One file, all of it** (§5 rows 1–3)
- [X] T007 `REJECTED` carries every placeholder this repository has shipped, enumerated by `grep -rnE "APP_KEY=|secret: *'"` — at minimum `change-me-in-production`, `your-secret-key-here-change-in-production`, `your-secret-key-here`, `production-secret-key`, `a-very-long-secret-key-32-chars`, `secret`, `your-secret`. ⚠️ The second is **not** a superstring of the first; a grep for one misses the other
- [X] T008 `SessionSecretError`'s constructor takes `(reason, source)` and **cannot** take the value — make it structurally impossible rather than a convention (FR-018)
- [X] T009 Export `assertUsableSecret`, `generateAppKey` and `SessionSecretError` from `packages/session/mod.ts`, and add them to a reachability test in the shape of `packages/core/tests/shutdown_reachability.test.ts` — a symbol its module exports but `mod.ts` does not is unreachable to every consumer with the suite fully green

### The wire format

- [X] T010 [P] Write the failing tests in `packages/session/tests/wire_format.test.ts`: round-trip; a cookie sealed under key A does not open under key B; the exact #137 forgery is rejected; the forgery with `v1.` prepended is rejected; a bit-flipped ciphertext is rejected; a truncated payload is rejected **before** any crypto call; a 5 000-character cookie is rejected on length; an expired `exp` is rejected
- [X] T011 [P] Write the failing test that **two seals of the same data differ** and that no two carry the same salt — invariant 2, worded as overwhelming probability, so assert distinctness over a sample, not a guarantee
- [X] T012 Rewrite `packages/session/drivers/cookie.ts`'s crypto as one `seal`/`open` pair: `v1.` + base64(`salt‖iv‖ciphertext`), HKDF-SHA256 with a fresh 16-byte salt, AES-256-GCM with a fresh 12-byte IV, the version passed as `additionalData`, and `iat`/`exp` **inside** the plaintext (FR-005/006/015). ⚠️ Delete the `if (!this.config.secret)` branches at `:78` and `:101` — FR-001 is the control, not the version marker
- [X] T013 `open()` validates structurally before any crypto call (FR-016): raw length ≤ 4096, the `v1.` prefix, then `byteLength >= 16 + 12 + 16` after `atob`. Each rejection returns `null` **by decision**; the `catch` becomes a backstop
- [X] T014 Replace the silent `catch { return null }` at `:43` with the bounded reporter (FR-009): warn on the first, then a rolling summary while the rate is non-zero, logging the **class** — `bad-prefix` / `bad-base64` / `too-short` / `tag-mismatch` / `expired` — and **never** the value. Anything contextual goes through `safeForLog` from `@lockness/contract`
- [X] T015 Do **not** carry `String.fromCharCode(...combined)` forward from `:97` (FR-017). Measured: `RangeError` between 125 000 and 200 000 bytes, and session payloads are app-influenced
- [X] T016 [P] Write the failing test that the derived key is **never cached** — invariant 5. Two seals of identical data under one config must perform two derivations. If this is untestable from outside, assert the absence instead: no module-level `CryptoKey` in `cookie.ts`

### Configuration resolution

- [X] T017 [P] Write the failing test for FR-012: build the middleware, **then** `configureSession` with a good key, then drive a request, and assert the cookie is sealed. This is T003's mechanism isolated — it is the single change without which nothing else in this feature works
- [X] T018 Move the `{ ...getSessionConfig(), ...config }` spread from `middleware.ts:41` **into the returned handler**. ⚠️ Do not memoise it "for performance": the memo is the bug
- [X] T019 [P] Write the failing tests for the id boundary (FR-020, Q2): a cookie value that is not `/^[0-9a-f]{64}$/` is discarded and a fresh id generated; a 64-hex value is honoured; a value containing a URL-decoded CR/LF is discarded. ⚠️ Hono URL-decodes the cookie before you see it, so `%0D%0A` arrives as raw CR/LF — the test must send the encoded form
- [X] T020 Apply the regex at the id read in `packages/session/middleware.ts`. One line, and it closes the reachable half of the Redis injection and `deno_kv.ts:41`'s >2 KiB key throw

## Phase 3 — US1 (P1): production refuses to boot without a key

**Independent test**: `APP_ENV=production`, no `APP_KEY`, `createApp` throws naming `APP_KEY`, and the message contains no key.

- [X] T021 [P] [US1] Write the failing tests in `packages/core/tests/session_boot.test.ts`: production + no key ⇒ `runBootstrapSteps` throws; the message names `APP_KEY`; the message contains no key material; non-production + no key ⇒ boots
- [X] T022 [US1] `normalizeSessionConfig` stops falling back to a literal (FR-003). `NormalizedSessionConfig.secret` becomes `string | undefined` — in production with no key there is nothing to return
- [X] T023 [US1] The dev random key is **one per process**: a module-level memo in `helpers.ts`, not a value generated in `normalizeSessionConfig`'s body. ⚠️ That function runs once per `createApp` and **4×** in `packages/core/tests/bootstrap_steps.test.ts` — a per-call key contradicts §2's stated behaviour and nothing would notice
- [X] T024 [US1] Call `assertUsableSecret` from `packages/core/kernel/bootstrap/steps/session.ts`, after resolution and only when the driver is `cookie` (§5 row 6, FR-010). ⚠️ **Not** in `sessionMiddleware()` — the kernel calls that at `loader.ts:136`, before resolution at `:162`, so a gate there throws for every application in development
- [X] T025 [US1] Verify the three existing tests at `packages/core/tests/bootstrap_steps.test.ts:45,53,64` still pass. They should — the resolver returns and only the step throws — but the audit predicted one breaks, so **measure rather than assume**
- [X] T026 [US1] Delete the `console.warn` at `helpers.ts:126-130` and the literal at `:122-123`

## Phase 4 — US2 (P1): a forged cookie is rejected

**Independent test**: the #137 value, and a cookie from another deployment, both read as an empty session and the guard reports unauthenticated.

- [X] T027 [P] [US2] Write the failing integration test in `packages/session/tests/forgery.test.ts` (extending T003): the exact #137 cookie value yields an empty session; a cookie sealed under a different key yields an empty session
- [X] T028 [US2] Delete `drivers/mod.ts`'s `default:` branch; an unrecognised driver name **throws**, naming it (FR-013). ⚠️ Today it silently builds a cookie driver — a second predicate over "which drivers need a secret"
- [X] T029 [US2] `SessionConfig.secret` becomes optional and `defaultConfig`'s `secret: ''` is deleted (FR-014). Fix `types.ts:87`'s JSDoc, which says "at least 32 characters" where FR-004 now says 32 **bytes** after a `base64:` prefix — two numbers, one rule
- [X] T030 [P] [US2] Confirm the seven sub-16-character test secrets in `store.test.ts` and `middleware.test.ts` still pass (R7). They are all `driver: 'memory'` and therefore ungated — if any fails, the gate has moved out of its home

## Phase 5 — US3 (P2): a developer runs locally with no key

**Independent test**: no `APP_KEY`, `APP_ENV` unset — the app boots, sessions work, and one warning says they will not survive a restart.

- [X] T031 [P] [US3] Write the failing test: two `createApp` calls in one process share a key; a restart does not (assert the memo, not the process)
- [X] T032 [US3] Emit exactly one warning naming what happens and how to stop it. **Not** per request, and it must not print the key

## Phase 6 — US4 (P2): scaffolding generates a key

**Independent test**: `lockness init` produces a project whose `.env` has a unique key, whose `.env.exemple` has none, and whose first production deploy boots.

- [X] T033 [P] [US4] Write the failing tests in `packages/init/tests/`: the generated `.env` carries a key that passes `assertUsableSecret`; two scaffolds produce different keys; no `.env.exemple` carries one; `.env.production.local` carries its own
- [X] T034 [US4] Inject the key at the `.env.exemple` → `.env` copy in `packages/init/mod.ts:302-308`, calling `generateAppKey()` (§5 row 3). ⚠️ Do **not** template it into `.env.exemple` — that file is committed by the user, and the key would ship with the project
- [X] T035 [US4] Give `.env.production.local` its own generated key at `mod.ts:315-320` (FR-008). Without it a fresh scaffold fails US1 on its first production deploy, and that failure gets "fixed" by pasting a key from a blog post
- [X] T036 [US4] Verify the base `.gitignore.stub` reaches every kit's file manifest. `.env` now carries a real key, so the manifest is security-relevant — check `packages/init/kits.ts`, do not assume

## Phase 7 — Polish and cross-cutting

- [X] T037 **The FR-007 grep becomes a test**, not a checklist: `packages/session/tests/no_placeholder_keys.test.ts` builds the search as an alternation over `REJECTED` itself and asserts zero matches outside `.specnaut/specs/`. R5 concedes the list will need extending again, and a one-off sweep does not survive that
- [X] T038 Clear the **~30 measured sites** in `plan.md` §8's table. All fourteen files, not a sample — including `docs/architecture.md:386`'s `configureSession({ …, secret: 'secret' })`, which FR-004 will make throw
- [X] T039 [P] Write the shutdown-shaped rotation note: `packages/session/docs/DOCS.md`, `README.md`, `types.ts`'s JSDoc. It must say plainly that **every cookie ever issued under a placeholder key stays forgeable until `APP_KEY` is rotated**, and that this release also requires re-issuing the key in the new `base64:` shape (R9)
- [X] T040 [P] Fill `packages/session/AGENTS.md`'s Invariants section — it is a placeholder today — with §6's five invariants, invariant 5 included (never cache the derived key)
- [X] T041 Run the gate: `deno fmt && deno lint && deno check && deno task test`, plus `deno task deps:analyze` — expect **no new package edge**
- [X] T042 **Negative-test every new assertion**: break the thing it claims, confirm red, and chase any "still passes" to its cause. A mis-targeted mutation and an assertion that cannot fail look identical from outside. This branch has two worked examples of the failure mode — `middleware.test.ts:29`, and #136's three unfalsifiable assertions
- [X] T043 Re-run T002's baseline and account for **every** delta, in both directions. A test that started passing is as interesting as one that started failing

---

## Dependencies

```
Phase 1 ─▶ Phase 2 ─┬─▶ Phase 3 (boot)      ─┐
                    ├─▶ Phase 4 (forgery)   ─┤
                    ├─▶ Phase 5 (dev key)   ─┼─▶ Phase 7
                    └─▶ Phase 6 (scaffold)  ─┘
```

Phase 2 blocks everything, and **T018 blocks the feature's meaning**: until
config is resolved inside the handler, no key reaches the cookie driver and every
downstream assertion is measuring the wrong thing. Phases 3–6 are mutually
independent once Phase 2 lands.

## Implementation strategy

**MVP is Phases 1, 2 and 4.** At the end of US2 the forgery is dead and there is
a test replaying #137's own cookie value to prove it — which is what makes the
fix demonstrable rather than asserted.

Phase 6 (scaffolding) carries no security weight on an existing deployment and
can follow if it turns out larger than it looks — the graph already allows that.

## Commit plan

| Commit | Covers |
| :--- | :--- |
| `test(137): reproduce the forgeable session cookie end to end` | T003 |
| `fix(137): resolve session configuration per request, not at factory time` | T017, T018 |
| `feat(137): require APP_KEY to be 32 bytes of real key material` | T004–T009, T021–T026, T031, T032 |
| `fix(137): seal the session cookie with a per-cookie key and reject the rest` | T010–T016, T027–T030 |
| `fix(137): validate the session id at the request boundary` | T019, T020 |
| `feat(137): generate an application key at scaffold time` | T033–T036 |
| `test(137): fail the build on any placeholder key in the tree` | T037 |
| `docs(137): state the key rotation obligation` | T038–T040 |
