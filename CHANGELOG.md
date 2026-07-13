# Changelog

All notable changes to this project are documented in this file.

The format follows Keep a Changelog principles and uses semantic versioning for published artifacts.

## [0.4.0] - 2026-07-13

### Added

- Command results now include a text-independent termination classification: successful exit, non-zero exit, signal termination, timeout, or process creation failure.
- JSON results expose termination details, including exit code, signal, and spawn error code where available.
- Output capture can be disabled or limited per stream; truncated capture is marked with `outputTruncated`.
- Tool-specific output metrics are opt-in through `output.parseMetrics`.
- Steps support `pipefail: true` for Bash pipelines and terminate their POSIX process group on timeout.
- Retry behavior can be configured independently for timeouts, signal termination, and spawn failures.
- Pretty failure summaries now list each failed package together with its failed package script.

### Changed

- Self-CI runs the locally built CLI by default; published-runner checks remain explicit via `ci:self:published*`.
- Added `ci:dist:quick` to run Quick Checks against an existing local CLI build without rebuilding it.
- Pretty failure labels use clear `Step: failed` wording.

### Fixed

- Local CLI builds correctly type-check the new output capture, shell execution, and package-summary behavior.

## [0.3.0] - 2026-06-30

### Added

- Pretty output now shows the ci-runner version in the startup header (`ci-runner v0.3.0: executing N steps`).
- Failed step summary now lists which packages failed within each step, e.g. `Build failed(2) (apps/test-ui, apps/docs-site)`.
- Smart output mode for failed steps: short output is shown in full; long output is filtered to error-relevant lines with brief context; a tail fallback applies when no error patterns match.
- `pnpm -r` recursive failure output is filtered to only show lines from the actually failing packages — successful packages are suppressed.

### Fixed

- ANSI colour codes emitted by pnpm (when `FORCE_COLOR` is active) no longer prevent failing package names from being detected and shown in the summary.
- Node.js `NO_COLOR`/`FORCE_COLOR` configuration warnings, Vite/Rolldown informational codes (`[IMPORT_IS_UNDEFINED]`, `[CIRCULAR_DEPENDENCY]`, etc.), build size reports, and success markers (`✓`) are now suppressed from failure output to reduce noise.
- Overly broad error-line patterns (`undefined`, `expected`, `received`, `missing`, `stderr`) removed to prevent false matches on non-error build output.

## [0.2.1] - 2026-02-09

### Changed

- CLI README now highlights the official VS Code extension and links directly to the Marketplace listing for a better local user experience.

## [0.2.0] - 2026-02-09

### Added

- CLI target model with `targets`, `--target`, and `--list-targets`.
- VS Code extension explorer view with runnable config and target nodes.
- Inline run and stop actions for individual targets in the VS Code view.
- Root self-CI config and scripts for local pipeline validation.

### Changed

- CLI watch mode now supports config-level `watch.exclude` patterns.
- CLI pretty output and VS Code output integration improved for readability and diagnostics.
- VS Code extension icon asset switched to PNG for Marketplace compatibility.

### Fixed

- CLI and VS Code recursive output parsing for TypeScript diagnostics.
- CLI `--format` flag precedence over config output defaults.
- VS Code run coordination to prevent parallel runs for the same config.
- VS Code environment sanitization for Electron launch contexts.

### Notes

- VS Code Marketplace publishing is tracked separately from the CLI package publish workflow.
