# CI Runner Plan

## Scope and Product Direction

- [ ] Finalize umbrella naming (`brand`) and package naming (`@scope/ci-runner-*`).
- [ ] Define v1 product boundaries (CLI-first, no daemon/web hard dependency).
- [ ] Define compatibility target (Node LTS range, OS support matrix).

## Architecture Baseline

- [x] Extract blueprint behavior as MVP baseline.
- [ ] Split architecture into modules:
  - [x] Domain contracts (`step`, `result`, `status`, `summary`)
  - [x] Execution layer (`command executor`, `timeout`, `retry`)
  - [x] Runner engine (`sequential orchestration`, `continue-on-fail`)
  - [x] Output adapters (`json`, `pretty`)
  - [x] Parser API (`tool-specific test metrics`)
- [x] Define stable public API surface (`index.ts` exports only).

## Milestone 1: Core Package (`@scope/ci-runner-core`)

- [x] Create package scaffold in `packages/ci-runner-core`.
- [x] Add workspace smoke consumer (`packages/ci-runner-smoke`) with stub-based pipeline.
- [ ] Implement strict step result model:
  - [x] `passed`
  - [x] `failed`
  - [x] `skipped` (with reason)
  - [x] `timed_out`
  - [x] `retried` metadata (attempt count)
- [x] Implement timeout per step.
- [x] Implement retry policy per step.
- [x] Keep non-blocking optional step behavior (`warn but continue`).
- [x] Return deterministic exit decision from summary.
- [x] Provide typed parser interface and registry.

## Milestone 2: CLI Package (`@scope/ci-runner-cli`)

- [x] Add config loading (`ci.config.ts` / `ci.config.json`).
- [x] Map config to core runner model.
- [x] Support conditional steps via config/env (e.g. integration tests toggle).
- [x] Support per-step optional policy from config (`warn but continue`).
- [x] Add flags (`--format`, `--verbose`, `--watch`, `--fail-fast`).
- [x] Keep compact output on success; emit full details on failure.

## Milestone 3: Output and Integrations

- [ ] `pretty` formatter parity with current script behavior.
- [x] `json` formatter for machine consumers.
- [ ] Ship default parser presets for vitest/playwright summaries.
- [ ] `junit` formatter (optional).
- [ ] GitHub Actions summary formatter (optional).

## Milestone 4: Runtime Extensions

- [ ] Add watch mode.
- [ ] Add daemon/background mode.
- [ ] Store run history (SQLite).
- [ ] Add minimal web UI for build history and step drilldown.

## Milestone 5: Publish Readiness

- [x] Add unit tests for runner/executor/parsers.
- [ ] Add integration tests for CLI flows.
- [ ] Add API documentation and migration notes.
- [ ] Add versioning/release workflow.
- [ ] Dry-run package publish (`pnpm -r pack`).
- [ ] Publish initial versions.

## Current Execution Order

- [x] Plan refined and saved.
- [x] Implement `ci-runner-core` scaffold.
- [x] Add a smoke project consuming `ci-runner-core`.
- [x] Run `lint`, `typecheck`, and `test`.
- [x] Implement `ci-runner-cli` package (config, flags, mapping, reporter, watch mode).
