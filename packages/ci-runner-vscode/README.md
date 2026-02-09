# CI Runner

Run `ci-runner` configs and named targets from the VS Code Explorer.

## Why It Helps in Monorepos

Large monorepos usually expose many npm scripts, and the full scripts list can become noisy for daily work.
CI Runner provides a focused, curated list of frequent workflows through named `targets` in `ci.config.ts` or `ci.config.json`.
This can reduce how often you need to open the `NPM Scripts` view.

CI Runner is not a replacement for npm scripts.
All scripts remain available and continue to be the execution backend.

## Features

- Detects `ci.config.json` and `ci.config.ts` in workspace folders.
- Lists configured targets and exposes run actions (`standard`, `watch`, `fail-fast`).
- Streams process output to the `CI Runner` output channel.
- Supports stop actions per target and for all active runs.

## Quick Start

1. Install `@number10/ci-runner-cli` in your workspace.
2. Open your workspace in VS Code.
3. Open Explorer and select the `CI Runner` view.
4. Run `Refresh` if configs are not listed yet.
5. Start a config or target with the inline Run action.

## Commands

- `CI Runner: Refresh`
- `CI Runner: Run Config`
- `CI Runner: Run Config (Watch)`
- `CI Runner: Run Config (Fail Fast)`
- `CI Runner: Run Config (Default Profile)`
- `CI Runner: Stop Config Run`
- `CI Runner: Stop All Runs`
- `CI Runner: Open Output`

## Settings

- `ciRunner.defaultConfigPath`: preferred relative config path shown first in the view.
- `ciRunner.defaultRunProfile`: default profile for direct node execution (`standard`, `watch`, `fail-fast`).

## Limitations

- A workspace folder is required; single loose files are not supported.
- Target discovery depends on `ci-runner --list-targets`; invalid configs are shown as errors.
