# Plan: drop the two fleet-compatibility shims (#278 + #322)

| | |
| :--- | :--- |
| **Branch** | `254-drop-compat-shims` |
| **Backlog** | [#278](https://github.com/locknessland/lockness-monorepo/issues/278) — remove the legacy revocation dual-read path<br>[#322](https://github.com/locknessland/lockness-monorepo/issues/322) — make the watched-channel caps refuse |
| **Packages** | `@lockness/realtime` (only) |
| **Created** | 2026-09-08 |

---

## 1. Why this exists

**Two shims in `@lockness/realtime` defer to a fleet that does not exist.** Both
were written as one half of a two-release plan, and the second release was never
cut. Measured on 2026-09-08:

| Measurement | Command | Result |
| :--- | :--- | :--- |
| Published releases | `gh release list` | **`v0.2.0` only** (2026-08-31) |
| Is #276 released? | `git tag --contains 5b13f0b2` | **empty — unreleased** |
| Unreleased work | `git rev-list --count v0.2.0..main` | **506 commits, ~155 issues** |

Because no version carrying #276 has ever shipped, the population the revocation
dual read protects — a fleet mid-upgrade from a pre-#276 instance — has never
existed and now never will: the user confirmed on 2026-09-08 that Lockness has
no users, so no `v0.2.0` deployment will roll to `v0.3.0`. The same holds for the
caps: the WARN release whose only job was to collect real channel counts was
never published, so #322's second acceptance criterion ("read what the warning
release actually collected") is **undecidable, permanently**.

What the shims cost today, on `main`:

- **`listRevoked` spends 1 + N round-trips** instead of the flat 1 that #276
  bought. `#legacyRevoked` issues an `SMEMBERS`, then one `EXISTS` **per member**
  (`drivers/redis.ts:1484`), on every reconcile tick.
- **Two key names sit outside #288's anchoring.** Every other derived name is
  behind `RESERVED_SEPARATOR_LEAD` (`__`), which no accepted prefix may contain.
  `legacyRevokedIndexKey` and `legacyRevokedKey` keep the old `:` shape, and `:`
  **is** in `PREFIX_RE` (`/^[A-Za-z0-9:._-]{1,64}$/`) — so prefix `app` with
  target `revoked` and prefix `app:revoked` both derive `app:revoked:revoked`,
  one a marker string and one a SET. Cross-prefix collision, plus `WRONGTYPE`.
- **`ChannelLimitError` is exported and never raised.** Two documented caps
  admit every breach with a `console.warn` promising a refusal in "the next
  release".

**The framework's own words on why this matters** (`manager.ts`, FR-017b): *"a
deprecation shim nobody deletes is how a two-release plan becomes a permanent
one."* Both shims are now that, and this branch is the deletion.

---

## 2. User scenarios

### US1 — a revocation reconcile costs one round trip (P1)

**Given** an app using `RedisBroadcastDriver` with durable revocations,
**when** its periodic revocation reconcile runs,
**then** exactly one command reaches Redis (the `EVAL`), regardless of how many
connections are revoked.

**Given** a prefix containing `:` (e.g. `app`, `app:revoked` — both accepted by
`PREFIX_RE`),
**when** two apps share one Redis with those two prefixes,
**then** no key derived by one is reachable by the other.

### US2 — a cap breach is refused, not silently admitted (P1)

**Given** an instance already watching `maxWatchedChannels` distinct channels,
**when** a client subscribes to one more **not yet hosted**,
**then** `subscribe` throws `ChannelLimitError` with scope `'instance'`, the
actual count and the limit, **and no membership anywhere is mutated** — the
connection is not registered, no presence member is added, no broker watch is
issued.

**Given** a connection already holding `maxChannelsPerConnection` channels,
**when** it subscribes to one more it does not already hold,
**then** the same, with scope `'connection'`.

### US3 — an operator moves a cap instead of forking (P2)

**Given** a deployment that legitimately needs more than 1 000 watched channels,
**when** it constructs its `ChannelManager` with
`{ maxWatchedChannels: 5_000 }`,
**then** the instance cap is 5 000 and the connection cap keeps its default.

### Edge cases

| Case | Expected |
| :--- | :--- |
| A join that grows **no** set (2nd client on a hosted channel; re-join of a channel the connection holds) | Admitted. It adds no broker subscription, so it is charged against no cap. **This is #295/FR-017 and it must keep passing unchanged.** |
| Cap value `0` | Refused at construction — a cap of 0 refuses every subscribe, which is never the intent and is silent in every log. |
| Cap value negative or non-integer | Refused at construction, same reason. |
| A residual `{prefix}:revoked` SET left in a real Redis | Ignored — nothing reads it. Operators are told they may delete it; it has no TTL and would linger forever. |
| `listRevoked` reply not the shape expected | Unchanged from #276 — "nobody is revoked" and "malformed reply" stay distinguishable. |

---

## 3. Requirements

> **Amended 2026-09-08** after both plan audits. Requirements added or corrected
> by a finding carry its tag (`A-n` architecture, `S-n` security).

**#278 — the revocation dual read**

- **FR-001** `#legacyRevoked`, `legacyRevokedIndexKey` and `legacyRevokedKey` are
  deleted from `packages/realtime/drivers/redis.ts`.
- **FR-002** `listRevoked` issues **exactly one** command. Its remaining
  in-charset filter (`isValidName`) stays: it guards the new sorted set's
  members, not the legacy path.
- **FR-003** Every name the driver derives is anchored behind
  `RESERVED_SEPARATOR_LEAD`. After FR-001 there is no documented exception left,
  so **both** registers of the exemption go: the getter docstring at
  `drivers/redis.ts:1025-1041`, and `UNANCHORED_BY_DESIGN` with its branch at
  `tests/prefix_anchoring.test.ts:831-834` / `:864-871`, which makes
  `FR-004 source` unconditional. *(A-2, S-4)*
- **FR-003b** The anchoring assertion additionally requires the character after
  the lead-in not to be `_`. The collision proof holds only because no separator
  tail begins with `_`; a getter spelled `${prefix}___queue:` passes today's
  assertion and reopens the collision for the accepted pair (`app`, `app_`).
  *(S-5)*
- **FR-004** Every site in `packages/realtime/tests/` that names a legacy symbol
  is updated. The set is **six files, 32 references**, enumerated by
  `grep -rn 'legacyRevoked' packages/realtime/` — not by this list, which is the
  starting point and not the boundary: *(A-5, A-7, A-8)*

  | File | Sites |
  | :--- | :--- |
  | `prefix_anchoring.test.ts` | `PREFIX_MEMBERS` `:166`, `exercise` `:264`, `CANNED.SMEMBERS`/`.EXISTS` `:214-218`, `shapes` `:445`, `UNANCHORED_BY_DESIGN` `:831`, the header docstring `:145` (**already wrong — it says nine, the list holds ten**) |
  | `mutations/connection_id_304.ts` | `:105` and `:120-123` — two anchors quoting code FR-001 deletes |
  | `live_realtime.ts` | `:71` and `:82` — a **required** field of the key-name fixture |
  | `connection_id_charset.test.ts` | 1 reference |
  | `revocation_atomicity.test.ts` | the two FR-009 tests (FR-005) |
  | `drivers/redis.ts` | 8 (FR-001) |

- **FR-005** The two `#276 FR-009` tests in `revocation_atomicity.test.ts` are
  removed. They exist only to cover the deleted path.
- **FR-005b** The `#304` mutation battery's two rows are **retired with their
  reasons transcribed, not deleted to go green.** Row `:120-123` carries the only
  written rationale for FR-002's surviving `isValidName` filter; that rationale
  moves into `listRevoked`'s docstring before the row goes. The harness fails
  loudly on a zero-hit anchor, so this is a scheduled edit, not a discovery.
  *(A-7)*

**#322 — the watched-channel caps**

- **FR-006** Both `console.warn` branches in `#checkChannelCaps` become
  `throw new ChannelLimitError(scope, count, limit)`.
- **FR-007** The refusal happens **before any membership mutation and after
  authorization** — verified in place at `manager.ts:532`, after the identity
  check `:515` and the authorizer `:519`, before `connections.set` `:533`.
  FR-007 is the requirement that it stays there, asserted rather than assumed.
- **FR-008** `ChannelManagerOptions` gains `maxWatchedChannels?: number` and
  `maxChannelsPerConnection?: number`, defaulting to the two exported constants.
  `#checkChannelCaps` reads **private fields only** — the four constant reads at
  `manager.ts:607,612,620,626` all become field reads.
- **FR-009** Cap validation at **construction**, spelled explicitly because two
  plausible spellings are wrong: *(S-7)*
  - the predicate is `Number.isInteger(v) && v > 0` — this refuses `NaN`,
    `±Infinity`, `1.5`, `-1`, `0` and any string from `JSON.parse` / `Deno.env`;
  - resolution is `??`, **never `||`** — with `||` a supplied `0` silently
    becomes `1_000` and SC-008's zero case never reaches the throw, which is the
    "silently repairs rather than refuses" shape §5 row 3 forbids;
  - a third refusal: `maxChannelsPerConnection <= maxWatchedChannels`. Without
    it one connection can consume the entire instance budget.
- **FR-010** Every stale promise is deleted, and the enumeration is **eleven
  sites, not four**: *(A-3, A-4)*
  - `manager.ts:588`, `:596`, `:612`, `:626` — `#checkChannelCaps`'s doc comment
    and both WARN bodies, plus the stray duplicate `@param` block above it;
  - `manager.ts:41-47` — `ChannelLimitError`'s "Exported from the first release
    and raised from the second";
  - `channel_watch_295.test.ts:176`, `:196`, `:208`, `:213`, `:342`, `:369`.
- **FR-010b** `MAX_WATCHED_CHANNELS`'s docstring (`manager.ts:25-32`) says the
  value is **"Not a free choice"** — jointly determined with #295's SC-007 (the N
  a full reconnect re-issue is proven at) and R-8 (the post-outage revocation
  window). FR-008 makes it exactly a free choice. The docstring is rewritten to
  say that the **default** carries those two couplings and that raising the cap
  voids both, and FR-013's upgrade note repeats it where operators pick a value.
  This is not a wording tidy: an operator following US3 to 5 000 invalidates a
  proof and a risk bound, and today the only sentence that would tell them says
  the opposite. *(A-3)*
