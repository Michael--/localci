# CI Runner API

## Packages

- `@number10/ci-runner-cli`: config loader, internal step engine, CLI flags, pretty reporter, watch mode.

## CLI Runtime (`@number10/ci-runner-cli`)

### Supported Flags

- `--config <path>`
- `--format <pretty|json>`
- `--verbose`
- `--watch`
- `--fail-fast`
- `--cwd <path>`

### Config Schema (`ci.config.json` / `ci.config.ts`)

```json
{
  "continueOnError": true,
  "cwd": ".",
  "output": {
    "format": "pretty",
    "verbose": false,
    "parseMetrics": false,
    "captureOutput": true,
    "maxOutputBytes": 1048576
  },
  "steps": [
    {
      "id": "test",
      "name": "Unit Tests",
      "command": "pnpm run test",
      "enabled": true,
      "timeoutMs": 60000,
      "optional": false,
      "pipefail": true,
      "retry": {
        "maxAttempts": 2,
        "delayMs": 250,
        "retryOnTimeout": false,
        "retryOnSignal": false,
        "retryOnSpawnFailure": false
      },
      "when": {
        "env": {
          "RUN_TESTS": "true"
        }
      }
    }
  ]
}
```

Step controls:

- `enabled` (default `true`): include or exclude a step without deleting it from config.
- `optional` (default `false`): failed step becomes `skipped` and does not fail the run.
- `pipefail` (default `false`): execute the step with Bash `pipefail` so every command in a shell pipeline contributes to the result.
- `captureOutput` (step or `output` default): disable stdout/stderr retention without affecting status evaluation.
- `maxOutputBytes` (step or `output` default): cap each captured stream and mark the result as truncated.
- `retryOnTimeout`, `retryOnSignal`, and `retryOnSpawnFailure` default to `false`; non-zero exits remain retryable by default.

Typed TypeScript variant:

```ts
import type { CiRunnerConfig } from '@number10/ci-runner-cli/types'

const config = {
  output: {
    format: 'pretty',
    verbose: false,
  },
  steps: [
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

## Output Contracts

- `pretty`: compact success output, detailed failure output.
- `json`: full machine-readable run result (`steps`, `summary`, `exitCode`, timestamps, and per-step termination details).

Each step result contains a text-independent termination classification: `succeeded`, `exited_nonzero`, `terminated_by_signal`, `timed_out`, or `spawn_failed`. Optional output parsing only enriches `metrics`; it never affects status, retries, or the final exit code.
