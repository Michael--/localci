# @number10/ci-runner-cli

Typed, config-driven CI command runner for local development and CI environments.

`@number10/ci-runner-cli` helps you replace ad-hoc shell scripts with a predictable pipeline runner that is easy to read, version, and maintain.

## Why Use It

Most CI scripts start simple and become fragile over time:

- inconsistent output across projects
- unclear failure handling
- duplicated retry/timeout logic
- hard-to-parse logs in CI systems

`ci-runner` gives you one consistent contract:

- explicit step model (`id`, `name`, `command`, `enabled`, `timeout`, `retry`, `optional`)
- deterministic exit behavior (`0` pass, `1` hard failure)
- compact human output (`pretty`) or machine output (`json`)
- typed config support for editor feedback (`ci.config.ts`)
- optional watch mode for local feedback loops

## Install

```bash
pnpm add -D @number10/ci-runner-cli
```

## Usage

```bash
ci-runner --format pretty
```

## Quick Start

Create `ci.config.json`:

```json
{
  "steps": [
    { "id": "lint", "name": "Lint", "command": "pnpm run lint" },
    { "id": "test", "name": "Test", "command": "pnpm run test" }
  ]
}
```

Run:

```bash
ci-runner --format pretty
```

Use JSON output in CI:

```bash
ci-runner --format json
```

## What You Get

- Stable step orchestration with retries and timeouts.
- Optional non-blocking steps (`optional: true`) for best-effort checks.
- Conditional execution via environment filters (`when.env`).
- Readable local output and complete machine-readable output.
- Type-safe config authoring with `@number10/ci-runner-cli/types`.

## Config File

The CLI loads `ci.config.ts` or `ci.config.json`.

Example:

```json
{
  "continueOnError": true,
  "cwd": ".",
  "output": {
    "format": "pretty",
    "verbose": false
  },
  "watch": {
    "exclude": ["**/*.log", "packages/ci-runner-cli/generated/**"]
  },
  "env": {
    "CI": "true"
  },
  "steps": [
    {
      "id": "lint",
      "name": "Lint",
      "command": "pnpm run lint",
      "enabled": true
    },
    {
      "id": "test",
      "name": "Unit Tests",
      "command": "pnpm run test",
      "timeoutMs": 60000,
      "optional": false,
      "retry": {
        "maxAttempts": 2,
        "delayMs": 250,
        "retryOnTimeout": false
      },
      "when": {
        "env": {
          "RUN_TESTS": "true"
        }
      }
    }
  ],
  "targets": [
    {
      "id": "quick",
      "name": "Quick Checks",
      "includeStepIds": ["lint", "test"]
    },
    {
      "id": "no-build",
      "name": "Without Build",
      "excludeStepIds": ["build"]
    }
  ]
}
```

Typed TypeScript example:

```ts
import type { CiRunnerConfig } from '@number10/ci-runner-cli/types'

const config = {
  output: {
    format: 'pretty',
  },
  steps: [
    {
      id: 'lint',
      name: 'Lint',
      command: 'pnpm run lint',
    },
    {
      id: 'test',
      name: 'Unit Tests',
      command: 'pnpm run test',
      retry: {
        maxAttempts: 2,
        delayMs: 250,
      },
    },
  ],
} satisfies CiRunnerConfig

export default config
```

## CLI Flags

- `--config <path>` Explicit config file path.
- `--target <id>` Run only one configured target id.
- `--list-targets` Print configured targets and exit.
- `--format <pretty|json>` Output format override.
- `--verbose` Print stdout/stderr also for successful steps in pretty mode.
- `--watch` Re-run on file changes.
- `--fail-fast` Stop after first hard failure.
- `--cwd <path>` Base working directory.
- `-h, --help` Show usage help.

## Named Targets

Use `targets` to expose reusable subsets without duplicating step definitions:

In large monorepos, targets are useful for defining a small set of frequent workflows so developers do not need to navigate long script lists each time.
Targets complement existing scripts; they do not replace them.

- `includeStepIds`: allow-list of steps.
- `excludeStepIds`: deny-list applied after include filtering.

Run one target:

```bash
ci-runner --target quick --format pretty
```

List configured targets for editor integrations:

```bash
ci-runner --list-targets --format json
```

Sample output shape:

```json
{
  "targets": [
    { "id": "quick", "name": "Quick Checks" },
    { "id": "full", "name": "Full Pipeline" }
  ]
}
```

The command exits after discovery and does not execute any step commands.

## Watch Mode

- Runs the pipeline once, then watches the selected `--cwd` recursively for changes.
- Debounces rapid events and queues one rerun while a run is active.
- Stops cleanly on `SIGINT`/`SIGTERM` (for example `Ctrl+C`).
- Falls back to a single run when recursive watch is unavailable or the watcher fails at runtime (for example `EMFILE` limits).
- Ignores common generated paths by default (`node_modules`, `.git`, `dist`, `coverage`, `out`, `build`, `.tmp`, `.vite`, `.vite-temp`, `.turbo`, and `*.tsbuildinfo` files).

Use config-level exclusions when needed:

```json
{
  "watch": {
    "exclude": ["dist", "**/*.log", "packages/*/tmp/**"]
  }
}
```

## Run Profiles

- `standard`: single run without watch mode.
- `watch`: continuous reruns on file changes.
- `fail-fast`: stop immediately on the first hard failure.

Profiles are command-line presets often used by integrations (for example the VS Code extension).

## Step Controls

- `enabled` (default `true`): temporarily disable a step without removing it.
- `optional` (default `false`): failed step is marked as skipped and does not fail the run.

## Output Modes

- `pretty`: concise success output, detailed failure diagnostics.
- `json`: full run payload with step results, summary, timestamps, and exit code.

## Exit Behavior

- Exit code `0`: no hard failures.
- Exit code `1`: at least one `failed` or `timed_out` step.
- `optional` step failures become `skipped` and do not fail the run.

## Public Surface

This package exposes:

- the executable CLI (`ci-runner`)
- user-facing config types (`@number10/ci-runner-cli/types`)

Runtime internals are intentionally private and not part of the public API contract.