- **FR-011** **Both** `#295/SC-017` tests are rewritten from "WARNs and admits"
  to "raises `ChannelLimitError` and leaves membership unchanged" — the
  connection branch at `channel_watch_295.test.ts:175` **and** the instance
  branch at `:324`. #322's anchor list says one test per id and is wrong; each id
  names two. *(A — the inherited error)*
- **FR-012** **Both** `#295/FR-017` tests are addressed, and neither passes
  "unchanged": *(A-9)*
  - `:217` (a join that grows no set) keeps its behaviour, but its only cap
    assertion — `warnings.filter(…) === []` at `:243-247` — becomes a tautology
    once no `console.warn` remains. It is replaced by an assertion that no
    `ChannelLimitError` is thrown, which is the guard the test is credited with.
    It also exercises the **connection** cap only, so SC-006's instance half
    needs a test that does not exist yet.
  - `:367` is titled *"ChannelLimitError is a usable error today, before it is
    ever raised"* — a title that becomes false one file from the code that
    raises it. Retitled and its `unraisable` body reworked.
- **FR-016** `ChannelLimitError`'s **message** drops the count and the limit; both
  stay as the typed `readonly` properties they already are, which is what
  server-side logging reads. The count is instance-wide and reachable by a caller
  that ran no authorizer, and most apps wire `onError` to a close-frame reason.
  FR-013 says the message must not be forwarded to a client. *(S-3)*
