/**
 * @fileoverview The Deno-bound script baseline (plan 274 FR-016): the
 * scripts under `scripts/` that predate the multi-runtime epic and still use
 * Deno, skipped by the `lockness-runtime` lint (`runtime_neutral.ts`).
 *
 * Every other non-test script under `scripts/` is held to that lint — no
 * `Deno` identifier, and relative static imports only of scripts held to it
 * too — except the modules the root `deno.jsonc` registers under
 * `lint.plugins`, which are typed on `Deno.lint` and are rewritten, not
 * migrated, when the lint leaves Deno at B4.
 *
 * **The baseline only shrinks.** An entry leaves when its script complies or
 * no longer exists: a test (`deno_bound_scripts_test.ts`) fails on an entry
 * that would pass the lint without it, and on one whose file is gone, so a
 * migrated script must leave in the same change. The one allowed addition is
 * a script that needs a Deno-only runtime API, named in the commit; any
 * other addition is refused in review, as lowering a floor in
 * `coverage-floors.json` is. Names, not counts of `Deno` references: the
 * target is an empty baseline, and a count would make a partial migration
 * look like progress.
 *
 * Generated at C10 by running the lint with an empty baseline, then adding
 * every script whose relative imports reach an entry, until nothing changed.
 * Entries are repository-relative paths, sorted.
 *
 * @module scripts/lint/deno_bound_scripts
 */

/** The scripts still bound to Deno, repository-relative, sorted. */
export const DENO_BOUND_SCRIPTS: readonly string[] = [
    'scripts/agents_brief.ts',
    'scripts/benchmark_imports.ts',
    'scripts/bump.ts',
    'scripts/ci_workflows.ts',
    'scripts/coverage_floor.ts',
    'scripts/deps_analyzer.ts',
    'scripts/docs_coverage.ts',
    'scripts/gate.ts',
    'scripts/generate_routes.ts',
    'scripts/generate_ui_registry.ts',
    'scripts/git_env.ts',
    'scripts/install_gitleaks.ts',
    'scripts/install_hooks.ts',
    'scripts/jsr_link_repos.ts',
    'scripts/kit_live.ts',
    'scripts/kit_migrations.ts',
    'scripts/kit_smoke.ts',
    'scripts/local_jsr.ts',
    'scripts/lockfile.ts',
    'scripts/mirror_packages.ts',
    'scripts/mutate.ts',
    'scripts/prepare_docs.ts',
    'scripts/prepush.ts',
    'scripts/prepush_secret_scan.ts',
    'scripts/prepush_test_support.ts',
    'scripts/publish_check.ts',
    'scripts/published_objects.ts',
    'scripts/release_notes.ts',
    'scripts/reorganize_ui_components.ts',
    'scripts/update_hono.ts',
    'scripts/watch_routes.ts',
]
