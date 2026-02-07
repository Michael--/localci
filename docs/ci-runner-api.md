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
    "verbose": false
  },
  "steps": [
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
  ]
}
```

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
- `json`: full machine-readable run result (`steps`, `summary`, `exitCode`, timestamps).