- **FR-017** `ChannelLimitError.scope` is documented as an **open** set that
  consumers must handle unknown values from. It is an exported closed union
  (`'instance' | 'connection'`, `manager.ts:64`) that FR-006 makes load-bearing;
  widening it after apps switch on it exhaustively is a published-type break.
  One JSDoc line inside FR-010's rewrite. *(S-2)*
- **FR-018** **Identified-connection headroom** (Q4, settled 2026-09-08). A
  connection with `identity === null` may join an already-hosted channel freely,
  but may only cause a **0→1 hosted-channel transition** while the instance holds
  fewer than `floor(maxWatchedChannels × anonymousHostingShare)` channels. The
  remaining share is reachable only by an identified connection. *(S-1)*
  - `ChannelManagerOptions` gains `anonymousHostingShare?: number`, default
    **`0.8`**. Its predicate is its own — `Number.isFinite(v) && v > 0 && v <= 1`
    — because it is a fraction, not a count, and FR-009's integer test would
    refuse every legitimate value. An app that is anonymous by design sets `1`.
  - `#checkChannelCaps` takes **`isIdentified: boolean`**, not the `Connection`.
    The cap decision must not be able to reach identity for anything else, and a
    boolean at the boundary is what keeps §5 row 6 a single home.
  - `ChannelLimitError.scope` gains **`'instance-anonymous'`**. "The instance is
    full" and "anonymous callers have used their share" call for different
    operator responses, and collapsing them into `'instance'` would make the
    headroom invisible in every log. Landing the third scope in the same branch
    as the first raise is precisely what S-2 asked for: the union is never
    widened after applications begin switching on it.

**Both**

