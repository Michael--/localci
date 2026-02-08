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

- [ ] Create `ci-runner-vscode` extension skeleton.
- [ ] Add Activity Bar view with detected configs and runnable entries.
- [ ] Add actions: run selected config, run with `--watch`, run with `--fail-fast`.
- [ ] Route detailed run output to VS Code Output Channel.
- [ ] Keep sidebar focused on overview/state (configs, last status, quick actions).
- [ ] Parse CLI `--format json` for structured status badges and summary counts.
- [ ] Add workspace settings for default config path and default run profile.

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

## Execution Order

- [x] Complete P0 and publish initial CLI release.
- [ ] Implement P1 recipes and collect formatter requests from first adopters.
- [ ] Build P2 extension MVP (overview in sidebar, details in Output Channel).
- [ ] Evaluate history/drilldown/web UI needs after real usage data.
