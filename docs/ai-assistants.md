# Using Lockness with your AI assistant

Lockness is a young, focused framework — which means a general-purpose AI
assistant has seen little or no Lockness code in training and will happily
invent APIs that do not exist. The fix is **grounding**: point your assistant at
the framework's own documentation so it answers from the real API surface
instead of guessing.

Lockness publishes its docs in three machine-friendly shapes. Use whichever fits
your tool.

## 1. `/llms.txt` — the index

A plain-text index, following the [llms.txt](https://llmstxt.org/) convention,
listing every documentation section with a one-line description and a link:

```text
https://lockness.land/llms.txt
```

Point an assistant that fetches URLs on demand (it will follow the links it
needs) at this file. It is small and cheap to load, and it lets the model pull
only the pages a task requires.

## 2. `/llms-full.txt` — the whole corpus in one file

Every framework and UI documentation page, concatenated into a single plain-text
file with section headings and source URLs:

```text
https://lockness.land/llms-full.txt
```

Use this when your tool ingests a whole corpus at once — a retrieval index, a
"load these docs into context" step, or a custom RAG pipeline. It is the same
content as the per-page `.txt` endpoints (`/docs/llms/*.txt`, `/ui/llms/*.txt`),
assembled for one fetch.

## 3. In-repo agent briefs — `AGENTS.md` / `CLAUDE.md`

Every Lockness project ships an `AGENTS.md` (symlinked to `CLAUDE.md`) at its
root with the framework's hard rules, and a per-package `AGENTS.md` beside each
`packages/*`. Tools that read project files (Claude Code, Cursor, and similar)
pick these up automatically — no configuration needed. They carry the rules a
docs page cannot: "import from `@lockness/core`, never `hono`", the JSR-only
dependency policy, the MVC layering, and so on.

## Which to use

| Your tool…                                          | Use                                         |
| :-------------------------------------------------- | :------------------------------------------ |
| fetches URLs on demand                              | `/llms.txt` (it follows the links it needs) |
| ingests a whole corpus once (RAG / context preload) | `/llms-full.txt`                            |
| reads files in your project                         | `AGENTS.md` / `CLAUDE.md` (automatic)       |

## What this is not

Lockness does **not** run a hosted "MCP server" or a remote code-generation
service. Code scaffolding and commands are the job of the local
[`nessy` CLI](nessy.md) (`nessy make:controller`, `nessy make:model`, …), which
your assistant can invoke directly in your project — no network round-trip, and
the files land in your working tree where they belong.