- **FR-013** `docs/realtime.md` gains a `v0.2.0 → v0.3.0` upgrade section naming:
  the caps now refuse and how to raise them; that a raised cap is a **reconnect
  cost** (5 000 channels is 5 000 `SUBSCRIBE`s per reconnect) and voids SC-007
  and R-8; that `ChannelLimitError`'s message must not reach a client; that the
  abandoned `{prefix}:revoked` and `{prefix}:revoked:*` may be deleted; **and
  that the ACL example's two `~app:revoked` grants must be dropped.** The doc
  already says to drop them once #278 lands (`docs/realtime.md:758-761`) and the
  grants reach a nested deployment's keys — deleting the key while keeping the
  grant keeps the reach. The rollout note (`:492-497`, `:761`) goes in the same
  edit. *(S-6)*
- **FR-014** **Every** user-facing mention is corrected, enumerated by SEARCH:
  `grep -rniE 'legacyRevoked|:revoked|MAX_WATCHED_CHANNELS|MAX_CHANNELS_PER_CONNECTION|ChannelLimitError|maxWatchedChannels|maxChannelsPerConnection|1 000|1_000' docs/ packages/*/README.md packages/*/AGENTS.md`
  — the numbers included, because a figure someone quoted is the most reliable
  gap this repo has recorded. **`packages/realtime/README.md` currently has zero
  hits**: the caps are absent from it entirely, which was venial while they
  warned and is a hole the moment they refuse.
- **FR-015** The stale security instruction goes: `listRevoked`'s comment
  (`redis.ts:1455-1467`) and `docs/realtime.md:427-432` both tell operators to
  re-issue out-of-charset revocations before a rolling upgrade — advice for the
  population that does not exist. *(S-4 class)*

---

## 4. Success criteria

- **SC-001** A revocation reconcile issues exactly one command, measured by a
  recording port, for 0, 1 and 50 revoked connections.
- **SC-002** No key or topic the driver derives contains `:revoked` — asserted by
  scanning `drivers/redis.ts`, so a reintroduction fails by name.
- **SC-003** Two managers with prefixes `app` and `app:revoked` share no key, for
  every derived name.
- **SC-003b** Two managers with prefixes `app` and `app_` share no key — the
  pair FR-003b's clause protects.
- **SC-004** A subscribe past the instance cap raises `ChannelLimitError` and
  leaves `subscriptions`, `connections`, `presence` and `#channelsByClient`
  byte-identical to their pre-call state.
- **SC-005** The same for the connection cap.
- **SC-006** A join that grows no set is admitted at and above **both** caps —
  the instance half is a new test.
- **SC-007** A raised cap admits subscribes the default refuses, and still
  refuses past the raised value.
- **SC-008** Construction throws for `0`, `-1`, `1.5`, `NaN`, `Infinity`, `"500"`
  and for `maxChannelsPerConnection > maxWatchedChannels`. `1.0` is accepted.
- **SC-009** `grep -rniE 'next release|this release|first release|second release|warning release|FR-017b|unraisable' packages/realtime/`
  returns nothing referring to these caps. The narrow `'next release'` string
  finds 4 of the 11 sites and is why this criterion is spelled as an enumeration.
- **SC-010** `ChannelLimitError`'s message contains no digit from the count or
  the limit, and both remain readable as properties.
- **SC-011** After FR-001, `UNANCHORED_BY_DESIGN` does not exist and
  `FR-004 source` has no exemption branch.
- **SC-013** At `floor(1000 × 0.8)` hosted channels, an anonymous connection is
  refused a **new** channel with scope `'instance-anonymous'`, an identified one
  is admitted, and the anonymous one still joins an already-hosted channel.
- **SC-014** With `anonymousHostingShare: 1`, an anonymous connection reaches the
  full instance cap — the anonymous-by-design deployment is not degraded.
- **SC-015** Construction throws for `anonymousHostingShare` of `0`, `-0.1`,
  `1.1`, `NaN` and `"0.8"`; `1` and `0.5` are accepted.
- **SC-012** The full gate is green: `deno fmt && deno lint && deno check &&
  deno task test`, plus `deno task deps:analyze` and the `#304` mutation battery.

