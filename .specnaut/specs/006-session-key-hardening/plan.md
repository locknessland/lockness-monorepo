# Plan: Fail closed on the session key, and make it per-deployment

**Backlog item**: [#137 — Session cookie is forgeable: crypto skipped on empty secret, fallback key committed](https://github.com/locknessland/lockness-monorepo/issues/137)
**Branch**: `006-session-key-hardening`
**Status**: awaiting stop-1 answers

---

## 1. Why this exists

**Anyone can log in as anyone.** Not as a theory — every Lockness application
built the documented way emits a session cookie that anybody can write.

**Setting `APP_KEY` does not help.** That is the finding that reshaped this plan,
and it is not what #137 says. Executed against this tree, with a good
32-character key configured exactly as the kernel configures it:

```text
1. at kernel-construction time, global secret = ""
2. after configureSession, global secret = "a-real-32-byte-random-app-key!!!"
3. set-cookie: lockness_session=JTdCJTIyYXV0aF93ZWIlMjIlM0ExJTdE; Max-Age=7200; …
4. >>> DECODES WITH NO KEY (plain base64): {"auth_web":1}
```

Line 3 is **the exact cookie value from #137's report**. The mechanism:

| Step | Where | What happens |
| :--- | :--- | :--- |
| 1 | `loader.ts:136` — `new KernelClass()` | the kernel's field initialiser runs, calling `sessionMiddleware()` |
| 2 | `middleware.ts:41` | the factory **snapshots** `{ ...getSessionConfig(), ...config }` — `defaultConfig.secret` is `''` (`config.ts:13`) |
| 3 | `loader.ts:162` → bootstrap step 110 | `configureSession()` finally sets the real secret — into a global the middleware already copied |
| 4 | `cookie.ts:78` / `:101` | with `secret === ''`, `encrypt`/`decrypt` are `btoa`/`atob`. No encryption, **no MAC** |

So #137's four elements are not four steps of one chain. Elements **3** (the
committed literal `'change-me-in-production'`, `helpers.ts:122`) and **4** (the
constant PBKDF2 salt, `cookie.ts:137`) are **unreachable on the kernel path** —
core resolves the literal and then throws it away. Every kernel application is on
the *no-crypto* path, not the *weak-key* path. The literal and the salt still
matter for anyone who calls `configureSession()` themselves, and they still have
to go, but **fixing key resolution alone fixes nothing.**

The sink is `packages/auth/guards/session_guard.ts:185`: it reads
`auth_<guard>` out of the session and calls `findById(userId)` with no check
that the session was ever issued by this application.

**Also measured, on this tree** (Deno 2.9.6, this machine):

| | |
| :--- | :--- |
| `deriveKey()` — PBKDF2, 100 000 iterations | **13.45 ms**, ≈74 derivations/second/core |
| Derivations per request | up to **2** (one in `read`, one in `write`) |
| The same derivation via HKDF-SHA256 | **0.045 ms** — **301× cheaper** |

The file this feature must touch anyway caps an application at roughly
**37 requests/second/core**, reachable by any unauthenticated client. Fixing the
key without fixing the derivation would leave a denial-of-service amplifier
inside the security fix.

## 2. User scenarios

### US1 — An operator deploys to production without `APP_KEY` (P1)

**Given** an application with `@Kernel({ session: true })` and no `APP_KEY` set,
**when** `APP_ENV=production` and the process boots,
**then** it **exits with a configuration error naming `APP_KEY`** — it does not
start, and it does not print a warning and carry on.

### US2 — An attacker presents a forged cookie (P1)

**Given** a running application on any supported configuration,
**when** a request arrives carrying `lockness_session` set to
`JTdCJTIyYXV0aF93ZWIlMjIlM0ExJTdE` (the base64 of `{"auth_web":1}`), or to a
ciphertext produced under a different deployment's key,
**then** the session reads as **empty**, and the session guard reports
unauthenticated.

### US3 — A developer runs locally with no `APP_KEY` (P2)

**Given** `APP_ENV` unset or `development` and no `APP_KEY`,
**when** the application boots,
**then** it starts, sessions work, and a **random per-process key** is used —
so sessions do not survive a restart, and nothing shared or guessable is in play.
A single warning says so.

### US4 — Somebody scaffolds a new project (P2)

**Given** `lockness init my-app`,
**when** the scaffold finishes,
**then** `my-app/.env` carries a **freshly generated random `APP_KEY`**, the
committed `.env.exemple` carries **no key at all**, and the string
`change-me-in-production` appears nowhere in the generated tree.

### US5 — An existing deployment upgrades (P2)

**Given** a deployment that has been running on the placeholder key,
**when** the operator upgrades,
**then** every previously issued cookie is rejected (users are logged out), and
the release notes state plainly that `APP_KEY` must be rotated because every
cookie ever issued under the placeholder stays forgeable until it is.

### Edge cases

- **`driver: 'memory' | 'deno-kv' | 'redis'`** — these never encrypt anything;
  the cookie carries only a random session id. They must **not** be made to
  require a secret. Only the cookie driver is gated.
- **`Deno.env` without `--allow-env`** — reading `APP_KEY` throws `NotCapable`.
  Treated as *absent*, never as a reason to crash a library consumer.
- **A short secret** — `'x'` is a usable key by the type system and a terrible
  one in fact. A minimum length is enforced; see FR-004.
- **`sessionMiddleware()` called before `configureSession()`** — the factory
  snapshots config at call time (`middleware.ts:41`). A cookie-driver middleware
  built from an unconfigured default must fail at that call, not on the first
  request.
