# CI Runner API

## Packages

- `@localci/ci-runner-core`: step engine, execution contracts, parser registry, JSON formatter.
- `@localci/ci-runner-cli`: config loader, CLI flags, pretty reporter, watch mode.

## Core Runtime API (`@localci/ci-runner-core`)

```ts
import {
  createNodeCommandExecutor,
  createPipelineRunner,
  StepParserRegistry,
  type PipelineStep,
} from '@localci/ci-runner-core'

const steps: readonly PipelineStep[] = [
  {
    id: 'lint',
    name: 'Lint',
    command: 'pnpm run lint',
  },
]

const runner = createPipelineRunner({
  steps,
  executor: createNodeCommandExecutor(),
  parserResolver: new StepParserRegistry(),
  continueOnError: true,
})

const result = await runner.run()
process.exitCode = result.exitCode
```

### Step Status Model

- `passed`
- `failed`
- `skipped`
- `timed_out`

Reason values:

- `command_failed`
- `command_timeout`
- `optional_step_failed`

## CLI Runtime (`@localci/ci-runner-cli`)

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
import type { CiRunnerConfig } from '@localci/ci-runner-cli/types'

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
