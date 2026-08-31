#!/usr/bin/env bash
#
# Classify every dirty path in the working tree, by PATH ALONE.
#
# "Is this uncommitted file legitimate?" asked of a model answers differently on
# different days, and the cost is asymmetric: a forgotten file is recoverable, a
# junk commit pollutes the history. So the answer lives in this table instead of
# in a judgement.
#
# Output lines are stable and greppable:
#   AUTO <group> <path>   may be committed unattended, in its own commit
#   IGNORE <path>         untracked and ignorable, leave it alone
#   STOP <path>           carries intent — a human decides
#   CLEAN                 nothing to do
#
# Exit codes:
#   0  tree clean, or everything dirty is AUTO/IGNORE
#   1  at least one path is outside the table — STOP and surface it
#   2  not a git repository, or misuse
set -uo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "STOP not-a-git-repository" >&2
    exit 2
fi

root=$(git rev-parse --show-toplevel)
cd "$root" || exit 2

status=$(git status --porcelain=v1 --untracked-files=all 2>/dev/null)

if [ -z "$status" ]; then
    echo "CLEAN"
    exit 0
fi

stopped=0

while IFS= read -r line; do
    [ -z "$line" ] && continue
    path=${line:3}
    # Rename entries read "old -> new"; classify the destination.
    case "$path" in
        *" -> "*) path=${path##* -> } ;;
    esac
    # Strip the quoting git applies to paths with unusual characters.
    path=${path%\"}
    path=${path#\"}

    case "$path" in
        # ---- codegen: content is produced by a task, not authored ----------
        docs/dependencies.md | \
        deno.lock | \
        app/routes.ts | \
        packages/ui/examples_registry.ts)
            echo "AUTO codegen $path"
            ;;

        # ---- agent memory: append-only notes an agent wrote about itself ---
        .claude/agents/*/memory/*)
            echo "AUTO agent-memory $path"
            ;;

        # ---- never ours to commit ------------------------------------------
        node_modules/* | coverage/* | _dist/* | tmp/* | public/css/* | \
        .env | .env.*)
            echo "IGNORE $path"
            ;;

        # ---- everything else carries intent --------------------------------
        #
        # packages/*/AGENTS.md is deliberately NOT codegen: only its marked
        # blocks are generated, and the surrounding invariants and pitfalls are
        # exactly the part a human must approve.
        #
        # deps.policy.jsonc is deliberately NOT codegen: widening it is a design
        # decision and gets its own reviewed commit.
        *)
            echo "STOP $path"
            stopped=1
            ;;
    esac
done <<< "$status"

exit "$stopped"
