# CI Runner Plan

## Product Direction

- `@number10/ci-runner-cli` is the only public package.
- Runtime engine stays private inside the CLI package.
- Product is CLI-first, with editor integration as the primary UX extension.

## Current Status

- [x] Internal runtime implemented and validated.
- [x] CLI implemented with typed config, pretty/json output, watch mode, fail-fast, retries, and timeouts.
- [x] Smoke and integration tests centered on external CLI usage.
- [x] Watch mode hardened with runtime watcher fallback and smoke coverage.
- [x] Release dry-run workflow and packaging in place for the CLI package.
- [x] Initial npm publish is pending.

## Strategic Decisions

- [x] Do not publish `ci-runner-core` as standalone package.
- [x] Prefer VS Code extension over standalone web server/webview as the first UI investment.
- [ ] Revisit web UI only if multi-user/shared history becomes a hard requirement.

## Priority Backlog

### P0: Release-critical

- [x] Finalize public scope and naming strategy.
- [ ] Define compatibility target (Node LTS range and OS matrix).
- [x] Run validation in at least 2 external repositories.
- [x] Publish first version of `@number10/ci-runner-cli`.

### P1: Adoption and CI ecosystem

- [x] Publish a short "recipes" doc for common pipelines (lint/test/build/e2e): `docs/ci-runner-recipes.md`.
- [ ] Collect adopter requests for additional formatter targets.
- [ ] Re-evaluate formatter backlog (`junit`, GitHub Actions summary) only when demand is proven.

### P2: VS Code extension (Activity Bar first)

- [x] Create `ci-runner-vscode` extension skeleton.
- [x] Add Activity Bar view with detected configs and runnable entries.
- [x] Add actions: run selected config, run with `--watch`, run with `--fail-fast`.
- [x] Route detailed run output to VS Code Output Channel.
- [x] Keep sidebar focused on overview/state (configs, last status, quick actions).
- [x] Parse CLI `--format json` for structured status badges and summary counts.
- [x] Add workspace settings for default config path and default run profile.
- [ ] Add named run targets inside one config file to support partial, frequent workflows.
- [ ] Show target names in the tree (for example `CI Full`, `Lint`, `Unit Tests`) instead of only file paths.
- [ ] Keep existing run profiles (`standard`, `watch`, `fail-fast`) available per target.
- [ ] Keep backward compatibility for single-config/single-pipeline repositories.

### P3: Deferred UX expansions

- [ ] Optional local run history persistence for extension (`workspace/.ci-runner/history.jsonl` or SQLite).
- [ ] Optional details panel for last run drilldown.
- [ ] Reassess standalone web UI only after extension usage feedback.

## VS Code Extension Feasibility Note

This is fully feasible with standard VS Code APIs:

- Tree View in Activity Bar for runnable entries.
- Commands + task/terminal execution for run actions.
- Output Channel for verbose logs and command output.
- JSON parsing from CLI output for lightweight visual status.

No protocol or backend service is required for v1 of the extension.

## Named Run Targets (Design Draft)

### Problem

- Monorepos contain many npm scripts; the built-in npm scripts view becomes noisy.
- The current CI Runner tree is config-file centric and exposes one pipeline per config file.
- Teams need fast access to common subsets (`lint`, `test`, `build`) without editing commands each time.

### Goal

- Allow multiple named runnable targets in one `ci.config.ts`/`ci.config.json`.
- Render those names directly in the VS Code CI Runner view.
- Preserve one-command full CI execution.

### Proposed Model (Backward-Compatible)

- Extend `CiRunnerConfig` with optional `targets`.
- Keep existing `steps` as the default full pipeline.
- When `targets` is missing, behavior stays exactly as today.

Proposed shape:

```ts
interface CiRunnerTarget {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly includeStepIds?: readonly string[]
  readonly excludeStepIds?: readonly string[]
}

interface CiRunnerConfig {
  readonly steps: readonly CliConfigStep[]
  readonly targets?: readonly CiRunnerTarget[]
}
```

### CLI and Extension Behavior

- Add CLI flag `--target <id>`.
- Resolve target before run:
  - `includeStepIds` limits the runnable step set.
  - `excludeStepIds` removes steps from that set.
  - Validation fails on unknown step ids or duplicate target ids.
- VS Code extension:
  - Detect targets from each config and display `target.name` as runnable node labels.
  - Keep current per-run actions (`Run`, `Run (Watch)`, `Run (Fail Fast)`) for each target.
  - Show config path as description/tooltip, not as the primary label.

### UX Defaults

- If `targets` exists, prepend an implicit `Full CI` node that runs all steps.
- If `targets` does not exist, keep current file-based node behavior.
- Default selected command remains configurable via `ciRunner.defaultRunProfile`.

### Delivery Plan

- Phase 1: CLI target schema, parser, validation, `--target` execution.
- Phase 2: VS Code tree model upgrade from config nodes to target nodes.
- Phase 3: Documentation and migration examples for monorepos.
- Phase 4: Collect feedback and refine filtering model if teams need tag-based targeting.

## Execution Order

- [x] Complete P0 and publish initial CLI release.
- [ ] Implement P1 recipes and collect formatter requests from first adopters.
- [ ] Build P2 extension MVP (overview in sidebar, details in Output Channel).
- [ ] Implement named run targets end-to-end (CLI `--target` + VS Code target list).
- [ ] Evaluate history/drilldown/web UI needs after real usage data.
