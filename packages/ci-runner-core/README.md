# @localci/ci-runner-core

Typed core runtime for CI step orchestration.

## Install

```bash
pnpm add @localci/ci-runner-core
```

## Features

- Sequential step execution
- Per-step timeout and retry policy
- Optional steps (`warn but continue`)
- Deterministic summary and exit code
- Parser and reporter extension points

## Quick Start

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
  {
    id: 'test',
    name: 'Unit Tests',
    command: 'pnpm run test',
    retry: {
      maxAttempts: 2,
      delayMs: 250,
    },
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

## Result Model

Step statuses:

- `passed`
- `failed`
- `skipped`
- `timed_out`

Reason values:

- `command_failed`
- `command_timeout`
- `optional_step_failed`
