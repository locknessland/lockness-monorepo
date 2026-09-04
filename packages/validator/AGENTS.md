# `@lockness/validator` — agent brief

Validation with custom rules, async validators, sanitisers and a Zod decorator
bridge. Two source files, eight test files — the best-covered package here.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Invariants

- **The dependency contract above is binding.** Importing anything outside it
  fails `deno task deps:analyze`, and the failure is a design question, not a
  lint to silence.

_Add the domain invariants — what must stay true inside this package, and what
breaks when it does not. A statement that could have been guessed from the file
names does not belong here._

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                 |
| :--------------------------------------------- | :--------------------------------------- |
| Imports (static)                               | `hono`                                   |
| Imports (soft, via `tryImportOptionalPackage`) | —                                        |
| Imported by                                    | —                                        |
| **Must never import**                          | nothing — no package depends on this one |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `ValidationError`, `Validator`, `ZodSchema`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| function  | `Validate`, `after`, `alpha`, `alphanumeric`, `before`, `between`, `confirmed`, `custom`, `dateString`, `defaultValue`, `different`, `email`, `escapeHtml`, `fileMimeType`, `fileSize`, `inArray`, `ip`, `json`, `lowercase`, `max`, `maxLength`, `min`, `minLength`, `notIn`, `numeric`, `pattern`, `requiredIf`, `requiredUnless`, `setValidationErrorHandler`, `stripTags`, `toBoolean`, `toNumber`, `trim`, `uppercase`, `url`, `uuid`, `validate`, `validateOrThrow`, `validator` |
| interface | `FieldRules`, `Rule`, `ValidationErrorResponse`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| namespace | `z`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| reference | `ZodType`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| typeAlias | `SanitizerFn`, `ValidationErrorHandler`, `ValidationResult`, `ValidatorFn`                                                                                                                                                                                                                                                                                                                                                                                                             |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                               | Path               |
| ------------------------------------- | ------------------ |
| Rules, sanitisers, the validator core | `mod.ts`           |
| Zod schema decorator                  | `zod_decorator.ts` |

## Pitfalls

- Async validators change the return type. A rule added as sync and later made
  async silently changes every caller's signature.
- Sanitisers mutate the value before rules run. Ordering between the two is part
  of the contract, not an implementation detail.

## Tests

<!-- generated:tests -->

8 test files for 5 source files:

- `packages/validator/tests/basic.test.ts`
- `packages/validator/tests/class.test.ts`
- `packages/validator/tests/complex.test.ts`
- `packages/validator/tests/dates.test.ts`
- `packages/validator/tests/relational.test.ts`
- `packages/validator/tests/sanitizers.test.ts`
- `packages/validator/tests/special.test.ts`
- `packages/validator/tests/zod_decorator.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 8 test files directly —

```bash
deno test -A packages/validator/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
