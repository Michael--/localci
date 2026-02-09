# Changelog

All notable changes to this project are documented in this file.

The format follows Keep a Changelog principles and uses semantic versioning for published artifacts.

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