---

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **How many channels one instance may watch** | Resolved once in `ChannelManager`'s constructor into a private field; `#checkChannelCaps` is its only reader (`packages/realtime/manager.ts`) | A second read of `MAX_WATCHED_CHANNELS` outside the constructor default; a driver-side cap; the number restated in `docs/realtime.md` prose rather than named as the option's default |
| **How many channels one connection may hold** | Same field pair, same reader (`packages/realtime/manager.ts`) | As above, plus a per-connection count derived from `subscriptions` instead of `#channelsByClient` |
| **Whether a cap value is usable** | The `ChannelManager` constructor, at construction (`packages/realtime/manager.ts`) | A re-validation inside `#checkChannelCaps`; a guard in an app's kernel config; a `Math.max(1, …)` clamp or a `\|\|` default, both of which repair instead of refusing |
| **Whether a cap breach is a denial or an error** | `#checkChannelCaps` throws; `SubscribeResult` carries no limit outcome (`packages/realtime/manager.ts`) | An `ok: false` branch for a cap; a `reason` field on `SubscribeResult`; a `catch` in `subscribe` converting the throw back into a result |
| **Whether a join counts against a cap at all** *(A-1)* | `#checkChannelCaps`, which asks `subscriptions.has(channel)` and `#channelsByClient` — and `#leaveLocal` deleting the empty `Set`, the invariant that makes `subscriptions.has` and `size > 0` one answer (`packages/realtime/manager.ts`) | `#joinLocal`'s `set.size > 0` drifting from `subscriptions.has`; keeping an empty `Set` in `#leaveLocal`; any count of "hosted" taken from a third structure |
| **Who may cause a 0→1 hosted-channel transition** *(S-1, settled)* | `#checkChannelCaps`, from the `isIdentified` boolean it is handed (`packages/realtime/manager.ts`) | An identity test in the app's `onOpen`; a second bound in the WebSocket layer; a per-socket rate limit standing in for the decision; `#checkChannelCaps` reading `connection.identity` itself rather than the boolean |
| **Where a durable revocation is read from** | `listRevoked`, one `EVAL` over `revocationIndexKey` (`packages/realtime/drivers/redis.ts`) | Any second read path, any fallback, any "if the sorted set is empty, also check…" |
| **Which key names the driver derives** | The private getters in `packages/realtime/drivers/redis.ts`, pinned by name in `PREFIX_MEMBERS` (a second *asker*, not a second home) | A key built inline at a call site; a name added to a getter without a `PREFIX_MEMBERS` row; a roster edited to go green rather than to record a move |
| **Whether a derived name may skip the anchor** *(A-2, S-4)* | **Nowhere, after FR-003.** The answer is "no name may", with no register to consult | `UNANCHORED_BY_DESIGN` surviving FR-001; a docstring re-asserting an exception; an exemption branch that cannot be reached and therefore cannot fail |

**Binding.** A decision may not move out of its home without this plan being
amended first. A review finding that one has two homes is a plan violation.

---

## 6. Technical context

| | |
| :--- | :--- |
| **Language** | TypeScript, Deno, TC39 Stage 3 decorators |
| **Package** | `@lockness/realtime` only. `@lockness/redis` is untouched. `packages/sse` and `packages/notification` declare their **own** `ChannelManager` / `ChannelManagerOptions` — measured: zero downstream coupling from FR-008. |
| **Storage** | Redis (sorted set `{prefix}__revocations`, score = expiry epoch second) |
| **Testing** | `deno test`; recording ports for command counting; a live broker on **port 6388** (6379 belongs to an unrelated container and is never touched) |
| **Scale** | Defaults 1 000 / instance, 100 / connection, both now operator-tunable |
| **Constraint** | Net **deletion**: 32 legacy references and 11 stale promises removed; two options and three validations added |

### Domain model

**Bounded context:** realtime channel membership and durable revocation.

| Term | Kind | Meaning |
| :--- | :--- | :--- |
| **Connection** | Entity (id) | One client socket, owned by one instance; may be anonymous (`identity === null`) |
| **Channel** | Value object | A name; `public` / `private-*` / `presence-*` |
| **Watched channel** | Value object | A channel this instance hosts ≥1 local subscriber for, and therefore holds a broker subscription for |
| **Revocation** | Value object | `(connection id, expiry)` — a member of the sorted set, scored by expiry |
| **Cap** | Value object | A positive integer bound on a set's size, resolved once per manager |

**Invariants**

1. A revocation is readable from exactly one structure.
2. Every derived Redis name is anchored behind `__`, with no exemption register.
3. A subscribe that breaches a cap mutates nothing.
4. A join that grows no set is charged against no cap — and `subscriptions.has(ch)`
   and `set.size > 0` are one answer, because `#leaveLocal` deletes the empty set.
5. A cap is a positive integer, established before the manager serves a request,
   and the per-connection cap never exceeds the per-instance one.

