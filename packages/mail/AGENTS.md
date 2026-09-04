# `@lockness/mail` — agent brief

Email sending with pluggable drivers and a fluent message builder. Standalone
and deliberately small: one source file, one test file.

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

| Direction                                      | Packages                                                                            |
| :--------------------------------------------- | :---------------------------------------------------------------------------------- |
| Imports (static)                               | —                                                                                   |
| Imports (soft, via `tryImportOptionalPackage`) | `markdown`, `queue`                                                                 |
| Imported by                                    | `notification`                                                                      |
| **Must never import**                          | `notification` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                        |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `ConsoleMailDriver`, `Mail`, `MailPackageMissingError`, `MailQueueNotConfiguredError`, `Mailable`, `MemoryMailDriver`, `ResendMailDriver`, `SmtpMailDriver`                                                                                                                                                                                                                                    |
| function  | `capturePreview`, `capturedMails`, `configureMail`, `configureMailQueue`, `disableMailPreview`, `enableMailPreview`, `getMailConfig`, `getMailableFactory`, `handleMailJob`, `handleMakeMail`, `isContained`, `isMailPreviewEnabled`, `mail`, `mailPreviewHandler`, `queueMailable`, `registerMailCommands`, `registerMailable`, `resetMailPreview`, `resetMailQueue`, `resetMailableRegistry` |
| interface | `CapturedMail`, `Cli`, `MailAddress`, `MailAttachment`, `MailConfig`, `MailDriver`, `MailMessage`, `MailResult`, `MailableContent`, `QueuedMailJob`                                                                                                                                                                                                                                            |
| typeAlias | `MailDispatcher`, `MailableFactory`, `ModuleImporter`                                                                                                                                                                                                                                                                                                                                          |
| variable  | `MAIL_DIR`                                                                                                                                                                                                                                                                                                                                                                                     |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern    | Path     |
| ---------- | -------- |
| Everything | `mod.ts` |

## Pitfalls

- The default driver in a test environment must not send. Verify the driver is a
  test double before asserting delivery.
- One test file for the whole package — new drivers arrive uncovered unless
  coverage is added deliberately.

## Tests

<!-- generated:tests -->

4 test files for 14 source files:

- `packages/mail/tests/mail.test.ts`
- `packages/mail/tests/mailable.test.ts`
- `packages/mail/tests/preview.test.ts`
- `packages/mail/tests/queued.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 4 test files directly —

```bash
deno test -A packages/mail/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