- **Two apps in one process** (every test file that boots two) — the dev random
  key is per-process, so they share it. Acceptable; documented.

## 3. Requirements

**The fix nobody asked for, and without which nothing else works:**

- **FR-012** — `sessionMiddleware()` resolves session configuration **inside the
  returned handler**, not at factory-call time. Today it snapshots at
  `middleware.ts:41`, which the kernel calls before `configureSession` has run
  (§1). Until this lands, no key ever reaches the cookie driver and SC-003 is
  unsatisfiable.

**Failing closed:**

- **FR-001** — `CookieSessionDriver` never falls back to base64. The
  `if (!this.config.secret)` branch is removed from both `encrypt()` and
  `decrypt()`; an unusable secret raises a configuration error instead. **This,
  not the version marker, is the control that kills the base64 forgery.**
- **FR-002** — Exactly **one** function decides whether a secret is usable, and
  every gate calls it rather than re-testing the secret.
- **FR-003** — Core resolves an absent secret as: explicit config → `APP_KEY` →
  (production) *nothing, so the boot fails* / (non-production) a
  **per-process** random key, memoised at module level. **Never a literal.**
  `NormalizedSessionConfig.secret` therefore becomes `string | undefined`.
- **FR-004** — A usable secret is `base64:` followed by **exactly 32 decoded
  bytes** (Q1, settled 2026-09-01). Anything else is refused, including every
  placeholder this project has ever shipped — so the `REJECTED` list becomes a
  *reporting* aid (naming the placeholder in the error's reason) rather than the
  control. The parse, the 32-byte constant and the list live in one file.
  **This makes "is this key material?" a parse, not a guess**, and it is what
  the HKDF swap needs: HKDF does not stretch, so the key must arrive strong.
- **FR-013** — `createDriver`'s `default:` branch is deleted; an unrecognised
  driver name **throws**, naming it. Today it silently builds a cookie driver
  (`drivers/mod.ts:52`), a second predicate over the "which drivers need a
  secret" decision.
- **FR-014** — `SessionConfig.secret` becomes optional and `defaultConfig`'s
  `''` is deleted. A required field whose shipped default is unusable invites
  exactly one fix: putting a generated key back inside the session package.

**The wire format:**

- **FR-005** — Key derivation uses **HKDF-SHA256** with a **16-byte random salt
  per cookie**. No salt constant, no salt in configuration, no `SessionConfig`
  field added.
- **FR-006** — The cookie is `v1.<base64>`: the version is a **plaintext prefix
  outside the base64**, so a wrong or absent prefix is rejected before `atob` is
  ever called. The version is **also** passed as AES-GCM `additionalData`, so it
  is covered by the tag and a future v2→v1 downgrade is not free. FR-006 is
  **format discrimination**; FR-001 is the security control.
- **FR-015** — `iat` and `exp` go **inside** the ciphertext, and `read()` rejects
  an expired payload. `maxAge` (`cookie.ts:60`) is a browser hint an attacker
  ignores, and the cookie driver keeps no server-side record — so today a
  captured cookie authenticates for ever, across the victim's logout. Bought now
  because the format is already breaking; deferred it costs a second forced
  logout of every user.
- **FR-016** — `decode()` validates **structurally, before any crypto call**:
  a raw-length ceiling of 4 096, the `v1.` prefix, then
  `byteLength >= 16 + 12 + 16` after `atob`. Each rejection returns `null` by
  decision; the `catch` becomes a backstop, not the mechanism.
- **FR-017** — The rewritten encoder does not carry `String.fromCharCode(...)`
  forward (`cookie.ts:97`). Spreading a large `Uint8Array` throws `RangeError`
  above ~125 000 bytes — measured — and session payloads are app-influenced.

**Not leaking, and being seen:**

- **FR-018** — No error, log line or event carries the secret value, any
  substring of it, or its length. `SessionSecretError` carries the *reason* and
  the *source* (config / `APP_KEY` / generated), never the value.
- **FR-009** — A rejected cookie is **not** silently swallowed
  (`cookie.ts:43` today). Warn on the first, then a rolling bounded summary
  ("N session cookies rejected in the last 60 s") while the rate is non-zero —
  bounded output that still shows 0/hour → 40k/hour. The **rejection class**
  is logged (bad-prefix / bad-base64 / too-short / tag-mismatch / expired),
  **never the rejected value**; anything contextual goes through
  `safeForLog`.
- **FR-010** — Non-cookie drivers keep working with no secret configured. The
  gate is the cookie driver and the bootstrap step, nowhere else.
- **FR-020** — The session id read from the cookie is validated at the boundary
  (Q2, settled 2026-09-01): `middleware.ts` rejects anything that is not
  `/^[0-9a-f]{64}$/` — exactly what `generateSessionId()` emits (`utils.ts:18`) —
  and falls through to generating a fresh one. One regex, and it closes the
  reachable half of S1's Redis injection *and* `deno_kv.ts:41`'s >2 KiB key
  throw. The underlying byte-length bug in `redis.ts:74` is filed as its own
  item.

**Leaving no key behind:**

- **FR-007** — No placeholder secret ships. The enumerating search is an
  alternation over the `REJECTED` array itself, run **as a test**, not as a
  task: `grep -rnE "<REJECTED joined by |>"` over the tree must return zero
  outside `.specnaut/specs/`. Measured today: **~30 sites** across 14 files,
  including three that a naive 16-character floor would bless —
  `your-secret-key-here` (20), `production-secret-key` (21) and the session
  package's own documented example `a-very-long-secret-key-32-chars` (31).
- **FR-019** — *(amended during implementation, 2026-09-01)* One **shape**, with
  every generation site bound to it by a test. `generateAppKey()` lives beside
  `assertUsableSecret`; core calls it through the loaded session module.
  `packages/init` generates inline instead, because importing the session
  package would pull it — and Hono behind it — into a scaffolder whose contract
  is `allow: ["cli"]`, inverting the tier and breaking SC-006.
  `packages/init/tests/app_key.test.ts` runs init's output through
  `assertUsableSecret`, so the two cannot drift without a red test. The drift
  FR-019 existed to prevent is closed; a shared symbol was only one way of
  closing it, and the other way does not cost a dependency edge.
- **FR-008** — `lockness init` writes a generated key into `.env`, leaves every
  `.env.exemple` keyless, and gives `.env.production.local` its own generated
  key — otherwise a freshly scaffolded project fails US1 on its first production
  deploy, and that failure gets "fixed" by pasting a key from a blog post.
- **FR-011** — `packages/session/docs/DOCS.md`, `README.md`, `types.ts`'s JSDoc
  and the release notes state the rotation obligation from US5.

## 4. Success criteria

- **SC-001** — A cookie carrying `{"auth_web":1}` in any encoding produced
  without the deployment's key never authenticates a user. Demonstrated by a
  test that replays the exact value from #137's report.
- **SC-002** — An application configured for production with no key does not
  serve a single request; it fails during **boot**, with a message naming
  `APP_KEY` and not containing any key.
- **SC-003** — Two applications started with different keys cannot read each
  other's cookies. **Requires FR-012**; unsatisfiable without it.
- **SC-004** — A freshly scaffolded project runs with sessions working and no
  operator action, its key unique to that scaffold, and its first production
  deploy boots.
- **SC-005** — The derivation is HKDF and no iteration count appears in
  `cookie.ts`. Asserted on the **algorithm**, not on wall-clock time — a timing
  assertion is the classic three-cycles-later `ignore: true`.
- **SC-006** — The pre-completion gate is green, and `deno task deps:analyze`
  reports **no new package edge**.
- **SC-007** — The sealed format costs **29 bytes** of overhead before base64
  (16 salt + 12 IV + tag accounting), so a 13-byte payload becomes an 80-byte
  cookie and roughly 3 000 bytes of session data still fit under 4 KB. Measured
  on a working prototype, which also rejected: the exact #137 forgery, a
  bit-flipped ciphertext, a cookie sealed under another deployment's key, and
  the #137 forgery with the version marker prepended.
- **SC-008** — A cookie whose `exp` has passed does not authenticate, and no
  cookie survives the victim's logout **on the drivers this feature covers**.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **Is this secret usable?** | `packages/session/secret.ts` — `assertUsableSecret(secret)` | any second test of the secret — an `if (!secret)` left in `drivers/cookie.ts`, or a check inside `sessionMiddleware()`. **The failing test**: `secret.test.ts` mutates the floor and every gate must move together |
| **The size, the reject list, and the shape** | `packages/session/secret.ts` — `KEY_BYTES` + `KEY_PREFIX` + `REJECTED` + the degenerate-key check, one file. *(`MIN_SECRET_LENGTH` was the first draft's name; Q1 replaced a length floor with a shape parse and the constant went with it.)* | a different number in `types.ts:87`'s JSDoc (it currently says 32 while FR-004 drafted 16), or a placeholder named again in a doc or a stub comment |
| **How a key is generated** | `packages/session/secret.ts` — `generateAppKey()` | a second `crypto.getRandomValues` in `core/kernel/bootstrap/helpers.ts` (FR-003) or in `packages/init/mod.ts` (FR-008). Greppable: `getRandomValues` outside `secret.ts` and `utils.ts` |
| **Where a secret comes from when the app set none** | `packages/core/kernel/bootstrap/helpers.ts` — `normalizeSessionConfig()` | `Deno.env.get('APP_KEY')` reappearing in `config/session.ts`, in the init stubs, or anywhere under `packages/session/` |
| **The dev key is one per process, not one per call** | `packages/core/kernel/bootstrap/helpers.ts` — one module-level memo | generating inside `normalizeSessionConfig`'s body, which is called once per `createApp` and four times in `bootstrap_steps.test.ts` — two apps in one process would then hold two keys, contradicting §2 |
| **What counts as production** | `packages/core/kernel/bootstrap/helpers.ts` — `isProduction()`, reading `DENO_ENV` then `APP_ENV` | any direct `Deno.env.get('APP_ENV') === 'production'`. There were three, and they disagreed with the framework's own container, which sets `DENO_ENV` — so the boot gate was inert in the image it exists to protect. Greppable: `APP_ENV` outside `helpers.ts` |
| **Production refuses to boot without a key** | `packages/core/kernel/bootstrap/steps/session.ts` — one call to the imported `assertUsableSecret` after resolution | an `APP_ENV === 'production'` test written inside the session package, which cannot know its environment. **Not** in `sessionMiddleware()`: the kernel calls that before resolution, so a gate there throws for every application in development |
| **When session configuration is resolved** | `packages/session/middleware.ts` — inside the returned handler (FR-012) | the `{ ...getSessionConfig(), ...config }` spread staying at factory-call time. **The failing test**: `configureSession` after `sessionMiddleware()` and assert the request uses the new secret |
| **Which drivers require a secret** | `packages/session/drivers/mod.ts` — the `switch`, with `default:` deleted (FR-013) | a `default:` branch building a cookie driver for an unrecognised name — a different predicate ("not one of the other three") over the same decision |
| **The cookie wire format** | `packages/session/drivers/cookie.ts` — one `seal`/`open` pair | a second parser anywhere. **The failing test**: `wire_format.test.ts` changes the prefix and exactly one file needs editing. There is no compatibility read path, and there must never be one |
| **How the AES key is derived** | `packages/session/drivers/cookie.ts` — `deriveKey()` | reusing `packages/auth/password.ts`'s PBKDF2 parameters because they look similar. Greppable: `PBKDF2` or `100000` in `cookie.ts` |
| **A rejected cookie is reported at a bounded rate** | `packages/session/drivers/cookie.ts` — one module-level counter beside `read()` | a second flag in `middleware.ts`, or a per-request `console.warn` anywhere. Greppable: `console.warn` outside that one site |
| **The secret never reaches output** | `packages/session/secret.ts` — `SessionSecretError`'s constructor takes a reason and a source, **never the value** | any message interpolating the argument. **The failing test**: assert `err.message` excludes the input on every rejection branch |
| **No literal key ships anywhere** | `packages/session/secret.ts`'s `REJECTED`, consumed by the FR-007 grep test | a placeholder re-added to a `.env.exemple.stub` "so the file looks complete", or to `config/session.ts` "so it type-checks" |

**Binding.** A decision may not move out of its home without this plan being
amended first. A review finding that one of these has two homes is a plan
violation, not a style opinion.

## 6. Technical context

| | |
| :--- | :--- |
| Language / runtime | TypeScript, Deno 2.9.6 |
| Packages touched | `@lockness/session`, `@lockness/core`, `@lockness/init`, plus the root `config/` template |
| Crypto | Web Crypto — HKDF-SHA256 → AES-256-GCM. Both confirmed available on this runtime by execution, not by documentation |
| Testing | `Deno.test` in `packages/*/tests/`; TDD, failing test first |
| Dependency impact | **none** — no new package edge. `session` keeps `allow: ["hono"]`, `core` and `init` already reach what they need |
| Scale | The hot path is every request carrying a session cookie |

**Two `SessionConfig` types exist** and this feature does not merge them:
`@lockness/core`'s (`kernel/kernel_decorators.ts:58`, all-optional, four fields)
and `@lockness/session`'s (`types.ts:67`, required, nine fields). Core's is the
kernel's input; session's is the resolved shape. They are different things that
share a name. Renaming is a separate, breaking change and is **out of scope** —
noted so the implementer does not "fix" it mid-feature.

### Domain model

**Bounded context**: session transport security — how a session's contents
survive the round trip to a browser without being readable or writable by it.

| Term | What it means here |
| :--- | :--- |
| **App key** | The deployment's root secret. `APP_KEY`. High-entropy key *material*, not a password |
| **Usable secret** | An app key that passes `assertUsableSecret` — non-empty, long enough, not a known placeholder |
| **Cookie key** | The AES-256-GCM key for **one** cookie, derived from the app key and that cookie's salt. Never stored |
| **Salt** | 16 random bytes, generated per cookie, public, carried on the wire |
| **Sealed payload** | `version ‖ salt ‖ iv ‖ ciphertext`, base64. The only shape the driver emits or accepts |

**Entities**: none — nothing here has identity or a lifecycle. All four are
value objects.

**Invariants**:
1. A sealed payload is produced only from a usable secret. There is no
   unauthenticated encoding path.
2. Every sealed payload has a distinct salt — with overwhelming probability, from
   16 random bytes, not by construction. Nothing stricter may be built on it.
3. A payload whose version prefix is absent or unrecognised is rejected before
   `atob` is called, and the version is covered by the GCM tag.
4. The app key never leaves the process — not into a cookie, not into a log, not
   into an error message, not as a length.
5. **The cookie key is never cached or reused across cookies.** Because the salt
   is fresh per cookie, each key encrypts exactly one message, so the ~2³²
   random-96-bit-IV ceiling does not apply. Caching the derived key — the first
   optimisation anyone proposes on seeing HKDF called per request — silently
   reinstates that bound. If it is ever cached, the IV must become a counter.

**Out of scope**, and *why* — the reasons were wrong in the first draft and are
corrected here:

| | |
| :--- | :--- |
| Session **id** signing for the non-cookie drivers | **Not** a fixation concern — fixation is already mitigated by `regenerate()` on login (`session_guard.ts:265, 302, 332`) over a 256-bit CSPRNG id. What is genuinely unaddressed is an unvalidated, attacker-controlled, URL-decoded string reaching a storage backend as a key (`middleware.ts:48` → `redis.ts:114` / `deno_kv.ts:41`). See Q2 |
| Key rotation for running deployments | The release note tells operators to rotate; the framework does not do it for them |
| The two `SessionConfig` types | `core`'s (`kernel_decorators.ts:58`, all-optional, four fields) and `session`'s (`types.ts:67`) are different things sharing a name. Merging them is a separate breaking change |

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| 1 — no direct `hono` import | ✅ **Not a violation — I was wrong to record one.** `packages/session/deno.json` maps `"hono": "jsr:@lockness/hono@^0.2.0"`, so the bare `hono` specifier inside this package *is* the Lockness re-export layer. Same in `auth` and `core`. The rule is about the registry the specifier resolves to, not its spelling, and it resolves correctly. Discovered by tracing an unpinned `jsr:@hono/hono@*` entry that my own "fix" put into `deno.lock` |
| 2 — JSR-only, declared per package | ✅ no dependency added |
| 3 — no `any` in exported APIs | ✅ |
| 4 — Tailwind v4 syntax | n/a — no UI surface |
| 5 — pre-completion gate | ✅ SC-006 |
| 6 — never hand-edit `deno.lock` | ✅ untouched |
| 7 — JSDoc on public APIs | ✅ `assertUsableSecret` and the new error type are exported and documented |
| 8 — MVC layering | n/a — no controller involved |
| 9 — one category per commit | ✅ commit plan in `tasks.md`: `fix(137)` for the crypto, `feat(137)` for the scaffolder, `docs(137)` for the rotation note |
| TDD non-negotiable | ✅ every FR gets its failing test first |
| No silent catches | ⚠️ **`drivers/cookie.ts:43` is one today** — `catch { return null }`. FR-009 fixes it as part of this work |
| Domain Model gate | ✅ §6 |

### Complexity tracking

**Empty.** The one entry this section carried — four `import type { Context } from 'hono'` statements accepted as a pre-existing rule violation — was not a violation at all; see row 1 above. Rewriting the imports "to comply" replaced a correctly declared, pinned alias with an **undeclared** specifier, which resolved by workspace member name and wrote an unpinned `jsr:@hono/hono@*` into `deno.lock`. Reverted.

The lesson is worth more than the entry: hard rule #2 says the rule is about the **registry, not the spelling**, and I applied it to the spelling. A lockfile diff caught it; no test would have.

## 8. Surface impact

| Surface | Impact |
| :--- | :--- |
| **HTTP / the wire** | **Breaking.** The cookie format changes; every existing session cookie is rejected and every user is logged out once. That is the intended outcome — the old ones are forgeable |
| **`@lockness/session` public API** | **Added**: `assertUsableSecret`, `generateAppKey`, `SessionSecretError`. **Changed**: `SessionConfig.secret` becomes optional (FR-014) |
| **`@lockness/core` public API** | Unchanged. `normalizeSessionConfig` is internal to bootstrap — but its return type gains `secret?: string` |
| **Boot behaviour** | **Breaking for a misconfigured production deployment** — it now refuses to start where it previously warned and served forgeable cookies. This is the feature |
| **Session lifetime** | **Breaking.** FR-015 makes `exp` real: a session now genuinely expires server-side, where before `maxAge` was advisory |
| **`lockness init` output** | `.env` and `.env.production.local` each gain their own generated key; every `.env.exemple` loses its placeholder |
| **CLI** | None. No `key:generate` command in this scope — `init` generates, and an operator rotating by hand uses any 32-byte source |
| **Front-end** | None. No front-end surface in this feature's blast radius, so there is no prototyping step |

### Documentation and stubs — the measured list

`grep -rnE "APP_KEY=|secret: *'"` over the tree, excluding `.specnaut/specs/`
and the session tests, returns **~30 sites across 14 files**. All of them, not
a sample:

| File | Sites | What changes |
| :--- | ---: | :--- |
| `docs/architecture.md` | 8 | six `secret: 'secret'` / `'your-secret'` examples, incl. `:386`'s `configureSession({ …, secret: 'secret' })` which FR-004 will make throw |
| `packages/session/README.md` | 6 | incl. `:352`'s bare `secret: 'secret'` |
| `packages/init/docs/DOCS.md` | 3 | `your-secret-key-here` ×2, `production-secret-key` |
| `packages/init/stubs/kits/{web,api,slim}/.env.exemple.stub` | 3 | `change-me-in-production` → keyless |
| `packages/session/docs/DOCS.md` | 1 | `a-very-long-secret-key-32-chars` — the package's own example, copy-pasted, and a naive floor would bless it |
| `packages/session/types.ts:59,87` | 2 | the example key, and the JSDoc's "at least 32 characters" which contradicts FR-004 |
| `packages/session/config.ts:13` | 1 | the `''` default, deleted by FR-014 |
| `packages/core/kernel/bootstrap/helpers.ts:122,126` | 2 | the literal and the `console.warn` |
| `packages/init/stubs/init/{.env.exemple.stub,config/session.ts.stub}` | 2 | `your-secret-key-here-change-in-production` — **not** a superstring of `change-me-in-production`, so the first-draft grep missed it entirely |
| `config/session.ts:11`, `.env.exemple:4` | 2 | the repo's own app template |
| `packages/init/{README.md:222}`, `packages/init/stubs/kits/slim/README.md.stub:64` | 2 | |
| `packages/core/README.md:116`, `packages/core/docs/kernel.md:170`, `packages/core/docs/kernel-decorator.md` | 3 | |
| `docs/getting-started.md:164`, `packages/auth/README.md:106` | 2 | |
| `packages/session/AGENTS.md` | — | its Invariants section is a placeholder; §6's five invariants go there |

FR-007 turns this list into a **test**, not a checklist — R5 concedes the reject
list will need extending again, and a one-off sweep does not survive that.

## 9. Risks

| # | Risk | Mitigation |
| :--- | :--- | :--- |
| R1 | **A running deployment stops booting on upgrade.** Someone on the placeholder key in production upgrades and the process refuses to start | This is the correct behaviour and the error names `APP_KEY` explicitly. Called out at the top of the release notes, not in a footnote |
| R2 | **Everyone is logged out.** The format change invalidates every cookie | Intended. Stated in the release notes beside R1 |
| R3 | **The dev random key surprises someone.** Sessions vanish on restart in development | One warn line at boot saying exactly that, and how to stop it (`APP_KEY=…`) |
| R4 | **HKDF is the wrong primitive if `APP_KEY` is a human-typed password.** HKDF does not stretch; a weak key stays weak | **Closed by Q1.** FR-004 refuses anything that is not 32 decoded bytes, so a typed passphrase cannot reach the derivation at all. The first draft's 16-character floor did not close this and the plan claimed it did |
| R9 | **Every existing deployment must re-issue its key**, on top of the forced logout | Both land in the same release note, as one instruction with one command. An operator who ignores it gets a boot failure naming `APP_KEY`, not a silent downgrade |
| R5 | **The reject list ages.** A future placeholder gets shipped and is not on it | FR-007's grep is the enforcement, and it is a task, not a hope |
| R6 | ~~A timing assertion (SC-005) is flaky~~ | **Removed.** SC-005 now asserts the algorithm, not the clock |
| R7 | **The sub-16-character test literals are a tripwire.** Seven secrets under 16 characters live in `store.test.ts` and `middleware.test.ts`, all on `driver: 'memory'` and therefore ungated. The moment the gate moves upstream of the driver — into `configureSession`, `SessionStore` or `normalizeSessionConfig` — all seven fail at once | Stated here so the implementer does not "simplify" the gate's location. Row 6 of §5 is the binding statement |
| R8 | **A green suite is not evidence here.** `middleware.test.ts:29` is named "persists data across requests", never makes the second request, and passes over a driver that does not persist at all | Every new assertion in this feature is negative-tested: break the thing it claims, confirm red, chase any "still passes" to its cause |

## 10. Architecture audit

`architect-expert`, dispatched on this plan before a line of code existed.
**Verdict: fail** — 2 CRITICAL, 4 HIGH, 4 MEDIUM, 1 LOW, over 15 files.
Every finding below was re-verified here before being accepted.

| # | Finding | Disposition |
| :--- | :--- | :--- |
| A1 | **CRITICAL — the kernel's secret never reaches the middleware.** `sessionMiddleware()` snapshots config at call time (`middleware.ts:41`); the call happens in the kernel's field initialiser, run by `new KernelClass()` at `loader.ts:136`; `configureSession` runs at `loader.ts:162`, in bootstrap step 110. The middleware therefore holds `defaultConfig` — `secret: ''` | **Accepted, and confirmed by execution.** Plan changed: §1 rewritten, **FR-012** added. See the proof below |
| A2 | **CRITICAL — §5 row 4 ("production refuses to boot" falls out of the other rows) is refuted.** A gate in `sessionMiddleware()` throws for every kernel application in development; without it the only gate is `createDriver`, called per request, which yields 500-per-request rather than a boot failure — contradicting SC-002 | **Accepted.** Row 4 given a real home: `packages/core/kernel/bootstrap/steps/session.ts`, the only place holding both the resolved secret and the environment. The `sessionMiddleware()` gate is dropped |
| A3 | **HIGH — FR-009 (warn once per process) has no row**, and two plausible homes exist | **Accepted.** Row added |
| A4 | **HIGH — key *generation* is needed in core (FR-003) and init (FR-008) and homed in neither.** Two implementations get written with different lengths, and one ends up below FR-004's own floor | **Accepted.** `generateAppKey()` added to `packages/session/secret.ts` with its own row; core and init both consume it. No new package edge — `core` already allows `session`, `init` reaches what it needs |
| A5 | **HIGH — §5 row 5's home is a per-request factory with an unnamed second construction site.** `drivers/mod.ts:52`'s `default:` branch builds a `CookieSessionDriver` for *any* unrecognised driver string, a different predicate over the same decision | **Accepted.** **FR-013** added: the `default:` branch is deleted and an unknown driver throws |
| A6 | **HIGH — FR-007's grep misses two shipped placeholders and FR-004's list blesses three more.** `your-secret-key-here-change-in-production` is not a superstring of `change-me-in-production`; `your-secret-key-here`, `production-secret-key` and `a-very-long-secret-key-32-chars` all pass a 16-character floor | **Accepted, and the count was low.** Re-measured here: **~30 shipped sites** carry a placeholder secret. FR-004 and FR-007 rewritten so the search is an alternation over `REJECTED` itself |
| A7 | MEDIUM — FR-004's minimum length has no home, and `types.ts:87` already ships a *different* number ("at least 32 characters") | **Accepted.** `MIN_SECRET_LENGTH` homed beside `REJECTED`; `types.ts` added to §8 |
| A8 | MEDIUM — FR-003's dev key is per-**call**, not per-process; §2's edge case claims the opposite | **Accepted.** Stated as a module-level memo in `helpers.ts`, with its own row |
| A9 | MEDIUM — `defaultConfig.secret: ''` survives the plan, so the package still ships a required field whose default is by its own definition unusable | **Accepted.** **FR-014**: `secret` becomes optional and the `''` default is deleted |
| A10 | MEDIUM — §5's third column is not greppable for three of eight rows | **Accepted.** Those rows now name the failing test instead of a string to match |
| A11 | MEDIUM/LOW — §8 under-enumerates the sites; FR-011's rotation note has five homes | **Accepted for §8** (rewritten against the measured list). **Rotation note: objection recorded, not acted on** — five prose restatements of one sentence is the normal cost of documentation, and a canonical-source mechanism for it is a bigger change than the sentence |
| A12 | Advisory — SC-005's wall-clock assertion is the classic three-cycles-later `ignore: true`; assert the algorithm instead | **Accepted.** SC-005 rewritten to assert HKDF and the absence of any iteration count |

**A correction I made to the audit, which was itself wrong — measured after the
fact.** I wrote that its "1 test, 1 file" prediction did not hold, and that the
three `bootstrap_steps.test.ts` tests would all stay green. Two of them broke:
`:45` and `:53` assert `assertExists(config.secret)` with the comment *"Should
have a default"*, and there is no default any more. The one the audit actually
named — the `APP_ENV=production` test at `:64` — did stay green, because it
asserts `secure`, not the secret.

So the audit was right that a test breaks and I was wrong to dismiss it; it was
wrong about which one, and about the count (two, not one). Both assertions were
rewritten to assert the **absence**, which is the new contract. The type change
I predicted also happened: `NormalizedSessionConfig.secret` is now
`string | undefined`.

### The A1 proof

Run against this tree, `configureSession` given a good 32-character key
*after* the middleware was built, exactly as the kernel orders it:

```text
1. at kernel-construction time, global secret = ""
2. after configureSession, global secret = "a-real-32-byte-random-app-key!!!"
3. set-cookie: lockness_session=JTdCJTIyYXV0aF93ZWIlMjIlM0ExJTdE; Max-Age=7200; …
4. >>> DECODES WITH NO KEY (plain base64): {"auth_web":1}
```

Line 3 is **the exact cookie value from #137's report**, emitted by an
application whose key is set correctly. Two things follow, and both change the
work:

- **#137's elements 3 and 4 are not reachable on the kernel path at all.** The
  committed literal and the constant salt are resolved by core and then thrown
  away. Every kernel application is on the *no-crypto* path, not the
  *weak-key* path.
- **Setting `APP_KEY` today fixes nothing**, and SC-003 is unsatisfiable until
  FR-012 lands, because both applications hold `''`.

## 11. Security audit

`security-expert`, dispatched on this plan in the same message as §10, before a
line of code existed. **Verdict: fail** — 1 CRITICAL, 2 HIGH, 6 MEDIUM, 4 LOW.
It confirms the plan's core thesis: FR-001/003/007 do kill both #137 forgery
paths, and the HKDF swap is the right call on the hot path. Every finding was
re-verified here before being accepted.

| # | Finding | Disposition |
| :--- | :--- | :--- |
| S1 | **CRITICAL — Redis RESP command injection, reachable from the session cookie.** `redis.ts:74` writes `` `$${arg.length}` `` — UTF-16 code units — then `encoder.encode()` emits UTF-8. Any multibyte character makes the declared bulk length short by an attacker-chosen amount, and the session id is an unvalidated cookie value that Hono has already URL-decoded (`middleware.ts:48`). The socket is shared across requests (`redis.ts:55-65`), so a desynced reply hands one user's session blob to another | **Confirmed by execution** — `'session:' + 'é'×5` declares 13 bytes and writes 18. **Open question Q2**: this is a defect in a non-default driver, unrelated to #137 |
| S2 | **HIGH — the sealed cookie carries no expiry and logout invalidates nothing.** `destroy()` (`cookie.ts:64-69`) deletes the client copy; `regenerate()` (`:71-74`) is a no-op; `maxAge` is a browser hint. A captured cookie authenticates for ever | **Accepted. FR-015 added.** The argument is decisive: the format is already breaking and every user is already being logged out once. Two integers inside the ciphertext are free now and cost a second flag day later |
| S3 | **HIGH — FR-004's 16-character floor does not supply the 128 bits §12 claimed.** 16 *characters* is 128 bits only if each is a uniform random byte; a human-chosen 16-character secret carries ~25–40. The plan handed the offline attacker the same 301× speedup it gave the request path, and the compensating control was a character count | **Accepted; §12's arithmetic was wrong.** **Open question Q1** — the fix changes `APP_KEY`'s public contract |
| S4 | MEDIUM — the version byte is outside the GCM tag, so a v2→v1 downgrade is free the day a v2 exists | **Accepted.** FR-006: the version is passed as `additionalData` |
| S5 | MEDIUM — FR-006 ("rejected without being parsed") contradicted §6's version-inside-base64 format, and misattributed to the marker a control FR-001 provides | **Accepted.** Resolved to a plaintext `v1.` prefix *outside* the base64 — which makes "before parsing" literally true and hands FR-016 its bound for free — plus the AAD binding from S4. FR-006 now names FR-001 as the control |
| S6 | MEDIUM — no FR forbade the secret reaching an error or a log; §6's invariant 4 had no test, and §7 promises a test per FR | **Accepted. FR-018 added**, including the note that reporting the *length* is itself key metadata |
| S7 | MEDIUM — "once per process" is the wrong throttle: it fixes flooding by creating an alerting blind spot, and "log a rejected cookie" is where someone attaches attacker-controlled bytes | **Accepted.** FR-009 reshaped to a bounded rolling summary that logs the rejection *class*, never the value |
| S8 | MEDIUM — the decode path fails closed only via the `catch`; no length ceiling, no structural check before the crypto call | **Accepted. FR-016 added** |
| S9 | **MEDIUM — `redis.ts:143` passes `this.config.db` where a lifetime is expected.** With the default `db = 0`, `0 ?? 7200` does not fire, `SETEX key 0` errors, and `store.ts:84` never runs — so **the session id is not rotated on login** on the redis driver | **Confirmed by reading. Open question Q3.** It invalidates a premise §6 relied on |
| S10 | LOW — `createDriver`'s `default:` silently builds a cookie driver for a typo'd driver name | **Accepted.** FR-013 |
| S11 | LOW — `String.fromCharCode(...)` at `cookie.ts:97` throws `RangeError` on a large session payload | **Accepted. FR-017.** Confirmed by execution: the limit is between 125 000 and 200 000 bytes |
| S12 | LOW — FR-008 said nothing about `.env.production.local`, so a scaffolded project fails US1 on its first production deploy | **Accepted.** FR-008 extended |
| S13 | LOW — "non-cookie drivers keep working" may not be true of the memory driver: `createDriver` runs per request (`middleware.ts:45`) and `MemorySessionDriver`'s `Map` is instance state (`memory.ts:27`). *The audit flagged this as unverified* | **Confirmed by execution. Open question Q3** — and worse than reported, see below |

### Two corrections and one addition

- **S13 is confirmed, and the test that should have caught it cannot fail.**
  Driving a real request pair through `sessionMiddleware()` on the memory driver:
  request 1 sets `auth_web = 42`, request 2 — carrying the returned cookie —
  sees `null`. Memory sessions do not persist across requests at all.
  `packages/session/tests/middleware.test.ts:29` is named
  *"persists data across requests"*, defines a `/get` route, **never calls it**,
  and asserts only `res1.status === 200`. It is inert by construction.
- **S1's classification of §6 is right and its remedy is bigger than one line.**
  §6 called the unsigned id cookie "a fixation concern"; fixation is in fact
  already mitigated by `regenerate()` on login (`session_guard.ts:265, 302, 332`)
  over a 256-bit CSPRNG id. What §6 actually scoped out was an unvalidated
  attacker-controlled string reaching a storage backend as a key. §6 is
  rewritten accordingly whatever Q2 decides.
- **The strongest property of this design is one the plan did not claim.**
  Because the salt is fresh per cookie, each derived key encrypts exactly **one**
  message, so the ~2³² random-96-bit-IV ceiling does not apply. That matters
  because the first optimisation anyone proposes on seeing HKDF called per
  request is "cache the derived key" — which silently reinstates the collision
  bound. Added as **invariant 5**: *the cookie key is never cached or reused
  across cookies; if it ever is, the IV must become a counter.* Invariant 2 is
  also reworded — a random 16-byte salt gives distinctness with overwhelming
  probability, not by construction.

## 12. Open questions

Three, ordered so the one that constrains the others comes first. Answers are
recorded here as settled decisions, with their date, before `tasks` runs.

### Q1 — What shape must `APP_KEY` be? — **settled 2026-09-01**

**`base64:` + exactly 32 decoded bytes**, Laravel's shape. Chosen over a length
floor and over branching on shape. It is the only option that turns "is this key
material?" into a parse, and it makes FR-008's generated key the one shape that
passes — so the common path can never involve a typed passphrase.

**Cost, accepted**: every existing deployment must re-issue its key at upgrade,
on top of the forced logout. Recorded as R9 and carried in the release note.
Rejected: the length floor (leaves the weak-key path open for anyone who types
one) and the branch-on-shape design (two derivation paths to maintain, test and
version, for a case FR-008 should make empty).

### Q2 — The Redis RESP injection (S1) — **settled 2026-09-01**

**Validate the id here; file the RESP encoder bug.** FR-020 adds the boundary
regex, which closes the reachable path and `deno_kv.ts:41` at the same time. The
UTF-16/UTF-8 length-prefix defect at `redis.ts:74` becomes its own item, so the
security diff for #137 stays readable.

**Known residual**: the encoder stays wrong until that item ships. It is no
longer reachable from a session cookie, but any other non-ASCII argument —
`AUTH` with a non-ASCII password is the live one — still desyncs the stream.
The item says so.

### Q3 — Two confirmed defects in the files this feature touches — **settled 2026-09-01**

**Both filed, neither fixed here.** S9 (`redis.ts:143` passing `config.db` as a
lifetime, so login does not rotate the session id) and S13 (memory sessions do
not persist, and `middleware.test.ts:29` cannot fail).

**Known residual, stated because it is uncomfortable**: the inert test stays
green and misleading until its item is picked up. It is named in the item, and
R8 makes negative-testing mandatory for every assertion this feature adds — so
the class of defect does not repeat inside this branch.

### Decided without asking

| Decision | Why it did not need asking |
| :--- | :--- |
| No backward-compatible read path for old cookies | Reading them is the vulnerability. A compatibility window is a window in which forged cookies still work |
| `iat`/`exp` inside the ciphertext now (FR-015) | The format is already breaking and every user is already being logged out once. Deferred, it costs a second flag day for two integers |
| The version as a plaintext `v1.` prefix **and** as GCM `additionalData` | Resolves S5's contradiction in the direction that also gives FR-016 its pre-`atob` bound, and closes S4's downgrade at the same time |
| Non-cookie drivers stay ungated | They never encrypt; requiring a secret would break working configurations to protect nothing |
| The session package never reads `Deno.env` | It cannot know whether it is in production, and reading env from a library needs a permission its consumer did not ask for |
| The reject list is exact-match, not a heuristic | A "looks weak" heuristic rejects legitimate keys and is a support burden. An exact list of what this project actually shipped is complete for the problem at hand |
| The rotation note stays restated in five places (A11) | Five prose restatements of one sentence is the ordinary cost of documentation; a canonical-source mechanism for it is a bigger change than the sentence |