**Out of scope:** the sorted-set design (#276), the per-channel subscribe
mechanism (#295), presence, the control plane.

---

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| 1. No direct `hono` import | ✅ N/A |
| 2. JSR-only, declared per package | ✅ No dependency change; `deps:analyze` in the gate |
| 3. No `any` in exported APIs | ✅ Two `number` options |
| 4. Tailwind v4 syntax | ✅ N/A |
| 5. Pre-completion gate | ✅ SC-012 |
| 6. Never hand-edit `deno.lock` | ✅ No dependency change |
| 7. JSDoc on public APIs | ⚠️ **Load-bearing.** FR-010, FR-010b and FR-017 are all JSDoc requirements. Three docstrings make claims this branch falsifies, and one of them (`MAX_WATCHED_CHANNELS`) would actively mislead an operator using the new option. |
| 8. MVC layering | ✅ Infrastructure package |
| 9. One category per commit | ✅ Split below |
| TDD | ✅ FR-011 rewrites both SC-017 tests to the new behaviour first |
| DDD layering | ✅ Confirmed by audit: `manager.ts` imports `@lockness/contract` and `./protocol.ts` only, never `drivers/redis.ts`. Cap decision application-side, key derivation adapter-side. |
| No silent catches | ✅ No `catch` added |

**Commit split**

| Category | Contents |
| :--- | :--- |
| `refactor(278)` | `#legacyRevoked` + both getters + both exemption registers + the stale security instruction |
| `feat(322)` | Caps refuse; two options; three construction-time validations; the message and `scope` JSDoc changes |
| `test(254)` | All six test files: `PREFIX_MEMBERS`, `CANNED`, `shapes`, `UNANCHORED_BY_DESIGN`, the FR-009 removals, both SC-017 rewrites, both FR-017 fixes, the `#304` battery rows, `live_realtime.ts`, the new SC-003b…SC-011 |
| `docs(254)` | `docs/realtime.md` upgrade section + ACL narrowing, `README.md`, `AGENTS.md` |

### Complexity tracking

None. The branch removes more than it adds. The only addition beyond two options
is FR-009's third validation, chosen because a per-connection cap above the
instance cap makes one connection a whole-instance denial.

---

## 8. Surface impact

**No front-end surface.** `@lockness/realtime` is server-side: no JSX, no CSS, no
route. The accessibility gate skips it.

| Surface | Change | Breaking? |
| :--- | :--- | :--- |
| `ChannelManagerOptions` | +3 optional fields (two caps, one share) | No |
| `ChannelManager` constructor | Throws on an unusable cap or an inverted pair | No — previously unsuppliable |
| `subscribe()` | Throws `ChannelLimitError` past a cap | **YES** |
| `ChannelLimitError` | Message loses the two numbers; properties keep them; `scope` gains `'instance-anonymous'` and is documented as open | **YES** for anyone parsing the message or switching exhaustively on `scope` |
| `MAX_*` constants | Values unchanged, now documented as defaults | No |
| `RedisBroadcastDriver.listRevoked` | One command instead of 1+N | No |
| Redis keyspace | `{prefix}:revoked*` stop being read; the ACL grants for them must be dropped | **YES** for a population that does not exist |

**Measured:** 0 production constructions of `ChannelManager` anywhere in the
repo — every non-test hit is a JSDoc `@example`. 60 constructions in
`packages/realtime/tests/` across 22 files, all passing no cap option.

### Documentation (this feature)

Nine-for-nine on missed doc gaps here, so FR-014's search is a requirement:

| File | Owed |
| :--- | :--- |
| `docs/realtime.md` | The upgrade section; `:483-497` rewritten (caps enforced **and tunable**, with the reconnect cost); `:427-432` stale instruction removed; `:719` ACL grants dropped; `:761` rollout note removed |
| `packages/realtime/README.md` | **The caps, from zero** — plus the two options |
| `packages/realtime/AGENTS.md` | Pitfalls, **outside** the `<!-- generated:* -->` blocks |
| `docs/testing.md` | Only if a battery count moves — the `#304` battery loses two rows |

---

## 9. Risks

| # | Risk | Mitigation |
| :--- | :--- | :--- |
| R-1 | A real Redis holds legacy revocations, and this drops them | Accepted, and now **proved** rather than assumed: the security audit traced every writer — the driver's only two `SADD` sites are `ownedKey` and `instancesKey`, so nothing has ever written the legacy structure in a released version. |
| R-2 | Refusing at a cap breaks an app quietly past it | Intended. FR-008 makes it movable. **Superseded in part by R-8** — the audit showed the operator framing was only half the story. |
| R-3 | A roster is edited to go green rather than to record the move | FR-004 enumerates all six files by search; three of the six self-report (the `shapes` assertion, the `#304` harness), three do not. |
| R-4 | Validation added but never exercised | SC-008 names seven shapes. |
| R-5 | A stale promise survives in a file nobody greps | SC-009's grep is the eleven-site enumeration, not the four-site one. |
| R-6 | The caps' numbers were never validated by field data and never will be | Answered by design, not data: FR-008 makes the number tunable. **But FR-010b is the other half** — the default's couplings to SC-007 and R-8 must be stated, or a tuned cap silently voids a proof. |
| R-7 | Deleting `#legacyRevoked` changes `listRevoked`'s filter semantics | Confirmed correct by the security audit: the two filters are separate guards. |
| R-8 | The refusal is an unauthenticated denial lever *(S-1)* | **Closed by FR-018.** Anonymous sockets can exhaust at most 80% of the instance budget; the remainder stays reachable by identified connections. Residual, and accepted: an app that authenticates nobody sets the share to 1 and carries the original exposure knowingly — which is the same posture `docs/realtime.md:488` already describes, now with a dial. |
| R-9 | `ChannelLimitError.scope` widens later *(S-2)* | FR-017 documents it as open before any app switches on it. |

---

## 10. Architecture audit

`architect-expert`, 2026-09-08, on `plan.md` before any code. **Verdict: fail** —
0 critical, 4 high, 4 medium, 1 low. **Every claim I spot-checked was exact.**

| # | Finding | Severity | Disposition |
| :--- | :--- | :--- | :--- |
| A-1 | §5 had no row for the "grows no set" exemption, which is computed with two spellings of "hosted" (`manager.ts:606` vs `:636`), coupled only by prose at `:658-660` | HIGH | **Plan changed** — §5 row 5; invariant 4 restated |
| A-2 | `UNANCHORED_BY_DESIGN` (`prefix_anchoring.test.ts:831`) is a second register of the anchoring exemption; after FR-001 its branch is unreachable and stays green | MEDIUM | **Plan changed** — FR-003, §5 row 9, SC-011 |
| A-3 | FR-010 targeted a two-release reference in `MAX_WATCHED_CHANNELS`'s docstring **that does not exist**; the text that is there says the value is "Not a free choice", which FR-008 falsifies | HIGH | **Plan changed** — FR-010b; R-6 corrected |
| A-4 | SC-009's grep finds **4 of 11** stale-promise sites; five in `channel_watch_295.test.ts` were covered by neither criterion nor requirement | HIGH | **Plan changed** — SC-009 widened, FR-010 enumerated |
| A-5 | FR-004 named 2 of 6 sites in `prefix_anchoring.test.ts` while presenting itself as the enumeration | MEDIUM | **Plan changed** — FR-004 table |
| A-7 | FR-001 deletes two live mutation anchors in `mutations/connection_id_304.ts`, one carrying the only written rationale for FR-002's surviving filter — a file no requirement named | HIGH | **Plan changed** — FR-005b |
| A-8 | `live_realtime.ts:71,82` declares `legacyRevoked` as a **required** fixture field; it compiles, so `deno check` is silent | MEDIUM | **Plan changed** — FR-004 table |
| A-9 | FR-012's "passes unchanged" hid two gaps: `:243-247` becomes a tautology, and the test exercises the connection cap only | MEDIUM | **Plan changed** — FR-012 |
| A-10 | Two stale rosters ("The nine members" for a list of ten; the `alpha:revoked` worked example) | LOW | **Plan changed** — FR-004 table |

**Inherited error, and the one worth naming separately:** #322's Notes present
their anchor list as an exhaustive symbol roster — *"line numbers will shift, the
symbols will not"* — and it is wrong. `#295/SC-017` and `#295/FR-017` each name
**two** tests (`:175`/`:324` and `:217`/`:367`), not one. This plan's first draft
copied that framing without checking it, so FR-011 and FR-012 each addressed half
a pair. Verified by `grep -n "^Deno.test('#295/"`.

**Clean, with its coverage named:** no layer violation (`manager.ts` never
imports the driver), no circular dependency, zero downstream packages affected by
FR-008, `console.warn` removed from the inner layer (a strict reduction), and §5
row 3 was called the model the other rows should follow.

---

## 11. Security audit

`security-expert`, 2026-09-08, on `plan.md` before any code. **Verdict: fail** —
0 critical, 1 high, 3 medium, 3 low. **#278's half is declared clean; every
finding is on #322.**

| # | Finding | Severity | Disposition |
| :--- | :--- | :--- | :--- |
| S-1 | Flipping WARN→throw turns an **unauthenticated** growth primitive into an unauthenticated **denial** primitive. `subscribe` skips the whole identity/authorize block for public channels (`manager.ts:513`), so ~10 anonymous sockets × 100 channels reach the instance cap and every subsequent new-channel subscribe throws — for every connection, authenticated ones included. FR-008 does not mitigate it. | HIGH | **Plan changed** — FR-018 (headroom), §5 row 6, SC-013…SC-015 |
| S-2 | `ChannelLimitError.scope` is a closed exported union that FR-006 makes load-bearing; widening it later breaks a published type at every catch site | MEDIUM | **Plan changed** — FR-017 |
| S-3 | The error message interpolates the instance-wide count, reachable by a caller that ran no authorizer; most apps wire `onError` to a close-frame reason | MEDIUM | **Plan changed** — FR-016, SC-010 |
| S-4 | FR-004 omitted `UNANCHORED_BY_DESIGN`, so the anchoring proof passes with a live exemption for two deleted names | MEDIUM | **Plan changed** — FR-003, SC-011 (same defect as A-2, found independently) |
| S-5 | The anchoring assertion checks only `startsWith('__')`; the collision proof rests on no tail beginning with `_`. `${prefix}___queue:` passes and reopens the collision for (`app`, `app_`) | LOW | **Plan changed** — FR-003b, SC-003b |
| S-6 | `docs/realtime.md:719`'s ACL keeps `~app:revoked ~app:revoked:*`; those globs reach a nested deployment's keys. The doc itself says to drop them once #278 lands | LOW | **Plan changed** — FR-013 |
| S-7 | FR-009's boundary needed three things spelled: the predicate, `??` not `\|\|`, and a cap-pair cross-check | LOW | **Plan changed** — FR-009 |

**Proof recorded, not just a verdict.** The audit proved by construction that
after FR-001 no two accepted prefixes can derive the same key: for accepted
P1 ≠ P2 with `P2 = P1 + t`, equality forces `t` to begin `__`, which
`assertUsablePrefix` refuses — subject to the `_` clause that became FR-003b.

**Clean, with its coverage named:** the revocation path creates no window —
`markRevoked` writes only the new key, the driver's only `SADD` sites are
`ownedKey` and `instancesKey`, so the single `EVAL` can never return less than
the dual read did. The authorization ordering FR-007 pins is correct as written
for private/presence and must not move. No new injection, path-traversal or SSRF
surface. FR-009's type boundary is complete for `NaN`, `±Infinity`, `1.5`, `-1`,
`0`, a string from JSON/env and `1.0`.

---

## 12. Open questions

| # | Question | Answer (2026-09-08) |
| :--- | :--- | :--- |
| Q1 | Scope — #278 alone, both shims, or a full compat sweep? | **#278 + #322 together.** They fall for the same reason; a full sweep risked deleting legitimate permanent paths. |
| Q2 | Once the caps refuse, can an operator move them? | **Configurable, 1 000 / 100 as defaults.** A refusal an operator cannot move is a fork. |
| Q3 | Cut `v0.3.0` after this, and is an upgrade note owed? | **Yes, in the same session, via `/ship`.** |
| **Q4** | **Who may cause a 0→1 hosted-channel transition?** *(S-1)* | **Identified-connection headroom.** Anonymous connections may consume a configurable share of the instance budget (`anonymousHostingShare`, default `0.8`); the rest is reachable only by an identified connection. Rejected: *requiring identity for all hosting* — an app with no authentication has `identity === null` for everyone, so realtime would stop working entirely rather than degrade. Rejected: *accept and document* — the dial costs ~15 lines and is cheapest while the option surface is being designed. |

### Decided without asking

| Decision | Why it was not a question |
| :--- | :--- |
| A cap breach **throws** rather than answering `{ ok: false }` | Already decided and recorded at `manager.ts:49-52`. Re-deciding it is the defect §5 exists to prevent. |
| No kernel wiring for the caps | 0 production constructions of `ChannelManager` in the repo — measured, not assumed. `ChannelManagerOptions` **is** the config surface. |
| `PREFIX_RE` keeps `:` in its charset | After FR-001 every derived name is anchored, proved above. Tightening would break without fixing. |
| `revocationTtlSeconds` stays | It is the sorted set's score, not part of the legacy path. |
| The stray duplicate `@param` block above `#checkChannelCaps` is removed | Boy Scout, in a file the change already touches (FR-010). |
| `Number.MAX_SAFE_INTEGER` is an accepted cap | An operator raising their own ceiling is a policy choice, not a defect. FR-013 tells them what it costs. |
