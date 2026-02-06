# CI Runner Plan (Consolidated)

## Current Status

- [x] Milestone 1: Core package implemented and validated.
- [x] Milestone 2: CLI package implemented and validated.
- [x] Milestone 3: Pretty/JSON output and parser presets implemented.
- [x] Milestone 5 (mostly): Integration tests, docs, and release dry-run workflow implemented.
- [ ] Initial npm publish is intentionally pending.

## Reassessed Open Items (Priority)

### P0: Required before first npm publish

- [ ] Finalize package naming and scope strategy.
  - Decision needed: keep `@localci/*` or move to final public scope.
- [ ] Define and document compatibility target.
  - Minimum: Node LTS range and supported OS matrix.
- [ ] Execute manual validation on real projects.
  - Run in at least 2 external repositories with real CI pipelines.
  - Record findings and required fixes.
- [ ] Publish first versions of `@localci/ci-runner-core` and `@localci/ci-runner-cli`.
  - Gate: successful `pnpm run release:dry-run` and manual validation sign-off.

### P1: High-value, can be post-publish

- [ ] Define explicit v1 product boundaries (CLI-first scope statement).
- [ ] Add optional `junit` formatter.
- [ ] Add optional GitHub Actions summary formatter.

### P2: Product extensions (post-v1)

- [x] Add watch mode (basic implementation is present in CLI runner).
- [ ] Add daemon/background mode.
- [ ] Store run history (SQLite).
- [ ] Add minimal web UI for build history and step drilldown.

## Completed Scope (Consolidated)

### Architecture Baseline

- [x] Extracted blueprint behavior into modular TypeScript packages.
- [x] Domain contracts (`step`, `result`, `status`, `summary`).
- [x] Execution layer (`command executor`, `timeout`, `retry`).
- [x] Runner orchestration (`continue-on-fail`, deterministic exit code).
- [x] Output adapters (`pretty`, `json`).
- [x] Parser API + registry.
- [x] Stable public API exports.

### Core Package (`@localci/ci-runner-core`)

- [x] Strict step result model (`passed`, `failed`, `skipped`, `timed_out`, retry metadata).
- [x] Per-step timeout and retry policy.
- [x] Optional-step non-blocking behavior.
- [x] Unit tests for runner and parser behavior.

### CLI Package (`@localci/ci-runner-cli`)

- [x] Config loading (`ci.config.ts` and `ci.config.json`).
- [x] Config-to-core mapping.
- [x] Conditional step execution from env conditions.
- [x] CLI flags: `--format`, `--verbose`, `--watch`, `--fail-fast`, `--config`, `--cwd`.
- [x] Compact success output and detailed failure output.
- [x] Default parser presets for vitest and playwright summaries.

### Publish Readiness

- [x] Integration test flows for CLI (smoke package).
- [x] Package READMEs for publishable modules.
- [x] API, migration, and release documentation.
- [x] Release dry-run scripts and GitHub workflow.
- [x] Dry-run pack artifacts for publishable packages.

## Next Execution Order

- [ ] Confirm final package scope and naming.
- [ ] Run manual validation in real repositories.
- [ ] Apply fixes from manual validation.
- [ ] Publish initial versions.
- [ ] Re-evaluate P1 formatter backlog based on first adopter feedback.
