# Pre-migration state — 2026-08-22T14:39:17Z

## Versions
installed templates: templates_version: 1.6.0
binary: specnaut 3.0.1 (templates 3.0.1)

## Managed-dir conflict check
.specflow/ exists: yes
.specnaut/ exists: no

## preserve.yml
none found (searched for preserve*.y*ml)

## .claude/ tree (before)
.claude
.claude/agents
.claude/agents/architect
.claude/agents/architect.md
.claude/agents/architect/runbook.md
.claude/agents/code-reviewer
.claude/agents/code-reviewer.md
.claude/agents/code-reviewer/runbook.md
.claude/agents/developer
.claude/agents/developer.md
.claude/agents/developer/memory
.claude/agents/developer/runbook.md
.claude/agents/devops-sre
.claude/agents/devops-sre.md
.claude/agents/devops-sre/memory
.claude/agents/devops-sre/runbook.md
.claude/agents/docs-writer
.claude/agents/docs-writer.md
.claude/agents/docs-writer/runbook.md
.claude/agents/product-owner
.claude/agents/product-owner.md
.claude/agents/product-owner/memory
.claude/agents/product-owner/runbook.md
.claude/agents/qa-tester
.claude/agents/qa-tester.md
.claude/agents/qa-tester/memory
.claude/agents/qa-tester/runbook.md
.claude/agents/review-coordinator.md
.claude/agents/security-auditor
.claude/agents/security-auditor.md
.claude/agents/security-auditor/memory
.claude/agents/specflow-expert.md
.claude/agents/test-reviewer.md
.claude/agents/ui-ux-designer.md
.claude/agents/workflow-manager.md
.claude/CLAUDE.md
.claude/commands
.claude/commands/backlog.md
.claude/commands/specflow.md
.claude/hooks
.claude/hooks/check-backlog-prereqs.sh
.claude/hooks/log-subagent.sh
.claude/hooks/protect-generated.sh
.claude/hooks/protect-sensitive-files.sh
.claude/loop.md
.claude/scripts
.claude/scripts/dispatch-agent.sh
.claude/settings.json
.claude/skills
.claude/skills/backlog
.claude/skills/backlog/SKILL.md
.claude/skills/deno-deploy
.claude/skills/deno-deploy/references
.claude/skills/deno-deploy/SKILL.md
.claude/skills/deno-expert
.claude/skills/deno-expert/SKILL.md
.claude/skills/deno-frontend
.claude/skills/deno-frontend/SKILL.md
.claude/skills/deno-guidance
.claude/skills/deno-guidance/SKILL.md
.claude/skills/deno-project-templates
.claude/skills/deno-project-templates/assets
.claude/skills/deno-project-templates/SKILL.md
.claude/skills/deno-sandbox
.claude/skills/deno-sandbox/SKILL.md
.claude/skills/orchestrate
.claude/skills/orchestrate/SKILL.md
.claude/skills/specflow
.claude/skills/specflow-auto
.claude/skills/specflow-auto/SKILL.md
.claude/skills/specflow-review
.claude/skills/specflow-review/SKILL.md
.claude/skills/specflow/phases
.claude/skills/specflow/SKILL.md
.claude/skills/tailwind
.claude/skills/tailwind/SKILL.md

## .specflow/ tree (before)
.specflow
.specflow/backlog-config.yml
.specflow/backlog.md
.specflow/installed.lock
.specflow/LABELS.md
.specflow/logs
.specflow/logs/agents.jsonl
.specflow/memory
.specflow/memory/constitution.md
.specflow/scripts
.specflow/scripts/backlog
.specflow/scripts/backlog/_config.sh
.specflow/scripts/backlog/add.sh
.specflow/scripts/backlog/cascade-check.sh
.specflow/scripts/backlog/clarify-comment.sh
.specflow/scripts/backlog/detect-fields.sh
.specflow/scripts/backlog/ensure-labels.sh
.specflow/scripts/backlog/list.sh
.specflow/scripts/backlog/move.sh
.specflow/scripts/backlog/set-field.sh
.specflow/scripts/backlog/view.sh
.specflow/scripts/bash
.specflow/scripts/bash/check-prerequisites.sh
.specflow/scripts/bash/common.sh
.specflow/scripts/bash/create-new-feature.sh
.specflow/scripts/bash/setup-plan.sh
.specflow/scripts/powershell
.specflow/scripts/powershell/check-prerequisites.ps1
.specflow/scripts/powershell/common.ps1
.specflow/scripts/powershell/create-new-feature.ps1
.specflow/scripts/powershell/setup-plan.ps1
.specflow/scripts/release
.specflow/scripts/release/release-github.sh
.specflow/scripts/release/release-gitlab.sh
.specflow/scripts/release/release-local.sh
.specflow/scripts/release/release.sh
.specflow/scripts/release/tag.sh
.specflow/specs
.specflow/specs/agent-team-architecture
.specflow/specs/agent-team-architecture/plan.md
.specflow/specs/agent-team-architecture/spec.md
.specflow/specs/bump-comment-preservation
.specflow/specs/bump-comment-preservation/spec.md
.specflow/specs/tasks-to-github-migration
.specflow/specs/tasks-to-github-migration/spec.md
.specflow/templates
.specflow/templates/agent-file-template.md
.specflow/templates/checklist-template.md
.specflow/templates/constitution-template.md
.specflow/templates/plan-template.md
.specflow/templates/spec-template.md
.specflow/templates/tasks-template.md

## Phases referenced in our docs/skills (before)
analyze
auto-chain
checklist
clarify
constitution
groom
implement
merge
plan
release-version
review
specify
tag-version
tasks
